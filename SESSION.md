# Insure Me — Session Handoff

> First action of every new session: read this file.

---

## Current State (2026-08-20 — session 2, phase 2 complete)

**Branch:** `main`
**Last commit:** `d1ef931` — feat(#18-#22): Coverage comparison engine and dashboard
**Pods:** 3/3 healthy. web-ui HTTP 200, inventory 4 items.
**Board:** ALL 22 CARDS COMPLETE. Archive + Policy upload/parse/review/storage + Coverage comparison/dashboard/flags/mapping/cross-policy.
**Next:** Rebuild + deploy to pick up phase 2.

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

[insure-me issues](https://github.com/Rgconner/insure-me/issues) — 10 open cards (#13–#22)

| # | Card | Category |
|---|------|----------|
| 13 | Archive Items (soft-delete) | Inventory |
| 14 | Policy Upload — PDF / URL / Text | Policy |
| 15 | Policy Parsing (LLM) | Policy |
| 16 | Policy Storage — Database and CRUD | Policy |
| 17 | Policy Review and Edit | Policy |
| 18 | Coverage Comparison Engine | Coverage |
| 19 | Coverage Flags and Colors | Coverage |
| 20 | Comparison Dashboard | Coverage |
| 21 | Cross-Policy Analysis | Coverage |
| 22 | Category Mapping — Items to Policy Sub-Limits | Coverage |

## Immediate First Action Next Session

**→ Start on #13: Archive Items — add `archived` column, archive/restore endpoints, archive button in InventoryList.**

---

## What Shipped This Session

| Commit | Card | What |
|--------|------|------|
| `b3a0fb2` | #1 | Capture Frame — camera hook + viewfinder + POST to backend |
| `89890ac` | #2,#3,#4 | Vision Router dispatch, Google Vision REST, OpenAI GPT-4o |
| `42e2bc7` | #5,#6 | Value Estimation (SerpAPI + LLM) + Inventory CRUD with photos |
| `b1e650a` | #10 | Voice Narration — SpeechRecognition API |
| `5513233` | #11,#12 | GPS Provenance + Certificate Document Capture |
| `0e2bab7` | deploy | k8s manifests (namespace, redis, backend, web-ui, traefik, kaniko) |
| `e2701de` | #13 | Archive Items — soft-delete with archive/restore |
| `382a6e1` | #14-#17 | Policy upload, LLM parse, storage, review/edit |
| `d1ef931` | #18-#22 | Coverage comparison engine, dashboard, flags, category mapping |

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
