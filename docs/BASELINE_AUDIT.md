# ROOTLINE OMNI — Baseline Audit Report

**Date:** 2026-10-19  
**Branch:** master (commit `c94a431`)  
**Auditor:** Senior Full-Stack Engineer, Graph Engineer, QA Engineer & UI Designer  
**Scope:** Track 01: Agents That Act on Connected Data  

---

## 1. Environment & Runtime Baseline

| Component | Detected Version / Status | Notes |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11 (PowerShell) | OS socket reservation affects port 8000 |
| **Python** | 3.12.10 (venv configured) | 3.13 also available on host |
| **Node.js** | v25.5.0 | Modern Node engine |
| **npm** | 11.8.0 | Standard npm client |
| **Docker Engine** | 29.8.2 (build 7fc2dff) | Daemon running |
| **FalkorDB Container** | `rootline-falkordb` | Image: `falkordb/falkordb:latest` (Up 11+ hours) |
| **Redis Server** | 8.10.2 (standalone) | Ports: `0.0.0.0:6379->6379/tcp`, `3000->3000/tcp` |
| **FalkorDB Graph Module** | `module:name=graph,ver=42201,api=1` | FalkorDB v4.22.1 / vectorset v1 |
| **Python Dependencies** | `falkordb-1.8.0`, `fastapi-0.146.0`, `uvicorn-0.54.0`, `pydantic-2.14.1`, `pytest-9.1.1`, `httpx-0.28.1`, `networkx-3.7` | Installed in `rootline/.venv` |
| **Frontend Dependencies** | `react-18.3.1`, `react-dom-18.3.1`, `vite-5.4.21` | Installed via `npm install` |

---

## 2. Test & Build Baseline Output

### Backend Pytest Baseline
Executed command:
```powershell
& ".\.venv\Scripts\python.exe" -m pytest -q
```
**Exact Output:**
```text
................................                                         [100%]
============================== warnings summary ===============================
.venv\Lib\site-packages\fastapi\testclient.py:1
  StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
32 passed, 1 warning in 9.04s
```
- **Passed:** 32 tests
- **Failed:** 0
- **Warning:** 1 (StarletteDeprecationWarning on httpx)

### Frontend Build Baseline
Executed command:
```powershell
npm run build
```
**Exact Output:**
```text
> rootline-ui@0.1.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 31 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.62 kB │ gzip:  0.38 kB
dist/assets/index-CmbwXMez.css    9.57 kB │ gzip:  2.89 kB
dist/assets/index-Dx0DQ_-s.js   162.53 kB │ gzip: 51.67 kB
✓ built in 1.33s
```
- Production build succeeds cleanly in 1.33s.

---

## 3. Schema & Seed Inventory (Baseline Snapshot)

Current seeded entities in FalkorDB:
- **Services (15):** `web-frontend`, `api-gateway`, `auth-service`, `checkout-service`, `payment-service`, `order-service`, `inventory-service`, `search-service`, `notification-service`, `payments-db`, `orders-db`, `inventory-db`, `search-index`, `cache-redis`, `message-queue`
- **Dependency Edges (17):** Directed `(:Service)-[:DEPENDS_ON]->(:Service)`
- **Teams (5):** Platform, Payments, Commerce, Search, Growth
- **Deployments (3):** DEP-501 (cache-redis), DEP-502 (payment-service), DEP-503 (auth-service)
- **Incidents (7):**
  - Open (3): `INC-2026-101` (SEV1 Checkout 500s), `INC-2026-102` (SEV2 Email delay), `INC-2026-103` (SEV3 Stale search)
  - Resolved (4): `INC-2026-044` (SEV1 Cache latency), `INC-2026-031` (SEV2 Payment errors), `INC-2026-027` (SEV2 Notification queue), `INC-2026-019` (SEV1 Payments DB)
- **Evidence (10):** Polarity items (`supports`, `contradicts`, `symptom`)
- **Runbooks (3):** `RB-cache-evictions`, `RB-queue-backlog`, `RB-payment-timeouts`
- **ADRs (2):** `ADR-007` (Shared Redis cache), `ADR-012` (Async notifications)

---

## 4. Architectural Analysis & Blockers Identified

1. **Read-Only Cypher Execution:**
   - Existing `backend/graph.py` only implements `graph.query()`. It lacks `graph.ro_query()`.
   - Track 01 constraint 9 requires: *"Diagnostic tools must use genuine read-only graph execution. If unavailable, fail closed."*
   - Solution: Implement `ro_run()` using native FalkorDB `ro_query`, with strict fail-closed behavior on connection or module failure.

2. **Port Conflict on Windows (Port 8000 vs 8010):**
   - Windows environment returned `OSError: [WinError 10048] Only one usage of each socket address is normally permitted` for `127.0.0.1:8000`.
   - Port 8010 is verified completely available.
   - Solution: Bind backend to 8010 and update `vite.config.js` proxy from 8000 to 8010.

3. **Missing Track 01 Core Deliverables:**
   - **One bounded observation-driven agent:** No dynamic tool registry loop currently exists. Existing investigator is a static linear pipeline.
   - **Entity resolution & grounding module:** Need graph-backed entity resolution and structured path/edge/evidence verification.
   - **Graph algorithms suite:** Need native PageRank/Betweenness query testing and honest Cypher fallbacks with transparent `engine_used` reporting.
   - **Evaluation / Benchmark suite:** Need fair benchmark comparing graph-backed vs graph-free baseline on identical labeled synthetic cases with real computed metrics.
   - **Tool API / MCP:** Need formal tool schemas, JSON-RPC compliance or clean internal tool API with typed outcomes.
   - **UI Polish:** Current UI is functional but basic; needs dark operations console, dynamic graph topology viz, real trace animation, benchmark viewer, and accessibility.

---

## 5. Verification Gate Status
- **Baseline tests:** Passed (32/32).
- **Baseline frontend build:** Passed.
- **Rollback point:** Git initial commit `c94a431` and untouched `ROOTLINE_OMNI_FINAL_ORIGINAL.zip`.
- **Phase 0 Audit Complete:** Feature edits may proceed to Phase 1.
