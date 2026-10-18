import pytest

from backend import graph


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["seeded"] is True


def test_incidents_and_overview(client):
    assert len(client.get("/api/incidents").json()["incidents"]) == 7
    o = client.get("/api/graph/overview").json()
    assert o["nodes"]["Service"] == 15 and o["dependency_edges"] == 17


def test_company_brain_endpoint(client):
    b = client.get("/api/company-brain").json()
    assert b["data_source"] == "falkordb"
    assert len(b["runbooks"]) == 3
    assert any(r["id"] == "RB-cache-evictions" for r in b["runbooks"])
    assert len(b["adrs"]) == 2
    assert any(a["id"] == "ADR-007" for a in b["adrs"])
    assert len(b["teams"]) == 5



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


def test_favicon(client):
    r = client.get("/favicon.ico")
    assert r.status_code == 200
    assert "svg" in r.headers.get("content-type", "")


def test_legal_routes(client):
    assert client.get("/privacy").status_code == 200
    assert client.get("/terms").status_code == 200


