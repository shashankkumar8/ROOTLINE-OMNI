"""Entity resolution and strict graph grounding.
Every entity, path, edge, and evidence item is validated against live FalkorDB records.
No silent fallbacks, no fabricated links.
"""
from typing import Any, Dict, List, Optional, Tuple
from .graph import ro_run


# Known fixture aliases (explicit, conservative)
SERVICE_ALIASES = {
    "redis": "cache-redis",
    "cache": "cache-redis",
    "redis-cache": "cache-redis",
    "queue": "message-queue",
    "kafka": "message-queue",
    "rabbitmq": "message-queue",
    "mq": "message-queue",
    "gateway": "api-gateway",
    "frontend": "web-frontend",
    "web": "web-frontend",
    "checkout": "checkout-service",
    "payment": "payment-service",
    "payments": "payment-service",
    "order": "order-service",
    "orders": "order-service",
    "inventory": "inventory-service",
    "search": "search-service",
    "notification": "notification-service",
    "notifications": "notification-service",
    "payments database": "payments-db",
    "orders database": "orders-db",
    "inventory database": "inventory-db",
}


def resolve_service_entity(query_str: str) -> Dict[str, Any]:
    """Resolve a raw query string to a canonical service node in FalkorDB.
    Returns:
        {
            "status": "exact_match" | "alias_match" | "ambiguous" | "unknown_entity",
            "service_id": str | None,
            "name": str | None,
            "suggestions": list[str]
        }
    """
    if not query_str or not isinstance(query_str, str):
        return {"status": "unknown_entity", "service_id": None, "name": None, "suggestions": []}

    cleaned = query_str.strip().lower()

    # 1. Exact match on service ID
    exact_id = ro_run("MATCH (s:Service {id:$id}) RETURN s.id, s.name", {"id": cleaned})
    if exact_id:
        return {
            "status": "exact_match",
            "service_id": exact_id[0][0],
            "name": exact_id[0][1],
            "suggestions": [],
        }

    # Exact match case-insensitive on name or id
    exact_name = ro_run(
        "MATCH (s:Service) WHERE toLower(s.name) = $q OR toLower(s.id) = $q RETURN s.id, s.name",
        {"q": cleaned},
    )
    if exact_name:
        return {
            "status": "exact_match",
            "service_id": exact_name[0][0],
            "name": exact_name[0][1],
            "suggestions": [],
        }

    # 2. Explicit aliases
    if cleaned in SERVICE_ALIASES:
        target_id = SERVICE_ALIASES[cleaned]
        node = ro_run("MATCH (s:Service {id:$id}) RETURN s.id, s.name", {"id": target_id})
        if node:
            return {
                "status": "alias_match",
                "service_id": node[0][0],
                "name": node[0][1],
                "suggestions": [],
            }

    # 3. Fuzzy search for suggestions (CONTAINS)
    candidates = ro_run(
        "MATCH (s:Service) WHERE toLower(s.id) CONTAINS $q OR toLower(s.name) CONTAINS $q RETURN s.id, s.name",
        {"q": cleaned},
    )
    if len(candidates) == 1:
        # Single conservative suggestion - do NOT silently select
        return {
            "status": "suggestion_available",
            "service_id": None,
            "name": None,
            "suggestions": [candidates[0][0]],
        }
    elif len(candidates) > 1:
        return {
            "status": "ambiguous",
            "service_id": None,
            "name": None,
            "suggestions": [c[0] for c in candidates],
        }

    return {"status": "unknown_entity", "service_id": None, "name": None, "suggestions": []}


def resolve_incident_entity(query_str: str) -> Dict[str, Any]:
    """Resolve an incident ID or title."""
    if not query_str or not isinstance(query_str, str):
        return {"status": "unknown_entity", "incident_id": None, "suggestions": []}

    cleaned = query_str.strip().upper()

    exact = ro_run("MATCH (i:Incident {id:$id}) RETURN i.id, i.title", {"id": cleaned})
    if exact:
        return {
            "status": "exact_match",
            "incident_id": exact[0][0],
            "title": exact[0][1],
            "suggestions": [],
        }

    # Fuzzy match on title or partial ID
    matches = ro_run(
        "MATCH (i:Incident) WHERE toUpper(i.id) CONTAINS $q OR toUpper(i.title) CONTAINS $q RETURN i.id, i.title",
        {"q": cleaned},
    )
    if len(matches) == 1:
        return {
            "status": "suggestion_available",
            "incident_id": None,
            "suggestions": [matches[0][0]],
        }
    elif len(matches) > 1:
        return {
            "status": "ambiguous",
            "incident_id": None,
            "suggestions": [m[0] for m in matches],
        }

    return {"status": "unknown_entity", "incident_id": None, "suggestions": []}


def verify_directed_edge(source_id: str, target_id: str) -> bool:
    """Verifies that an exact directed DEPENDS_ON edge exists in FalkorDB: source -> target."""
    rows = ro_run(
        "MATCH (a:Service {id:$a})-[r:DEPENDS_ON]->(b:Service {id:$b}) RETURN count(r)",
        {"a": source_id, "b": target_id},
    )
    return bool(rows and rows[0][0] > 0)


def verify_path(path_nodes: List[str]) -> Tuple[bool, Optional[str]]:
    """Verifies that every node exists and each adjacent pair has a valid DEPENDS_ON edge."""
    if not path_nodes or len(path_nodes) < 1:
        return False, "Empty path"

    # Verify all nodes exist
    for node_id in path_nodes:
        n = ro_run("MATCH (s:Service {id:$id}) RETURN count(s)", {"id": node_id})
        if not n or n[0][0] == 0:
            return False, f"Node '{node_id}' does not exist in graph"

    # Verify consecutive edges
    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        if not verify_directed_edge(u, v):
            return False, f"Directed edge does not exist: {u} -> {v}"

    return True, None


def verify_grounded_claim(
    incident_id: str,
    candidate_id: str,
    path: List[str],
    evidence_ids: List[str],
    runbook_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Verify all components of an investigation claim against live graph records.
    Returns:
        {
            "grounding_verified": bool,
            "status": "grounded" | "verification_failed",
            "failures": list[str],
            "verified_elements": dict
        }
    """
    failures = []

    # 1. Incident exists
    inc = ro_run("MATCH (i:Incident {id:$id}) RETURN i.id", {"id": incident_id})
    if not inc:
        failures.append(f"Incident '{incident_id}' not found in graph")

    # 2. Candidate service exists
    cand = ro_run("MATCH (s:Service {id:$id}) RETURN s.id", {"id": candidate_id})
    if not cand:
        failures.append(f"Candidate service '{candidate_id}' not found in graph")

    # 3. Path validity
    if path:
        valid_path, path_err = verify_path(path)
        if not valid_path:
            failures.append(f"Path grounding failed: {path_err}")
        if path[-1] != candidate_id:
            failures.append(f"Path end '{path[-1]}' does not match candidate '{candidate_id}'")

    # 4. Evidence items exist and link to this incident and candidate
    for eid in evidence_ids:
        ev = ro_run(
            "MATCH (i:Incident {id:$iid})-[:HAS_EVIDENCE]->(e:Evidence {id:$eid})-[:ABOUT]->(s:Service {id:$sid}) "
            "RETURN e.id",
            {"iid": incident_id, "eid": eid, "sid": candidate_id},
        )
        if not ev:
            failures.append(f"Evidence '{eid}' is not connected to incident '{incident_id}' and candidate '{candidate_id}'")

    # 5. Runbooks (if specified) must link to the candidate
    if runbook_ids:
        for rbid in runbook_ids:
            rb = ro_run(
                "MATCH (r:Runbook {id:$rbid})-[:APPLIES_TO]->(s:Service {id:$sid}) RETURN r.id",
                {"rbid": rbid, "sid": candidate_id},
            )
            if not rb:
                failures.append(f"Runbook '{rbid}' does not apply to candidate '{candidate_id}'")

    is_verified = len(failures) == 0
    return {
        "grounding_verified": is_verified,
        "status": "grounded" if is_verified else "verification_failed",
        "failures": failures,
        "verified_elements": {
            "incident": bool(inc),
            "candidate": bool(cand),
            "path_edges_verified": bool(path and not any("Path" in f for f in failures)),
            "evidence_count_verified": len(evidence_ids) - sum(1 for f in failures if "Evidence" in f),
        },
    }
