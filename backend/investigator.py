"""Deterministic, explainable cause ranking over graph results. No LLM, no invented facts."""
import json
import time
import uuid
from datetime import datetime, timezone

from . import queries as q

DEPLOY_WINDOW_H = 24
WEIGHTS = {
    "path": 3.0,                 # * (1 - hops / (MAX_HOPS + 1)): closer to the affected service scores higher
    "deployment": 4.0,           # * (1 - hours_before / DEPLOY_WINDOW_H) for the most recent deploy in window
    "history_same_pattern": 3.0,  # per resolved past incident caused by candidate with same failure pattern (max 2)
    "history_other": 1.0,        # per resolved past incident caused by candidate, different pattern (max 2)
    "evidence_support": 1.5,     # per supporting evidence (max 3)
    "evidence_contradiction": -2.5,  # per contradicting evidence
    "unsupported": -1.0,         # candidate has no supporting or contradicting evidence at all
}
INCONCLUSIVE_BELOW = 4.0
CLOSE_CALL_MARGIN = 1.0
VERIFY = {
    "cache": "Check evictions, memory usage, hit rate and latency on {n}.",
    "database": "Check connections, CPU and slow queries on {n}.",
    "queue": "Check queue depth, consumer lag and consumer health on {n}.",
    "index": "Check index freshness and the last successful indexing job on {n}.",
    "service": "Compare {n}'s error rate and latency before and after its latest change.",
}


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def shortest(rows, id_idx, hops_idx, path_idx):
    best = {}
    for r in rows:
        if r[id_idx] not in best or (r[hops_idx], r[path_idx]) < (best[r[id_idx]][hops_idx], best[r[id_idx]][path_idx]):
            best[r[id_idx]] = r
    return best


def investigate(incident_id: str, persist: bool = True) -> dict | None:
    trace, _t = [], [time.perf_counter()]

    def mark(name, detail="", operations=None):
        now = time.perf_counter()
        trace.append({"stage": name, "status": "ok", "ms": round((now - _t[0]) * 1000, 1),
                      "detail": detail, "operations": operations or []})
        _t[0] = now

    inc = q.get_incident(incident_id)
    if inc is None:
        return None
    sid = inc["service_id"]
    mark("incident_context", f"{inc['id']} affects {sid}", ["get_incident"])

    # A. multi-hop dependency traversal (the affected service itself is hop 0)
    paths = shortest(q.dependency_paths(sid), 0, 3, 4)
    cand_hops = {**{k: v[3] for k, v in paths.items()}, sid: 0}
    cand_path = {**{k: v[4] for k, v in paths.items()}, sid: [sid]}
    cids = list(cand_hops)
    info = q.service_info(cids + [sid])
    mark("dependency_traversal", f"{len(cids) - 1} dependencies within {q.MAX_HOPS} hops", ["dependency_paths", "service_info"])

    dep = {}
    for r in q.recent_deployments(cids, inc["ts"], DEPLOY_WINDOW_H * 3600):
        if r[0] not in dep or r[3] > dep[r[0]]["ts"]:
            dep[r[0]] = {"id": r[1], "version": r[2], "ts": r[3], "summary": r[4], "hours_before": round((inc["ts"] - r[3]) / 3600, 2)}
    hist = {}
    for r in q.history(cids, incident_id):
        hist.setdefault(r[0], []).append({"incident_id": r[1], "title": r[2], "pattern": r[3], "resolution": r[4], "time": iso(r[5])})
    ev = {}
    for r in q.incident_evidence(incident_id):
        ev.setdefault(r[0], []).append({"id": r[1], "kind": r[2], "polarity": r[3], "text": r[4], "time": iso(r[5])})

    mark("evidence_collection", f"{sum(len(v) for v in ev.values())} evidence, {len(dep)} deployments, {sum(len(v) for v in hist.values())} past incidents", ["recent_deployments", "history", "incident_evidence"])
    candidates = []
    for c in cids:
        bd = {k: 0.0 for k in WEIGHTS}
        bd["path"] = WEIGHTS["path"] * max(0.0, 1 - cand_hops[c] / (q.MAX_HOPS + 1))
        if c in dep:
            bd["deployment"] = WEIGHTS["deployment"] * max(0.0, 1 - dep[c]["hours_before"] / DEPLOY_WINDOW_H)
        same = [h for h in hist.get(c, []) if h["pattern"] == inc["pattern"]]
        other = [h for h in hist.get(c, []) if h["pattern"] != inc["pattern"]]
        bd["history_same_pattern"] = WEIGHTS["history_same_pattern"] * min(len(same), 2)
        bd["history_other"] = WEIGHTS["history_other"] * min(len(other), 2)
        sup = [e for e in ev.get(c, []) if e["polarity"] == "supports"]
        con = [e for e in ev.get(c, []) if e["polarity"] == "contradicts"]
        bd["evidence_support"] = WEIGHTS["evidence_support"] * min(len(sup), 3)
        bd["evidence_contradiction"] = WEIGHTS["evidence_contradiction"] * len(con)
        if not sup and not con:
            bd["unsupported"] = WEIGHTS["unsupported"]
        limits = []
        if not sup:
            limits.append("No supporting evidence is linked to this candidate.")
        if con:
            limits.append("Contradicting evidence exists; see contradicting_evidence.")
        if c not in dep:
            limits.append(f"No deployment changed this service in the {DEPLOY_WINDOW_H}h before the incident.")
        info_c = info.get(c, {"id": c, "name": c, "kind": "service", "tier": None, "team": None})
        candidates.append({
            "service_id": c, "name": info_c["name"], "team": info_c["team"], "kind": info_c["kind"],
            "hops_from_affected": cand_hops[c], "path": cand_path[c],
            "score": round(sum(bd.values()), 2), "score_breakdown": {k: round(v, 2) + 0.0 for k, v in bd.items()},
            "supporting_evidence": sup, "contradicting_evidence": con,
            "deployment": dep.get(c), "history": hist.get(c, []), "same_pattern_history": same,
            "limitations": limits,
            "verification_step": VERIFY.get(info_c["kind"], VERIFY["service"]).format(n=info_c["name"]),
        })
    candidates.sort(key=lambda x: (-x["score"], x["service_id"]))
    for i, c in enumerate(candidates, 1):
        c["rank"] = i
    mark("candidate_ranking", f"{len(candidates)} candidates scored with documented deterministic weights")

    # C. blast radius of the affected service (reverse direction of DEPENDS_ON)
    blast = shortest(q.dependents(sid), 0, 3, 4)
    binfo = q.service_info(list(blast))
    radius = sorted(({"service_id": k, "name": v[1], "tier": v[2], "hops": v[3], "path": v[4],
                      "team": binfo.get(k, {}).get("team")} for k, v in blast.items()), key=lambda x: (x["hops"], x["service_id"]))

    mark("blast_radius", f"{len(radius)} dependent services", ["dependents", "service_info"])
    rb, ad = {}, {}
    for r in q.runbooks(cids):
        rb.setdefault(r[0], []).append({"id": r[1], "title": r[2], "uri": r[3], "steps": r[4] or []})
    for r in q.adrs(cids):
        ad.setdefault(r[0], []).append({"id": r[1], "title": r[2], "decision": r[3]})
    for c in candidates:
        c["runbooks"], c["adrs"] = rb.get(c["service_id"], []), ad.get(c["service_id"], [])
    mark("ownership_context", f"{sum(len(v) for v in rb.values())} runbooks, {sum(len(v) for v in ad.values())} ADRs", ["runbooks", "adrs"])
    top = candidates[0] if candidates else None
    conclusive = bool(top and top["score"] >= INCONCLUSIVE_BELOW)
    if not conclusive:
        note = "Inconclusive: no candidate reaches the minimum heuristic score. Collect more evidence before acting."
    elif len(candidates) > 1 and top["score"] - candidates[1]["score"] < CLOSE_CALL_MARGIN:
        note = f"Close call between {top['name']} and {candidates[1]['name']}; verify both."
    else:
        note = f"{top['name']} ranks highest on graph evidence. This is a heuristic ranking score, not a probability."

    # Action (operator approval always required; nothing is executed)
    if not conclusive:
        a_kind, a_text = "collect_evidence", "Collect more evidence. Start with: " + (top["verification_step"] if top else "n/a")
    else:
        parts = []
        if top["deployment"]:
            parts.append(f"Consider reverting {top['deployment']['id']} ({top['deployment']['summary']}) on {top['name']}.")
        if top["same_pattern_history"]:
            h = top["same_pattern_history"][0]
            parts.append(f"A similar incident {h['incident_id']} was resolved with: {h['resolution']}")
        elif top["history"]:
            h = top["history"][0]
            parts.append(f"Past incident {h['incident_id']} on this service was resolved with: {h['resolution']}")
        parts.append("Verify first: " + top["verification_step"])
        a_kind, a_text = ("mitigate" if (top["deployment"] or top["history"]) else "verify"), " ".join(parts)

    cids_all = [c["service_id"] for c in candidates]
    prior = [{"investigation_id": r[0], "incident_id": r[1], "incident_title": r[2], "top_candidate": r[3],
              "decision": r[4], "rationale": r[5], "decided": iso(r[6]) if r[6] else None}
             for r in q.prior_investigations(cids_all)]

    mark("memory_retrieval", f"{len(prior)} related earlier decisions (historical, not current truth)", ["prior_investigations"])
    inv_id = "INV-" + uuid.uuid4().hex[:8].upper()
    used = sorted({e["id"] for c in candidates for e in c["supporting_evidence"] + c["contradicting_evidence"]})
    now = int(time.time())
    report = {
        "investigation_id": inv_id, "generated_at": iso(now), "data_source": "falkordb", "synthetic_data": True,
        "incident": {**inc, "time": iso(inc["ts"])},
        "dependency_paths": [{"target": c["service_id"], "hops": c["hops_from_affected"], "path": c["path"]} for c in candidates if c["hops_from_affected"] > 0],
        "candidates": candidates, "blast_radius": {"affected_service": sid, "dependents": radius, "count": len(radius)},
        "conclusion": {"status": "ranked" if conclusive else "inconclusive", "top_candidate": top["service_id"] if conclusive else None, "note": note},
        "recommended_action": {"kind": a_kind, "text": a_text, "requires_operator_approval": True},
        "prior_investigations": prior, "scoring": {"weights": WEIGHTS, "inconclusive_below": INCONCLUSIVE_BELOW,
                                                   "note": "Heuristic ranking score, not a calibrated probability."},
        "decision": {"status": "pending", "rationale": "", "decided": None},
        "trace": trace,
    }
    if persist:
        q.save_investigation({
            "id": inv_id, "incident_id": incident_id, "created_at": now, "status": report["conclusion"]["status"],
            "top_candidate": report["conclusion"]["top_candidate"], "report_json": json.dumps(report),
            "ranked": [{"sid": c["service_id"], "rank": c["rank"], "score": c["score"]} for c in candidates[:5]],
            "evidence_ids": used, "action_text": a_text, "action_kind": a_kind})
    return report
