# ROOTLINE OMNI — Build & Verification Status

**Last Updated:** 2026-10-18  
**Verification Environment:** Windows PowerShell, Python 3.12.10, Node.js v25.5.0, npm 11.8.0, Docker Desktop 29.8.2  
**Target Database:** FalkorDB 1.8.0 Container (`rootline-falkordb`, port 6379)

---

## 1. Verified Live Execution Checklist

| Check / Workflow | Command Executed | Result | Status |
|---|---|---|---|
| FalkorDB Container Startup | `docker run -d --name rootline-falkordb -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest` | Container `57bf93ca4204` running on ports 6379/3000 | **PASS** |
| Virtualenv & Dependencies | `pip install -r requirements-dev.txt` | Successfully installed `falkordb 1.8.0`, `fastapi`, `pytest 9.1.1` | **PASS** |
| Environment Config | `Copy-Item .env.example .env` | Active `.env` created with local placeholders | **PASS** |
| Idempotent Graph Seed | `python -m backend.seed` | `seeded: {'services': 15, 'incidents': 7, 'evidence': 10}` | **PASS** |
| Full Test Suite (45 Tests) | `pytest -q` | **45 passed, 1 warning in 12.53s** against live FalkorDB | **PASS** |
| Frontend Dependencies | `cd frontend; npm install` | 63 packages installed cleanly | **PASS** |
| Frontend Production Build | `cd frontend; npm run build` | Built in 2.58s (`dist/` created with HTML, CSS, JS bundles) | **PASS** |
| Backend API Startup | `uvicorn backend.main:app --port 8000` | Process started on `http://127.0.0.1:8000` | **PASS** |
| Live API Health Probe | `Invoke-RestMethod http://127.0.0.1:8000/api/health` | `status: ok, database: falkordb, graph: rootline, seeded: True` | **PASS** |
| Live Company Brain API | `Invoke-RestMethod http://127.0.0.1:8000/api/company-brain` | Returns 3 runbooks, 2 ADRs, 5 teams from FalkorDB | **PASS** |
| Browser Main Journey | Browser navigated to `http://localhost:8000/` | Full UI loaded, incident investigation and surgery operational | **PASS** |

---

## 2. Key Verified Invariants

1. **FalkorDB System of Record**: All services, incidents, deployments, evidence, runbooks, and ADRs are stored and queried in FalkorDB using parameterized Cypher.
2. **True Graph Surgery Isolation**: Live Graph Surgery executes via FalkorDB `GRAPH.COPY`. Baseline topology invariance is verified by comparing exact edge counts and edge lists before and after surgery.
3. **Automatic Teardown**: Simulation graphs are destroyed in `finally` blocks; verified by `sim_graphs() == []`.
4. **Deterministic Heuristic Scores**: Ranking scores are transparent heuristic weights (not probabilities); verified deterministic across repeated runs.
5. **Zero Invented Evidence**: All data is explicitly labeled as synthetic; no claims of real production telemetry or automated remediation.

---

## 3. Disclosed Limitations & External Dependencies

- **Public URLs**: Public GitHub repository URL, demo video URL, and live cloud deployment URL will be populated upon final repository push.
- **Docker Desktop**: Requires Docker Desktop running locally with WSL2 engine for the FalkorDB container.
