import pytest

from backend import graph


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["seeded"] is True


def test_incidents_and_overview(client):
    assert len(client.get("/api/incidents").json()["incidents"]) == 7
    o = client.get("/api/graph/overview").json()
    assert o["nodes"]["Service"] == 15 and o["dependency_edges"] == 17


def test_unknown_ids_404(client):
    assert client.post("/api/investigate/INC-NOPE").status_code == 404
    assert client.get("/api/investigations/INV-NOPE").status_code == 404
    assert client.post("/api/investigations/INV-NOPE/decision", json={"decision": "approved", "rationale": "ok ok"}).status_code == 404


def test_investigation_persists_with_graph_links(client):
    r = client.post("/api/investigate/INC-2026-101").json()
    got = client.get(f"/api/investigations/{r['investigation_id']}").json()
    links = got["persisted_graph_links"]
    assert links["used_evidence"] == ["EV-101-2", "EV-101-3", "EV-101-4", "EV-101-5", "EV-101-6"]
    assert links["ranked"][0]["service_id"] == "cache-redis" and links["action"]["text"]
    assert got["decision"]["status"] == "pending"
    assert len(client.get("/api/investigations").json()["investigations"]) == 1


def test_decision_persistence_validation_and_reconnect(client):
    iid = client.post("/api/investigate/INC-2026-101").json()["investigation_id"]
    url = f"/api/investigations/{iid}/decision"
    assert client.post(url, json={"decision": "maybe", "rationale": "because"}).status_code == 422
    assert client.post(url, json={"decision": "approved", "rationale": ""}).status_code == 422
    assert client.post(url, json={"decision": "approved", "rationale": "   "}).status_code == 422
    assert client.post(url, json={"decision": "approved", "rationale": "Matches prior fix"}).status_code == 200
    assert client.post(url, json={"decision": "rejected", "rationale": "changed mind"}).status_code == 409
    graph.reset()  # drop the client connection and reconnect, as after an API restart
    got = client.get(f"/api/investigations/{iid}").json()
    assert got["decision"]["status"] == "approved" and got["decision"]["rationale"] == "Matches prior fix"


def test_memory_surfaces_prior_decision(client):
    first = client.post("/api/investigate/INC-2026-101").json()["investigation_id"]
    client.post(f"/api/investigations/{first}/decision", json={"decision": "approved", "rationale": "Reverted DEP-501"})
    second = client.post("/api/investigate/INC-2026-101").json()
    assert second["prior_investigations"][0]["investigation_id"] == first
    assert second["prior_investigations"][0]["decision"] == "approved"


def test_graph_unavailable_returns_503_not_fake_data(client, monkeypatch):
    monkeypatch.delenv("FALKORDB_EMBEDDED_PATH", raising=False)
    monkeypatch.setenv("FALKORDB_HOST", "127.0.0.1")
    monkeypatch.setenv("FALKORDB_PORT", "1")
    graph.reset()
    assert client.get("/api/health").status_code == 503
    r = client.post("/api/investigate/INC-2026-101")
    assert r.status_code == 503 and r.json()["error"] == "graph_unavailable"
    graph.reset()


def test_tools_list_endpoint(client):
    r = client.get("/api/tools").json()
    assert r["status"] == "success"
    tool_names = {t["name"] for t in r["tools"]}
    expected = {
        "triage_incident_with_evidence",
        "multi_hop_blast_radius",
        "shortest_dependency_path",
        "graph_algorithms_suite",
        "verify_action_by_graph_surgery",
        "resolve_owners_and_runbook",
    }
    assert expected.issubset(tool_names)


def test_tool_call_endpoint(client):
    ok = client.post("/api/tools/call", json={"tool": "multi_hop_blast_radius", "arguments": {"service_id": "cache-redis"}}).json()
    assert ok["status"] == "success" and ok["count"] > 0
    assert ok["duration_ms"] >= 0
    # Unknown tool fails cleanly
    bad = client.post("/api/tools/call", json={"tool": "unknown_tool", "arguments": {}})
    assert bad.status_code == 400


def test_agent_run_endpoint(client):
    res = client.post("/api/agent/run", json={"incident_id": "INC-2026-101", "max_steps": 4}).json()
    assert res["status"] == "completed" and res["outcome"] == "answered_with_path"
    assert res["top_candidate"] == "cache-redis"
    assert len(res["trace"]) >= 2
    assert res["policy"] == "deterministic_observation_driven_policy"
    # Unknown entity stops at step 1 with unknown_entity
    bad = client.post("/api/agent/run", json={"incident_id": "INC-DOES-NOT-EXIST"}).json()
    assert bad["status"] == "unknown_entity"
    assert bad["steps_executed"] == 1


def test_benchmark_endpoint(client):
    res = client.get("/api/benchmark").json()
    assert res["status"] == "success"
    summary = res["summary"]
    assert summary["sample_size"] == 5
    assert summary["graph_backed"]["accuracy_pct"] >= 80.0
    assert len(res["cases"]) == 5


def test_algorithms_endpoint(client):
    res = client.get("/api/algorithms/run?algorithm=pagerank").json()
    assert res["status"] == "success"
    assert res["engine_used"] == "falkordb_native_pagerank"
    assert res["node_count"] == 15


def test_grounding_endpoints(client):
    # Entity resolution
    res = client.post("/api/grounding/resolve", json={"query": "redis", "entity_type": "service"}).json()
    assert res["status"] == "alias_match" and res["service_id"] == "cache-redis"

    # Claim verification: valid claim
    claim_ok = client.post("/api/grounding/verify", json={
        "incident_id": "INC-2026-101",
        "candidate_id": "cache-redis",
        "path": ["checkout-service", "payment-service", "cache-redis"],
        "evidence_ids": ["EV-101-2"],
    }).json()
    assert claim_ok["grounding_verified"] is True

    # Claim verification: invalid non-existent edge
    claim_bad = client.post("/api/grounding/verify", json={
        "incident_id": "INC-2026-101",
        "candidate_id": "cache-redis",
        "path": ["checkout-service", "web-frontend", "cache-redis"],  # fake edge
        "evidence_ids": [],
    }).json()
    assert claim_bad["grounding_verified"] is False
    assert "Directed edge does not exist" in claim_bad["failures"][0]


def test_company_brain_endpoint(client):
    res = client.get("/api/company-brain").json()
    assert len({r["id"] for r in res["runbooks"]}) == 3
    assert len({a["id"] for a in res["adrs"]}) == 2
    assert len(res["teams"]) == 15
