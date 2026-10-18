# ROOTLINE OMNI — Operational Boundaries & Limitations

In compliance with the project's non-negotiable transparency rules, this document provides an honest, rigorous accounting of ROOTLINE OMNI's technical boundaries, assumptions, and design trade-offs.

---

## 1. Synthetic Data & Operational Isolation

- **Fictional Demonstration Data**: All 15 services, 7 incidents, 10 evidence records, 3 runbooks, and 2 architecture decisions are completely synthetic, authored specifically for Graph Hacks 2026.
- **No Production Telemetry Access**: ROOTLINE does not connect to live Datadog, Prometheus, CloudWatch, or OpenTelemetry collectors. It reads structured graph evidence records stored in FalkorDB.
- **No Automated Remediation**: ROOTLINE is strictly an incident investigation and counterfactual analysis workbench. It does not execute rollbacks, restart containers, or modify Kubernetes pods. All suggested actions require human operator approval.

---

## 2. Heuristic Scoring vs. Probabilities

- **Deterministic Weights**: Candidate cause scores are computed using hand-authored, explainable weights (distance from entry point, deployment recency within a 24h window, historical pattern matches, and evidence polarity).
- **Not Calibrated Probabilities**: Scores (e.g. `7.00`, `3.50`) are heuristic ranking metrics, **not statistical probabilities**. A score of 7.00 does not mean "70% probability of root cause."
- **Inconclusive Threshold**: Incidents where no candidate reaches a heuristic score of `4.00` (e.g. `INC-2026-103`) are deliberately classified as `inconclusive` with a recommendation to collect more evidence.

---

## 3. Workflow Orchestration vs. Autonomous Multi-Agent

- **Deterministic Pipeline**: The investigation trace represents sequential backend execution stages (`incident_context`, `dependency_traversal`, `evidence_collection`, `candidate_ranking`, `blast_radius`, `ownership_context`, `memory_retrieval`).
- **No LLM Planner**: ROOTLINE does not employ an autonomous multi-agent coordinator or generative AI planner. All graph traversals and ranking rules are deterministic, reproducible, and inspectable code.

---

## 4. Live Graph Surgery Scope

- **Supported Operations**: Live Graph Surgery supports counterfactual removal of directed `DEPENDS_ON` edges between services. It does not support arbitrary node deletion, service property modification, or schema alterations in the simulation graph.
- **Graph-Copy Prerequisite**: Requires a FalkorDB server that supports `GRAPH.COPY`. If running against a restricted environment where graph copying is disabled, the API fails closed with HTTP 503 rather than manufacturing a partial clone.
- **Baseline Topology Invariance**: When Live Graph Surgery completes, an immutable `(:Simulation)` audit record is appended to the baseline graph. Therefore, "baseline unchanged" refers to dependency topology, candidate rankings, and investigation rerun invariance—not byte-for-byte file immutability.

---

## 5. Deployment Model

- **Local Workstation Prototype**: The current implementation is optimized for single-operator local execution using Python 3.12, Vite 5, and Docker FalkorDB.
- **Multi-Tenant Extensions**: Architectural patterns for OAuth 2.0/OIDC, distributed Redis locking, and Kafka outbox event streaming are documented in `docs/ARCHITECTURE.md` as production blueprints, but are not active in this hackathon prototype to avoid introducing untested infrastructure.
