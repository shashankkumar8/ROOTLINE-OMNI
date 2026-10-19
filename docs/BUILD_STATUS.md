## Branch integration note — 2026-10-19

The branch `review/gemini-tog-integration` adds a ToG-inspired adapter, MCP-style JSON-RPC endpoints, workbench UI, and additional tests. The existing sandbox results listed below predate these changes and do not verify this branch. Re-run `python -m pytest -q` and `npm run build` on the final revision; report the exact output. No new-branch test/build result is asserted in this note.

---

# Build status (updated 2026-10-18)

## Verified in the user's sandbox

After the latest review-hardening edits, the user reports:
- `pytest -q`: **32 tests passed** using embedded FalkorDB (`falkordblite`).
- `npm run build`: **succeeded**.

These results apply to the source version and environment used for that run. Re-run the commands on the exact files you submit if you make further code changes.

## Still not verified

- Docker FalkorDB on the user's Windows machine.
- `GRAPH.COPY` compatibility on FalkorDB Cloud, if Cloud is used.
- Full browser click-through on the target machine.
- Public GitHub repository, demo video, live deployment, and completed hackathon submission.

## Release checklist

- Run `pytest -q` from the project root.
- Run `npm run build` from `frontend/`.
- Start the actual FalkorDB configuration intended for the demo.
- Test `INC-2026-101` end to end.
- Test a relevant-edge and unrelated-edge Graph Surgery case.
- Verify temporary graph cleanup, baseline dependency-topology check, and decision persistence.
- Complete the README AI-assistance disclosure truthfully.
- Add the public repository and demo-video URLs.
- Confirm the submission portal reports successful submission.

## Important behavior and limitations

- Live Graph Surgery requires a supported graph-copy operation. If unsupported, the API should fail clearly; it does not silently create a partial seed-only clone.
- The baseline receives a simulation audit record. `baseline_unchanged` refers to the checked dependency topology/investigation comparison, not byte-for-byte database equality.
- Data and runbooks are synthetic. Scores are heuristics, not calibrated probabilities.
- The application does not connect to production telemetry or execute remediation.
- The workflow is deterministic orchestration; no autonomous multi-agent behavior is claimed.
