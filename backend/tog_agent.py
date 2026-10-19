"""ToG-inspired graph investigation over ROOTLINE's existing, tested primitives.

This module deliberately reuses the existing investigator, fixed tool registry, grounding
validator, and isolated graph-surgery implementation. It does not replace the current
API/data model or claim a faithful research-paper reproduction.

Safety rules:
- Diagnostic reads use the existing graph.ro_run / FalkorDB ro_query boundary.
- No fallback from read-only queries to normal graph.query.
- Unknown or ambiguous entities stop the run.
- Claims are grounded against live graph records before being marked verified.
- Graph edge removal is a counterfactual topology experiment, not causal proof.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from . import agent, algorithms, grounding, investigator, queries as q, surgery


INCIDENT_RE = re.compile(r"\bINC-\d{4}-\d{3}\b", re.IGNORECASE)
# Match identifiers that look like service IDs, without treating arbitrary prose tokens
# as entities. Entity existence is always decided by FalkorDB-backed resolution.
SERVICE_TOKEN_RE = re.compile(
    r"\b[a-z0-9]+-(?:service|redis|index|queue|gateway|db|cache|broker|api)\b",
    re.IGNORECASE,
)


class TogInputError(ValueError):
    """Invalid request to the bounded ToG-inspired investigation workflow."""


def _duration_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 3)


def _trace_step(
    trace: list[dict[str, Any]],
    *,
    tool: str,
    args: dict[str, Any],
    observation: dict[str, Any],
    rationale: str,
    started: float,
) -> None:
    trace.append({
        "step": len(trace) + 1,
        "tool": tool,
        "arguments": args,
        "outcome": observation.get("outcome", observation.get("status", "unknown")),
        "duration_ms": observation.get("duration_ms", _duration_ms(started)),
        "branch_rationale": rationale,
        "observation": observation,
    })


def _service_tokens(prompt: str) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []
    for token in SERVICE_TOKEN_RE.findall(prompt or ""):
        key = token.lower()
        if key not in seen:
            seen.add(key)
            tokens.append(token)
    return tokens


def _resolve_prompt(prompt: str, incident_id: str | None) -> dict[str, Any]:
    """Resolve all explicit entities; unknown service tokens are reported even without an incident."""
    incident_ids = INCIDENT_RE.findall(prompt or "")
    requested_incident = incident_id.strip() if incident_id else (incident_ids[0] if incident_ids else "")

    for token in _service_tokens(prompt):
        result = grounding.resolve_service_entity(token)
        if result.get("status") not in {"exact_match", "alias_match"}:
            return {
                "outcome": "unknown_entity",
                "entity_type": "service",
                "queried": token,
                "suggestions": result.get("suggestions", []),
            }

    if not requested_incident:
        return {
            "outcome": "missing_data",
            "entity_type": "incident",
            "queried": None,
            "suggestions": [],
            "reason": "No incident ID supplied. Provide incident_id or include an incident ID such as INC-2026-101.",
        }

    # An explicit incident_id parameter is authoritative; a distinct incident ID in
    # the prompt is ambiguous rather than silently overriding the supplied parameter.
    if incident_id and incident_ids:
        distinct = {x.upper() for x in incident_ids}
        if distinct - {incident_id.strip().upper()}:
            return {
                "outcome": "unknown_entity",
                "entity_type": "incident",
                "queried": ", ".join(sorted(distinct)),
                "suggestions": [incident_id.strip().upper()],
                "reason": "Prompt incident ID conflicts with incident_id argument.",
            }

    incident = grounding.resolve_incident_entity(requested_incident)
    if incident.get("status") != "exact_match":
        return {
            "outcome": "unknown_entity",
            "entity_type": "incident",
            "queried": requested_incident,
            "suggestions": incident.get("suggestions", []),
        }
    return {"outcome": "resolved", "incident_id": incident["incident_id"]}


def run_tog_agent(
    prompt: str,
    incident_id: str | None = None,
    max_steps: int = 5,
    request_surgery: bool | None = None,
) -> dict[str, Any]:
    """Run a bounded observation-driven policy that chooses follow-up tools from observations."""
    started = time.perf_counter()
    prompt = (prompt or "").strip()
    if not prompt:
        raise TogInputError("prompt must not be empty.")
    if not 1 <= max_steps <= 8:
        raise TogInputError("max_steps must be between 1 and 8.")

    resolved = _resolve_prompt(prompt, incident_id)
    trace: list[dict[str, Any]] = []
    if resolved["outcome"] != "resolved":
        return {
            "status": "stopped",
            "outcome": resolved["outcome"],
            "reason": resolved.get("reason", "Entity could not be resolved against graph records."),
            "entity": {k: v for k, v in resolved.items() if k != "outcome"},
            "steps_executed": 0,
            "trace": trace,
            "policy": "tog_inspired_deterministic_observation_policy",
            "total_duration_ms": _duration_ms(started),
            "synthetic_data": True,
        }

    iid = resolved["incident_id"]
    # This first observation invokes the same graph-grounded triage implementation used
    # by the fixed registry, preserving the current business logic.
    t0 = time.perf_counter()
    triage = agent.execute_tool("triage_incident_with_evidence", {"incident_id": iid})
    _trace_step(
        trace, tool="triage_incident_with_evidence", args={"incident_id": iid},
        observation=triage,
        rationale="Resolve the requested incident and collect graph paths, evidence polarity, deployment recency, and ranked candidates.",
        started=t0,
    )

    outcome = triage.get("outcome", "tool_error")
    if outcome in {"unknown_entity", "not_in_graph", "tool_error", "graph_unavailable"}:
        return {
            "status": "stopped", "outcome": outcome, "incident_id": iid,
            "summary": "Initial graph triage did not return a usable incident observation.",
            "steps_executed": len(trace), "trace": trace,
            "policy": "tog_inspired_deterministic_observation_policy",
            "total_duration_ms": _duration_ms(started), "synthetic_data": True,
        }

    candidates = triage.get("candidates") or []
    top_candidate = triage.get("top_candidate")
    if not top_candidate or not candidates:
        # The branch is chosen from the actual triage observation: no ranked candidate.
        if len(trace) < max_steps:
            t0 = time.perf_counter()
            pagerank = agent.execute_tool("graph_algorithms_suite", {"algorithm": "pagerank"})
            _trace_step(
                trace, tool="graph_algorithms_suite", args={"algorithm": "pagerank"},
                observation=pagerank,
                rationale="Triage returned no conclusive candidate; inspect graph structure as supplementary context, without overriding abstention.",
                started=t0,
            )
        return {
            "status": "inconclusive", "outcome": "inconclusive", "incident_id": iid,
            "summary": "Triage did not establish a sufficiently supported single candidate; structural metrics do not override abstention.",
            "steps_executed": len(trace), "trace": trace,
            "policy": "tog_inspired_deterministic_observation_policy",
            "total_duration_ms": _duration_ms(started), "synthetic_data": True,
        }

    top = next((c for c in candidates if c.get("service_id") == top_candidate), candidates[0])
    path = top.get("path") or []
    has_contradiction = bool(top.get("contradicting_evidence_ids") or top.get("contradicting_evidence"))
    close_second = len(candidates) > 1 and (
        float(candidates[0].get("score", 0)) - float(candidates[1].get("score", 0))
        < float(investigator.CLOSE_CALL_MARGIN)
    )

    # Branch 2: if the actual observation contains a valid path, ask FalkorDB for
    # the directed shortest path; otherwise don't fabricate source/target identifiers.
    if len(trace) < max_steps and len(path) >= 2:
        src, dst = path[0], path[-1]
        t0 = time.perf_counter()
        path_result = agent.execute_tool(
            "shortest_dependency_path",
            {"source_service_id": src, "target_service_id": dst},
        )
        _trace_step(
            trace,
            tool="shortest_dependency_path",
            args={"source_service_id": src, "target_service_id": dst},
            observation=path_result,
            rationale=(
                f"The observed top candidate is {top_candidate}; "
                f"{'contradictory evidence exists' if has_contradiction else 'the candidate has a graph path'}"
                f"{'; a close second candidate also exists' if close_second else ''}. Verify the directed path using the graph."
            ),
            started=t0,
        )

    # Branch 3: blast radius is useful only if budget remains; it is based on the
    # actual candidate chosen by triage, not a hardcoded service.
    if len(trace) < max_steps:
        t0 = time.perf_counter()
        blast = agent.execute_tool(
            "multi_hop_blast_radius", {"service_id": top_candidate, "max_hops": 4}
        )
        _trace_step(
            trace, tool="multi_hop_blast_radius",
            args={"service_id": top_candidate, "max_hops": 4},
            observation=blast,
            rationale=f"Triage produced candidate {top_candidate}; inspect reverse dependency reach to describe potential blast radius.",
            started=t0,
        )

    # Branch 4: retrieve the graph-backed operational context for the observed candidate.
    if len(trace) < max_steps:
        t0 = time.perf_counter()
        owner = agent.execute_tool("resolve_owners_and_runbook", {"service_id": top_candidate})
        _trace_step(
            trace, tool="resolve_owners_and_runbook", args={"service_id": top_candidate},
            observation=owner,
            rationale="Retrieve owner/runbook context for the candidate returned by the previous graph-backed triage observation.",
            started=t0,
        )

    # Surgery is performed only when explicitly requested by flag or prompt wording, and only
    # for an actual directed edge on the observed path. It is labelled as a topology experiment.
    wants_surgery = request_surgery if request_surgery is not None else bool(
        re.search(r"\b(surgery|counterfactual|remove (?:the )?(?:edge|dependency)|cut (?:the )?edge)\b", prompt, re.I)
    )
    if wants_surgery and len(trace) < max_steps and len(path) >= 2:
        src, dst = path[-2], path[-1]
        t0 = time.perf_counter()
        surg = agent.execute_tool(
            "verify_action_by_graph_surgery",
            {"incident_id": iid, "source_service_id": src, "target_service_id": dst},
        )
        _trace_step(
            trace, tool="verify_action_by_graph_surgery",
            args={"incident_id": iid, "source_service_id": src, "target_service_id": dst},
            observation=surg,
            rationale=f"Counterfactual topology experiment requested; test the actual observed dependency edge {src} -> {dst} in an isolated clone.",
            started=t0,
        )

    # Re-ground result from actual graph records. A missing/invalid path or evidence ID
    # makes grounding fail; it is never force-set to True.
    evidence_ids = list(top.get("evidence_ids") or top.get("supporting_evidence_ids") or [])
    grounding_result = grounding.verify_grounded_claim(
        incident_id=iid,
        candidate_id=top_candidate,
        path=path,
        evidence_ids=evidence_ids,
        runbook_ids=[r.get("id") for r in top.get("runbooks", []) if r.get("id")] or None,
    )
    outcome = "answered_with_path" if grounding_result.get("grounding_verified") else "verification_failed"
    status = "completed" if outcome == "answered_with_path" else "verification_failed"
    return {
        "status": status,
        "outcome": outcome,
        "incident_id": iid,
        "top_candidate": top_candidate,
        "candidate_score": top.get("score"),
        "candidate_score_breakdown": top.get("score_breakdown", {}),
        "primary_path": path,
        "supporting_evidence_ids": top.get("supporting_evidence_ids", []),
        "contradicting_evidence_ids": top.get("contradicting_evidence_ids", []),
        "grounding": grounding_result,
        "trace": trace,
        "steps_executed": len(trace),
        "policy": "tog_inspired_deterministic_observation_policy",
        "interpretation": "A bounded deterministic policy inspired by graph-exploration research; not a faithful reimplementation of a paper's full method and not an autonomous LLM planner.",
        "synthetic_data": True,
        "total_duration_ms": _duration_ms(started),
    }


def mcp_tools() -> list[dict[str, Any]]:
    """Return the existing fixed tools using MCP-compatible tool schema field names."""
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "inputSchema": spec.parameters,
        }
        for spec in agent.TOOL_REGISTRY.values()
    ]


def handle_mcp_jsonrpc(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Minimal JSON-RPC adapter for MCP methods used by this prototype.

    This implementation supports initialize, ping, tools/list and tools/call. It is not
    advertised as full MCP transport/session conformance.
    """
    if not isinstance(payload, dict) or payload.get("jsonrpc") != "2.0" or not isinstance(payload.get("method"), str):
        return {"jsonrpc": "2.0", "id": payload.get("id") if isinstance(payload, dict) else None,
                "error": {"code": -32600, "message": "Invalid JSON-RPC request"}}

    method = payload["method"]
    request_id = payload.get("id")
    params = payload.get("params") or {}
    if request_id is None:
        # JSON-RPC notifications have no response. The HTTP route maps None to 204.
        return None
    if not isinstance(params, dict):
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": "params must be an object"}}

    if method == "initialize":
        requested = params.get("protocolVersion", "2025-06-18")
        version = requested if requested in {"2025-06-18", "2025-03-26"} else "2025-06-18"
        return {
            "jsonrpc": "2.0", "id": request_id,
            "result": {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "rootline-tool-adapter", "version": "0.2.0"},
                "instructions": "Fixed validated ROOTLINE tools over synthetic incident graph data. No arbitrary Cypher.",
            },
        }
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": mcp_tools()}}
    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(arguments, dict):
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": "tools/call requires name and object arguments"}}
        if name not in agent.TOOL_REGISTRY:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": f"Unknown tool: {name}"}}
        spec = agent.TOOL_REGISTRY[name]
        required = set(spec.parameters.get("required", []))
        missing = sorted(required - set(arguments))
        if missing:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": f"Missing required arguments: {', '.join(missing)}"}}
        allowed = set(spec.parameters.get("properties", {}))
        extra = sorted(set(arguments) - allowed)
        if extra:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": f"Unknown arguments: {', '.join(extra)}"}}
        result = agent.execute_tool(name, arguments)
        output = json.dumps(result, ensure_ascii=False, default=str)
        is_error = result.get("outcome") in {"tool_error", "graph_unavailable", "verification_failed"}
        return {
            "jsonrpc": "2.0", "id": request_id,
            "result": {
                "content": [{"type": "text", "text": output}],
                "structuredContent": result,
                "isError": is_error,
            },
        }

    if method.startswith("notifications/"):
        # No response for valid notification methods.
        return None
    return {"jsonrpc": "2.0", "id": request_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"}}
