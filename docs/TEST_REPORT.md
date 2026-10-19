> **Freshness note (2026-10-19):** This report records tests from a prior revision. The ToG-inspired workbench and MCP-style routes on `review/gemini-tog-integration` were added afterward; these historical results do not verify that branch. Run the full test suite and frontend build on the exact revision intended for release before updating any pass counts.

---

# ROOTLINE OMNI — Test Execution Report

**Execution Date:** 2026-10-18  
**Environment:** Windows PowerShell, Python 3.12.10, Node.js v25.5.0, npm 11.8.0, Docker Desktop 29.8.2  
**Target Database:** FalkorDB 1.8.0 (Docker container `rootline-falkordb`, port 6379)  
**Overall Result:** **46 / 46 tests passing (100%)**

---

## 1. Test Suite Summary

```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.1.1, pluggy-1.7.0
rootdir: C:\Users\LENOVO\Downloads\ROOTLINE_OMNI_FINAL (1)\rootline
configfile: pytest.ini
testpaths: tests
collected 46 items

tests/test_api.py ..........                                             [ 21%]
tests/test_graph.py ......                                               [ 34%]
tests/test_investigator.py ...........                                   [ 58%]
tests/test_surgery.py ...................                                [100%]

============================== 46 passed in 10.23s ==============================
```

---

## 2. Test File Breakdown

### 2.1 `tests/test_api.py` (10 Tests)
| Test Function | Description | Result |
|---|---|---|
| `test_health` | Probes `/api/health`, verifies `status: ok` and database connectivity | **PASS** |
| `test_incidents_and_overview` | Tests `/api/incidents` (7 items) and `/api/graph/overview` (15 services, 17 edges) | **PASS** |
| `test_company_brain_endpoint` | Tests `/api/company-brain` (3 runbooks, 2 ADRs, 5 teams) | **PASS** |
| `test_unknown_ids_404` | Verifies 404 responses for non-existent incident and investigation IDs | **PASS** |
| `test_investigation_persists_with_graph_links` | Verifies that `/api/investigate/{id}` persists report, evidence links, and actions | **PASS** |
| `test_decision_persistence_validation_and_reconnect` | Tests rationale validation, approval/rejection, 409 conflict, and database reconnect | **PASS** |
| `test_memory_surfaces_prior_decision` | Verifies that a recorded decision on `cache-redis` surfaces in subsequent investigations | **PASS** |
| `test_graph_unavailable_returns_503_not_fake_data` | Simulates database outage and verifies clean HTTP 503 error without manufactured data | **PASS** |
| `test_favicon` | Verifies `/favicon.ico` serves official SVG graph icon with HTTP 200 | **PASS** |
| `test_legal_routes` | Verifies `/privacy` and `/terms` standalone routes return HTTP 200 | **PASS** |

### 2.2 `tests/test_graph.py` (6 Tests)
| Test Function | Description | Result |
|---|---|---|
| `test_connection` | Confirms raw Cypher `RETURN 1` connection to FalkorDB container | **PASS** |
| `test_seed_is_idempotent` | Runs seed twice and proves node, edge, and label counts remain invariant | **PASS** |
| `test_dependency_traversal_multihop` | Verifies forward 2-hop parallel dependency paths to `cache-redis` | **PASS** |
| `test_traversal_direction_is_correct` | Proves callers (`web-frontend`) are excluded from downstream dependency trees | **PASS** |
| `test_history_retrieval` | Verifies resolved historical incidents connected through `CAUSED_BY` | **PASS** |
| `test_open_incidents_excluded_from_history` | Proves unresolved/open incidents are never cited as historical resolution precedent | **PASS** |

### 2.3 `tests/test_investigator.py` (11 Tests)
| Test Function | Description | Result |
|---|---|---|
| `test_cache_ranked_first_for_checkout` | Verifies `INC-2026-101` ranks `cache-redis` as #1 candidate cause | **PASS** |
| `test_scores_equal_breakdown_sum_and_cite_evidence` | Validates heuristic score breakdown sum and surfaces canary contradiction on `payment-service` | **PASS** |
| `test_contrasting_scenarios_give_different_results` | Compares `INC-2026-101` (Redis) against `INC-2026-102` (Message Queue) | **PASS** |
| `test_inconclusive_when_evidence_is_thin` | Verifies `INC-2026-103` returns `inconclusive` status with `collect_evidence` action | **PASS** |
| `test_blast_radius_uses_reverse_direction` | Tests reverse dependency traversal from `checkout-service` upstream to frontend | **PASS** |
| `test_unknown_incident_returns_none` | Verifies unknown incident ID returns `None` safely | **PASS** |
| `test_graph_dependence_changing_edges_changes_result` | Proves deleting graph relationships directly alters investigation outcome | **PASS** |
| `test_empty_graph_is_handled` | Verifies zero-crash graceful handling when graph is empty | **PASS** |
| `test_cycles_in_dependency_graph_handled_deterministically` | Introduces circular dependency edge; proves entry service strictly stays at hop 0 | **PASS** |
| `test_disconnected_candidate_service_handled` | Tests isolated service with 0 edges; handles gracefully without exceptions | **PASS** |
| `test_stable_tie_breaking_for_equal_scores` | Tests two candidate services with identical score; proves deterministic alphabetical tie-breaking | **PASS** |

### 2.4 `tests/test_surgery.py` (19 Tests)
| Test Function | Description | Result |
|---|---|---|
| `test_relevant_edge_removal_changes_results_and_baseline_is_restored` | Removes `inventory -> cache`; verifies rerouting via `payment`, baseline topology unchanged, cleanup verified | **PASS** |
| `test_redundant_path_removal_does_not_change_ranking` | Cuts redundant path; verifies ranking stability | **PASS** |
| `test_removing_both_cache_paths_drops_cache_from_candidates` | Cuts both parallel paths; proves cache drops out of candidates entirely | **PASS** |
| `test_unrelated_edge_leaves_results_stable` | **Negative Control**: cuts search edge; proves checkout results remain 100% identical | **PASS** |
| `test_blast_radius_changes_when_upstream_edge_removed` | Verifies blast radius contracts when upstream caller is pruned | **PASS** |
| `test_unknown_edge_rejected_without_creating_simulation_graph` | Non-existent edge rejected with `UnknownEdge` (422) before cloning | **PASS** |
| `test_failure_mid_simulation_leaves_no_residue` | Simulates edge deletion failure; verifies temporary graph deleted in `finally` | **PASS** |
| `test_simulation_endpoint_and_audit_record` | Tests `/api/simulate` endpoint, 422 validations, and `(:Simulation)` audit node creation | **PASS** |
| `test_company_brain_and_trace_come_from_graph` | Verifies runbooks, ADRs, owning teams, and 7-stage timings originate from graph | **PASS** |
| `test_ranking_is_deterministic` | Consecutive runs against identical graph return bit-for-bit identical scores | **PASS** |
| `test_duplicate_edges_rejected_before_copy` | Rejects duplicate input edges before allocating clone | **PASS** |
| `test_selected_edge_missing_rejected` | Explicit missing edge rejection test | **PASS** |
| `test_self_referential_edge_rejected` | Rejects invalid `a -> a` self-loops | **PASS** |
| `test_empty_edge_list_rejected` | Rejects empty surgery requests | **PASS** |
| `test_graph_copy_failure_handled_safely` | Simulates FalkorDB copy failure; verifies clean error and zero dangling graphs | **PASS** |
| `test_investigation_failure_during_simulation_cleans_up` | Simulates exception during rerun; verifies temporary graph teardown | **PASS** |
| `test_repeated_and_concurrent_simulations_safety` | Consecutive simulations generate distinct UUID graphs with full cleanup | **PASS** |
| `test_temporary_graph_lifecycle_and_cleanup` | Verifies edge count reduction in simulation and 100% destruction after finish | **PASS** |
| `test_graph_copy_failure_api_returns_503` | Verifies HTTP 503 response when graph copy is disabled | **PASS** |

---

## 3. Frontend Production Build Verification

```powershell
cd frontend
npm run build
```
- **Output:**
  - `dist/index.html`: 0.99 kB
  - `dist/assets/index-CB7moncz.css`: 11.40 kB
  - `dist/assets/index-CqboDSQQ.js`: 170.46 kB
- **Compilation Time:** 2.58 seconds
- **Lint / Type Errors:** 0 errors
- **Static Asset Serving:** Mounted at `/` via FastAPI `StaticFiles(directory='frontend/dist', html=True)`.
