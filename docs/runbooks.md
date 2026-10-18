# Synthetic operator runbooks

These runbooks are fictional demonstration content connected to services through FalkorDB `(:Runbook)-[:APPLIES_TO]->(:Service)` relationships. They are displayed in the UI as read-only guidance. Rootline does not execute commands or perform production remediation.

## RB-cache-evictions — Redis eviction and latency

Applies to: `cache-redis`

1. Confirm current memory pressure and eviction policy.
2. Compare eviction rate, hit rate, p95/p99 latency, and connection counts with the incident window.
3. Check the latest cache configuration change and verify whether the new limits are intentional.
4. If the change is implicated, follow the team's approved rollback procedure; do not run destructive commands from this demo.
5. Verify recovery using error rate, latency, and eviction metrics before closing the incident.

## RB-queue-backlog — Queue backlog and consumer scaling

Applies to: `message-queue`, `notification-service`

1. Confirm queue depth, oldest-message age, and consumer lag.
2. Inspect consumer restart frequency and memory/CPU pressure.
3. Check dead-letter volume and recent producer/consumer changes.
4. Scale consumers only within documented capacity and downstream rate limits.
5. Verify backlog drain rate and message processing errors.

## RB-payment-timeouts — Payment timeout triage

Applies to: `payment-service`, `payments-db`

1. Compare payment API latency and timeout rate with the incident start.
2. Check dependency health and connection pool saturation.
3. Compare the latest deployment/configuration with the last known-good version.
4. Use the approved rollback or mitigation procedure only after operator review.
5. Verify successful payment requests and reconcile any affected transactions.

## Safety and provenance

All content above is synthetic and is not an operational runbook for any real system. Do not execute it as production instructions. A real deployment should replace these records with approved, versioned, access-controlled runbooks and record their source and last-reviewed timestamp.
