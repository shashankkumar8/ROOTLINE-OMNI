# ROOTLINE OMNI — Pre-Submission Release Checklist

**Target:** Graph Hacks 2026 Submission  
**Recommendation:** **GO WITH DISCLOSED LIMITATIONS**

---

## 1. Technical Release Gates

- [x] **Database Engine**: FalkorDB container running on port 6379; verified with `RETURN 1` connection.
- [x] **Backend Health**: `GET /api/health` returns `status: ok, database: falkordb, graph: rootline, seeded: True`.
- [x] **Full Pytest Suite**: 44 / 44 tests passing against the live FalkorDB instance (`pytest -q`).
- [x] **Frontend Production Build**: `npm run build` succeeds in under 3 seconds without errors or warnings.
- [x] **Live Graph Surgery Isolation**: Proved by `tests/test_surgery.py` across 19 edge-case and failure tests.
- [x] **Baseline Topology Invariance**: Proved by before/after edge set comparison.
- [x] **Temporary Graph Teardown**: Guaranteed by `finally` blocks; zero leaked simulation graphs in FalkorDB.
- [x] **Negative Control Test**: Proved by `test_unrelated_edge_leaves_results_stable` (`changed: false`).
- [x] **Deterministic Ranking**: Proved by `test_ranking_is_deterministic`.
- [x] **Operator Decision Persistence**: Proved by `test_decision_persistence_validation_and_reconnect` (stores approved/rejected status in FalkorDB with 409 conflict prevention).
- [x] **Company Brain Integration**: Proved by `test_company_brain_endpoint` (3 runbooks, 2 ADRs, 5 teams queried via Cypher).
- [x] **No Secrets in Repo**: Verified zero API keys, passwords, or tokens in source code or `.env.example`.
- [x] **Truthful AI Disclosure**: Completed in `docs/AI_DISCLOSURE.md` and `README.md`.
- [x] **80 Engineering Concepts Traceability**: Fully audited in `docs/REQUIREMENT_TRACEABILITY.md`.

---

## 2. Required Manual Actions for the User

The following steps require human action and cannot be executed automatically:

1. **Push to Public GitHub Repository**:
   ```powershell
   git init
   git add .
   git commit -m "feat: ROOTLINE OMNI submission release"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
2. **Record Under-3-Minute Demo Video**:
   - Follow the exact step-by-step click script in `docs/DEMO_SCRIPT.md`.
   - Showcase `INC-2026-101`, Live Graph Surgery cutting `inventory-service -> cache-redis`, path rerouting, the safety grid, and Company Brain runbooks.
3. **Submit on Hackathon Portal**:
   - Primary Track: **Track 01 — Agents That Act on Connected Data** (Counterfactual Live Graph Surgery).
   - Additional Tracks (if multi-track submission allowed):
     - **Track 02 — Investigation Memory** (Persisted human decisions influencing future candidate retrieval).
     - **Track 03 — Company Brain** (Graph-linked team ownership, runbooks, and ADRs).
   - Provide public GitHub repository URL and demo video URL.
