"""Integration checks for the ToG-inspired adapter and minimal MCP-style JSON-RPC API."""
from backend import agent


def test_tog_route_investigates_known_incident_and_grounds_result(client):
    response = client.post(
        "/api/agent/tog",
        json={"prompt": "Investigate INC-2026-101", "max_steps": 5},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["incident_id"] == "INC-2026-101"
    assert result["top_candidate"] == "cache-redis"
    assert result["outcome"] in {"answered_with_path", "verification_failed"}
    assert result["trace"]
    assert all(step["duration_ms"] >= 0 for step in result["trace"])
    # Grounding failures must be explicit; never synthesize a verified flag.
    if result["outcome"] == "answered_with_path":
        assert result["grounding"]["grounding_verified"] is True
        assert result["grounding"]["verified_elements"]["candidate"] is True


def test_tog_route_rejects_unknown_service_from_graph(client):
    response = client.post(
        "/api/agent/tog",
        json={
            "prompt": "Investigate INC-2026-101 and check kafka-broker",
            "max_steps": 5,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["outcome"] == "unknown_entity"
    assert result["entity"]["entity_type"] == "service"
    assert result["entity"]["queried"] == "kafka-broker"
    assert result["steps_executed"] == 0


def test_tog_route_requires_explicit_incident(client):
    response = client.post(
        "/api/agent/tog",
        json={"prompt": "Investigate infrastructure failures"},
    )
    assert response.status_code == 422


def test_tog_route_validates_step_budget(client):
    response = client.post(
        "/api/agent/tog",
        json={"prompt": "Investigate INC-2026-101", "max_steps": 99},
    )
    assert response.status_code == 422


def test_mcp_tools_endpoint_exposes_fixed_registry(client):
    response = client.get("/api/mcp/tools")
    assert response.status_code == 200
    data = response.json()
    names = {tool["name"] for tool in data["tools"]}
    assert names == set(agent.TOOL_REGISTRY)
    assert all("inputSchema" in tool for tool in data["tools"])
    assert "not full transport/session conformance" in data["protocol_scope"]


def test_mcp_jsonrpc_initialize_and_tools_list(client):
    init = client.post(
        "/api/mcp/rpc",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}},
        },
    )
    assert init.status_code == 200
    init_body = init.json()
    assert init_body["jsonrpc"] == "2.0"
    assert init_body["result"]["serverInfo"]["name"] == "rootline-tool-adapter"
    assert "tools" in init_body["result"]["capabilities"]

    listed = client.post(
        "/api/mcp/rpc",
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    assert listed.status_code == 200
    assert len(listed.json()["result"]["tools"]) == 6


def test_mcp_jsonrpc_calls_fixed_triage_tool(client):
    response = client.post(
        "/api/mcp/rpc",
        json={
            "jsonrpc": "2.0",
            "id": "call-1",
            "method": "tools/call",
            "params": {
                "name": "triage_incident_with_evidence",
                "arguments": {"incident_id": "INC-2026-101"},
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["jsonrpc"] == "2.0"
    assert body["id"] == "call-1"
    assert body["result"]["structuredContent"]["outcome"] == "answered_with_path"
    assert body["result"]["structuredContent"]["top_candidate"] == "cache-redis"


def test_mcp_jsonrpc_rejects_unknown_tool(client):
    response = client.post(
        "/api/mcp/rpc",
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "run_arbitrary_cypher", "arguments": {"cypher": "MATCH (n) RETURN n"}},
        },
    )
    assert response.status_code == 200
    assert response.json()["error"]["code"] == -32602


def test_evaluation_ablation_alias_returns_benchmark_rows(client):
    response = client.get("/api/evaluation/ablation")
    assert response.status_code == 200
    data = response.json()
    assert "cases" in data
    assert data["cases"]
    assert "summary" in data
