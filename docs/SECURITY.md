# ROOTLINE OMNI — Security & Threat Mitigation Specification

## 1. Threat Model Overview

ROOTLINE OMNI operates as a local-first incident investigation console communicating with an in-memory graph database (FalkorDB).

```
[ Browser / Operator ]
        │  (HTTP / localhost)
        ▼
[ FastAPI Gateway ] ── (Pydantic Schema Validation & Bound Checking)
        │  (Parameterized Cypher)
        ▼
[ FalkorDB Engine ] ── (Isolated Memory Graph Store)
```

### Potential Attack Vectors Considered:
1. **Cypher Query Injection**: Malicious input attempting to break out of Cypher clauses to read or alter unauthorized graph data.
2. **Resource Exhaustion (DoS)**: Overly large graph surgery requests or cyclic dependency explosions causing unbounded memory growth.
3. **Cross-Origin Script Access (CORS)**: Unauthorized third-party web pages accessing the local API.
4. **State Leakage / Temporary Graph Collisions**: Concurrent surgery requests colliding on shared temporary graph names.
5. **Credential Exposure**: Hardcoded passwords or tokens committed to version control.

---

## 2. Implemented Security Controls

### 2.1 100% Parameterized Cypher Queries
All dynamic values (incident IDs, timestamps, service IDs, simulation properties) are passed through FalkorDB's parameter dictionary (`$params`).
- **No string formatting**: User input is never interpolated via `f"..."` into Cypher clauses.
- **Constant Hop Bounds**: Variable-length pattern limits (`[:DEPENDS_ON*1..4]`) use a constant integer (`MAX_HOPS = 4`) hardcoded in the codebase, preventing unbounded traversal depths.

### 2.2 Strict Input Validation & Bounded Payloads
Every API endpoint is protected by Pydantic models with explicit length and format constraints:
- `DecisionIn`: Rationale constrained between 3 and 1000 characters; whitespace-only strings are rejected with HTTP 422.
- `SimulateIn`: `incident_id` constrained to max 100 chars; `remove_edges` array strictly bounded to between 1 and 3 items.
- Duplicate edges and self-referential edges (`a -> a`) are rejected before any graph allocation occurs.

### 2.3 Collision-Resistant Simulation Graph Naming
Simulation graphs are created with cryptographically random UUIDs:
```python
sim_name = f"{baseline_name}_sim_{uuid.uuid4().hex[:8]}"
```
This guarantees that multiple concurrent operator requests never share or overwrite the same temporary graph.

### 2.4 Guaranteed Temporary Resource Teardown
All simulation graphs are destroyed in a Python `finally` block:
```python
finally:
    try:
        if sim_name in db.list_graphs():
            db.select_graph(sim_name).delete()
        sim_deleted = sim_name not in db.list_graphs()
    except Exception:
        sim_deleted = False
```
If deletion fails due to an unexpected database error, `simulation_graph_deleted` is reported as `false`, alerting the operator immediately.

### 2.5 Strict CORS Origin Allowlist
The FastAPI gateway strictly restricts incoming requests:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
Third-party origins are rejected by the browser's preflight check.

### 2.6 Zero Secrets in Source Control
- Database credentials and connection settings are loaded strictly through environment variables.
- `.env` is excluded in `.gitignore`.
- `.env.example` contains only benign local placeholders (`FALKORDB_HOST=localhost`, `FALKORDB_PORT=6379`, `FALKORDB_PASSWORD=`).
- No API keys, credentials, or production tokens exist anywhere in the repository.
