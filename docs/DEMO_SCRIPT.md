# ROOTLINE OMNI — 3-Minute Judge Demo Script

**Target Duration:** 2 minutes 45 seconds (under 3:00)  
**Primary Track:** Track 01 — Agents That Act on Connected Data  
**Supporting Themes:** Track 02 (Investigation Memory), Track 03 (Company Brain)  
**Tone:** Confident, technical, transparent, metric-driven SRE/Distributed Systems engineer.

---

### [0:00 – 0:20] The Problem & Graph-Native Pitch
- **Action**: Screen shows the ROOTLINE OMNI interface at `http://localhost:8000/`. The header shows `FalkorDB connected · graph “rootline” · synthetic data`.
- **Narration**:  
  *"When complex distributed systems fail, observability tools show you alerts and telemetry, but they can't answer causal questions. Most AI tools hallucinate explanations because they don't reason over topology. ROOTLINE OMNI is a graph-native incident investigation workbench powered by FalkorDB. It traverses dependency paths, weighs supporting and contradictory evidence, and performs Live Graph Surgery—an isolated counterfactual graph intervention to prove what actually caused the incident."*

---

### [0:20 – 0:55] Incident Selection & 7-Stage Graph Investigation
- **Action**: Click `INC-2026-101` (SEV1: Checkout returning HTTP 500s). Click **"Run investigation"**. The loading shimmer appears, and in under 50ms the investigation renders.
- **Narration**:  
  *"Here is incident INC-2026-101: checkout error rate surged to 38%. When we click 'Run investigation', FalkorDB executes a 7-stage deterministic diagnostic pipeline. Notice the top candidate cause: Redis Cache (cache-redis) with a heuristic score of 7.00. Notice the second candidate, Payment Service, has contradicting evidence: a canary rollback of deployment DEP-502 on a single pod did not change error rates, which penalized its score by -2.5. Every score is a transparent, deterministic heuristic calculated from graph proximity, deployment recency, historical matches, and evidence polarity—not a generative hallucination or fake probability."*

---

### [0:55 – 1:20] Causal Paths & Reverse Blast Radius
- **Action**: Expand `#1 Redis Cache`, show the score breakdown table, the evidence links, and the dependency path chip list (`checkout-service → inventory-service → cache-redis`). Scroll down to the **Blast Radius** table showing `api-gateway` and `web-frontend`.
- **Narration**:  
  *"ROOTLINE discovers candidate causes through forward traversal along DEPENDS_ON edges up to 4 hops. Simultaneously, it traverses edges in reverse to compute blast radius—showing that API Gateway and Web Frontend are directly impacted upstream. Below candidate ranking, ROOTLINE exposes the real backend trace with microsecond stage timings and Cypher operations."*

---

### [1:20 – 2:05] Live Graph Surgery: Counterfactual Experiment
- **Action**: Scroll to the **Live Graph Surgery** panel. Click the demo preset button:  
  **`🎯 Key Cut: inventory → cache`**  
  (Selecting `inventory-service → cache-redis`). Click **"Cut edge and compare"**.
- **Narration**:  
  *"Now let's test our signature feature: Live Graph Surgery. We want to test a hypothesis: what if the dependency between Inventory Service and Redis Cache is severed? Does the outage path change?  
  Watch what happens: FalkorDB clones the entire baseline graph into a temporary isolated graph using GRAPH.COPY. In that isolated copy alone, ROOTLINE removes the selected edge, reruns the exact same investigation, and compares the outcomes.  
  Look at the vector SVG comparison: the baseline path reached Redis through Inventory Service. In the counterfactual graph, that path is broken, forcing the causal path to reroute through Payment Service! The before-and-after candidate diff and blast radius deltas are immediately visible."*

---

### [2:05 – 2:25] Safety Grid & Invariance Verification
- **Action**: Point to the **Safety Grid** in the surgery results:
  - Baseline topology: **`UNCHANGED`**
  - Baseline result: **`UNCHANGED`**
  - Temporary graph: **`CLEANED`**
  - Audit record: **`SAVED`**
- **Narration**:  
  *"Live Graph Surgery guarantees safety:  
  First, baseline dependency topology was verified before and after the experiment—it remains strictly invariant.  
  Second, the temporary graph was completely destroyed in a finally block, leaving zero leaked database state.  
  Third, an immutable simulation audit node was recorded on the baseline graph to provide a permanent audit trail.  
  And if we cut an unrelated edge—like search-service to search-index—the system reports 'Investigation unchanged', proving it does not produce false positives."*

---

### [2:25 – 2:45] Human Decision Recording & Company Brain
- **Action**:
  1. Scroll to **Proposed Action**. Type `Reverting DEP-501 per past resolution INC-2026-044` into the rationale box. Click **"Approve Recommendation"**. Show the green confirmation badge.
  2. Click the **"🧠 Company Brain"** tab. Show the 3 Runbooks and 2 ADRs. Click **"Open Runbook Steps"** on `RB-cache-evictions` to display the modal.
- **Narration**:  
  *"ROOTLINE enforces human-in-the-loop governance: nothing is automatically remediated. We record our operator approval with rationale directly into FalkorDB, where it persists as organizational memory for future investigations.  
  Finally, our Company Brain tab surfaces runbooks, architecture decisions, and owning teams queried directly through graph relationships.  
  All 44 automated backend tests are passing against our live FalkorDB container, and the frontend production build compiles in 2.5 seconds.  
  This is ROOTLINE OMNI—connected incident intelligence with counterfactual proof."*
