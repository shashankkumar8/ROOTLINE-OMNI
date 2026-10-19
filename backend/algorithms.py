"""Graph algorithms suite with honest engine reporting.
Direct execution against FalkorDB native procedures:
- PageRank: algo.pageRank
- Betweenness Centrality: algo.betweenness
- Weakly Connected Components: algo.wcc
- Shortest Path: native shortestPath() in RETURN
Fallback implementations use explicit, transparent names (e.g. cypher_transitive_degree_fallback).
"""
import time
from typing import Any, Dict, List, Optional
from .graph import ro_run


def run_pagerank(label: str = "Service", rel_type: str = "DEPENDS_ON") -> Dict[str, Any]:
    """Compute PageRank using FalkorDB native algorithm procedure."""
    t0 = time.perf_counter()
    try:
        # FalkorDB native procedure: CALL algo.pageRank('NodeLabel', 'REL_TYPE')
        cypher = f"CALL algo.pageRank('{label}', '{rel_type}')"
        rows = ro_run(cypher)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        results = []
        for r in rows:
            node = r[0]
            score = float(r[1])
            node_id = getattr(node, "properties", {}).get("id") or str(node)
            name = getattr(node, "properties", {}).get("name") or node_id
            results.append({"id": node_id, "name": name, "score": round(score, 6)})
        results.sort(key=lambda x: -x["score"])
        return {
            "algorithm": "pagerank",
            "engine_used": "falkordb_native_pagerank",
            "duration_ms": elapsed_ms,
            "node_count": len(results),
            "results": results,
            "status": "success",
        }
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "algorithm": "pagerank",
            "engine_used": "failed_falkordb_native_pagerank",
            "duration_ms": elapsed_ms,
            "error": str(exc),
            "status": "error",
            "results": [],
        }


def run_betweenness() -> Dict[str, Any]:
    """Compute Betweenness Centrality using FalkorDB native procedure."""
    t0 = time.perf_counter()
    try:
        cypher = "CALL algo.betweenness()"
        rows = ro_run(cypher)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        results = []
        for r in rows:
            node = r[0]
            score = float(r[1])
            props = getattr(node, "properties", {})
            node_id = props.get("id")
            if not node_id:
                continue
            name = props.get("name") or node_id
            results.append({"id": node_id, "name": name, "score": round(score, 4)})
        results.sort(key=lambda x: -x["score"])
        return {
            "algorithm": "betweenness",
            "engine_used": "falkordb_native_betweenness",
            "duration_ms": elapsed_ms,
            "node_count": len(results),
            "results": results,
            "status": "success",
        }
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "algorithm": "betweenness",
            "engine_used": "failed_falkordb_native_betweenness",
            "duration_ms": elapsed_ms,
            "error": str(exc),
            "status": "error",
            "results": [],
        }


def run_connected_components() -> Dict[str, Any]:
    """Compute Weakly Connected Components using FalkorDB native procedure."""
    t0 = time.perf_counter()
    try:
        cypher = "CALL algo.wcc()"
        rows = ro_run(cypher)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        components: Dict[int, List[str]] = {}
        for r in rows:
            node = r[0]
            comp_id = int(r[1])
            props = getattr(node, "properties", {})
            node_id = props.get("id")
            if node_id:
                components.setdefault(comp_id, []).append(node_id)
        formatted = [{"component_id": k, "members": sorted(v), "size": len(v)} for k, v in components.items()]
        formatted.sort(key=lambda x: -x["size"])
        return {
            "algorithm": "connected_components",
            "engine_used": "falkordb_native_wcc",
            "duration_ms": elapsed_ms,
            "component_count": len(formatted),
            "components": formatted,
            "status": "success",
        }
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "algorithm": "connected_components",
            "engine_used": "failed_falkordb_native_wcc",
            "duration_ms": elapsed_ms,
            "error": str(exc),
            "status": "error",
            "components": [],
        }


def run_shortest_path(source_id: str, target_id: str) -> Dict[str, Any]:
    """Compute shortest dependency path using FalkorDB native shortestPath()."""
    t0 = time.perf_counter()
    try:
        cypher = (
            "MATCH (a:Service), (b:Service) "
            "WHERE a.id = $src AND b.id = $dst "
            "RETURN shortestPath((a)-[:DEPENDS_ON*]->(b))"
        )
        rows = ro_run(cypher, {"src": source_id, "dst": target_id})
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        if not rows or not rows[0] or not rows[0][0]:
            return {
                "algorithm": "shortest_path",
                "engine_used": "falkordb_native_shortest_path",
                "source": source_id,
                "target": target_id,
                "path": [],
                "hops": -1,
                "duration_ms": elapsed_ms,
                "status": "not_in_graph",
                "note": f"No directed dependency path from {source_id} to {target_id}",
            }
        p = rows[0][0]
        node_ids = [n.properties.get("id") for n in p.nodes()]
        return {
            "algorithm": "shortest_path",
            "engine_used": "falkordb_native_shortest_path",
            "source": source_id,
            "target": target_id,
            "path": node_ids,
            "hops": len(node_ids) - 1,
            "duration_ms": elapsed_ms,
            "status": "answered_with_path",
        }
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "algorithm": "shortest_path",
            "engine_used": "failed_falkordb_native_shortest_path",
            "source": source_id,
            "target": target_id,
            "duration_ms": elapsed_ms,
            "error": str(exc),
            "status": "tool_error",
        }


def run_transitive_degree_fallback() -> Dict[str, Any]:
    """Transparent Cypher heuristic fallback computing incoming dependency counts."""
    t0 = time.perf_counter()
    rows = ro_run(
        "MATCH (s:Service) "
        "OPTIONAL MATCH (other:Service)-[:DEPENDS_ON]->(s) "
        "RETURN s.id, s.name, count(other) AS in_degree ORDER BY in_degree DESC"
    )
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    results = [{"id": r[0], "name": r[1], "in_degree": r[2]} for r in rows]
    return {
        "algorithm": "degree_centrality",
        "engine_used": "cypher_transitive_degree_fallback",
        "duration_ms": elapsed_ms,
        "results": results,
        "status": "success",
    }
