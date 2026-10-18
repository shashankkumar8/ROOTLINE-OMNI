# Final review and deliberate trade-offs

## Changes in this polish pass

1. **Runbook usability:** runbook nodes now carry synthetic, step-by-step guidance stored in FalkorDB. The UI opens the guidance in a read-only modal. ADRs open in the same modal. No `.invalid` URLs are shown, and no command is executed.
2. **Graph Surgery presentation:** the UI now shows a compact SVG comparison of the baseline and simulated top-candidate paths, identifies the removed edge, and surfaces separate status for baseline topology, baseline investigation output, temporary-graph cleanup, and audit persistence.
3. **Graph-copy compatibility:** if the configured client/server cannot copy the graph, the API returns a clear 503. It deliberately does not fall back to reseeding a partial graph: doing so could omit persisted investigations, decisions, audit nodes, and graph state, which would invalidate the counterfactual.
4. **Trace transparency:** the trace lists the actual backend stage, graph/tool operations, measured elapsed time, and result detail. It explicitly describes a deterministic workflow, not autonomous agents.
5. **Track honesty:** Track 01 is the primary capability mapping. Track 02 is supported by graph-backed saved investigation/decision retrieval; Track 03 is supported by graph-linked teams, runbooks, and ADRs. The code does not claim autonomous multi-agent coordination.
6. **Documentation:** graph model, synthetic runbook content, security limits, and verification status have been updated.

## What this does not prove

- This environment did not have the `falkordb` Python package and could not install it because network access was unavailable. The full pytest suite was therefore not executed here.
- The frontend dependencies could not be fully installed, so Vite build and browser interaction were not verified here.
- Docker FalkorDB and FalkorDB Cloud compatibility remain unverified. Test the exact server/version you will use for the demo.
- The scoring model is heuristic and synthetic; it is not a calibrated causal probability.
- The app is not a production incident-response platform: it has no authentication, no real telemetry integration, and no production remediation.

## Final track positioning

- **Track 01 — primary:** connected-data investigation and counterfactual graph proof.
- **Track 02 — memory capability:** investigation/decision persistence and retrieval. Do not claim agent coordination.
- **Track 03 — Company Brain capability:** service ownership, runbooks, and ADR retrieval through graph relationships.

Only select multiple tracks in the official submission form if multiple selection is supported and you can demonstrate each capability from the running app. The product should not claim autonomous agents unless a genuine agent/tool-selection implementation is added and verified.

## Release gate

Before submission, run `python -m pytest -q`, run `npm run build` inside `frontend`, start the exact Docker/FalkorDB version planned for the demo, test the two graph-surgery cases (relevant and unrelated edge), open both runbook and ADR modals, verify decision persistence, and record the demo only after these checks pass.
