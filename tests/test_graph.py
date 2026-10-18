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
