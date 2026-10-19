from backend import graph, investigator as inv, queries as q, surgery


def sim_graphs():
    return [g for g in graph.get_db().list_graphs() if "_sim_" in g]


def test_relevant_edge_removal_changes_results_and_baseline_is_restored():
    before_edges = q.edge_count()
    r = surgery.simulate("INC-2026-101", [("inventory-service", "cache-redis")])
    assert r["changed"] and r["before"]["top_candidate"] == "cache-redis"
    assert r["before"]["candidates"]["cache-redis"]["path"] == ["checkout-service", "inventory-service", "cache-redis"]
    assert r["after"]["candidates"]["cache-redis"]["path"] == ["checkout-service", "payment-service", "cache-redis"]  # reroutes
    assert r["isolation"]["baseline_unchanged"] and r["isolation"]["simulation_edges"] == before_edges - 1
    assert q.edge_count() == before_edges and sim_graphs() == []


def test_redundant_path_removal_does_not_change_ranking():
    r = surgery.simulate("INC-2026-101", [("payment-service", "cache-redis")])  # the other 2-hop path remains
    assert r["before"]["top_candidate"] == r["after"]["top_candidate"] == "cache-redis"
    assert r["before"]["candidates"]["cache-redis"]["score"] == r["after"]["candidates"]["cache-redis"]["score"]


def test_removing_both_cache_paths_drops_cache_from_candidates():
    r = surgery.simulate("INC-2026-101", [("payment-service", "cache-redis"), ("inventory-service", "cache-redis")])
    assert "cache-redis" not in r["after"]["candidates"] and r["after"]["top_candidate"] != "cache-redis"
    assert any(c["service_id"] == "cache-redis" and c["after"] is None for c in r["candidate_changes"])


def test_unrelated_edge_leaves_results_stable():
    r = surgery.simulate("INC-2026-101", [("search-service", "search-index")])
    assert not r["changed"] and r["candidate_changes"] == [] and r["blast_radius_removed"] == []
    assert r["before"] == r["after"]


def test_blast_radius_changes_when_upstream_edge_removed():
    r = surgery.simulate("INC-2026-101", [("web-frontend", "api-gateway")])
    assert r["blast_radius_removed"] == ["web-frontend"] and r["before"]["top_candidate"] == r["after"]["top_candidate"]


def test_unknown_edge_rejected_without_creating_simulation_graph():
    try:
        surgery.simulate("INC-2026-101", [("checkout-service", "web-frontend")])  # wrong direction
        assert False, "expected UnknownEdge"
    except surgery.UnknownEdge:
        pass
    assert sim_graphs() == []


def test_failure_mid_simulation_leaves_no_residue(monkeypatch):
    def boom(a, b):
        raise RuntimeError("delete failed")
    monkeypatch.setattr(q, "delete_edge", boom)
    before = q.edge_count()
    try:
        surgery.simulate("INC-2026-101", [("payment-service", "cache-redis")])
    except RuntimeError:
        pass
    assert q.edge_count() == before and sim_graphs() == []


def test_simulation_endpoint_and_audit_record(client):
    ok = client.post("/api/simulate", json={"incident_id": "INC-2026-101", "remove_edges": [{"from": "payment-service", "to": "cache-redis"}]})
    assert ok.status_code == 200 and ok.json()["isolation"]["baseline_unchanged"]
    assert graph.run("MATCH (s:Simulation) RETURN count(s)")[0][0] == 1
    assert client.post("/api/simulate", json={"incident_id": "INC-2026-101", "remove_edges": [{"from": "a", "to": "b"}]}).status_code == 422
    assert client.post("/api/simulate", json={"incident_id": "NOPE", "remove_edges": [{"from": "payment-service", "to": "cache-redis"}]}).status_code == 404
    assert client.post("/api/simulate", json={"incident_id": "INC-2026-101", "remove_edges": []}).status_code == 422
    assert len(client.get("/api/graph/edges").json()["edges"]) == 17


def test_company_brain_and_trace_come_from_graph():
    r = inv.investigate("INC-2026-101", persist=False)
    top = r["candidates"][0]
    assert [x["id"] for x in top["runbooks"]] == ["RB-cache-evictions"] and [x["id"] for x in top["adrs"]] == ["ADR-007"]
    assert top["runbooks"][0]["steps"] and "memory pressure" in top["runbooks"][0]["steps"][0]
    assert top["team"] == "Platform"
    stages = [t["stage"] for t in r["trace"]]
    assert stages == ["incident_context", "dependency_traversal", "evidence_collection", "candidate_ranking",
                      "blast_radius", "ownership_context", "memory_retrieval"]
    graph.run("MATCH (:Runbook {id:'RB-cache-evictions'})-[r:APPLIES_TO]->() DELETE r")
    assert inv.investigate("INC-2026-101", persist=False)["candidates"][0]["runbooks"] == []


def test_ranking_is_deterministic():
    a = inv.investigate("INC-2026-101", persist=False)
    b = inv.investigate("INC-2026-101", persist=False)
    strip = lambda r: [(c["service_id"], c["score"], c["path"]) for c in r["candidates"]]
    assert strip(a) == strip(b)


def test_duplicate_edges_rejected_before_copy():
    before = q.edge_count()
    try:
        surgery.simulate("INC-2026-101", [("payment-service", "cache-redis"), ("payment-service", "cache-redis")])
        assert False, "expected UnknownEdge"
    except surgery.UnknownEdge as exc:
        assert "Duplicate" in str(exc)
    assert q.edge_count() == before and sim_graphs() == []
