# Insure Me — Session Handoff

> First action of every new session: read this file.

---

## Current State (2026-08-19 — session 1)

**Branch:** `main`
**Last commit:** `b3a0fb2` — feat(#1): Capture Frame
**CI status:** Not yet configured
**System state:** Cards #1-#4 complete. Camera capture → Google Vision + GPT-4o identification → cross-check. 8 cards open.

## Board

[insure-me issues](https://github.com/Rgconner/insure-me/issues) — 12 open cards

| # | Card |
|---|------|
| 1 | Capture Frame |
| 2 | Vision Router — Primary + Secondary Cross-Check |
| 3 | Vision Source A — Google Vision API |
| 4 | Vision Source B — Alternate Vision API |
| 5 | Value Estimation — Web Search + LLM Fallback |
| 6 | Inventory Builder — Catalog CRUD |
| 7 | Repo & Project Scaffold |
| 8 | External Call Resilience — Timeouts + Error Handling |
| 9 | Message Tracking — Redis Pub/Sub Pipeline |
| 10 | Narration / Voice Input — Speak Item Details |
| 11 | GPS + Timestamp Provenance |
| 12 | Certificate of Authentication Capture |

## Immediate First Action Next Session

**→ Wire up Value Estimation (#5) — replace search_price() and llm_estimate() stubs with real web search and LLM calls.**

---

## What Shipped This Session

| Commit | Card | What |
|--------|------|------|
| `b3a0fb2` | #1 | Capture Frame — camera hook + viewfinder + POST to backend |
| (pending) | #2 | Vision Router — dispatch routing + cross-check confidence |
| (pending) | #3 | Google Vision API — REST integration, label/object/web detection |
| (pending) | #4 | OpenAI GPT-4o — structured JSON identification |

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Repository | `Rgconner/insure-me` |
| Local path | `F:\git\insure-me` |
| Tech stack | Python/FastAPI + React/TypeScript/Vite + Redis + SQLite |
| Vision approach | Dual-source (primary + secondary), cross-check for agreement |
| MVP scope | Inventory builder only — policy/gap analysis deferred to V2 |
| External calls | Always try/except + timeout |
| Messaging | Redis pub/sub, traceable |

## Decisions Made (permanent)

| Decision | Rationale |
|----------|-----------|
| Dual vision sources with cross-check | Reliability — two APIs agreeing is stronger than one |
| Inventory-only MVP | Building the catalog is the hardest part; coverage comparison layers on top |
| Policy upload deferred to V2 | Keep prototype focused on the core loop |
| Same stack as picker-vision | Reuse patterns, reduce cognitive overhead |
