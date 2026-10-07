# Insure Me

Vision-powered home inventory builder. Scan your stuff, get replacement values, know if you're covered.

**Prototype — test the workflow, prove viability.**

## How It Works

```
Scan → Identify → Price → Catalog
```

1. **Capture** — Point your camera at an item, snap a frame
2. **Identify** — Dual vision APIs cross-check what it is
3. **Price** — Web search + LLM estimate replacement cost
4. **Catalog** — Build your inventory with photos, identities, and values

## Tech Stack

- **Backend:** Python / FastAPI
- **Frontend:** React / TypeScript / Vite / Tailwind
- **Messaging:** Redis pub/sub
- **Database:** SQLite
- **Deploy:** Docker / Kubernetes / GitHub Actions

## Getting Started

```bash
# Local dev with Docker Compose
docker compose up

# Or run manually:
cd server/backend && pip install -r requirements.txt && uvicorn main:app --reload
cd server/web_ui && npm install && npm run dev
```

## Project Structure

```
server/
  backend/     FastAPI backend (vision routing, value estimation, inventory API)
  web_ui/      React/TypeScript frontend (camera, catalog UI)
k8s/           Kubernetes manifests
.github/       CI/CD workflows
```

## Board

[GitHub Issues](https://github.com/Rgconner/insure-me/issues)
