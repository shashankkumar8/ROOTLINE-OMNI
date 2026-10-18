"""Every Cypher query the product depends on. Parameterized; no business logic here."""
from .graph import run

MAX_HOPS = 4  # constant interpolated into variable-length patterns (Cypher cannot parameterize bounds)


def get_incident(iid: str):
    r = run("MATCH (i:Incident {id:$id})-[:AFFECTS]->(s:Service) "
            "RETURN i.id, i.title, i.severity, i.ts, i.pattern, i.status, i.summary, s.id, s.name", {"id": iid})
    if not r:
        return None
    k = ["id", "title", "severity", "ts", "pattern", "status", "summary", "service_id", "service_name"]
    return dict(zip(k, r[0]))


def list_incidents():
    r = run("MATCH (i:Incident)-[:AFFECTS]->(s:Service) "
            "RETURN i.id, i.title, i.severity, i.ts, i.pattern, i.status, i.summary, s.id, s.name ORDER BY i.ts DESC")
    k = ["id", "title", "severity", "ts", "pattern", "status", "summary", "service_id", "service_name"]
    return [dict(zip(k, x)) for x in r]


# A. Dependency traversal: what does the affected service (transitively) DEPEND ON?  A -[:DEPENDS_ON*]-> C
def dependency_paths(service_id: str):
    return run(f"MATCH p=(a:Service {{id:$sid}})-[:DEPENDS_ON*1..{MAX_HOPS}]->(c:Service) "
               "RETURN c.id, c.name, c.kind, length(p), [n IN nodes(p) | n.id]", {"sid": service_id})


# C. Blast radius: who (transitively) DEPENDS ON this service?  D -[:DEPENDS_ON*]-> A  (reverse direction)
def dependents(service_id: str):
    return run(f"MATCH p=(d:Service)-[:DEPENDS_ON*1..{MAX_HOPS}]->(a:Service {{id:$sid}}) "
               "RETURN d.id, d.name, d.tier, length(p), [n IN nodes(p) | n.id]", {"sid": service_id})


def service_info(ids: list):
    r = run("MATCH (s:Service) WHERE s.id IN $ids OPTIONAL MATCH (t:Team)-[:OWNS]->(s) "
            "RETURN s.id, s.name, s.tier, s.kind, t.name", {"ids": ids})
    return {x[0]: {"id": x[0], "name": x[1], "tier": x[2], "kind": x[3], "team": x[4]} for x in r}


# Temporal evidence: deployments that CHANGED a candidate within `window` seconds before the incident
def recent_deployments(cids: list, ts: int, window: int):
    return run("MATCH (d:Deployment)-[:CHANGED]->(s:Service) "
               "WHERE s.id IN $cids AND d.ts <= $ts AND d.ts >= $since "
               "RETURN s.id, d.id, d.version, d.ts, d.summary", {"cids": cids, "ts": ts, "since": ts - window})


# B. Historical evidence: resolved incidents CAUSED_BY a candidate, with documented resolutions
def history(cids: list, incident_id: str):
    return run("MATCH (h:Incident)-[:CAUSED_BY]->(s:Service) "
               "WHERE s.id IN $cids AND h.status = 'resolved' AND h.id <> $iid "
               "RETURN s.id, h.id, h.title, h.pattern, h.resolution, h.ts", {"cids": cids, "iid": incident_id})


def incident_evidence(incident_id: str):
    return run("MATCH (i:Incident {id:$iid})-[:HAS_EVIDENCE]->(e:Evidence)-[:ABOUT]->(s:Service) "
               "RETURN s.id, e.id, e.kind, e.polarity, e.text, e.ts", {"iid": incident_id})


# E. Memory: earlier investigations whose top candidate is among the current candidates and that got a decision
def prior_investigations(cids: list, exclude_id: str = ""):
    return run("MATCH (inv:Investigation)-[:OF]->(i:Incident) "
               "WHERE inv.top_candidate IN $cids AND inv.decision <> 'pending' AND inv.id <> $x "
               "RETURN inv.id, i.id, i.title, inv.top_candidate, inv.decision, inv.rationale, inv.decided_at "
               "ORDER BY inv.decided_at DESC LIMIT 5", {"cids": cids, "x": exclude_id})


# D. Persistence
def save_investigation(inv: dict):
    run("MATCH (i:Incident {id:$iid}) "
        "CREATE (inv:Investigation {id:$id, created_at:$ts, incident_id:$iid, status:$status, "
        "top_candidate:$top, decision:'pending', rationale:'', decided_at:0, report_json:$json})-[:OF]->(i)",
        {"iid": inv["incident_id"], "id": inv["id"], "ts": inv["created_at"], "status": inv["status"],
         "top": inv["top_candidate"] or "", "json": inv["report_json"]})
    if inv["ranked"]:
        run("UNWIND $c AS c MATCH (inv:Investigation {id:$id}),(s:Service {id:c.sid}) "
            "CREATE (inv)-[:RANKED {rank:c.rank, score:c.score}]->(s)", {"id": inv["id"], "c": inv["ranked"]})
    if inv["evidence_ids"]:
        run("UNWIND $e AS eid MATCH (inv:Investigation {id:$id}),(e:Evidence {id:eid}) "
            "CREATE (inv)-[:USED_EVIDENCE]->(e)", {"id": inv["id"], "e": inv["evidence_ids"]})
    run("MATCH (inv:Investigation {id:$id}) CREATE (inv)-[:RECOMMENDS]->(a:Action "
        "{id:$aid, text:$text, kind:$kind, requires_approval:true})",
        {"id": inv["id"], "aid": inv["id"] + "-ACT", "text": inv["action_text"], "kind": inv["action_kind"]})


def list_investigations():
    r = run("MATCH (inv:Investigation)-[:OF]->(i:Incident) "
            "RETURN inv.id, inv.created_at, i.id, i.title, inv.status, inv.top_candidate, inv.decision, "
            "inv.rationale, inv.decided_at ORDER BY inv.created_at DESC")
    k = ["id", "created_at", "incident_id", "incident_title", "status", "top_candidate", "decision", "rationale", "decided_at"]
    return [dict(zip(k, x)) for x in r]


def get_investigation(inv_id: str):
    r = run("MATCH (inv:Investigation {id:$id})-[:OF]->(i:Incident) "
            "RETURN inv.report_json, inv.decision, inv.rationale, inv.decided_at", {"id": inv_id})
    if not r:
        return None
    ev = run("MATCH (inv:Investigation {id:$id})-[:USED_EVIDENCE]->(e:Evidence) RETURN e.id ORDER BY e.id", {"id": inv_id})
    rk = run("MATCH (inv:Investigation {id:$id})-[r:RANKED]->(s:Service) RETURN s.id, r.rank, r.score ORDER BY r.rank", {"id": inv_id})
    act = run("MATCH (inv:Investigation {id:$id})-[:RECOMMENDS]->(a:Action) RETURN a.id, a.text, a.kind", {"id": inv_id})
    return {"report_json": r[0][0], "decision": r[0][1], "rationale": r[0][2], "decided_at": r[0][3],
            "used_evidence": [x[0] for x in ev], "ranked": [{"service_id": x[0], "rank": x[1], "score": x[2]} for x in rk],
            "action": ({"id": act[0][0], "text": act[0][1], "kind": act[0][2]} if act else None)}


def record_decision(inv_id: str, decision: str, rationale: str, ts: int):
    run("MATCH (inv:Investigation {id:$id}) SET inv.decision=$d, inv.rationale=$r, inv.decided_at=$ts",
        {"id": inv_id, "d": decision, "r": rationale, "ts": ts})


def graph_overview():
    counts = run("MATCH (n) RETURN labels(n)[0], count(n)")
    sev = run("MATCH (i:Incident) RETURN i.severity, i.status, count(i)")
    rels = run("MATCH ()-[r:DEPENDS_ON]->() RETURN count(r)")
    services = run("MATCH (s:Service) OPTIONAL MATCH (t:Team)-[:OWNS]->(s) "
                   "RETURN s.id, s.name, s.tier, s.kind, t.name ORDER BY s.tier, s.id")
    svc_list = [{"id": s[0], "name": s[1], "tier": s[2], "kind": s[3], "team": s[4]} for s in services]
    return {"nodes": {x[0]: x[1] for x in counts},
            "severity": [{"severity": x[0], "status": x[1], "count": x[2]} for x in sev],
            "dependency_edges": rels[0][0] if rels else 0,
            "services": svc_list}


# Company Brain: runbooks and architecture decisions attached to services by graph relationships
def runbooks(ids: list):
    return run("MATCH (r:Runbook)-[:APPLIES_TO]->(s:Service) WHERE s.id IN $ids RETURN s.id, r.id, r.title, r.uri, r.steps", {"ids": ids})


def adrs(ids: list):
    return run("MATCH (a:ADR)-[:GOVERNS]->(s:Service) WHERE s.id IN $ids RETURN s.id, a.id, a.title, a.decision", {"ids": ids})


def company_brain_overview():
    rb_rows = run("MATCH (r:Runbook)-[:APPLIES_TO]->(s:Service) "
                  "RETURN r.id, r.title, r.uri, r.steps, collect(s.id) ORDER BY r.id")
    adr_rows = run("MATCH (a:ADR)-[:GOVERNS]->(s:Service) "
                   "RETURN a.id, a.title, a.decision, collect(s.id) ORDER BY a.id")
    team_rows = run("MATCH (t:Team)-[:OWNS]->(s:Service) "
                    "RETURN t.id, t.name, collect(s.id) ORDER BY t.name")
    return {
        "runbooks": [{"id": r[0], "title": r[1], "uri": r[2], "steps": r[3] or [], "services": r[4]} for r in rb_rows],
        "adrs": [{"id": a[0], "title": a[1], "decision": a[2], "services": a[3]} for a in adr_rows],
        "teams": [{"id": t[0], "name": t[1], "services": t[2]} for t in team_rows],
    }


# Graph surgery support
def list_edges():
    return [{"from": r[0], "to": r[1]} for r in run(
        "MATCH (a:Service)-[:DEPENDS_ON]->(b:Service) RETURN a.id, b.id ORDER BY a.id, b.id")]


def edge_count() -> int:
    return run("MATCH ()-[r:DEPENDS_ON]->() RETURN count(r)")[0][0]


def edge_exists(a: str, b: str) -> bool:
    return run("MATCH (:Service {id:$a})-[r:DEPENDS_ON]->(:Service {id:$b}) RETURN count(r)", {"a": a, "b": b})[0][0] > 0


def delete_edge(a: str, b: str):
    run("MATCH (:Service {id:$a})-[r:DEPENDS_ON]->(:Service {id:$b}) DELETE r", {"a": a, "b": b})


def save_simulation(sim: dict):
    run("CREATE (:Simulation {id:$id, incident_id:$iid, removed_edges:$edges, created_at:$ts, "
        "top_before:$tb, top_after:$ta, changed:$ch})", sim)
