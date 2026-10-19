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


def test_contradiction_red_herring_penalized():
    # payment-service has deployment DEP-502 (recent) but EV-101-5 contradicts it
    r = inv.investigate("INC-2026-101", persist=False)
    pay = next(c for c in r["candidates"] if c["service_id"] == "payment-service")
    assert pay["score_breakdown"]["evidence_contradiction"] < 0
    assert "EV-101-5" in pay["contradicting_evidence_ids"]
    assert any("Contradicting evidence" in lim for lim in pay["limitations"])


def test_abstention_on_close_call_or_tie():
    # Insert a temporary synthetic incident where two candidates tie on score >= 4.0
    now = 1792000000
    graph.run("CREATE (s_gw:Service {id:'synth-gateway', name:'Synth Gateway', tier:1, kind:'service', synthetic:true}), "
              "(sa:Service {id:'synth-svc-a', name:'Synth A', tier:2, kind:'service', synthetic:true}), "
              "(sb:Service {id:'synth-svc-b', name:'Synth B', tier:2, kind:'service', synthetic:true}), "
              "(s_gw)-[:DEPENDS_ON]->(sa), (s_gw)-[:DEPENDS_ON]->(sb), "
              "(i:Incident {id:'INC-SYNTH-TIE', title:'Synthetic Tie', severity:'SEV1', ts:$ts, pattern:'latency_spike', status:'open', summary:'Tie test', synthetic:true})-[:AFFECTS]->(s_gw)", {"ts": now})
    graph.run("CREATE (e1:Evidence {id:'EV-TIE-1', kind:'metric', polarity:'supports', text:'sup1', ts:$ts, synthetic:true}), "
              "(e2:Evidence {id:'EV-TIE-2', kind:'metric', polarity:'supports', text:'sup2', ts:$ts, synthetic:true}), "
              "(e3:Evidence {id:'EV-TIE-3', kind:'log', polarity:'supports', text:'sup3', ts:$ts, synthetic:true}), "
              "(e4:Evidence {id:'EV-TIE-4', kind:'log', polarity:'supports', text:'sup4', ts:$ts, synthetic:true}), "
              "(i:Incident {id:'INC-SYNTH-TIE'})-[:HAS_EVIDENCE]->(e1), (e1)-[:ABOUT]->(:Service {id:'synth-svc-a'}), "
              "(i)-[:HAS_EVIDENCE]->(e2), (e2)-[:ABOUT]->(:Service {id:'synth-svc-a'}), "
              "(i)-[:HAS_EVIDENCE]->(e3), (e3)-[:ABOUT]->(:Service {id:'synth-svc-b'}), "
              "(i)-[:HAS_EVIDENCE]->(e4), (e4)-[:ABOUT]->(:Service {id:'synth-svc-b'})", {"ts": now})
    try:
        r = inv.investigate("INC-SYNTH-TIE", persist=False)
        assert r is not None
        assert len(r["candidates"]) >= 2
        assert r["candidates"][0]["score"] == r["candidates"][1]["score"]
        assert r["candidates"][0]["score"] >= 4.0
        # Because gap < CLOSE_CALL_MARGIN (1.0), status must abstain to inconclusive
        assert r["conclusion"]["status"] == "inconclusive"
        assert r["conclusion"]["top_candidate"] is None
        assert "close call" in r["conclusion"]["note"].lower()
        assert r["recommended_action"]["kind"] == "collect_evidence"
    finally:
        graph.run("MATCH (i:Incident {id:'INC-SYNTH-TIE'}) DETACH DELETE i")
        graph.run("MATCH (e:Evidence) WHERE e.id IN ['EV-TIE-1', 'EV-TIE-2', 'EV-TIE-3', 'EV-TIE-4'] DETACH DELETE e")
        graph.run("MATCH (s:Service) WHERE s.id IN ['synth-gateway', 'synth-svc-a', 'synth-svc-b'] DETACH DELETE s")


def test_missing_data_flags_and_no_fabrication():
    r = inv.investigate("INC-2026-101", persist=False)
    for c in r["candidates"]:
        assert "missing_data" in c
        assert isinstance(c["missing_data"]["owner"], bool)
        assert isinstance(c["missing_data"]["runbooks"], bool)
        assert isinstance(c["missing_data"]["deployment"], bool)
        # Verify runbooks are not fabricated when missing
        if c["missing_data"]["runbooks"]:
            assert len(c["runbooks"]) == 0
