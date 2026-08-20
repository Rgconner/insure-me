"""
Insure Me — Backend API

Vision-powered home inventory builder.
Pipeline: Capture → Identify → Price → Catalog

All external calls wrapped with timeouts and error handling per card #8.
All pipeline messages published via Redis pub/sub per card #9.
"""

import asyncio
import base64
import json
import logging
import os
import pathlib
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis as redis_lib
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Service identity
# ---------------------------------------------------------------------------

SERVICE_NAME = "insure-me-backend"
_VERSION_FILE = pathlib.Path(__file__).parent / "VERSION"
SERVICE_VERSION = (
    _VERSION_FILE.read_text().strip()
    if _VERSION_FILE.exists()
    else os.getenv("SERVICE_VERSION", "unknown")
)
_STARTED_AT = datetime.now(timezone.utc).isoformat()
_START_MONO = time.monotonic()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./insure-me.db")

# Vision sources (env vars — pluggable per card #2/#3/#4)
VISION_PRIMARY = os.getenv("VISION_PRIMARY", "google")
VISION_SECONDARY = os.getenv("VISION_SECONDARY", "openai")
VISION_PRIMARY_KEY = os.getenv("VISION_PRIMARY_KEY", "")
VISION_SECONDARY_KEY = os.getenv("VISION_SECONDARY_KEY", "")

# Value estimation (card #5)
SEARCH_API_KEY = os.getenv("SEARCH_API_KEY", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")

# External call timeouts (card #8)
DEFAULT_TIMEOUT = float(os.getenv("EXTERNAL_TIMEOUT_SECONDS", "15.0"))

# Uploads
UPLOAD_DIR = pathlib.Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(SERVICE_NAME)

# ---------------------------------------------------------------------------
# Redis + Pub/Sub (card #9)
# ---------------------------------------------------------------------------

redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)

CHANNEL_CAPTURE = "insure-me:capture"
CHANNEL_IDENTIFY = "insure-me:identify"
CHANNEL_PRICE = "insure-me:price"
CHANNEL_CATALOG = "insure-me:catalog"
CHANNEL_DEAD_LETTER = "insure-me:dead_letter"


def publish_event(channel: str, trace_id: str, stage: str, payload: dict, source: str = ""):
    """Publish a traceable event to Redis."""
    msg = {
        "trace_id": trace_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stage": stage,
        "source": source,
        "payload": payload,
    }
    try:
        redis_client.publish(channel, json.dumps(msg))
        logger.debug(f"[{trace_id}] published to {channel}: {stage}")
    except Exception as e:
        logger.error(f"[{trace_id}] failed to publish to {channel}: {e}")


def publish_dead_letter(trace_id: str, stage: str, error: str, payload: dict = None):
    """Publish failed events to dead_letter channel for inspection."""
    publish_event(CHANNEL_DEAD_LETTER, trace_id, stage, {
        "error": error,
        "original_payload": payload or {},
    }, source=SERVICE_NAME)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

DB_PATH = DATABASE_URL.replace("sqlite:///", "")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(pathlib.Path(__file__).parent / DB_PATH)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            id TEXT PRIMARY KEY,
            photo_path TEXT NOT NULL,
            identified_name TEXT,
            category TEXT,
            estimated_value REAL,
            value_source TEXT,
            confidence REAL,
            narration TEXT DEFAULT '',
            latitude REAL,
            longitude REAL,
            captured_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            inventory_id TEXT NOT NULL,
            photo_path TEXT NOT NULL,
            doc_type TEXT DEFAULT 'other',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (inventory_id) REFERENCES inventory(id)
        )
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialized")
# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Insure Me", version=SERVICE_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded photos
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class InventoryItem(BaseModel):
    id: str
    identified_name: Optional[str] = None
    category: Optional[str] = None
    estimated_value: Optional[float] = None
    value_source: Optional[str] = None
    confidence: Optional[float] = None
    created_at: str
    updated_at: str


class PriceRequest(BaseModel):
    trace_id: str
    identified_name: str
    category: Optional[str] = None


class CatalogItem(BaseModel):
    trace_id: str
    photo_filename: str = ""
    identified_name: str
    category: Optional[str] = None
    estimated_value: float
    value_source: str
    confidence: float
    narration: str = ""
    latitude: float | None = None
    longitude: float | None = None
    captured_at: str = ""

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------

_COUNTERS: dict[str, int] = {
    "captures_received": 0,
    "identifications_run": 0,
    "prices_estimated": 0,
    "items_cataloged": 0,
}

# ---------------------------------------------------------------------------
# Health / telemetry
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "status": "ok",
        "uptime_seconds": time.monotonic() - _START_MONO,
    }


@app.get("/api/versions")
async def versions():
    return {"service": SERVICE_NAME, "version": SERVICE_VERSION}


@app.get("/api/telemetry")
async def telemetry():
    return {
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "started_at": _STARTED_AT,
        "uptime_seconds": time.monotonic() - _START_MONO,
        "counters": _COUNTERS,
    }


# ---------------------------------------------------------------------------
# Capture — upload photo (card #1)
# ---------------------------------------------------------------------------

@app.post("/api/capture")
async def capture_photo(file: UploadFile):
    """Receive a captured photo frame, save it, publish to identify pipeline."""
    trace_id = str(uuid.uuid4())
    _COUNTERS["captures_received"] += 1

    ext = pathlib.Path(file.filename).suffix if file.filename else ".jpg"
    photo_filename = f"{trace_id}{ext}"
    photo_path = UPLOAD_DIR / photo_filename

    content = await file.read()
    photo_path.write_bytes(content)

    publish_event(CHANNEL_CAPTURE, trace_id, "captured", {
        "photo_filename": photo_filename,
        "photo_path": str(photo_path),
    }, source=SERVICE_NAME)

    asyncio.create_task(run_identification(trace_id, str(photo_path)))

    return {
        "trace_id": trace_id,
        "photo_filename": photo_filename,
        "status": "captured",
    }


@app.get("/api/capture/{trace_id}")
async def capture_status(trace_id: str):
    """Check status of a capture/identify/price pipeline by trace_id."""
    return {
        "trace_id": trace_id,
        "status": "processing",
        "note": "Poll or subscribe to Redis channels for live status",
    }

# ---------------------------------------------------------------------------
# Identification — Vision Router (card #2/#3/#4)
# ---------------------------------------------------------------------------

async def run_identification(trace_id: str, photo_path: str):
    """Route photo to primary and secondary vision sources, cross-check results."""
    _COUNTERS["identifications_run"] += 1

    primary_result = None
    secondary_result = None

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        try:
            primary_result = await identify_with_source(
                client, VISION_PRIMARY, VISION_PRIMARY_KEY, photo_path, trace_id
            )
        except Exception as e:
            logger.warning(f"[{trace_id}] Primary source ({VISION_PRIMARY}) failed: {e}")
            publish_dead_letter(trace_id, "identify:primary", str(e))

        try:
            secondary_result = await identify_with_source(
                client, VISION_SECONDARY, VISION_SECONDARY_KEY, photo_path, trace_id
            )
        except Exception as e:
            logger.warning(f"[{trace_id}] Secondary source ({VISION_SECONDARY}) failed: {e}")
            publish_dead_letter(trace_id, "identify:secondary", str(e))

    if primary_result and secondary_result:
        agree = primary_result["name"].lower() == secondary_result["name"].lower()
        confidence = "high" if agree else "low"
        identified_name = (
            primary_result["name"]
            if agree
            else f"{primary_result['name']} / {secondary_result['name']}"
        )
    elif primary_result:
        confidence = "medium"
        identified_name = primary_result["name"]
    elif secondary_result:
        confidence = "medium"
        identified_name = secondary_result["name"]
    else:
        publish_event(CHANNEL_IDENTIFY, trace_id, "identify:failed", {
            "error": "Both vision sources failed",
        }, source=SERVICE_NAME)
        publish_dead_letter(trace_id, "identify", "Both sources failed")
        return

    result = {
        "trace_id": trace_id,
        "identified_name": identified_name,
        "confidence": confidence,
        "primary_source": VISION_PRIMARY if primary_result else None,
        "secondary_source": VISION_SECONDARY if secondary_result else None,
    }

    publish_event(CHANNEL_IDENTIFY, trace_id, f"identified:{confidence}", result,
                  source=SERVICE_NAME)

    asyncio.create_task(run_pricing(trace_id, identified_name))


async def identify_with_source(client: httpx.AsyncClient, source: str, api_key: str,
                                photo_path: str, trace_id: str) -> Optional[dict]:
    """Dispatch to the appropriate vision API implementation."""
    source_lower = source.lower()

    if source_lower == "google":
        return await _identify_google(client, api_key, photo_path, trace_id)
    elif source_lower == "openai":
        return await _identify_openai(client, api_key, photo_path, trace_id)
    else:
        logger.warning(f"[{trace_id}] Unknown vision source: {source} — using placeholder")
        await asyncio.sleep(0.5)
        return {
            "name": f"Item identified by {source}",
            "category": "general",
            "source": source,
            "raw_confidence": 0.5,
        }


# ---------------------------------------------------------------------------
# Google Vision API (card #3)
# ---------------------------------------------------------------------------

GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


async def _identify_google(client: httpx.AsyncClient, api_key: str,
                            photo_path: str, trace_id: str) -> Optional[dict]:
    """
    Send frame to Google Cloud Vision API.
    Uses LABEL_DETECTION + OBJECT_LOCALIZATION + WEB_DETECTION.
    Structures response into (name, category, confidence).
    """
    if not api_key:
        logger.warning(f"[{trace_id}] Google Vision API key not configured")
        return None

    try:
        image_bytes = pathlib.Path(photo_path).read_bytes()
        encoded = base64.b64encode(image_bytes).decode("utf-8")
    except Exception as e:
        logger.error(f"[{trace_id}] Failed to read image for Google Vision: {e}")
        return None

    payload = {
        "requests": [{
            "image": {"content": encoded},
            "features": [
                {"type": "LABEL_DETECTION", "maxResults": 10},
                {"type": "OBJECT_LOCALIZATION", "maxResults": 5},
                {"type": "WEB_DETECTION", "maxResults": 5},
            ],
        }]
    }

    url = f"{GOOGLE_VISION_URL}?key={api_key}"
    logger.info(f"[{trace_id}] Calling Google Vision API...")

    try:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[{trace_id}] Google Vision HTTP error: {e}")
        return None

    responses = data.get("responses", [])
    if not responses:
        logger.warning(f"[{trace_id}] Google Vision returned empty response")
        return None

    r = responses[0]
    if "error" in r:
        logger.error(f"[{trace_id}] Google Vision API error: {r['error']}")
        return None

    # Parse structured identity from response
    objects = r.get("localizedObjectAnnotations", [])
    object_name = objects[0]["name"] if objects else None

    labels = r.get("labelAnnotations", [])
    label_names = [l["description"] for l in labels[:10]] if labels else []

    web = r.get("webDetection", {})
    web_entities = web.get("webEntities", [])
    web_entity_names = [
        e["description"]
        for e in web_entities[:5]
        if "description" in e and e.get("score", 0) > 0.5
    ] if web_entities else []

    # Build descriptive name
    material_keywords = [
        "leather", "wood", "metal", "glass", "gold", "silver", "cotton",
        "wool", "plastic", "oak", "mahogany", "walnut", "cherry",
        "marble", "granite", "ceramic", "porcelain", "steel", "aluminum",
    ]

    if object_name:
        name_parts = [object_name]
        for label in label_names:
            l_lower = label.lower()
            if l_lower != object_name.lower() and l_lower not in name_parts[0].lower():
                if any(kw in l_lower for kw in material_keywords):
                    name_parts.insert(0, label)
                    break
        identified_name = " ".join(name_parts)
    elif label_names:
        identified_name = ", ".join(label_names[:3])
    elif web_entity_names:
        identified_name = web_entity_names[0]
    else:
        identified_name = "Unidentified item"

    category = label_names[0] if label_names else "general"

    if objects:
        raw_confidence = objects[0].get("score", 0.5)
    elif labels:
        raw_confidence = labels[0].get("score", 0.5)
    else:
        raw_confidence = 0.3

    logger.info(
        f"[{trace_id}] Google Vision: \"{identified_name}\" "
        f"(category={category}, confidence={raw_confidence:.2f})"
    )

    return {
        "name": identified_name,
        "category": category,
        "source": "google",
        "raw_confidence": raw_confidence,
    }
# ---------------------------------------------------------------------------
# OpenAI GPT-4V / GPT-4o (card #4)
# ---------------------------------------------------------------------------

OPENAI_VISION_URL = "https://api.openai.com/v1/chat/completions"


async def _identify_openai(client: httpx.AsyncClient, api_key: str,
                            photo_path: str, trace_id: str) -> Optional[dict]:
    """
    Send frame to OpenAI GPT-4o for vision-based identification.
    Returns structured JSON: {name, category, confidence}.
    """
    if not api_key:
        logger.warning(f"[{trace_id}] OpenAI API key not configured")
        return None

    try:
        image_bytes = pathlib.Path(photo_path).read_bytes()
        encoded = base64.b64encode(image_bytes).decode("utf-8")
    except Exception as e:
        logger.error(f"[{trace_id}] Failed to read image for OpenAI: {e}")
        return None

    payload = {
        "model": "gpt-4o",
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Identify this object precisely. Return ONLY a JSON object "
                        "with keys: name (detailed, human-readable name including "
                        "brand/model if visible, material, and key characteristics), "
                        "category (one-word: furniture, jewelry, electronics, "
                        "appliance, art, clothing, tool), "
                        "confidence (0.0-1.0). No other text."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                },
            ],
        }],
        "max_tokens": 200,
        "temperature": 0.0,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    logger.info(f"[{trace_id}] Calling OpenAI GPT-4o...")

    try:
        resp = await client.post(OPENAI_VISION_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[{trace_id}] OpenAI HTTP error: {e}")
        return None

    # Parse structured JSON from GPT-4o response
    try:
        content = data["choices"][0]["message"]["content"]
        content = content.strip()
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
        result = json.loads(content.strip())
        return {
            "name": result.get("name", "Unknown"),
            "category": result.get("category", "general"),
            "source": "openai",
            "raw_confidence": float(result.get("confidence", 0.5)),
        }
    except (KeyError, json.JSONDecodeError, IndexError) as e:
        logger.error(f"[{trace_id}] Failed to parse OpenAI response: {e}")
        return None



# ---------------------------------------------------------------------------
# Pricing — Value Estimation (card #5)
# ---------------------------------------------------------------------------

async def run_pricing(trace_id: str, identified_name: str):
    """Estimate replacement value via web search + LLM fallback."""
    _COUNTERS["prices_estimated"] += 1

    value = None
    value_source = ""

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            value = await search_price(client, identified_name, trace_id)
            if value is not None:
                value_source = "web_search"
    except Exception as e:
        logger.warning(f"[{trace_id}] Web search failed: {e}")
        publish_dead_letter(trace_id, "price:search", str(e))

    if value is None:
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                value = await llm_estimate(client, identified_name, trace_id)
                if value is not None:
                    value_source = "llm"
        except Exception as e:
            logger.warning(f"[{trace_id}] LLM estimate failed: {e}")
            publish_dead_letter(trace_id, "price:llm", str(e))

    if value is None:
        publish_event(CHANNEL_PRICE, trace_id, "price:failed", {
            "identified_name": identified_name,
            "error": "Could not estimate value",
        }, source=SERVICE_NAME)
        publish_dead_letter(trace_id, "price", "All pricing sources failed")
        return

    result = {
        "trace_id": trace_id,
        "identified_name": identified_name,
        "estimated_value": value,
        "value_source": value_source,
    }

    publish_event(CHANNEL_PRICE, trace_id, f"priced:{value_source}", result,
                  source=SERVICE_NAME)


# ---------------------------------------------------------------------------
# Pricing — SerpAPI web search (card #5 — primary)
# ---------------------------------------------------------------------------

SERPAPI_URL = "https://serpapi.com/search"


async def search_price(client: httpx.AsyncClient, item_name: str, trace_id: str) -> Optional[float]:
    """Search the web for retail/replacement price via SerpAPI."""
    api_key = SEARCH_API_KEY
    if not api_key:
        logger.warning(f"[{trace_id}] SerpAPI key not configured — skipping web search")
        return None

    params = {
        "engine": "google_shopping",
        "q": f"{item_name} price",
        "api_key": api_key,
        "gl": "us",
        "hl": "en",
    }

    logger.info(f"[{trace_id}] SerpAPI shopping: \"{item_name}\"")

    try:
        resp = await client.get(SERPAPI_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as e:
        logger.warning(f"[{trace_id}] SerpAPI HTTP error: {e}")
        return None

    shopping_results = data.get("shopping_results", [])
    if shopping_results:
        first = shopping_results[0]
        price = _extract_price(first.get("price"))
        if price is not None:
            logger.info(f"[{trace_id}] SerpAPI shopping: ${price:.2f}")
            return price

    # Fallback: regular Google search with price regex
    params["engine"] = "google"
    params["q"] = f"{item_name} replacement cost retail price USD"

    try:
        resp = await client.get(SERPAPI_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as e:
        logger.warning(f"[{trace_id}] SerpAPI regular search error: {e}")
        return None

    kg = data.get("knowledge_graph", {})
    price_str = kg.get("price")
    if price_str:
        price = _extract_price(str(price_str))
        if price is not None:
            logger.info(f"[{trace_id}] Knowledge graph price: ${price:.2f}")
            return price

    organic = data.get("organic_results", [])
    for result in organic[:5]:
        text = f"{result.get('title', '')} {result.get('snippet', '')}"
        price = _extract_price_from_text(text)
        if price is not None and 0.50 < price < 1_000_000:
            logger.info(f"[{trace_id}] SerpAPI snippet price: ${price:.2f}")
            return price

    logger.info(f"[{trace_id}] SerpAPI: no price found")
    return None


def _extract_price(raw: str | None) -> Optional[float]:
    """Extract float from price string like '$1,299.99'."""
    if not raw:
        return None
    cleaned = raw.replace("$", "").replace(",", "").replace("£", "").replace("€", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_price_from_text(text: str) -> Optional[float]:
    """Find dollar amount in text via regex."""
    import re
    patterns = [
        r'\$[\s]*([\d,]+(?:\.\d{2})?)',
        r'([\d,]+(?:\.\d{2})?)\s*(?:USD|dollars)',
    ]
    for pat in patterns:
        match = re.search(pat, text)
        if match:
            return _extract_price(match.group(1) if pat.startswith(r'\$') else match.group(1))
    return None


# ---------------------------------------------------------------------------
# Pricing — LLM estimate (card #5 — fallback)
# ---------------------------------------------------------------------------

LLM_API_URL = "https://api.openai.com/v1/chat/completions"


async def llm_estimate(client: httpx.AsyncClient, item_name: str, trace_id: str) -> Optional[float]:
    """Ask OpenAI to estimate replacement cost. Returns float or None."""
    api_key = LLM_API_KEY
    if not api_key:
        logger.warning(f"[{trace_id}] LLM API key not configured")
        return None

    payload = {
        "model": "gpt-4o",
        "messages": [{
            "role": "user",
            "content": (
                f"What is the current retail replacement cost of: {item_name}?\n"
                "Return ONLY JSON: {\"estimated_value\": <float USD>, "
                "\"confidence\": <0.0-1.0>}. No other text."
            ),
        }],
        "max_tokens": 100,
        "temperature": 0.0,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    logger.info(f"[{trace_id}] LLM price estimate: \"{item_name}\"")

    try:
        resp = await client.post(LLM_API_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[{trace_id}] LLM HTTP error: {e}")
        return None

    try:
        content = data["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
        result = json.loads(content.strip())
        value = result.get("estimated_value")
        if isinstance(value, (int, float)) and value > 0:
            conf = result.get("confidence", 0.5)
            logger.info(f"[{trace_id}] LLM estimate: ${value:.2f} (confidence={conf:.2f})")
            return float(value)
    except (KeyError, json.JSONDecodeError, IndexError) as e:
        logger.error(f"[{trace_id}] Failed to parse LLM price: {e}")

    return None

# ---------------------------------------------------------------------------
# Inventory — Catalog CRUD (card #6)
# ---------------------------------------------------------------------------

@app.get("/api/inventory")
async def list_inventory():
    """List all cataloged items."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM inventory ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.get("/api/inventory/{item_id}")
async def get_inventory_item(item_id: str):
    """Get a single inventory item."""
    conn = get_db()
    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return dict(row)


@app.post("/api/inventory")
async def add_to_inventory(item: CatalogItem):
    """Add an identified and priced item to the catalog."""
    _COUNTERS["items_cataloged"] += 1
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    conn.execute(
        """INSERT INTO inventory (id, photo_path, identified_name, category,
           estimated_value, value_source, confidence, narration,
           latitude, longitude, captured_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            item_id, item.photo_filename, item.identified_name, item.category,
            item.estimated_value, item.value_source, item.confidence,
            item.narration,
            item.latitude, item.longitude, item.captured_at,
            now, now,
        ),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()

    result = dict(row)

    publish_event(CHANNEL_CATALOG, item.trace_id, "cataloged", {
        "item_id": item_id,
        "identified_name": item.identified_name,
        "estimated_value": item.estimated_value,
    }, source=SERVICE_NAME)

    return result


@app.patch("/api/inventory/{item_id}")
async def update_inventory_item(item_id: str, item: InventoryItem):
    """Update an inventory item."""
    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM inventory WHERE id = ?", (item_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """UPDATE inventory SET identified_name=?, category=?, estimated_value=?,
           value_source=?, confidence=?, updated_at=? WHERE id=?""",
        (
            item.identified_name, item.category, item.estimated_value,
            item.value_source, item.confidence, now, item_id,
        ),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/inventory/{item_id}")
async def delete_inventory_item(item_id: str):
    """Remove an item from the catalog."""
    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM inventory WHERE id = ?", (item_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    conn.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": item_id}


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Documents — Certificate / Appraisal capture (card #12)
# ---------------------------------------------------------------------------

class DocumentUpload(BaseModel):
    doc_type: str = "other"  # certificate, appraisal, receipt, other


@app.post("/api/inventory/{item_id}/documents")
async def add_document(item_id: str, file: UploadFile):
    """Upload a supporting document photo for an inventory item."""
    conn = get_db()
    existing = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    doc_id = str(uuid.uuid4())
    ext = pathlib.Path(file.filename).suffix if file.filename else ".jpg"
    doc_filename = f"doc-{doc_id}{ext}"
    doc_path = UPLOAD_DIR / doc_filename

    content = await file.read()
    doc_path.write_bytes(content)

    # Determine doc_type from query param or default
    doc_type = "other"

    conn.execute(
        """INSERT INTO documents (id, inventory_id, photo_path, doc_type)
           VALUES (?, ?, ?, ?)""",
        (doc_id, item_id, doc_filename, doc_type),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()

    return dict(row)


@app.get("/api/inventory/{item_id}/documents")
async def list_documents(item_id: str):
    """List all supporting documents for an inventory item."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM documents WHERE inventory_id = ? ORDER BY created_at DESC",
        (item_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Remove a supporting document."""
    conn = get_db()
    existing = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete the file
    doc_path = UPLOAD_DIR / existing["photo_path"]
    try:
        doc_path.unlink(missing_ok=True)
    except Exception:
        pass

    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": doc_id}



# Debug endpoints
# ---------------------------------------------------------------------------

@app.get("/api/debug/events/{channel}")
async def debug_channel(channel: str, limit: int = 10):
    """Inspect recent messages on a Redis channel."""
    return {
        "channel": channel,
        "note": "Use redis-cli MONITOR to inspect live pub/sub traffic.",
    }


@app.get("/api/logs/{service}")
async def get_logs(service: str):
    """Return recent log entries (placeholder)."""
    return {"service": service, "note": "Log endpoint placeholder."}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    init_db()
    logger.info(f"{SERVICE_NAME} v{SERVICE_VERSION} started")
    logger.info(f"  Vision primary: {VISION_PRIMARY}, secondary: {VISION_SECONDARY}")
    logger.info(f"  Redis: {REDIS_URL}")
    logger.info(f"  DB: {DB_PATH}")
