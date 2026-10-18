from backend import graph, investigator as inv, queries as q


def top(r):
    return r["candidates"][0]


def test_cache_ranked_first_for_checkout():
    r = inv.investigate("INC-2026-101", persist=False)
    assert r["conclusion"]["status"] == "ranked" and r["conclusion"]["top_candidate"] == "cache-redis"
    assert [c["service_id"] for c in r["candidates"][:2]] == ["cache-redis", "payment-service"]


def test_scores_equal_breakdown_sum_and_cite_evidence():
    r = inv.investigate("INC-2026-101", persist=False)
    for c in r["candidates"]:
        assert abs(c["score"] - sum(c["score_breakdown"].values())) < 0.02
    t = top(r)
    assert {e["id"] for e in t["supporting_evidence"]} == {"EV-101-2", "EV-101-3"}
    pay = next(c for c in r["candidates"] if c["service_id"] == "payment-service")
    assert [e["id"] for e in pay["contradicting_evidence"]] == ["EV-101-5"]  # conflicting evidence surfaced


def test_contrasting_scenarios_give_different_results():
    a = inv.investigate("INC-2026-101", persist=False)
    b = inv.investigate("INC-2026-102", persist=False)
    assert top(a)["service_id"] == "cache-redis" and top(b)["service_id"] == "message-queue"
    assert top(a)["deployment"] and top(b)["deployment"] is None


def test_inconclusive_when_evidence_is_thin():
    r = inv.investigate("INC-2026-103", persist=False)
    assert r["conclusion"]["status"] == "inconclusive" and r["conclusion"]["top_candidate"] is None
    assert r["recommended_action"]["kind"] == "collect_evidence"


def test_blast_radius_uses_reverse_direction():
    r = inv.investigate("INC-2026-101", persist=False)
    assert {d["service_id"] for d in r["blast_radius"]["dependents"]} == {"api-gateway", "web-frontend"}


def test_unknown_incident_returns_none():
    assert inv.investigate("INC-NOPE") is None


def test_graph_dependence_changing_edges_changes_result():
    """MANDATORY: removing graph relationships must change the investigation outcome."""
    before = inv.investigate("INC-2026-101", persist=False)
    assert top(before)["service_id"] == "cache-redis"
    # 1) remove the CAUSED_BY history edge -> history evidence for cache-redis disappears
    graph.run("MATCH (:Incident {id:'INC-2026-044'})-[r:CAUSED_BY]->(:Service {id:'cache-redis'}) DELETE r")
    mid = inv.investigate("INC-2026-101", persist=False)
    c0 = next(c for c in before["candidates"] if c["service_id"] == "cache-redis")
    c1 = next(c for c in mid["candidates"] if c["service_id"] == "cache-redis")
    assert c1["score"] == c0["score"] - 3.0 and not c1["history"]
    # 2) cut cache-redis out of the dependency graph -> it is no longer even a candidate
    graph.run("MATCH (:Service)-[r:DEPENDS_ON]->(:Service {id:'cache-redis'}) DELETE r")
    after = inv.investigate("INC-2026-101", persist=False)
    assert "cache-redis" not in {c["service_id"] for c in after["candidates"]}
    assert top(after)["service_id"] != "cache-redis"


def test_empty_graph_is_handled():
    graph.delete_graph()
    graph.reset()
    assert inv.investigate("INC-2026-101") is None


def test_cycles_in_dependency_graph_handled_deterministically():
    # Introduce a cyclic dependency: inventory-service -> checkout-service -> ... -> inventory-service
    graph.run("MATCH (a:Service {id:'inventory-service'}), (b:Service {id:'checkout-service'}) "
              "CREATE (a)-[:DEPENDS_ON]->(b)")
    r = inv.investigate("INC-2026-101", persist=False)
    assert r is not None
    # Entry service checkout-service must strictly remain at hop 0
    checkout = next(c for c in r["candidates"] if c["service_id"] == "checkout-service")
    assert checkout["hops_from_affected"] == 0
    assert checkout["path"] == ["checkout-service"]


def test_disconnected_candidate_service_handled():
    # An incident affecting a completely disconnected service with no dependencies or history
    graph.run("CREATE (s:Service {id:'island-service', name:'Island Service', tier:3, kind:'service'})")
    graph.run("CREATE (i:Incident {id:'INC-ISLAND', title:'Island isolated', severity:'SEV3', "
              "ts:1700000000, pattern:'unknown', status:'open', summary:'Isolated service alert'})")
    graph.run("MATCH (i:Incident {id:'INC-ISLAND'}), (s:Service {id:'island-service'}) CREATE (i)-[:AFFECTS]->(s)")
    r = inv.investigate("INC-ISLAND", persist=False)
    assert r is not None
    assert len(r["candidates"]) == 1
    assert r["candidates"][0]["service_id"] == "island-service"
    assert r["conclusion"]["status"] == "inconclusive"
    assert r["blast_radius"]["count"] == 0


def test_stable_tie_breaking_for_equal_scores():
    # Create two identical candidate services with identical hop distance, no deployments, no evidence
    graph.run("CREATE (s1:Service {id:'service-beta', name:'Beta Service', tier:2, kind:'service'})")
    graph.run("CREATE (s2:Service {id:'service-alpha', name:'Alpha Service', tier:2, kind:'service'})")
    graph.run("MATCH (c:Service {id:'checkout-service'}), (s1:Service {id:'service-beta'}), (s2:Service {id:'service-alpha'}) "
              "CREATE (c)-[:DEPENDS_ON]->(s1), (c)-[:DEPENDS_ON]->(s2)")
    r = inv.investigate("INC-2026-101", persist=False)
    alpha = next(c for c in r["candidates"] if c["service_id"] == "service-alpha")
    beta = next(c for c in r["candidates"] if c["service_id"] == "service-beta")
    assert alpha["score"] == beta["score"]
    # Tie-breaking by service_id ensures alphabetical order
    assert alpha["rank"] < beta["rank"]

