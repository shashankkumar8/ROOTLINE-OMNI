"""Synthetic seed data. Idempotent (MERGE everywhere). Run: python -m backend.seed
All services, incidents, deployments and evidence below are FICTIONAL, written for this hackathon."""
from datetime import datetime, timezone

from .graph import run


def ts(s: str) -> int:
    return int(datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp())


TEAMS = [
    ("T-platform", "Platform"), ("T-payments", "Payments"), ("T-commerce", "Commerce"),
    ("T-search", "Search"), ("T-growth", "Growth"),
]
# id, name, tier (1 = most critical), kind, owner team
SERVICES = [
    ("web-frontend", "Web Frontend", 1, "service", "T-growth"),
    ("api-gateway", "API Gateway", 1, "service", "T-platform"),
    ("auth-service", "Auth Service", 1, "service", "T-platform"),
    ("checkout-service", "Checkout Service", 1, "service", "T-commerce"),
    ("payment-service", "Payment Service", 1, "service", "T-payments"),
    ("order-service", "Order Service", 1, "service", "T-commerce"),
    ("inventory-service", "Inventory Service", 2, "service", "T-commerce"),
    ("search-service", "Search Service", 2, "service", "T-search"),
    ("notification-service", "Notification Service", 3, "service", "T-growth"),
    ("payments-db", "Payments DB", 1, "database", "T-payments"),
    ("orders-db", "Orders DB", 1, "database", "T-commerce"),
    ("inventory-db", "Inventory DB", 2, "database", "T-commerce"),
    ("search-index", "Search Index", 2, "index", "T-search"),
    ("cache-redis", "Redis Cache", 1, "cache", "T-platform"),
    ("message-queue", "Message Queue", 2, "queue", "T-platform"),
]
# (A, B) means A DEPENDS_ON B
DEPENDS = [
    ("web-frontend", "api-gateway"), ("api-gateway", "auth-service"),
    ("api-gateway", "checkout-service"), ("api-gateway", "search-service"),
    ("checkout-service", "payment-service"), ("checkout-service", "order-service"),
    ("checkout-service", "inventory-service"), ("payment-service", "payments-db"),
    ("payment-service", "cache-redis"), ("order-service", "orders-db"),
    ("order-service", "message-queue"), ("inventory-service", "inventory-db"),
    ("inventory-service", "cache-redis"), ("notification-service", "message-queue"),
    ("auth-service", "cache-redis"), ("search-service", "search-index"),
    ("search-service", "cache-redis"),
]
DEPLOYMENTS = [  # id, version, time, summary, service changed
    ("DEP-501", "redis-config-2026.10.14", "2026-10-14T11:10:00", "Lowered maxmemory and switched eviction policy", "cache-redis"),
    ("DEP-502", "payment-service v2.14.0", "2026-10-14T12:40:00", "Upgraded payment SDK and retry settings", "payment-service"),
    ("DEP-503", "auth-service v5.2.1", "2026-10-12T09:00:00", "Token refresh bugfix", "auth-service"),
]
# id, title, severity, time, pattern, status, summary, affected service, caused-by service, resolution
INCIDENTS = [
    ("INC-2026-101", "Checkout returning HTTP 500s", "SEV1", "2026-10-14T14:10:00", "latency_spike", "open",
     "Checkout error rate 38% with p99 latency above 8s.", "checkout-service", None, None),
    ("INC-2026-102", "Order confirmation emails delayed", "SEV2", "2026-10-15T08:30:00", "queue_backlog", "open",
     "Confirmation emails arriving 40+ minutes late.", "notification-service", None, None),
    ("INC-2026-103", "Search results slightly stale", "SEV3", "2026-10-15T20:00:00", "stale_data", "open",
     "Newly listed items take hours to appear in search.", "search-service", None, None),
    ("INC-2026-044", "Cache latency spike during sale", "SEV1", "2026-08-02T10:00:00", "latency_spike", "resolved",
     "Cache p99 latency exceeded 1s; dependants timed out.", "api-gateway", "cache-redis",
     "Reverted maxmemory-policy to allkeys-lru and flushed hot keys."),
    ("INC-2026-031", "Payment errors after SDK bump", "SEV2", "2026-06-20T15:00:00", "error_rate_spike", "resolved",
     "Payment authorization failures after dependency upgrade.", "checkout-service", "payment-service",
     "Rolled back payment SDK version."),
    ("INC-2026-027", "Notification queue backlog", "SEV2", "2026-05-11T07:45:00", "queue_backlog", "resolved",
     "Queue depth grew faster than consumers drained it.", "notification-service", "message-queue",
     "Scaled consumer group from 2 to 6 workers and purged dead letters."),
    ("INC-2026-019", "Payments DB connection exhaustion", "SEV1", "2026-04-02T13:20:00", "connection_exhaustion", "resolved",
     "Connection pool saturated on payments database.", "payment-service", "payments-db",
     "Raised max connections and fixed leaking connection in client."),
]
# id, incident, service, kind, polarity (supports | contradicts | symptom), text, time
EVIDENCE = [
    ("EV-101-1", "INC-2026-101", "checkout-service", "metric", "symptom", "Checkout 5xx rate rose to 38% at 14:02 UTC.", "2026-10-14T14:02:00"),
    ("EV-101-2", "INC-2026-101", "cache-redis", "metric", "supports", "Redis evictions rose 20x and p99 latency reached 1.4s after 11:15 UTC.", "2026-10-14T11:20:00"),
    ("EV-101-3", "INC-2026-101", "cache-redis", "log", "supports", "Redis log shows maxmemory reached; keys evicted under new policy.", "2026-10-14T11:25:00"),
    ("EV-101-4", "INC-2026-101", "payment-service", "log", "supports", "Payment service logs show timeouts calling cache.", "2026-10-14T13:50:00"),
    ("EV-101-5", "INC-2026-101", "payment-service", "test", "contradicts", "Canary rollback of DEP-502 on one pod did not change its error rate.", "2026-10-14T14:30:00"),
    ("EV-101-6", "INC-2026-101", "payments-db", "metric", "contradicts", "Payments DB CPU and connections within normal range.", "2026-10-14T14:05:00"),
    ("EV-102-1", "INC-2026-102", "notification-service", "metric", "symptom", "Confirmation email latency exceeded 40 minutes.", "2026-10-15T08:20:00"),
    ("EV-102-2", "INC-2026-102", "message-queue", "metric", "supports", "Queue depth 48k and rising; consumer lag growing since 07:50 UTC.", "2026-10-15T08:00:00"),
    ("EV-102-3", "INC-2026-102", "message-queue", "log", "supports", "Consumers restarting repeatedly with out-of-memory errors.", "2026-10-15T08:10:00"),
    ("EV-103-1", "INC-2026-103", "search-service", "metric", "symptom", "Index freshness lag of 5 hours.", "2026-10-15T19:50:00"),
]

RUNBOOKS = [  # id, title, uri, concise operator guidance, services it applies to
    ("RB-cache-evictions", "Redis eviction and latency runbook", "",
     ["Confirm current memory pressure and eviction policy.",
      "Compare eviction rate, hit rate, p95/p99 latency, and connection counts with the incident window.",
      "Check the latest cache configuration change and verify whether the new limits are intentional.",
      "If the change is implicated, follow the team's approved rollback procedure; do not run destructive commands from this demo.",
      "Verify recovery using error rate, latency, and eviction metrics before closing the incident."], ["cache-redis"]),
    ("RB-queue-backlog", "Queue backlog and consumer scaling", "",
     ["Confirm queue depth, oldest-message age, and consumer lag.",
      "Inspect consumer restart frequency and memory/CPU pressure.",
      "Check dead-letter volume and recent producer/consumer changes.",
      "Scale consumers only within documented capacity and downstream rate limits.",
      "Verify backlog drain rate and message processing errors."], ["message-queue", "notification-service"]),
    ("RB-payment-timeouts", "Payment timeout triage", "",
     ["Compare payment API latency and timeout rate with the incident start.",
      "Check dependency health and connection pool saturation.",
      "Compare the latest deployment/configuration with the last known-good version.",
      "Use the approved rollback or mitigation procedure only after operator review.",
      "Verify successful payment requests and reconcile any affected transactions."], ["payment-service", "payments-db"]),
]
ADRS = [  # id, title, decision, services governed
    ("ADR-007", "Shared Redis cache for sessions and inventory", "Accepted: one shared cache cluster to cut cost; accepts shared blast radius.", ["cache-redis"]),
    ("ADR-012", "Asynchronous notifications via message queue", "Accepted: notifications decoupled from order flow through a queue.", ["message-queue", "notification-service"]),
]


def seed() -> dict:
    run("UNWIND $r AS r MERGE (t:Team {id:r.id}) SET t.name=r.name, t.synthetic=true",
        {"r": [{"id": a, "name": b} for a, b in TEAMS]})
    run("UNWIND $r AS r MERGE (s:Service {id:r.id}) SET s.name=r.name, s.tier=r.tier, s.kind=r.kind, s.synthetic=true",
        {"r": [{"id": a, "name": b, "tier": c, "kind": d} for a, b, c, d, _ in SERVICES]})
    run("UNWIND $r AS r MATCH (t:Team {id:r.t}),(s:Service {id:r.s}) MERGE (t)-[:OWNS]->(s)",
        {"r": [{"t": e, "s": a} for a, _, _, _, e in SERVICES]})
    run("UNWIND $r AS r MATCH (a:Service {id:r.a}),(b:Service {id:r.b}) MERGE (a)-[:DEPENDS_ON]->(b)",
        {"r": [{"a": a, "b": b} for a, b in DEPENDS]})
    run("UNWIND $r AS r MERGE (d:Deployment {id:r.id}) SET d.version=r.v, d.ts=r.ts, d.summary=r.sum, d.synthetic=true "
        "WITH d, r MATCH (s:Service {id:r.s}) MERGE (d)-[:CHANGED]->(s)",
        {"r": [{"id": a, "v": b, "ts": ts(c), "sum": d, "s": e} for a, b, c, d, e in DEPLOYMENTS]})
    run("UNWIND $r AS r MERGE (i:Incident {id:r.id}) SET i.title=r.title, i.severity=r.sev, i.ts=r.ts, "
        "i.pattern=r.pat, i.status=r.st, i.summary=r.sum, i.resolution=r.res, i.synthetic=true "
        "WITH i, r MATCH (s:Service {id:r.aff}) MERGE (i)-[:AFFECTS]->(s)",
        {"r": [{"id": a, "title": b, "sev": c, "ts": ts(d), "pat": e, "st": f, "sum": g, "aff": h, "res": k or ""}
               for a, b, c, d, e, f, g, h, _, k in INCIDENTS]})
    run("UNWIND $r AS r MATCH (i:Incident {id:r.i}),(s:Service {id:r.s}) MERGE (i)-[:CAUSED_BY]->(s)",
        {"r": [{"i": x[0], "s": x[8]} for x in INCIDENTS if x[8]]})
    run("UNWIND $r AS r MERGE (e:Evidence {id:r.id}) SET e.kind=r.kind, e.polarity=r.pol, e.text=r.text, "
        "e.ts=r.ts, e.synthetic=true "
        "WITH e, r MATCH (i:Incident {id:r.inc}),(s:Service {id:r.s}) MERGE (i)-[:HAS_EVIDENCE]->(e) MERGE (e)-[:ABOUT]->(s)",
        {"r": [{"id": a, "inc": b, "s": c, "kind": d, "pol": e, "text": f, "ts": ts(g)}
               for a, b, c, d, e, f, g in EVIDENCE]})
    run("UNWIND $r AS r MERGE (b:Runbook {id:r.id}) SET b.title=r.title, b.uri=r.uri, b.steps=r.steps, b.synthetic=true "
        "WITH b, r UNWIND r.svc AS sid MATCH (s:Service {id:sid}) MERGE (b)-[:APPLIES_TO]->(s)",
        {"r": [{"id": a, "title": b, "uri": c, "steps": d, "svc": e} for a, b, c, d, e in RUNBOOKS]})
    run("UNWIND $r AS r MERGE (a:ADR {id:r.id}) SET a.title=r.title, a.decision=r.dec, a.synthetic=true "
        "WITH a, r UNWIND r.svc AS sid MATCH (s:Service {id:sid}) MERGE (a)-[:GOVERNS]->(s)",
        {"r": [{"id": a, "title": b, "dec": c, "svc": d} for a, b, c, d in ADRS]})
    for label in ("Service", "Incident", "Deployment", "Evidence", "Investigation", "Team"):
        try:
            run(f"CREATE INDEX FOR (n:{label}) ON (n.id)")
        except Exception:
            pass  # index already exists
    return {"services": len(SERVICES), "incidents": len(INCIDENTS), "evidence": len(EVIDENCE)}


if __name__ == "__main__":
    print("seeded:", seed())
