# Insure Me — Session Handoff

> First action of every new session: read this file.

---

## Current State (2026-08-19 — session 1)

**Branch:** `main`
**Last commit:** `89890ac` — feat(#2,#3,#4)
**CI status:** Not yet configured
**System state:** Cards #1-#9 complete (core pipeline + inventory CRUD + infra). 3 cards open: #10 Narration, #11 GPS Provenance, #12 Certificate Capture.

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

**→ Add Narration / Voice Input (#10) — speech-to-text via Web Speech API to supplement visual identification.**

---

## What Shipped This Session

| Commit | Card | What |
|--------|------|------|
| `b3a0fb2` | #1 | Capture Frame — camera hook + viewfinder + POST to backend |
| `89890ac` | #2,#3,#4 | Vision Router dispatch, Google Vision REST, OpenAI GPT-4o |
| (pending) | #5 | Value Estimation — SerpAPI web search + OpenAI LLM fallback |
| (pending) | #6,#7,#8,#9 | Inventory CRUD, Scaffold, Call Resilience, Redis Pub/Sub |

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
