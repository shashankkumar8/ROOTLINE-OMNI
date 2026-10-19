from backend import graph, queries as q
from backend.seed import seed


def count(label):
    return graph.run(f"MATCH (n:{label}) RETURN count(n)")[0][0]


def test_connection():
    assert graph.run("RETURN 1")[0][0] == 1


def test_seed_is_idempotent():
    before = (count("Service"), count("Incident"), count("Evidence"),
              graph.run("MATCH ()-[r]->() RETURN count(r)")[0][0])
    seed(); seed()
    after = (count("Service"), count("Incident"), count("Evidence"),
             graph.run("MATCH ()-[r]->() RETURN count(r)")[0][0])
    assert before == after


def test_dependency_traversal_multihop():
    raw = q.dependency_paths("checkout-service")
    cache_paths = {tuple(r[4]) for r in raw if r[0] == "cache-redis"}
    # two distinct 2-hop paths reach the shared cache: via payment-service and via inventory-service
    assert cache_paths == {("checkout-service", "payment-service", "cache-redis"),
                           ("checkout-service", "inventory-service", "cache-redis")}
    assert all(r[3] == 2 for r in raw if r[0] == "cache-redis")
    assert "payments-db" in {r[0] for r in raw}


def test_traversal_direction_is_correct():
    deps = {r[0] for r in q.dependency_paths("checkout-service")}
    assert "web-frontend" not in deps and "api-gateway" not in deps  # callers are not dependencies
    dependents = {r[0] for r in q.dependents("payments-db")}
    assert dependents == {"payment-service", "checkout-service", "api-gateway", "web-frontend"}
    assert "order-service" not in dependents and "orders-db" not in dependents


def test_history_retrieval():
    rows = q.history(["cache-redis", "payments-db"], "INC-2026-101")
    ids = {r[1] for r in rows}
    assert ids == {"INC-2026-044", "INC-2026-019"}
    assert all(r[4] for r in rows)  # every historical incident has a documented resolution


def test_open_incidents_excluded_from_history():
    assert all(r[1] != "INC-2026-101" for r in q.history(["checkout-service"], "x") if r[3])


def test_ro_run_executes_reads_and_blocks_mutations():
    import pytest
    from redis.exceptions import ResponseError
    # Reads succeed through ro_run
    res = graph.ro_run("MATCH (s:Service {id:$sid}) RETURN s.id, s.name", {"sid": "checkout-service"})
    assert len(res) == 1 and res[0][0] == "checkout-service"
    # Mutations must be blocked by FalkorDB ro_query
    with pytest.raises(ResponseError) as exc_info:
        graph.ro_run("CREATE (n:IllegalNode {id:'bad'})")
    assert "read-only" in str(exc_info.value).lower()


def test_synthetic_data_labeling_on_all_seeded_entities():
    # Every seeded entity must be explicitly labeled synthetic
    for label in ["Service", "Incident", "Evidence", "Deployment", "Team", "Runbook", "ADR"]:
        rows = graph.ro_run(f"MATCH (n:{label}) RETURN count(n), count(n.synthetic)")
        total, labeled = rows[0][0], rows[0][1]
        assert total > 0, f"Expected seeded {label} nodes"
        assert total == labeled, f"Unlabeled synthetic data found in {label}"


def test_parameterized_query_safety():
    # Verify parameterized values with special characters cannot break Cypher syntax
    res = q.get_incident("INC-2026-101' OR 1=1 --")
    assert res is None
    ev = q.incident_evidence("'; DROP GRAPH rootline; --")
    assert ev == []
