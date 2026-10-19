"""Live Graph Surgery: copy the graph, remove dependency edges in the COPY, rerun the same
investigation, compare, delete the copy. The baseline topology is never modified."""
import uuid

from . import graph, queries as q
from .investigator import investigate, iso


class UnknownEdge(Exception):
    pass


class GraphCopyUnavailable(Exception):
    """The configured FalkorDB server/client cannot create an isolated graph copy."""
    pass


def _summary(r: dict) -> dict:
    return {
        "status": r["conclusion"]["status"], "top_candidate": r["conclusion"]["top_candidate"],
        "candidates": {c["service_id"]: {"rank": c["rank"], "score": c["score"], "path": c["path"]} for c in r["candidates"]},
        "blast_radius": sorted(d["service_id"] for d in r["blast_radius"]["dependents"]),
    }


def simulate(incident_id: str, remove_edges: list[tuple[str, str]]):
    """Run a counterfactual investigation on a disposable graph copy.

    The baseline graph's dependency topology is read before and after the simulation.
    A Simulation audit node is written to the baseline after verification; this does
    not change the dependency topology used by investigations.
    """
    base = investigate(incident_id, persist=False)
    if base is None:
        return None

    # Validate against the baseline before allocating a copy. Reject duplicate inputs
    # rather than making the user's requested operation ambiguous.
    if len(set(remove_edges)) != len(remove_edges):
        raise UnknownEdge("Duplicate dependency edges are not allowed")
    for a, b in remove_edges:
        if not q.edge_exists(a, b):
            raise UnknownEdge(f"No DEPENDS_ON edge {a} -> {b}")

    edges_before_list = sorted((e["from"], e["to"]) for e in q.list_edges())
    baseline_summary = _summary(base)
    baseline_name = graph.graph_name()
    sim_name = f"{baseline_name}_sim_{uuid.uuid4().hex[:8]}"
    db = graph.get_db()
    sim_edges = None
    sim_deleted = False
    after = None

    try:
        try:
            db.select_graph(baseline_name).copy(sim_name)
        except Exception as exc:
            # Do not silently seed a partial replacement graph: that would change the
            # meaning of the counterfactual. Fail closed with an actionable message.
            raise GraphCopyUnavailable(
                "This FalkorDB server/client could not copy the baseline graph. "
                "Use a FalkorDB version that supports GRAPH.COPY and verify copy permissions; "
                "the baseline was not intentionally mutated."
            ) from exc
        with graph.use_graph(sim_name):
            for a, b in remove_edges:
                q.delete_edge(a, b)
            after = investigate(incident_id, persist=False)
            sim_edges = q.edge_count()
            if after is None:
                raise RuntimeError("Incident disappeared from simulation graph")
    finally:
        # Do not claim cleanup succeeded unless the graph is actually gone.
        try:
            if sim_name in db.list_graphs():
                db.select_graph(sim_name).delete()
            sim_deleted = sim_name not in db.list_graphs()
        except Exception:
            sim_deleted = False

    # Re-read the baseline and compare the actual edge set, not only its count.
    verify = investigate(incident_id, persist=False)
    edges_after_list = sorted((e["from"], e["to"]) for e in q.list_edges())
    baseline_unchanged = (
        edges_after_list == edges_before_list
        and verify is not None
        and _summary(verify) == baseline_summary
    )
    b, a = baseline_summary, _summary(after)
    changes = []
    for sid in sorted(set(b["candidates"]) | set(a["candidates"])):
        x, y = b["candidates"].get(sid), a["candidates"].get(sid)
        if x != y:
            changes.append({"service_id": sid, "before": x, "after": y})

    result = {
        "incident_id": incident_id,
        "removed_edges": [{"from": x, "to": y} for x, y in remove_edges],
        "before": b,
        "after": a,
        "candidate_changes": changes,
        "blast_radius_removed": sorted(set(b["blast_radius"]) - set(a["blast_radius"])),
        "blast_radius_added": sorted(set(a["blast_radius"]) - set(b["blast_radius"])),
        "changed": b != a,
        "isolation": {
            "simulation_graph_deleted": sim_deleted,
            "baseline_edges_before": len(edges_before_list),
            "baseline_edges_after": len(edges_after_list),
            "simulation_edges": sim_edges,
            "baseline_unchanged": baseline_unchanged,
            "baseline_topology_unchanged": edges_after_list == edges_before_list,
        },
    }
    import time
    now = int(time.time())
    try:
        q.save_simulation({
            "id": "SIM-" + uuid.uuid4().hex[:8].upper(),
            "iid": incident_id,
            "edges": [f"{x}->{y}" for x, y in remove_edges],
            "ts": now,
            "tb": b["top_candidate"] or "",
            "ta": a["top_candidate"] or "",
            "ch": result["changed"],
        })
        result["audit_saved"] = True
    except Exception:
        # Simulation output remains useful, but never claim an audit record was saved.
        result["audit_saved"] = False
    result["generated_at"] = iso(now)
    return result
