import json
import os
import time
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

from . import agent, algorithms, benchmark, graph, grounding, investigator, queries as q, surgery, tog_agent

app = FastAPI(
    title="ROOTLINE OMNI API",
    description="Graph-powered incident investigation and explainable operations intelligence on FalkorDB",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8010", "http://127.0.0.1:8010"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(graph.GraphUnavailable)
async def graph_down(_, exc):
    return JSONResponse(
        status_code=503,
        content={"error": "graph_unavailable", "detail": "FalkorDB is not reachable. Check FALKORDB_HOST/PORT."},
    )


# --- Input Models ---
class DecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    rationale: str = Field(min_length=3, max_length=1000)

    @field_validator("rationale")
    @classmethod
    def rationale_must_contain_text(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Rationale must contain at least 3 non-whitespace characters")
        return value


class EdgeIn(BaseModel):
    from_: str = Field(alias="from", min_length=1, max_length=100)
    to: str = Field(min_length=1, max_length=100)


class SimulateIn(BaseModel):
    incident_id: str = Field(min_length=1, max_length=100)
    remove_edges: List[EdgeIn] = Field(min_length=1, max_length=3)


class ToolCallIn(BaseModel):
    tool: str = Field(min_length=1, max_length=100)
    arguments: Dict[str, Any] = Field(default_factory=dict)


class AgentRunIn(BaseModel):
    incident_id: str = Field(min_length=1, max_length=100)
    max_steps: int = Field(default=5, ge=1, le=10)
    request_surgery: bool = Field(default=False)


class TogRunIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    incident_id: Optional[str] = Field(default=None, min_length=1, max_length=100)
    max_steps: int = Field(default=5, ge=1, le=8)
    request_surgery: Optional[bool] = None

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Prompt must contain non-whitespace text")
        return value


class ResolveEntityIn(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    entity_type: Literal["service", "incident"] = "service"


class VerifyClaimIn(BaseModel):
    incident_id: str
    candidate_id: str
    path: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)
    runbook_ids: Optional[List[str]] = None


# --- Core System & Health Endpoints ---
@app.get("/api/health")
def health():
    try:
        graph.run("RETURN 1")
        n = graph.run("MATCH (i:Incident) RETURN count(i)")[0][0]
        return {"status": "ok", "database": "falkordb", "graph": graph.graph_name(), "seeded": n > 0, "incidents": n}
    except graph.GraphUnavailable:
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unreachable"})


@app.get("/api/incidents")
def incidents():
    return {
        "data_source": "falkordb",
        "synthetic_data": True,
        "incidents": [{**i, "time": investigator.iso(i["ts"])} for i in q.list_incidents()],
    }


@app.get("/api/graph/overview")
def overview():
    return {"data_source": "falkordb", **q.graph_overview()}


# --- Investigation Endpoints ---
@app.post("/api/investigate/{incident_id}")
def run_investigation(incident_id: str):
    r = investigator.investigate(incident_id)
    if r is None:
        raise HTTPException(404, f"Unknown incident '{incident_id}'")
    return r


@app.get("/api/investigations")
def list_investigations():
    return {
        "investigations": [
            {
                **i,
                "created": investigator.iso(i["created_at"]),
                "decided": investigator.iso(i["decided_at"]) if i["decided_at"] else None,
            }
            for i in q.list_investigations()
        ]
    }


@app.get("/api/investigations/{inv_id}")
def get_investigation(inv_id: str):
    r = q.get_investigation(inv_id)
    if r is None:
        raise HTTPException(404, f"Unknown investigation '{inv_id}'")
    report = json.loads(r["report_json"])
    report["decision"] = {
        "status": r["decision"],
        "rationale": r["rationale"],
        "decided": investigator.iso(r["decided_at"]) if r["decided_at"] else None,
    }
    report["persisted_graph_links"] = {
        "used_evidence": r["used_evidence"],
        "ranked": r["ranked"],
        "action": r["action"],
    }
    return report


@app.post("/api/investigations/{inv_id}/decision")
def record_decision(inv_id: str, body: DecisionIn):
    r = q.get_investigation(inv_id)
    if r is None:
        raise HTTPException(404, f"Unknown investigation '{inv_id}'")
    if r["decision"] != "pending":
        raise HTTPException(409, f"Decision already recorded: {r['decision']}")
    now = int(time.time())
    q.record_decision(inv_id, body.decision, body.rationale.strip(), now)
    return {
        "investigation_id": inv_id,
        "decision": body.decision,
        "rationale": body.rationale.strip(),
        "decided": investigator.iso(now),
    }


# --- Graph Topology & Surgery Endpoints ---
@app.get("/api/graph/edges")
def edges():
    return {"data_source": "falkordb", "edges": q.list_edges()}


@app.post("/api/simulate")
def simulate(body: SimulateIn):
    try:
        r = surgery.simulate(body.incident_id, [(e.from_, e.to) for e in body.remove_edges])
    except surgery.UnknownEdge as exc:
        raise HTTPException(422, str(exc))
    except surgery.GraphCopyUnavailable as exc:
        raise HTTPException(503, str(exc))
    if r is None:
        raise HTTPException(404, f"Unknown incident '{body.incident_id}'")
    return r


# --- Phase 3 & 8: Tool Registry & Bounded Agent Endpoints ---
@app.get("/api/tools")
def list_tools():
    """Return the fixed tool registry with input/output schemas."""
    return {
        "status": "success",
        "tools": [spec.model_dump() for spec in agent.TOOL_REGISTRY.values()],
        "outcomes": agent.OUTCOMES,
    }


@app.post("/api/tools/call")
def call_tool(body: ToolCallIn):
    """Execute a single validated tool from the fixed registry."""
    if body.tool not in agent.TOOL_REGISTRY:
        raise HTTPException(400, f"Tool '{body.tool}' is not registered in fixed registry")
    return agent.execute_tool(body.tool, body.arguments)


@app.post("/api/agent/run")
def run_agent(body: AgentRunIn):
    """Execute the bounded observation-driven agent loop."""
    return agent.run_bounded_agent_loop(
        incident_query=body.incident_id,
        max_steps=body.max_steps,
        request_surgery=body.request_surgery,
    )


# --- Phase 4: Grounding & Entity Resolution Endpoints ---
@app.post("/api/grounding/resolve")
def resolve_entity(body: ResolveEntityIn):
    if body.entity_type == "service":
        return grounding.resolve_service_entity(body.query)
    return grounding.resolve_incident_entity(body.query)


@app.post("/api/grounding/verify")
def verify_claim(body: VerifyClaimIn):
    return grounding.verify_grounded_claim(
        incident_id=body.incident_id,
        candidate_id=body.candidate_id,
        path=body.path,
        evidence_ids=body.evidence_ids,
        runbook_ids=body.runbook_ids,
    )


# --- Phase 5: Graph Algorithms Suite Endpoint ---
@app.get("/api/algorithms/run")
def run_algorithms(algorithm: str = "pagerank", scope: str = "Service"):
    return agent.tool_graph_algorithms(algorithm=algorithm, optional_scope=scope)


# --- Phase 7: Benchmark & Evaluation Endpoint ---
@app.get("/api/benchmark")
def run_benchmark():
    return benchmark.run_benchmark_suite()


# --- Company Brain Overview ---
@app.get("/api/company-brain")
def company_brain():
    rbs = q.ro_run("MATCH (r:Runbook)-[:APPLIES_TO]->(s:Service) RETURN r.id, r.title, r.uri, r.steps, s.id")
    adrs = q.ro_run("MATCH (a:ADR)-[:GOVERNS]->(s:Service) RETURN a.id, a.title, a.decision, s.id")
    teams = q.ro_run("MATCH (t:Team)-[:OWNS]->(s:Service) RETURN t.id, t.name, s.id")
    return {
        "runbooks": [{"id": r[0], "title": r[1], "uri": r[2], "steps": r[3], "service": r[4]} for r in rbs],
        "adrs": [{"id": a[0], "title": a[1], "decision": a[2], "service": a[3]} for a in adrs],
        "teams": [{"id": t[0], "name": t[1], "service": t[2]} for t in teams],
    }


# --- ToG-inspired agent adapter and MCP-style tool interface ---
@app.post("/api/agent/tog")
def run_tog(body: TogRunIn):
    """Run a bounded, deterministic, ToG-inspired policy over graph-backed observations."""
    try:
        return tog_agent.run_tog_agent(
            prompt=body.prompt,
            incident_id=body.incident_id,
            max_steps=body.max_steps,
            request_surgery=body.request_surgery,
        )
    except tog_agent.TogInputError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/mcp/tools")
def mcp_tools():
    """Expose schemas for the fixed internal tool registry; this is not full MCP transport conformance."""
    return {
        "status": "success",
        "protocol_scope": "MCP-compatible JSON-RPC adapter prototype; not full transport/session conformance; no claim of full transport/session conformance",
        "full_conformance": False,
        "tools": tog_agent.mcp_tools(),
    }


@app.post("/api/mcp/rpc")
def mcp_rpc(payload: Dict[str, Any]):
    """Minimal JSON-RPC adapter for initialize, ping, tools/list, and tools/call."""
    result = tog_agent.handle_mcp_jsonrpc(payload)
    if result is None:
        return Response(status_code=204)
    return JSONResponse(content=result)


@app.get("/api/evaluation/ablation")
def evaluation_ablation():
    """Compatibility alias that runs the measured graph-backed vs graph-free benchmark."""
    return benchmark.run_benchmark_suite()


# --- Static and Legal Routes ---
_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")


@app.get("/privacy", include_in_schema=False)
@app.get("/terms", include_in_schema=False)
def legal_routes():
    idx = os.path.join(_dist, "index.html")
    if os.path.isfile(idx):
        return FileResponse(idx)
    return HTMLResponse("<!doctype html><html><body><h1>ROOTLINE OMNI</h1><p>Legal documentation</p></body></html>")


if os.path.isdir(_dist):
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_dist, html=True), name="ui")
