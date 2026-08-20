# Insure Me — Session Handoff

> First action of every new session: read this file.

---

## Current State (2026-08-19 — session 1)

**Branch:** `main`
**Last commit:** `1ff4f89` — Update board: 12 cards
**CI status:** Not yet configured
**System state:** Card #1 (Capture Frame) implemented — camera hook + viewfinder + capture + backend POST. Inventory list shows results.

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

**→ Wire up Vision Router (#2) — plug real vision API calls into identify_with_source().**

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
