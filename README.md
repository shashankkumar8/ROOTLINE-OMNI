# Rootline Omni

**Counterfactual graph incident investigation, powered by FalkorDB.**

Rootline investigates synthetic service incidents by traversing dependency paths, weighing supporting and contradicting evidence, consulting incident history, calculating blast radius, and recording operator decisions. Its signature feature, **Live Graph Surgery**, removes selected dependency edges in an isolated graph copy and reruns the same investigation so the operator can compare what changed without intentionally changing baseline dependency topology.

> **Hackathon:** Graph Hacks 2026 · **Primary track:** Track 01 — Agents That Act on Connected Data. Persistent investigation decisions support the Track 02 memory theme, and graph-linked owners/runbooks/ADRs support the Track 03 Company Brain theme. Treat these as capability alignments, and select additional tracks only if the submission rules permit it and you can demonstrate them. The implementation is a rule-guided diagnostic workflow; it does not claim autonomous multi-agent coordination or an LLM planner.
>
> **Demo safety:** all incident and operational data are synthetic. Rootline does not connect to production telemetry, execute remediation, or replace human approval.

## Why FalkorDB is essential

The graph is part of the product's reasoning, not just a storage layer:

- Candidate causes are discovered through variable-length `DEPENDS_ON` traversal from the affected service.
- Blast radius is calculated by traversing the same edges in reverse dependency direction.
- Evidence, deployments, prior incident resolutions, ownership, runbooks, ADRs, and operator decisions are connected through graph relationships.
- Live Graph Surgery changes dependency topology in a temporary graph and compares a rerun against the baseline.

The backend uses parameterized Cypher for data values. The browser communicates with FastAPI; it never connects directly to FalkorDB.

## Features

- **Evidence-first ranking:** deterministic heuristic scores with a visible breakdown; scores are not probabilities.
- **Contradiction handling:** negative evidence can lower a candidate's score.
- **Uncertainty:** weak evidence can produce an `inconclusive` result instead of a forced root cause.
- **Live Graph Surgery:** remove one or more existing dependency edges from an isolated copy, rerun the investigation, compare paths and rankings, check baseline dependency topology, and report cleanup status.
- **Blast radius:** identify services that transitively depend on a selected service.
- **Company Brain:** resolve owning teams, synthetic runbook steps, and architecture decision records through graph relationships.
- **Investigation memory:** save investigations and operator decisions in FalkorDB and retrieve relevant prior decisions.
- **Trace and audit:** show sequential backend investigation stages and elapsed times; simulation audit records are stored in the baseline graph.
- **Human approval:** approve/reject a recommendation with a rationale. No remediation is executed.

## Architecture

```mermaid
graph TD
    UI[React + Vite UI] -->|HTTP REST| API[FastAPI]
    API --> Q[Parameterized Cypher queries]
    Q <--> DB[(FalkorDB graph: rootline)]
    API --> R[Deterministic evidence ranker]
    API --> S[Isolated graph-surgery simulation]
    S -->|copy / mutate / investigate / compare / cleanup| DB
```

Key files:

- `backend/main.py` — HTTP API and request validation
- `backend/queries.py` — graph reads/writes and parameterized Cypher
- `backend/investigator.py` — investigation stages and deterministic ranking
- `backend/agent.py` — bounded tool-calling agent with fail-closed Cypher policy
- `backend/algorithms.py` — native FalkorDB algorithms (PageRank, Betweenness, WCC)
- `backend/grounding.py` — anti-hallucination graph fact verification
- `backend/benchmark.py` — fair comparative evaluation suite (Graph-Native vs Keyword Baseline)
- `backend/surgery.py` — isolated graph-copy simulation, comparison, audit, cleanup
- `backend/seed.py` — idempotent synthetic demo graph
- `frontend/src/App.jsx` — 6-tab React UI command center
- `docs/FINAL_VERIFICATION_REPORT.md` — full release audit and verification report
- `docs/graph-model.md` — graph schema, queries, and score formula
- `docs/runbooks.md` — synthetic, read-only runbook content

## Graph model

```mermaid
graph LR
    Incident -->|AFFECTS| Service
    Service -->|DEPENDS_ON| Service
    Team -->|OWNS| Service
    Deployment -->|CHANGED| Service
    Incident -->|CAUSED_BY| Service
    Incident -->|HAS_EVIDENCE| Evidence
    Evidence -->|ABOUT| Service
    Runbook -->|APPLIES_TO| Service
    ADR -->|GOVERNS| Service
    Investigation -->|OF| Incident
    Investigation -->|RANKED| Service
    Investigation -->|USED_EVIDENCE| Evidence
    Investigation -->|RECOMMENDS| Action
    Simulation -. audit record .-> Incident
```

See [`docs/graph-model.md`](docs/graph-model.md) for node properties, exact relationship directions, queries, and scoring. The graph model documentation is intended to match `backend/seed.py` and `backend/queries.py`.

## Local setup

### Prerequisites

- Python 3.10+ (use the version supported by your installed dependencies)
- Node.js and npm
- Docker Desktop, running

### 1. Start FalkorDB

PowerShell:

```powershell
docker run -d --name rootline-falkordb -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest
```

If the container already exists, start it with `docker start rootline-falkordb`. To inspect it, use `docker logs rootline-falkordb`.

### 2. Install and seed the backend

From the repository's `rootline/` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# If script activation is blocked for this terminal only:
# Set-ExecutionPolicy -Scope Process Bypass
pip install -r requirements-dev.txt
Copy-Item .env.example .env
python -m backend.seed
uvicorn backend.main:app --reload --port 8000
```

### 3. Start the frontend

Open a second PowerShell terminal in `rootline/`:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The backend API is normally at `http://localhost:8000`; check `GET /api/health` to confirm the API and graph connection.

To build the frontend bundle, run `npm run build` from `frontend/`. The backend's production/static serving behavior depends on the built bundle being present; for development, use the separate Vite server above.

### 4. Run tests

From the repository root, with the virtual environment active:

```powershell
pytest -q
```

The tests use an isolated test graph. See [`docs/BUILD_STATUS.md`](docs/BUILD_STATUS.md) for the distinction between previously observed results and checks that still need to be rerun after the latest changes.

## Demo flow

1. Open `INC-2026-101` and inspect the affected service, candidate paths, evidence, contradiction, and score breakdown.
2. Open **Live Graph Surgery** and remove `inventory-service → cache-redis` in the simulation. Compare the rerouted path and resulting candidate ranking.
3. Confirm the response reports baseline dependency topology unchanged and whether temporary-graph cleanup succeeded. The simulation also writes an audit record to the baseline graph; therefore “unchanged” refers to dependency topology and investigation comparison, not a byte-for-byte unchanged graph.
4. Open the Company Brain context and read the synthetic runbook/ADR information in the app. No external placeholder URLs are used and no commands are executed.
5. Save an investigation decision with rationale, then inspect saved investigations / prior decisions.
6. Show the test output and explain the limits below.

Use only behaviors you have personally verified on the exact build and database configuration used for the recording. Graph Surgery requires graph-copy support from the configured FalkorDB server/client; unsupported environments should return an explicit error rather than silently creating an incomplete clone.

## API overview

- `GET /api/health`
- `GET /api/incidents`
- `GET /api/graph/overview`
- `POST /api/investigate/{incident_id}`
- `GET /api/investigations`
- `GET /api/investigations/{id}`
- `GET /api/graph/edges`
- `POST /api/simulate`
- `POST /api/investigations/{id}/decision`

For request schemas and response details, inspect the route definitions in `backend/main.py`. Invalid input should be rejected with a validation response; unknown resources, unavailable graph operations, and conflicts return explicit errors.

## Synthetic scenarios

- **`INC-2026-101`** — checkout HTTP 500s; Redis is a strong candidate, while a canary rollback provides contradicting evidence against the payment service.
- **`INC-2026-102`** — delayed order-confirmation emails; the message queue is a plausible cause.
- **`INC-2026-103`** — stale search results; deliberately designed to demonstrate an inconclusive outcome when evidence is insufficient.

These are fictional scenarios created for demonstration, not real production incidents or measured operational outcomes.

## Limitations and security

- All data, runbooks, ADRs, and incident history are synthetic.
- Ranking weights are hand-authored heuristics and are not calibrated probabilities.
- There is no live telemetry ingestion, authentication, production deployment integration, or automated remediation.
- The UI trace represents sequential backend stages, not independently acting autonomous agents.
- Graph Surgery supports dependency-edge counterfactuals only. It requires a supported graph-copy operation and must be verified on the target FalkorDB deployment.
- A simulation audit record is written to the baseline graph. The code checks dependency topology and rerun behavior, not byte-for-byte equality of the whole database.
- Do not put secrets in source control. Configure connection settings through `.env` and use a suitable secret manager outside local development.

## AI assistance disclosure

Complete this section truthfully for the submitted version. Name the AI tools actually used, what they helped with, what you personally implemented/reviewed, and which checks you ran yourself. Do not claim test results, live Docker compatibility, or functionality that you did not verify.

## Submission links

- Repository: _add your public repository URL_
- Demo video: _add your video URL_
- Live deployment: _not provided; use the local setup above_
