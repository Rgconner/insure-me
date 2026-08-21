# Insure Me — Session Handoff

> First action of every new session: read this file.

---

## Current State (2026-08-20 — session 2, rebuild done)

**Branch:** `main`
**Last commit:** `1d0d93a` — fix: no-store cache header for index.html (stale SPA bundle)
**Pods:** 3/3 healthy (rebuilt 1 min ago). web-ui HTTP 200, inventory 4 items.
**Cloudflare:** **External to this NS.** No cloudflared tunnel in `insure-me` — tunnel is shared infrastructure. Do NOT recreate or debug it here.

### Deployment status (cluster `192.168.10.101`)

| Component | State |
|-----------|-------|
| namespace `insure-me` | ✅ created |
| redis | ✅ 1/1 Running |
| backend (FastAPI) | ✅ 1/1 Running — `/health` 200, `/api/inventory` 200 |
| web-ui (nginx SPA) | ✅ 1/1 Running — serves `http://192.168.11.215/` |
| MetalLB LoadBalancer | ✅ `192.168.11.215` (sandbox pool) |
| Traefik IngressRoutes | ✅ `insure-me-http` (redirect) + `insure-me-https` (letsencrypt) for `insure-me.snwbd.com` |

> **No per-app cloudflared tunnel.** `insure-me.snwbd.com` rides the shared
> Traefik edge exactly like `board`/`git`/`bss.snwbd.com`. A redundant
> cloudflared-tunnel deployment was created then removed.

### Images
Built in-cluster with Kaniko (`k8s/kaniko-build.yaml`), pushed to internal gitea registry:
- `git.snwbd.com/aikb-admin/insure-me/backend:latest`
- `git.snwbd.com/aikb-admin/insure-me/web-ui:latest`
Pull auth via `gitea-registry` secret (copied into `insure-me` ns).

### Two remaining action items
1. **Cloudflare DNS/public-hostname** — add `insure-me.snwbd.com` to the existing
   Cloudflare edge (same as board/git/bss), pointed at the Traefik edge. No new tunnel needed.
2. **Vision/LLM API keys** — set into `insure-me-secrets` (VISION_PRIMARY_KEY, VISION_SECONDARY_KEY, SEARCH_API_KEY, LLM_API_KEY) to activate identification + pricing.

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

**→ CI/CD pipeline + deploy (#7 infra). Then integrate real API keys and test the full pipeline end-to-end.**

---

## What Shipped This Session

| Commit | Card | What |
|--------|------|------|
| `b3a0fb2` | #1 | Capture Frame — camera hook + viewfinder + POST to backend |
| `89890ac` | #2,#3,#4 | Vision Router dispatch, Google Vision REST, OpenAI GPT-4o |
| `42e2bc7` | #5,#6 | Value Estimation (SerpAPI + LLM) + Inventory CRUD with photos |
| `b1e650a` | #10 | Voice Narration — SpeechRecognition API |
| (pending) | #11,#12 | GPS Provenance + Certificate Document Capture |

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
