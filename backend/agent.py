"""One bounded observation-driven agent for Track 01.
Deterministic policy over a fixed, validated tool registry.
Every step records real time.perf_counter() duration, tool arguments,
observation summary, branch rationale, and explicit outcome.
"""
import time
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field

from . import algorithms, grounding, investigator, queries as q, surgery


# Standard outcome enums
OUTCOMES = [
    "answered_with_path",
    "not_in_graph",
    "unknown_entity",
    "inconclusive",
    "missing_data",
    "verification_failed",
    "tool_error",
    "graph_unavailable",
]


class ToolSpec(BaseModel):
    name: str
    description: str
    read_only: bool
    parameters: Dict[str, Any]


# Fixed Tool Registry Schemas
TOOL_REGISTRY: Dict[str, ToolSpec] = {
    "triage_incident_with_evidence": ToolSpec(
        name="triage_incident_with_evidence",
        description="Traverse graph dependencies and rank candidate root causes using multi-hop evidence and deployment recency.",
        read_only=True,
        parameters={
            "type": "object",
            "properties": {"incident_id": {"type": "string", "description": "The incident ID (e.g. INC-2026-101)"}},
            "required": ["incident_id"],
        },
    ),
    "multi_hop_blast_radius": ToolSpec(
        name="multi_hop_blast_radius",
        description="Traverse reverse DEPENDS_ON edges up to max_hops to determine which upstream callers are impacted.",
        read_only=True,
        parameters={
            "type": "object",
            "properties": {
                "service_id": {"type": "string", "description": "Service ID to evaluate blast radius for"},
                "max_hops": {"type": "integer", "minimum": 1, "maximum": 6, "default": 4},
            },
            "required": ["service_id"],
        },
    ),
    "shortest_dependency_path": ToolSpec(
        name="shortest_dependency_path",
        description="Find the shortest directed dependency path between two services using native FalkorDB shortestPath.",
        read_only=True,
        parameters={
            "type": "object",
            "properties": {
                "source_service_id": {"type": "string"},
                "target_service_id": {"type": "string"},
            },
            "required": ["source_service_id", "target_service_id"],
        },
    ),
    "graph_algorithms_suite": ToolSpec(
        name="graph_algorithms_suite",
        description="Run native graph algorithms (pagerank, betweenness, connected_components) on FalkorDB.",
        read_only=True,
        parameters={
            "type": "object",
            "properties": {
                "algorithm": {"type": "string", "enum": ["pagerank", "betweenness", "connected_components", "degree"]},
                "optional_scope": {"type": "string", "default": "Service"},
            },
            "required": ["algorithm"],
        },
    ),
    "verify_action_by_graph_surgery": ToolSpec(
        name="verify_action_by_graph_surgery",
        description="Perform a counterfactual topology experiment by cutting a dependency edge in an isolated temporary clone.",
        read_only=False,  # writes to temporary clone, leaves baseline unchanged
        parameters={
            "type": "object",
            "properties": {
                "incident_id": {"type": "string"},
                "source_service_id": {"type": "string"},
                "target_service_id": {"type": "string"},
            },
            "required": ["incident_id", "source_service_id", "target_service_id"],
        },
    ),
    "resolve_owners_and_runbook": ToolSpec(
        name="resolve_owners_and_runbook",
        description="Retrieve owner team, operator runbooks, and architectural decisions attached to a service in the graph.",
        read_only=True,
        parameters={
            "type": "object",
            "properties": {"service_id": {"type": "string"}},
            "required": ["service_id"],
        },
    ),
}


# Tool Execution Handlers
def tool_triage_incident(incident_id: str) -> Dict[str, Any]:
    # Resolve entity first
    res = grounding.resolve_incident_entity(incident_id)
    if res["status"] != "exact_match":
        return {
            "status": "unknown_entity" if res["status"] == "unknown_entity" else "ambiguous",
            "outcome": "unknown_entity",
            "incident_id": incident_id,
            "suggestions": res.get("suggestions", []),
            "candidates": [],
        }
    actual_iid = res["incident_id"]
    report = investigator.investigate(actual_iid, persist=False)
    if not report:
        return {"status": "not_in_graph", "outcome": "not_in_graph", "incident_id": actual_iid}

    top = report["conclusion"]["top_candidate"]
    status = report["conclusion"]["status"]
    outcome = "answered_with_path" if status == "ranked" else "inconclusive"
    return {
        "status": status,
        "outcome": outcome,
        "incident_id": actual_iid,
        "top_candidate": top,
        "candidates": report["candidates"][:3],
        "blast_count": report["blast_radius"]["count"],
        "recommended_action": report["recommended_action"],
        "note": report["conclusion"]["note"],
    }


def tool_blast_radius(service_id: str, max_hops: int = 4) -> Dict[str, Any]:
    res = grounding.resolve_service_entity(service_id)
    if res["status"] not in ("exact_match", "alias_match"):
        return {"status": "unknown_entity", "outcome": "unknown_entity", "service_id": service_id, "dependents": []}
    sid = res["service_id"]
    raw = q.dependents(sid, max_hops=max_hops)
    deps = sorted(({"service_id": r[0], "name": r[1], "tier": r[2], "hops": r[3], "path": r[4]} for r in raw), key=lambda x: (x["hops"], x["service_id"]))
    outcome = "answered_with_path" if deps else "not_in_graph"
    return {
        "status": "success",
        "outcome": outcome,
        "service_id": sid,
        "max_hops": max_hops,
        "count": len(deps),
        "dependents": deps,
    }


def tool_shortest_path(source_service_id: str, target_service_id: str) -> Dict[str, Any]:
    s_res = grounding.resolve_service_entity(source_service_id)
    t_res = grounding.resolve_service_entity(target_service_id)
    if s_res["status"] not in ("exact_match", "alias_match") or t_res["status"] not in ("exact_match", "alias_match"):
        return {"status": "unknown_entity", "outcome": "unknown_entity", "source": source_service_id, "target": target_service_id}
    src, dst = s_res["service_id"], t_res["service_id"]
    res = algorithms.run_shortest_path(src, dst)
    return res


def tool_graph_algorithms(algorithm: str, optional_scope: str = "Service") -> Dict[str, Any]:
    algo = algorithm.lower().strip()
    if algo == "pagerank":
        return algorithms.run_pagerank(label=optional_scope)
    elif algo in ("betweenness", "betweenness_centrality"):
        return algorithms.run_betweenness()
    elif algo in ("connected_components", "wcc"):
        return algorithms.run_connected_components()
    elif algo in ("degree", "degree_centrality"):
        return algorithms.run_transitive_degree_fallback()
    else:
        return {"status": "tool_error", "outcome": "tool_error", "error": f"Unknown algorithm '{algorithm}'"}


def tool_verify_surgery(incident_id: str, source_service_id: str, target_service_id: str) -> Dict[str, Any]:
    # Validate nodes and edge existence first
    if not q.edge_exists(source_service_id, target_service_id):
        return {
            "status": "verification_failed",
            "outcome": "verification_failed",
            "error": f"Edge does not exist: {source_service_id} -> {target_service_id}",
        }
    try:
        sim = surgery.simulate(incident_id, [(source_service_id, target_service_id)])
        if not sim:
            return {"status": "not_in_graph", "outcome": "not_in_graph", "incident_id": incident_id}
        # Invariant check
        invariants_ok = (
            sim["isolation"]["baseline_unchanged"]
            and sim["isolation"]["baseline_topology_unchanged"]
            and sim["isolation"]["simulation_graph_deleted"]
        )
        return {
            "status": "success" if invariants_ok else "verification_failed",
            "outcome": "answered_with_path" if invariants_ok else "verification_failed",
            "experiment_type": "counterfactual_topology_experiment",
            "edge_removed": f"{source_service_id}->{target_service_id}",
            "top_before": sim["before"]["top_candidate"],
            "top_after": sim["after"]["top_candidate"],
            "ranking_changed": sim["changed"],
            "invariants_verified": invariants_ok,
            "isolation": sim["isolation"],
        }
    except Exception as exc:
        return {"status": "tool_error", "outcome": "tool_error", "error": str(exc)}


def tool_resolve_owners(service_id: str) -> Dict[str, Any]:
    res = grounding.resolve_service_entity(service_id)
    if res["status"] not in ("exact_match", "alias_match"):
        return {"status": "unknown_entity", "outcome": "unknown_entity", "service_id": service_id}
    sid = res["service_id"]
    info = q.service_info([sid]).get(sid, {})
    rbs = q.runbooks([sid])
    adrs = q.adrs([sid])
    runbooks = [{"id": r[1], "title": r[2], "uri": r[3], "steps": r[4]} for r in rbs]
    adr_list = [{"id": a[1], "title": a[2], "decision": a[3]} for a in adrs]
    has_owner = bool(info.get("team"))
    has_runbooks = len(runbooks) > 0
    outcome = "answered_with_path" if (has_owner and has_runbooks) else "missing_data"
    return {
        "status": "success",
        "outcome": outcome,
        "service_id": sid,
        "service_name": info.get("name", sid),
        "owner_team": info.get("team"),
        "tier": info.get("tier"),
        "runbooks": runbooks,
        "adrs": adr_list,
        "missing_data": {"owner": not has_owner, "runbooks": not has_runbooks},
    }


DISPATCH: Dict[str, Callable[..., Dict[str, Any]]] = {
    "triage_incident_with_evidence": tool_triage_incident,
    "multi_hop_blast_radius": tool_blast_radius,
    "shortest_dependency_path": tool_shortest_path,
    "graph_algorithms_suite": tool_graph_algorithms,
    "verify_action_by_graph_surgery": tool_verify_surgery,
    "resolve_owners_and_runbook": tool_resolve_owners,
}


def execute_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a single validated tool and measure exact duration."""
    if tool_name not in DISPATCH:
        return {"status": "tool_error", "outcome": "tool_error", "error": f"Unknown tool '{tool_name}'"}
    t0 = time.perf_counter()
    try:
        res = DISPATCH[tool_name](**args)
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        res["duration_ms"] = duration_ms
        return res
    except TypeError as te:
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"status": "tool_error", "outcome": "tool_error", "error": f"Invalid arguments: {te}", "duration_ms": duration_ms}
    except Exception as exc:
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"status": "tool_error", "outcome": "tool_error", "error": str(exc), "duration_ms": duration_ms}


def run_bounded_agent_loop(
    incident_query: str,
    max_steps: int = 5,
    request_surgery: bool = False,
) -> Dict[str, Any]:
    """Execute a bounded observation-driven agent investigation.
    The next tool is dynamically determined from the prior observation.
    """
    total_t0 = time.perf_counter()
    trace: List[Dict[str, Any]] = []
    step = 1

    # Step 1: Initial resolution and triage
    tool = "triage_incident_with_evidence"
    args = {"incident_id": incident_query}
    rationale = "Begin investigation by resolving the incident and gathering graph-grounded multi-hop evidence."

    obs = execute_tool(tool, args)
    trace.append({
        "step": step,
        "tool": tool,
        "args": args,
        "outcome": obs.get("outcome", "unknown"),
        "duration_ms": obs.get("duration_ms", 0.0),
        "branch_rationale": rationale,
        "observation": {k: v for k, v in obs.items() if k not in ("candidates", "dependents")},
    })

    # Terminal check on unknown entity
    if obs.get("outcome") == "unknown_entity":
        return {
            "status": "unknown_entity",
            "outcome": "unknown_entity",
            "summary": f"Entity '{incident_query}' could not be resolved against the graph.",
            "steps_executed": step,
            "total_duration_ms": round((time.perf_counter() - total_t0) * 1000, 2),
            "trace": trace,
            "policy": "deterministic_observation_driven_policy",
        }

    # If inconclusive, check blast radius or abstain
    top_cand = obs.get("top_candidate")
    if not top_cand:
        # Inconclusive branch
        step += 1
        tool = "graph_algorithms_suite"
        args = {"algorithm": "pagerank"}
        rationale = "Candidate evidence is thin/inconclusive; inspect graph topology via PageRank to identify structural bottlenecks."
        obs_algo = execute_tool(tool, args)
        trace.append({
            "step": step,
            "tool": tool,
            "args": args,
            "outcome": obs_algo.get("outcome", "answered_with_path"),
            "duration_ms": obs_algo.get("duration_ms", 0.0),
            "branch_rationale": rationale,
            "observation": {"top_bottlenecks": [r["id"] for r in obs_algo.get("results", [])[:3]]},
        })
        return {
            "status": "inconclusive",
            "outcome": "inconclusive",
            "summary": "Evidence is insufficient or candidates are tied. Agent abstains from declaring a single root cause.",
            "steps_executed": step,
            "total_duration_ms": round((time.perf_counter() - total_t0) * 1000, 2),
            "trace": trace,
            "policy": "deterministic_observation_driven_policy",
        }

    # Step 2: Next tool selected based on top candidate observation -> blast radius
    step += 1
    tool = "multi_hop_blast_radius"
    args = {"service_id": top_cand, "max_hops": 4}
    rationale = f"Top candidate '{top_cand}' identified with score {obs['candidates'][0]['score']}. Assess transitive blast radius across callers."
    obs_blast = execute_tool(tool, args)
    trace.append({
        "step": step,
        "tool": tool,
        "args": args,
        "outcome": obs_blast.get("outcome", "answered_with_path"),
        "duration_ms": obs_blast.get("duration_ms", 0.0),
        "branch_rationale": rationale,
        "observation": {"affected_count": obs_blast.get("count", 0), "dependents": [d["service_id"] for d in obs_blast.get("dependents", [])]},
    })

    # Step 3: Resolve ownership and runbooks for top candidate
    step += 1
    tool = "resolve_owners_and_runbook"
    args = {"service_id": top_cand}
    rationale = f"Retrieve graph-linked team ownership and operator runbooks for candidate '{top_cand}'."
    obs_owner = execute_tool(tool, args)
    trace.append({
        "step": step,
        "tool": tool,
        "args": args,
        "outcome": obs_owner.get("outcome", "answered_with_path"),
        "duration_ms": obs_owner.get("duration_ms", 0.0),
        "branch_rationale": rationale,
        "observation": {
            "owner_team": obs_owner.get("owner_team"),
            "runbook_count": len(obs_owner.get("runbooks", [])),
            "missing_data": obs_owner.get("missing_data"),
        },
    })

    # Step 4 (Optional): If counterfactual requested and valid candidate path exists
    if request_surgery and step < max_steps:
        cand_path = obs["candidates"][0].get("path", [])
        if len(cand_path) >= 2:
            step += 1
            src_edge, dst_edge = cand_path[-2], cand_path[-1]
            tool = "verify_action_by_graph_surgery"
            args = {"incident_id": obs["incident_id"], "source_service_id": src_edge, "target_service_id": dst_edge}
            rationale = f"Operator requested counterfactual verification: test cutting candidate link {src_edge}->{dst_edge} in an isolated clone."
            obs_surg = execute_tool(tool, args)
            trace.append({
                "step": step,
                "tool": tool,
                "args": args,
                "outcome": obs_surg.get("outcome", "answered_with_path"),
                "duration_ms": obs_surg.get("duration_ms", 0.0),
                "branch_rationale": rationale,
                "observation": {
                    "ranking_changed": obs_surg.get("ranking_changed"),
                    "invariants_verified": obs_surg.get("invariants_verified"),
                },
            })

    total_duration_ms = round((time.perf_counter() - total_t0) * 1000, 2)
    return {
        "status": "completed",
        "outcome": "answered_with_path",
        "incident_id": obs.get("incident_id"),
        "top_candidate": top_cand,
        "steps_executed": step,
        "total_duration_ms": total_duration_ms,
        "trace": trace,
        "policy": "deterministic_observation_driven_policy",
    }
