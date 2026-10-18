# ROOTLINE OMNI — Adversarial Technical Defense

This document evaluates ROOTLINE OMNI from the perspective of an adversarial graph database engineer and hackathon judge seeking to rigorously challenge the product's claims.

---

## 1. Challenge: "Are graph queries real, or is this just hardcoded JSON?"

**Defense & Proof:**
- FalkorDB is the single system of record. There is no relational database, SQLite fallback, or static JSON store in the data layer.
- All services, incidents, deployments, evidence, runbooks, and ADRs are created in FalkorDB via Cypher in `backend/seed.py`.
- If FalkorDB is stopped, the application immediately returns HTTP 503 (`status: degraded, database: unreachable`) rather than serving fallback mock data.
- **Proof Command**:
  ```powershell
  pytest tests/test_api.py::test_graph_unavailable_returns_503_not_fake_data -q
  ```

---

## 2. Challenge: "Is Live Graph Surgery truly isolated, or are you mutating the baseline graph?"

**Defense & Proof:**
- Live Graph Surgery does **not** delete edges in the baseline graph `rootline` and roll them back.
- It executes `db.select_graph(baseline_name).copy(sim_name)` to create a physically distinct graph in FalkorDB.
- Deletions are executed strictly inside `sim_name` using Python's `contextvars` routing.
- The baseline graph's dependency edge set is read before surgery and compared against the baseline edge set after surgery.
- **Proof Tests**:
  - `test_relevant_edge_removal_changes_results_and_baseline_is_restored`: Baseline topology edge count before and after matches exactly ($N = 17$).
  - `test_unrelated_edge_leaves_results_stable`: Baseline topology is unchanged even when an edge in another subsystem is cut.

---

## 3. Challenge: "What happens if Live Graph Surgery crashes midway? Does it leak temporary graphs?"

**Defense & Proof:**
- The creation and deletion of the temporary graph are wrapped in a Python `try...finally` block.
- In `finally`, `db.select_graph(sim_name).delete()` is guaranteed to execute regardless of whether the rerun succeeded, threw a Cypher error, or encountered a Python exception.
- Teardown success is actively verified by confirming `sim_name not in db.list_graphs()`.
- **Proof Tests**:
  - `test_failure_mid_simulation_leaves_no_residue`: Injects a runtime failure mid-deletion; verifies temporary graph is deleted and zero dangling simulation graphs remain in FalkorDB.
  - `test_investigation_failure_during_simulation_cleans_up`: Injects an exception during the rerun investigation; verifies temporary graph is completely cleaned up.

---

## 4. Challenge: "Could Live Graph Surgery produce false positives (claiming an impact when none occurred)?"

**Defense & Proof:**
- ROOTLINE includes an explicit **Negative Control Test**:
- Removing `search-service → search-index` during an investigation of `INC-2026-101` (Checkout HTTP 500s).
- The simulation runs in an isolated copy, removes the edge, and reruns the investigation.
- The comparison reports `changed: false`, candidate changes `[]`, and blast radius changes `[]`.
- Proves that ROOTLINE only reports impact when graph connectivity actually influences the causal traversal.
- **Proof Test**:
  - `test_unrelated_edge_leaves_results_stable`

---

## 5. Challenge: "Is the ranking score a fake probability?"

**Defense & Proof:**
- The codebase and UI explicitly reject probability claims.
- Every candidate card displays the subtitle: *"deterministic heuristic · not probability"*.
- The score is the mathematical sum of transparent, documented weights:
  - Path proximity: $+3.0 \times (1 - \text{hops} / 5)$
  - Deployment recency: $+4.0 \times (1 - \Delta h / 24)$
  - Same-pattern history: $+3.0$ per past resolved incident (max 2)
  - Other-pattern history: $+1.0$ per past resolved incident (max 2)
  - Supporting evidence: $+1.5$ per supporting record (max 3)
  - Contradicting evidence: $-2.5$ per contradiction record
  - Unsupported penalty: $-1.0$ if no evidence exists
- The UI exposes the exact mathematical breakdown table for every candidate.
- **Proof Test**:
  - `test_scores_equal_breakdown_sum_and_cite_evidence`

---

## 6. Challenge: "Is the Company Brain actually retrieved from the graph?"

**Defense & Proof:**
- Runbooks and ADRs are stored as FalkorDB nodes and queried via Cypher:
  - `(:Runbook)-[:APPLIES_TO]->(:Service)`
  - `(:ADR)-[:GOVERNS]->(:Service)`
  - `(:Team)-[:OWNS]->(:Service)`
- If a runbook relationship is deleted in the graph, it immediately disappears from candidate context.
- **Proof Test**:
  - `test_company_brain_and_trace_come_from_graph`: Deletes the `APPLIES_TO` relationship; verifies runbooks list for the service drops to empty.

---

## 7. Challenge: "Are all 80 engineering concepts accounted for?"

**Defense & Proof:**
- The master 80-point checklist is fully mapped in `docs/REQUIREMENT_TRACEABILITY.md`.
- No requirement was silently omitted or deleted.
- Each concept has an exact disposition (`IMPLEMENT NOW`, `IMPLEMENT AS OPTIONAL PROFILE`, `DOCUMENT / ARCHITECT`, `NOT APPLICABLE`, `BLOCKED`) with code path and verification evidence.
- Relational SQL concepts (e.g. `PgBouncer`, `SELECT FOR UPDATE`) are honestly classified as not applicable to property graphs rather than dishonestly claimed as implemented.
