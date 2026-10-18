import json
import os
import time
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

from . import graph, investigator, queries as q, surgery

app = FastAPI(title="Rootline", description="Graph-powered incident investigator (synthetic data) on FalkorDB")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(graph.GraphUnavailable)
async def graph_down(_, exc):
    return JSONResponse(status_code=503, content={"error": "graph_unavailable",
                        "detail": "FalkorDB is not reachable. Start it and check FALKORDB_HOST/PORT."})


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


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#090A0C"/><circle cx="8" cy="8" r="4" fill="#6366F1"/><circle cx="24" cy="8" r="4" fill="#10B981"/><circle cx="16" cy="24" r="4" fill="#F43F5E"/><path d="M8 8 L24 8 L16 24 Z" stroke="#374151" stroke-width="2" fill="none"/></svg>'
    return Response(content=svg, media_type="image/svg+xml")


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
    return {"data_source": "falkordb", "synthetic_data": True, "incidents": [{**i, "time": investigator.iso(i["ts"])} for i in q.list_incidents()]}


@app.get("/api/graph/overview")
def overview():
    return {"data_source": "falkordb", **q.graph_overview()}


@app.get("/api/company-brain")
def company_brain():
    return {"data_source": "falkordb", "synthetic_data": True, **q.company_brain_overview()}



@app.post("/api/investigate/{incident_id}")
def investigate(incident_id: str):
    r = investigator.investigate(incident_id)
    if r is None:
        raise HTTPException(404, f"Unknown incident '{incident_id}'")
    return r


@app.get("/api/investigations")
def investigations():
    return {"investigations": [{**i, "created": investigator.iso(i["created_at"]),
                                "decided": investigator.iso(i["decided_at"]) if i["decided_at"] else None}
                               for i in q.list_investigations()]}


@app.get("/api/investigations/{inv_id}")
def investigation(inv_id: str):
    r = q.get_investigation(inv_id)
    if r is None:
        raise HTTPException(404, f"Unknown investigation '{inv_id}'")
    report = json.loads(r["report_json"])
    report["decision"] = {"status": r["decision"], "rationale": r["rationale"],
                          "decided": investigator.iso(r["decided_at"]) if r["decided_at"] else None}
    report["persisted_graph_links"] = {"used_evidence": r["used_evidence"], "ranked": r["ranked"], "action": r["action"]}
    return report


@app.post("/api/investigations/{inv_id}/decision")
def decide(inv_id: str, body: DecisionIn):
    r = q.get_investigation(inv_id)
    if r is None:
        raise HTTPException(404, f"Unknown investigation '{inv_id}'")
    if r["decision"] != "pending":
        raise HTTPException(409, f"Decision already recorded: {r['decision']}")
    now = int(time.time())
    q.record_decision(inv_id, body.decision, body.rationale.strip(), now)
    return {"investigation_id": inv_id, "decision": body.decision, "rationale": body.rationale.strip(), "decided": investigator.iso(now)}


class EdgeIn(BaseModel):
    from_: str = Field(alias="from", min_length=1, max_length=100)
    to: str = Field(min_length=1, max_length=100)


class SimulateIn(BaseModel):
    incident_id: str = Field(min_length=1, max_length=100)
    remove_edges: list[EdgeIn] = Field(min_length=1, max_length=3)


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


