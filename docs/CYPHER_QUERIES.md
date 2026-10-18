# ROOTLINE OMNI — Parameterized Cypher Query Guide

All graph queries in ROOTLINE are executed via the FalkorDB Cypher engine (`falkordb-py`).  
Every query is strictly parameterized with a dictionary of values; user input is never interpolated into query strings.

---

## 1. Indexing & Schema Idempotence (`backend/seed.py`)

### 1.1 Index Creation
Indexes ensure $O(1)$ node seek performance for lookups by unique identifier:
```cypher
CREATE INDEX FOR (n:Service) ON (n.id)
CREATE INDEX FOR (n:Incident) ON (n.id)
CREATE INDEX FOR (n:Deployment) ON (n.id)
CREATE INDEX FOR (n:Evidence) ON (n.id)
CREATE INDEX FOR (n:Investigation) ON (n.id)
CREATE INDEX FOR (n:Team) ON (n.id)
```

### 1.2 Idempotent Batch Seeding (`UNWIND ... MERGE`)
```cypher
// Services
UNWIND $r AS r 
MERGE (s:Service {id: r.id}) 
SET s.name = r.name, s.tier = r.tier, s.kind = r.kind

// Directed Dependencies
UNWIND $r AS r 
MATCH (a:Service {id: r.a}), (b:Service {id: r.b}) 
MERGE (a)-[:DEPENDS_ON]->(b)

// Deployments with Service Relationship
UNWIND $r AS r 
MERGE (d:Deployment {id: r.id}) 
SET d.version = r.v, d.ts = r.ts, d.summary = r.sum 
WITH d, r 
MATCH (s:Service {id: r.s}) 
MERGE (d)-[:CHANGED]->(s)
```

---

## 2. Investigation Traversal Queries (`backend/queries.py`)

### 2.1 Multi-Hop Dependency Traversal (Forward Direction)
Traverses the directed acyclic graph forward from the affected service up to 4 hops:
```cypher
MATCH p = (a:Service {id: $sid})-[:DEPENDS_ON*1..4]->(c:Service) 
RETURN c.id, c.name, c.kind, length(p), [n IN nodes(p) | n.id]
```
- Parameters: `{"sid": "checkout-service"}`
- Returned data: Discovered candidate service, length of path, and explicit ordered node sequence.

### 2.2 Reverse Dependency Blast Radius (Incoming Direction)
Traverses incoming edges in reverse to determine what upstream services depend on the target:
```cypher
MATCH p = (d:Service)-[:DEPENDS_ON*1..4]->(a:Service {id: $sid}) 
RETURN d.id, d.name, d.tier, length(p), [n IN nodes(p) | n.id]
```
- Parameters: `{"sid": "checkout-service"}`
- Result: Upstream dependents (`api-gateway`, `web-frontend`) affected by outages in the target.

### 2.3 Temporal Deployment Correlation
Finds deployments modifying candidate services within a bounded time window prior to the incident:
```cypher
MATCH (d:Deployment)-[:CHANGED]->(s:Service) 
WHERE s.id IN $cids AND d.ts <= $ts AND d.ts >= $since 
RETURN s.id, d.id, d.version, d.ts, d.summary
```
- Parameters: `{"cids": ["cache-redis", "payment-service"], "ts": 1791987000, "since": 1791900600}`

### 2.4 Historical Incident Pattern Matching
Finds resolved historical incidents whose root cause was linked via `CAUSED_BY`:
```cypher
MATCH (h:Incident)-[:CAUSED_BY]->(s:Service) 
WHERE s.id IN $cids AND h.status = 'resolved' AND h.id <> $iid 
RETURN s.id, h.id, h.title, h.pattern, h.resolution, h.ts
```

### 2.5 Incident Evidence Retrieval
Traverses evidence linked to the incident and maps it to the specific service it concerns:
```cypher
MATCH (i:Incident {id: $iid})-[:HAS_EVIDENCE]->(e:Evidence)-[:ABOUT]->(s:Service) 
RETURN s.id, e.id, e.kind, e.polarity, e.text, e.ts
```

---

## 3. Company Brain Queries (`backend/queries.py`)

### 3.1 Aggregated Company Brain Overview
Collects all runbooks, architecture decisions, and team ownership mappings in single round-trip Cypher queries:
```cypher
// Runbooks
MATCH (r:Runbook)-[:APPLIES_TO]->(s:Service) 
RETURN r.id, r.title, r.uri, r.steps, collect(s.id) ORDER BY r.id

// Architecture Decisions (ADRs)
MATCH (a:ADR)-[:GOVERNS]->(s:Service) 
RETURN a.id, a.title, a.decision, collect(s.id) ORDER BY a.id

// Team Ownership Directory
MATCH (t:Team)-[:OWNS]->(s:Service) 
RETURN t.id, t.name, collect(s.id) ORDER BY t.name
```

---

## 4. Live Graph Surgery Queries (`backend/queries.py`)

### 4.1 Edge Existence Verification (Pre-Flight)
Checks that the selected edge exists before cloning resources:
```cypher
MATCH (:Service {id: $a})-[r:DEPENDS_ON]->(:Service {id: $b}) 
RETURN count(r)
```

### 4.2 Targeted Dependency Edge Deletion (Simulation Graph Only)
Executed *exclusively* inside the temporary isolated simulation graph:
```cypher
MATCH (:Service {id: $a})-[r:DEPENDS_ON]->(:Service {id: $b}) 
DELETE r
```

### 4.3 Simulation Audit Logging (Baseline Graph)
Records an immutable simulation audit node on the baseline graph without modifying dependency topology:
```cypher
CREATE (:Simulation {
  id: $id, 
  incident_id: $iid, 
  removed_edges: $edges, 
  created_at: $ts, 
  top_before: $tb, 
  top_after: $ta, 
  changed: $ch
})
```
