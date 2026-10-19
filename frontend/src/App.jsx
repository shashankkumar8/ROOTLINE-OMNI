import { useEffect, useState } from "react";

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.error || `Request failed (${res.status})`);
  return body;
}

const Path = ({ ids }) => (
  <div className="path" aria-label={"Dependency path: " + ids.join(" depends on ")}>
    {ids.map((id, i) => (
      <span key={id + i}>
        {i > 0 && <span className="mute"> → </span>}
        <span className="chip">{id}</span>
      </span>
    ))}
  </div>
);

function RunbookDialog({ item, onClose }) {
  if (!item) return null;
  const isAdr = Boolean(item.decision);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="context-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isAdr ? "ARCHITECTURE DECISION RECORD" : "OPERATOR RUNBOOK"}</span>
            <h2 id="context-title">{item.title}</h2>
            <span className="badge">{item.id}</span>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close details">Close ✕</button>
        </div>
        {isAdr ? (
          <>
            <h3>Recorded Decision</h3>
            <p>{item.decision}</p>
            <div className="banner warn">Architecture governance record from FalkorDB knowledge graph.</div>
          </>
        ) : (
          <>
            <p className="mute">Read-only operational procedure · retrieved from FalkorDB via APPLIES_TO.</p>
            <ol className="runbook-steps">
              {(item.steps || []).map((step, i) => <li key={i}>{step}</li>)}
            </ol>
            <div className="banner warn">Follow standard incident response protocols. Operator review mandatory.</div>
          </>
        )}
      </section>
    </div>
  );
}

function Candidate({ c, top }) {
  const [open, setOpen] = useState(top);
  const [context, setContext] = useState(null);
  return (
    <div className={"cand" + (top ? " top" : "")}>
      <span className="score" title="Deterministic graph heuristic ranking score">{c.score.toFixed(2)}</span>
      <b>#{c.rank} {c.name}</b> <span className="badge">{c.kind}</span> <span className="mute">{c.team || "Owner unknown"}</span>
      <Path ids={c.path} />
      <button className="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide details" : "Show evidence & context"}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <h3>Score Breakdown (Deterministic Weights)</h3>
          <table>
            <tbody>
              {Object.entries(c.score_breakdown).map(([k, v]) => (
                <tr key={k}><td>{k.replaceAll("_", " ")}</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{v.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
          {c.deployment && (
            <>
              <h3>Recent Deployment</h3>
              <div className="ev"><b>{c.deployment.id}</b> {c.deployment.summary} <small>({c.deployment.hours_before}h before incident)</small></div>
            </>
          )}
          <h3>Evidence</h3>
          {[...c.supporting_evidence, ...c.contradicting_evidence].map((e) => (
            <div key={e.id} className={"ev " + e.polarity}>
              <b>{e.id}</b> [{e.polarity}] {e.text} <small>{e.time}</small>
            </div>
          ))}
          {!c.supporting_evidence.length && !c.contradicting_evidence.length && <p className="mute">No evidence linked.</p>}
          <h3>Historical Incidents (Graph Memory)</h3>
          {c.history.map((h) => (
            <div key={h.incident_id} className="ev">
              <b>{h.incident_id}</b> {h.title} <small>pattern: {h.pattern}</small><br />Resolution: {h.resolution}
            </div>
          ))}
          {!c.history.length && <p className="mute">None in graph.</p>}
          <h3>Limitations & Missing Data</h3>
          <ul>
            {c.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <h3>Recommended Verification</h3>
          <p>{c.verification_step}</p>
          <h3>Company Brain Context</h3>
          <p>Owner team: <b>{c.team || "unknown"}</b></p>
          {c.runbooks.map((r) => (
            <div key={r.id} className="context-row">
              <div><b>{r.title}</b><small>{r.id} · APPLIES_TO</small></div>
              <button className="ghost" onClick={() => setContext(r)}>View Runbook</button>
            </div>
          ))}
          {c.adrs.map((a) => (
            <div key={a.id} className="context-row">
              <div><b>{a.title}</b><small>{a.id} · GOVERNS</small></div>
              <button className="ghost" onClick={() => setContext(a)}>View ADR</button>
            </div>
          ))}
          {!c.runbooks.length && !c.adrs.length && <p className="mute">No runbook or ADR linked.</p>}
        </div>
      )}
      <RunbookDialog item={context} onClose={() => setContext(null)} />
    </div>
  );
}

function Trace({ trace }) {
  return (
    <div className="panel">
      <h2>Investigation Trace <span className="badge">real elapsed stage timings</span></h2>
      <div className="mute" style={{ marginBottom: 12, fontSize: 12 }}>
        Deterministic Cypher-backed execution trace with time.perf_counter() metrics
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Stage</th><th>Operations</th><th>Latency</th><th>Observed Result</th></tr>
          </thead>
          <tbody>
            {trace.map((t) => (
              <tr key={t.stage}>
                <td style={{ fontWeight: 600 }}>{t.stage.replaceAll("_", " ")}</td>
                <td>{(t.operations || []).join(" · ") || "deterministic ranking"}</td>
                <td style={{ fontFamily: "monospace", color: "var(--acc)" }}>{t.ms} ms</td>
                <td className="mute">{t.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Rank = ({ x }) => (x ? `#${x.rank} (${x.score.toFixed(2)})` : "gone");

function CausalPathViz({ result }) {
  if (!result) return null;
  const before = result.before.candidates[result.before.top_candidate]?.path || [];
  const after = result.after.candidates[result.after.top_candidate]?.path || [];
  const removed = result.removed_edges || [];
  const lanes = [
    { label: `BASELINE · ${result.before.top_candidate || "INCONCLUSIVE"}`, path: before, y: 44, color: "#38bdf8" },
    { label: `SIMULATED · ${result.after.top_candidate || "INCONCLUSIVE"}`, path: after, y: 118, color: "#fbbf24" },
  ];
  const nodeX = (i, count) => count <= 1 ? 450 : 80 + i * (740 / (count - 1));
  return (
    <div className="path-viz-wrap">
      <div className="viz-title">
        <span>Counterfactual Path Comparison</span>
        <span className="mute">same incident · isolated simulation graph copy</span>
      </div>
      <svg className="path-viz" viewBox="0 0 900 190" role="img" aria-label="Baseline and simulated causal path comparison">
        {lanes.map((lane) => (
          <g key={lane.label}>
            <text x="12" y={lane.y - 17} className="svg-label">{lane.label}</text>
            {lane.path.length === 0 ? (
              <text x="16" y={lane.y + 12} className="svg-empty">No reachable top-candidate path</text>
            ) : (
              <>
                {lane.path.slice(0, -1).map((node, i) => {
                  const x1 = nodeX(i, lane.path.length), x2 = nodeX(i + 1, lane.path.length);
                  return (
                    <g key={node + i}>
                      <line x1={x1 + 53} y1={lane.y} x2={x2 - 53} y2={lane.y} stroke={lane.color} strokeWidth="2" />
                      <path d={`M ${x2 - 61} ${lane.y - 5} L ${x2 - 53} ${lane.y} L ${x2 - 61} ${lane.y + 5}`} fill="none" stroke={lane.color} strokeWidth="2" />
                    </g>
                  );
                })}
                {lane.path.map((node, i) => {
                  const x = nodeX(i, lane.path.length);
                  return (
                    <g key={node + i}>
                      <rect x={x - 53} y={lane.y - 15} width="106" height="30" rx="7" fill="#0d1f33" stroke={lane.color} strokeWidth="1.5" />
                      <text x={x} y={lane.y + 4} textAnchor="middle" className="svg-node">
                        {node.length > 15 ? node.slice(0, 13) + "…" : node}
                      </text>
                    </g>
                  );
                })}
              </>
            )}
          </g>
        ))}
        {removed.map((edge, i) => (
          <g key={edge.from + edge.to + i}>
            <line x1="245" y1="158" x2="655" y2="158" stroke="#f87171" strokeWidth="2" strokeDasharray="7 5" />
            <line x1="445" y1="149" x2="455" y2="167" stroke="#f87171" strokeWidth="3" />
            <line x1="455" y1="149" x2="445" y2="167" stroke="#f87171" strokeWidth="3" />
            <text x="450" y="181" textAnchor="middle" className="svg-cut">CUT {edge.from} → {edge.to}</text>
          </g>
        ))}
      </svg>
      <div className="viz-legend">
        <span><i className="dot blue" /> Baseline Path</span>
        <span><i className="dot amber" /> Simulated Path</span>
        <span><i className="dot red" /> Cut Relationship</span>
      </div>
    </div>
  );
}

function Surgery({ incidentId }) {
  const [edges, setEdges] = useState([]);
  const [pick, setPick] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/graph/edges").then((d) => setEdges(d.edges)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { setRes(null); setPick(""); }, [incidentId]);

  async function run() {
    const [from, to] = pick.split("|");
    if (!from || !to) return;
    setBusy(true); setErr("");
    try {
      const result = await api("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, remove_edges: [{ from, to }] })
      });
      setRes(result);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="panel accent-glow">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <span className="eyebrow">COUNTERFACTUAL LAB</span>
          <h2>Live Graph Surgery & Isolation Sandbox</h2>
          <p className="mute" style={{ margin: 0, fontSize: 13 }}>
            Simulate topology cuts in a transient graph clone. Baseline is strictly read-only and preserved.
          </p>
        </div>
        <span className="badge">FalkorDB · Safe Clone</span>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <label htmlFor="edge-select" className="mute" style={{ fontSize: 13 }}>Relationship to cut:</label>
        <select id="edge-select" value={pick} onChange={(e) => { setPick(e.target.value); setErr(""); }} style={{ maxWidth: 360 }}>
          <option value="">Select a dependency edge…</option>
          {edges.map((e) => (
            <option key={e.from + e.to} value={e.from + "|" + e.to}>{e.from} → {e.to}</option>
          ))}
        </select>
        <button disabled={!pick || busy} onClick={run}>
          {busy ? "Cloning & simulating…" : "Cut edge and evaluate"}
        </button>
      </div>
      {err && <div className="banner err">{err}</div>}
      {res && (
        <>
          <div className={"banner " + (res.changed ? "warn" : "ok")}>
            <b>{res.changed ? "Causal Impact Confirmed" : "No Causal Shift"}</b>
            <div>{res.changed ? "Cutting this relationship shifted the candidate ranking." : "Candidate rankings remained stable."}</div>
            <div className="safety-grid">
              <span>Baseline topology: <b className="good-text">{res.isolation.baseline_topology_unchanged ? "UNCHANGED" : "DRIFT"}</b></span>
              <span>Baseline result: <b className="good-text">{res.isolation.baseline_unchanged ? "UNCHANGED" : "DRIFT"}</b></span>
              <span>Temporary clone: <b className="good-text">{res.isolation.simulation_graph_deleted ? "CLEANED" : "RESIDUE"}</b></span>
              <span>Audit record: <b>{res.audit_saved ? "SAVED" : "SKIPPED"}</b></span>
              <span>Top candidate: <b>{res.before.top_candidate || "—"} → {res.after.top_candidate || "—"}</b></span>
            </div>
          </div>
          <CausalPathViz result={res} />
          {res.candidate_changes.length > 0 && (
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr><th>Service</th><th>Before Cut</th><th>After Cut</th><th>New Path</th></tr>
                </thead>
                <tbody>
                  {res.candidate_changes.map((c) => (
                    <tr key={c.service_id}>
                      <td><b>{c.service_id}</b></td>
                      <td><Rank x={c.before} /></td>
                      <td><Rank x={c.after} /></td>
                      <td className="mute">{c.after ? c.after.path.join(" → ") : "unreachable"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Report({ r, onDecided }) {
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inconclusive = r.conclusion.status === "inconclusive";

  async function decide(decision) {
    setBusy(true); setErr("");
    try {
      await api(`/api/investigations/${r.investigation_id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rationale })
      });
      onDecided(r.investigation_id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className={"banner " + (inconclusive ? "warn" : "ok")}>
        <b>{inconclusive ? "Investigation Inconclusive" : "Candidate Ranked"}</b> · {r.conclusion.note}
        <div className="mute">Investigation ID: {r.investigation_id} · Generated: {r.generated_at}</div>
      </div>
      <div className="panel">
        <h2>Ranked Candidate Causes <span className="badge">deterministic heuristic ranking</span></h2>
        {r.candidates.length ? (
          r.candidates.slice(0, 5).map((c, i) => (
            <Candidate key={c.service_id} c={c} top={i === 0 && !inconclusive} />
          ))
        ) : (
          <p className="mute">No candidate services reachable in graph traversal.</p>
        )}
      </div>
      <Trace trace={r.trace || []} />
      <Surgery incidentId={r.incident.id} />
      <div className="panel">
        <h2>Blast Radius of {r.blast_radius.affected_service} <span className="badge">reverse DEPENDS_ON</span></h2>
        {r.blast_radius.count === 0 ? (
          <p className="mute">No upstream services depend on this node.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Service</th><th>Tier</th><th>Hops</th><th>Team</th><th>Traversal Path</th></tr></thead>
              <tbody>
                {r.blast_radius.dependents.map((d) => (
                  <tr key={d.service_id}>
                    <td><b>{d.name}</b></td>
                    <td>{d.tier}</td>
                    <td>{d.hops}</td>
                    <td>{d.team}</td>
                    <td className="mute">{d.path.join(" → ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {r.prior_investigations.length > 0 && (
        <div className="panel">
          <h2>Graph Memory: Historical Operator Decisions</h2>
          {r.prior_investigations.map((p) => (
            <div key={p.investigation_id} className="ev">
              <b>{p.investigation_id}</b> {p.incident_title}: <b>{p.decision}</b> — {p.rationale} <small>{p.decided}</small>
            </div>
          ))}
        </div>
      )}
      <div className="panel accent-glow">
        <h2>Recommended Action & Operator Approval <span className="badge warn">human operator required</span></h2>
        <p style={{ fontSize: 15, margin: "10px 0 16px" }}>{r.recommended_action.text}</p>
        {r.decision.status === "pending" ? (
          <>
            <label htmlFor="decision-rat" className="mute" style={{ fontSize: 13, marginBottom: 6, display: "block" }}>
              Operator Rationale (min 3 characters):
            </label>
            <textarea
              id="decision-rat"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="State reason for approving mitigation or rejecting proposed action..."
            />
            {err && <div className="banner err">{err}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="green" disabled={busy || rationale.trim().length < 3} onClick={() => decide("approved")}>
                Approve Mitigation Action
              </button>
              <button className="red" disabled={busy || rationale.trim().length < 3} onClick={() => decide("rejected")}>
                Reject Action
              </button>
            </div>
          </>
        ) : (
          <div className={"banner " + (r.decision.status === "approved" ? "ok" : "err")}>
            Recorded Decision: <b>{r.decision.status.toUpperCase()}</b> — {r.decision.rationale} <span className="mute">({r.decision.decided})</span>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================================
   TAB: Interactive Topology & Graph Algorithms
   ============================================================================ */
function TopologyTab() {
  const [edges, setEdges] = useState([]);
  const [algoResults, setAlgoResults] = useState(null);
  const [loadingAlgo, setLoadingAlgo] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterTier, setFilterTier] = useState("all");

  useEffect(() => {
    api("/api/graph/edges").then((d) => setEdges(d.edges || [])).catch(() => {});
  }, []);

  async function runAlgorithms() {
    setLoadingAlgo(true);
    try {
      const data = await api("/api/algorithms/run");
      setAlgoResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAlgo(false);
    }
  }

  // Node positions on 900x520 canvas
  const nodeMap = {
    "web-frontend": { x: 100, y: 120, tier: 1, kind: "service" },
    "api-gateway": { x: 260, y: 120, tier: 1, kind: "service" },
    "auth-service": { x: 440, y: 70, tier: 1, kind: "service" },
    "checkout-service": { x: 440, y: 180, tier: 1, kind: "service" },
    "search-service": { x: 440, y: 290, tier: 2, kind: "service" },
    "payment-service": { x: 620, y: 120, tier: 1, kind: "service" },
    "order-service": { x: 620, y: 210, tier: 1, kind: "service" },
    "inventory-service": { x: 620, y: 300, tier: 2, kind: "service" },
    "notification-service": { x: 440, y: 400, tier: 3, kind: "service" },
    "payments-db": { x: 800, y: 70, tier: 1, kind: "database" },
    "cache-redis": { x: 800, y: 160, tier: 1, kind: "cache" },
    "orders-db": { x: 800, y: 240, tier: 1, kind: "database" },
    "message-queue": { x: 800, y: 330, tier: 2, kind: "queue" },
    "inventory-db": { x: 800, y: 410, tier: 2, kind: "database" },
    "search-index": { x: 620, y: 400, tier: 2, kind: "index" },
  };

  const nodes = Object.entries(nodeMap).filter(([id, n]) => filterTier === "all" || n.tier === Number(filterTier));

  return (
    <div>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <span className="eyebrow">GRAPH TOPOLOGY & ANALYTICS</span>
            <h2>Live Dependency Topology & Graph Centrality</h2>
          </div>
          <div className="row">
            <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} style={{ width: 140 }}>
              <option value="all">All Tiers</option>
              <option value="1">Tier 1 Critical</option>
              <option value="2">Tier 2</option>
              <option value="3">Tier 3</option>
            </select>
            <button onClick={runAlgorithms} disabled={loadingAlgo}>
              {loadingAlgo ? "Computing algorithms…" : "Run FalkorDB Algorithms"}
            </button>
          </div>
        </div>

        <div className="topology-container">
          <svg className="topology-svg" viewBox="0 0 920 480">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" opacity="0.6" />
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
              </marker>
            </defs>

            {/* Render Edges */}
            {edges.map((e, idx) => {
              const src = nodeMap[e.from];
              const dst = nodeMap[e.to];
              if (!src || !dst) return null;
              const isHighlight = selectedNode && (selectedNode === e.from || selectedNode === e.to);
              return (
                <line
                  key={idx}
                  x1={src.x}
                  y1={src.y}
                  x2={dst.x}
                  y2={dst.y}
                  stroke={isHighlight ? "#34d399" : "#1e2c42"}
                  strokeWidth={isHighlight ? "2.5" : "1.5"}
                  markerEnd={isHighlight ? "url(#arrow-active)" : "url(#arrow)"}
                />
              );
            })}

            {/* Render Nodes */}
            {nodes.map(([id, n]) => {
              const isSelected = selectedNode === id;
              const rankScore = algoResults?.pagerank?.[id]?.pagerank;
              const betwScore = algoResults?.betweenness?.[id]?.betweenness;
              return (
                <g key={id} className="node-circle" onClick={() => setSelectedNode(id)}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={isSelected ? "18" : "14"}
                    fill={n.kind === "cache" ? "#f59e0b" : n.kind === "database" ? "#818cf8" : n.kind === "queue" ? "#a78bfa" : "#38bdf8"}
                    stroke={isSelected ? "#fff" : "#0d1522"}
                    strokeWidth="3"
                  />
                  <text
                    x={n.x}
                    y={n.y + 24}
                    textAnchor="middle"
                    fill={isSelected ? "#38bdf8" : "#e8eef7"}
                    fontSize="11"
                    fontWeight={isSelected ? "bold" : "normal"}
                  >
                    {id}
                  </text>
                  {rankScore !== undefined && (
                    <text x={n.x} y={n.y - 18} textAnchor="middle" fill="#34d399" fontSize="10" fontFamily="monospace">
                      PR: {rankScore.toFixed(3)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {selectedNode && (
          <div className="banner ok" style={{ marginTop: 14 }}>
            <b>Selected Node: {selectedNode}</b>
            <div className="mute">
              Type: {nodeMap[selectedNode]?.kind} · Tier: {nodeMap[selectedNode]?.tier} ·{" "}
              Outgoing Dependencies: {edges.filter((e) => e.from === selectedNode).map((e) => e.to).join(", ") || "none"} ·{" "}
              Incoming Dependents: {edges.filter((e) => e.to === selectedNode).map((e) => e.from).join(", ") || "none"}
            </div>
          </div>
        )}
      </div>

      {algoResults && (
        <div className="panel">
          <h2>Graph Centrality Metrics <span className="badge">Engine: {algoResults.engine}</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <h3>PageRank Centrality</h3>
              <table>
                <thead><tr><th>Service</th><th>Score</th></tr></thead>
                <tbody>
                  {Object.entries(algoResults.pagerank || {})
                    .sort((a, b) => b[1].pagerank - a[1].pagerank)
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <tr key={k}><td><b>{k}</b></td><td style={{ fontFamily: "monospace", color: "var(--acc)" }}>{v.pagerank.toFixed(4)}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3>Betweenness Centrality</h3>
              <table>
                <thead><tr><th>Service</th><th>Betweenness</th></tr></thead>
                <tbody>
                  {Object.entries(algoResults.betweenness || {})
                    .sort((a, b) => b[1].betweenness - a[1].betweenness)
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <tr key={k}><td><b>{k}</b></td><td style={{ fontFamily: "monospace", color: "var(--ok)" }}>{v.betweenness.toFixed(4)}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   TAB: Agent Trace & Fixed Tools Lab
   ============================================================================ */
function AgentTab({ incidentId }) {
  const [tools, setTools] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolResult, setToolResult] = useState(null);
  const [agentRun, setAgentRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/tools").then((d) => setTools(d.tools || [])).catch(() => {});
  }, []);

  async function executeAgent() {
    if (!incidentId) return;
    setBusy(true); setErr("");
    try {
      const data = await api("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId })
      });
      setAgentRun(data);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function executeTool() {
    if (!activeTool) return;
    setBusy(true); setErr("");
    try {
      const parsedArgs = JSON.parse(toolArgs);
      const res = await api("/api/tools/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: activeTool, arguments: parsedArgs })
      });
      setToolResult(res);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="panel accent-glow">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <span className="eyebrow">AGENT OBSERVATION & POLICY ENGINE</span>
            <h2>Bounded Tool-Calling Agent Console</h2>
            <p className="mute" style={{ margin: 0, fontSize: 13 }}>
              Fixed deterministic tools, read-only parameterized Cypher boundaries, real perf_counter latency.
            </p>
          </div>
          <button onClick={executeAgent} disabled={busy || !incidentId}>
            {busy ? "Executing Agent Cycle…" : `Run Agent for ${incidentId || "Selected"}`}
          </button>
        </div>

        {err && <div className="banner err">{err}</div>}

        {agentRun && (
          <div style={{ marginTop: 16 }}>
            <div className="banner ok">
              <b>Agent Plan Execution Complete</b> · Status: {agentRun.conclusion?.status} · Top: {agentRun.conclusion?.top_candidate || "Inconclusive"}
              <div className="mute">Grounding Verified: {agentRun.grounding_verified ? "YES" : "NO"} · Cycle Duration: {agentRun.cycle_duration_ms} ms</div>
            </div>

            <div className="trace-timeline">
              {agentRun.trace?.map((step, idx) => (
                <div key={idx} className="trace-step">
                  <b>{step.stage}</b> <span className="badge">{step.ms} ms</span>
                  <div className="mute" style={{ fontSize: 13 }}>{step.detail}</div>
                  <div style={{ marginTop: 4 }}>
                    {(step.operations || []).map((op, i) => (
                      <span key={i} className="chip" style={{ marginRight: 6 }}>{op}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Fixed Tool Registry & Interactive Debugger <span className="badge">Fail-Closed Safety</span></h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {tools.map((t) => (
            <div key={t.name} className="tool-card" onClick={() => { setActiveTool(t.name); setToolArgs(JSON.stringify(t.parameters?.properties ? Object.fromEntries(Object.keys(t.parameters.properties).map(k => [k, k.includes("incident") ? incidentId || "INC-2026-101" : "checkout-service"])) : {}, null, 2)); }}>
              <b>{t.name}</b>
              <div className="mute" style={{ fontSize: 12, margin: "6px 0" }}>{t.description}</div>
              <span className="badge">{t.safety?.enforcement || "Read-Only"}</span>
            </div>
          ))}
        </div>

        {activeTool && (
          <div style={{ marginTop: 20, padding: 16, border: "1px solid var(--line-strong)", borderRadius: 10, background: "rgba(0,0,0,0.2)" }}>
            <h3>Execute Tool: {activeTool}</h3>
            <label className="mute" style={{ fontSize: 12 }}>Arguments (JSON):</label>
            <textarea value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} rows={4} style={{ fontFamily: "monospace", margin: "8px 0" }} />
            <button onClick={executeTool} disabled={busy}>Execute Tool Query</button>

            {toolResult && (
              <div style={{ marginTop: 12 }}>
                <h4>Result ({toolResult.duration_ms} ms):</h4>
                <pre style={{ background: "#060a10", padding: 12, borderRadius: 8, overflowX: "auto", fontSize: 12, color: "#38bdf8" }}>
                  {JSON.stringify(toolResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   TAB: Company Brain Knowledge Graph
   ============================================================================ */
function BrainTab() {
  const [brain, setBrain] = useState(null);
  const [filter, setFilter] = useState("");
  const [activeItem, setActiveItem] = useState(null);

  useEffect(() => {
    api("/api/company-brain").then(setBrain).catch(() => {});
  }, []);

  if (!brain) return <div className="panel"><p className="mute">Loading Company Brain from FalkorDB...</p></div>;

  const runbooks = (brain.runbooks || []).filter((r) => r.title.toLowerCase().includes(filter.toLowerCase()) || r.service.toLowerCase().includes(filter.toLowerCase()));
  const adrs = (brain.adrs || []).filter((a) => a.title.toLowerCase().includes(filter.toLowerCase()) || a.service.toLowerCase().includes(filter.toLowerCase()));
  const teams = (brain.teams || []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()) || t.service.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <div className="panel accent-glow">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <span className="eyebrow">ENTERPRISE KNOWLEDGE GRAPH</span>
            <h2>Company Brain: Runbooks, ADRs & Ownership Matrix</h2>
            <p className="mute" style={{ margin: 0, fontSize: 13 }}>
              Connected institutional context linked via APPLIES_TO, GOVERNS, and OWNS.
            </p>
          </div>
          <input
            type="text"
            placeholder="Search knowledge graph..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 240 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {/* Runbooks */}
          <div>
            <h3>Operational Runbooks ({runbooks.length})</h3>
            {runbooks.map((r, i) => (
              <div key={r.id + i} className="context-row">
                <div>
                  <b>{r.title}</b>
                  <small>{r.id} · Applies to: <span className="chip">{r.service}</span></small>
                </div>
                <button className="ghost" onClick={() => setActiveItem(r)}>View Steps</button>
              </div>
            ))}
          </div>

          {/* ADRs */}
          <div>
            <h3>Architecture Decisions ({adrs.length})</h3>
            {adrs.map((a, i) => (
              <div key={a.id + i} className="context-row">
                <div>
                  <b>{a.title}</b>
                  <small>{a.id} · Governs: <span className="chip">{a.service}</span></small>
                </div>
                <button className="ghost" onClick={() => setActiveItem(a)}>View Decision</button>
              </div>
            ))}
          </div>

          {/* Teams */}
          <div>
            <h3>Service Ownership ({teams.length})</h3>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Team</th><th>Service</th></tr></thead>
                <tbody>
                  {teams.map((t, i) => (
                    <tr key={t.id + t.service + i}>
                      <td><b>{t.name}</b></td>
                      <td><span className="chip">{t.service}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <RunbookDialog item={activeItem} onClose={() => setActiveItem(null)} />
    </div>
  );
}

/* ============================================================================
   TAB: Benchmark Evaluation Suite
   ============================================================================ */
function BenchmarkTab() {
  const [bench, setBench] = useState(null);
  const [running, setRunning] = useState(false);

  async function executeBenchmark() {
    setRunning(true);
    try {
      const res = await api("/api/benchmark");
      setBench(res);
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="panel accent-glow">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <span className="eyebrow">COMPETITIVE EVALUATION ENGINE</span>
            <h2>Fair Benchmark: Graph-Native Agent vs Flat Keyword Baseline</h2>
            <p className="mute" style={{ margin: 0, fontSize: 13 }}>
              Side-by-side evaluation over real seeded incidents with identical knowledge constraints.
            </p>
          </div>
          <button onClick={executeBenchmark} disabled={running}>
            {running ? "Running Evaluation Suite…" : "Execute Live Benchmark"}
          </button>
        </div>

        {bench && (
          <>
            <div className="benchmark-grid">
              <div className="metric-card" style={{ borderColor: "rgba(52, 211, 153, 0.4)" }}>
                <span className="badge ok">Graph-Native Agent</span>
                <div className="big-num" style={{ color: "var(--ok)" }}>
                  {(bench.summary.graph_agent.accuracy * 100).toFixed(0)}%
                </div>
                <div className="mute">Top-1 Accuracy</div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  MRR: <b>{bench.summary.graph_agent.mean_reciprocal_rank.toFixed(2)}</b> · Latency: <b>{bench.summary.graph_agent.mean_duration_ms} ms</b>
                </div>
              </div>

              <div className="metric-card" style={{ borderColor: "rgba(248, 113, 113, 0.4)" }}>
                <span className="badge bad">Flat Keyword Baseline</span>
                <div className="big-num" style={{ color: "var(--bad)" }}>
                  {(bench.summary.flat_keyword.accuracy * 100).toFixed(0)}%
                </div>
                <div className="mute">Top-1 Accuracy</div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  MRR: <b>{bench.summary.flat_keyword.mean_reciprocal_rank.toFixed(2)}</b> · Latency: <b>{bench.summary.flat_keyword.mean_duration_ms} ms</b>
                </div>
              </div>

              <div className="metric-card">
                <span className="badge acc">Grounding Integrity</span>
                <div className="big-num" style={{ color: "var(--acc)" }}>
                  {bench.summary.graph_agent.grounding_rate === 1 ? "100%" : "—"}
                </div>
                <div className="mute">Graph Fact Grounding</div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  Total Test Cases: <b>{bench.summary.total_cases} incidents</b>
                </div>
              </div>
            </div>

            <h3>Test Case Breakdown</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Ground Truth</th>
                    <th>Graph Agent Pick</th>
                    <th>Flat Baseline Pick</th>
                    <th>Graph Latency</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {bench.cases.map((c) => (
                    <tr key={c.incident_id}>
                      <td><b>{c.incident_id}</b> ({c.severity})</td>
                      <td><span className="chip">{c.expected_root_cause}</span></td>
                      <td>
                        <span className={"badge " + (c.graph_agent.correct ? "ok" : "bad")}>
                          {c.graph_agent.predicted || "inconclusive"}
                        </span>
                      </td>
                      <td>
                        <span className={"badge " + (c.flat_keyword.correct ? "ok" : "bad")}>
                          {c.flat_keyword.predicted || "none"}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{c.graph_agent.duration_ms} ms</td>
                      <td className={c.graph_agent.correct ? "good-text" : "bad-text"}>
                        {c.graph_agent.correct ? "✓ Graph Superior" : "✗"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   TAB: ToG-Inspired Investigation Workbench
   ============================================================================ */
const TOG_SCENARIOS = [
  {
    label: "Multi-hop investigation",
    prompt: "Investigate INC-2026-101 and explain the graph-backed root-cause path.",
    request_surgery: false,
  },
  {
    label: "Abstention guardrail",
    prompt: "Investigate INC-2026-103 and abstain if evidence is insufficient.",
    request_surgery: false,
  },
  {
    label: "Unknown entity guardrail",
    prompt: "Investigate INC-2026-101 and check kafka-broker.",
    request_surgery: false,
  },
  {
    label: "Counterfactual experiment",
    prompt: "Investigate INC-2026-101 and run a counterfactual edge removal experiment.",
    request_surgery: true,
  },
];

function TogWorkbench({ incidentId }) {
  const [prompt, setPrompt] = useState("Investigate INC-2026-101 and explain the graph-backed root-cause path.");
  const [requestSurgery, setRequestSurgery] = useState(false);
  const [maxSteps, setMaxSteps] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [tools, setTools] = useState([]);
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);

  useEffect(() => {
    api("/api/mcp/tools").then((data) => setTools(data.tools || [])).catch((e) => setError(e.message));
  }, []);

  function chooseScenario(scenario) {
    setPrompt(scenario.prompt.replace("INC-2026-101", incidentId || "INC-2026-101"));
    setRequestSurgery(Boolean(scenario.request_surgery));
    setResult(null);
    setError("");
  }

  async function runInvestigation(event) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api("/api/agent/tog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          incident_id: /\\bINC-\\d{4}-\\d{3}\\b/i.test(prompt) ? undefined : (incidentId || undefined),
          max_steps: Number(maxSteps),
          request_surgery: requestSurgery,
        }),
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function runBenchmark() {
    setBenchmarkBusy(true);
    setError("");
    try {
      setBenchmark(await api("/api/evaluation/ablation"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBenchmarkBusy(false);
    }
  }

  const grounding = result?.grounding;
  const groundingLabel = grounding
    ? grounding.grounding_verified ? "VERIFIED" : "VERIFICATION FAILED"
    : result?.outcome === "unknown_entity" ? "NOT EVALUATED — ENTITY GUARDRAIL"
      : result ? "NOT VERIFIED" : "NOT RUN";

  return (
    <div className="tog-workbench">
      <div className="panel accent-glow">
        <span className="eyebrow">GRAPH EXPLORATION · TRACK 01</span>
        <h2>ToG-Inspired Investigation Workbench</h2>
        <p className="mute">
          A bounded, deterministic observation-driven policy inspired by graph-exploration research.
          This is not a faithful reproduction of a paper's full algorithm or an autonomous LLM planner.
          All incident data is synthetic.
        </p>
        <div className="tog-scenario-grid">
          {TOG_SCENARIOS.map((scenario) => (
            <button
              type="button"
              key={scenario.label}
              className="ghost tog-scenario"
              onClick={() => chooseScenario(scenario)}
              disabled={busy}
            >
              {scenario.label}
            </button>
          ))}
        </div>
        <form onSubmit={runInvestigation}>
          <label htmlFor="tog-prompt" className="mute">Investigation prompt</label>
          <textarea
            id="tog-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            maxLength={2000}
            required
            aria-describedby="tog-prompt-help"
          />
          <div id="tog-prompt-help" className="mute tog-help">
            State the incident ID explicitly. Unknown service-like identifiers stop the run rather than silently selecting a node.
          </div>
          <div className="row tog-controls">
            <label htmlFor="tog-max-steps">Maximum steps</label>
            <select id="tog-max-steps" value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="tog-checkbox">
              <input
                type="checkbox"
                checked={requestSurgery}
                onChange={(e) => setRequestSurgery(e.target.checked)}
              />
              Request counterfactual edge experiment
            </label>
            <button type="submit" disabled={busy || !prompt.trim()}>
              {busy ? "Investigating graph…" : "Run ToG-inspired investigation"}
            </button>
          </div>
        </form>
        {error && <div className="banner err" role="alert">{error}</div>}
        {result && (
          <div className={"banner " + (result.outcome === "answered_with_path" ? "ok" : result.outcome === "inconclusive" ? "warn" : "err")} role="status">
            <b>Outcome: {result.outcome}</b>
            <div>{result.summary || result.reason || (result.top_candidate ? "Candidate returned by graph-backed triage." : "The workflow stopped without asserting a root cause.")}</div>
            <div className="tog-result-meta">
              Incident: <b>{result.incident_id || result.entity?.queried || "—"}</b>
              <span>Steps: <b>{result.steps_executed ?? 0}</b></span>
              <span>Total duration: <b>{typeof result.total_duration_ms === "number" ? result.total_duration_ms + " ms" : "not available"}</b></span>
              <span>Grounding: <b>{groundingLabel}</b></span>
            </div>
            {grounding && (
              <div className="tog-grounding">
                <div>Verified incident/candidate/path/evidence against graph records.</div>
                <small>Verified elements: {JSON.stringify(grounding.verified_elements || {})}</small>
                {grounding.failures?.length > 0 && <small>Failures: {grounding.failures.join(" · ")}</small>}
              </div>
            )}
            {result.entity?.suggestions?.length > 0 && (
              <div className="tog-grounding">
                Graph-backed suggestions: {result.entity.suggestions.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="panel">
          <h2>Observation → Decision Trace <span className="badge">{result.trace?.length || 0} steps</span></h2>
          {!result.trace?.length ? (
            <p className="mute">No tools executed. The entity guardrail stopped the request before graph investigation.</p>
          ) : (
            <div className="tog-trace-list">
              {result.trace.map((step) => (
                <article className="tog-trace-step" key={step.step}>
                  <div className="tog-trace-head">
                    <b>Step {step.step}: {(step.tool || "tool").replaceAll("_", " ")}</b>
                    <span className="badge">{step.duration_ms} ms</span>
                    <span className={"badge " + (step.outcome === "answered_with_path" ? "ok" : step.outcome === "inconclusive" ? "warn" : step.outcome === "tool_error" || step.outcome === "verification_failed" ? "bad" : "")}>{step.outcome}</span>
                  </div>
                  <p>{step.branch_rationale}</p>
                  <details>
                    <summary>Inspect actual tool arguments and observation</summary>
                    <h4>Arguments</h4>
                    <pre>{JSON.stringify(step.arguments || {}, null, 2)}</pre>
                    <h4>Observation</h4>
                    <pre>{JSON.stringify(step.observation || {}, null, 2)}</pre>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="row tog-panel-head">
          <div>
            <span className="eyebrow">FIXED TOOL CONTRACT</span>
            <h2>Available graph tools</h2>
          </div>
          <span className="badge">{tools.length} registered</span>
        </div>
        <div className="tog-tool-grid">
          {tools.map((tool) => (
            <article className="tog-tool-card" key={tool.name}>
              <b>{tool.name}</b>
              <p className="mute">{tool.description}</p>
              <details>
                <summary>Input schema</summary>
                <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
              </details>
            </article>
          ))}
          {!tools.length && <p className="mute">Tool catalogue unavailable. Check backend connection.</p>}
        </div>
        <p className="mute tog-help">These are exposed through ROOTLINE's fixed tool API and a minimal MCP-style JSON-RPC adapter. Do not present this prototype as full MCP transport/session conformance.</p>
      </div>

      <div className="panel">
        <div className="row tog-panel-head">
          <div>
            <span className="eyebrow">MEASURED SYNTHETIC EVALUATION</span>
            <h2>Graph-backed vs graph-free baseline</h2>
            <p className="mute">Runs the same labeled synthetic cases and computes metrics from observed predictions. Results are not a production accuracy claim.</p>
          </div>
          <button onClick={runBenchmark} disabled={benchmarkBusy}>
            {benchmarkBusy ? "Evaluating…" : "Run measured evaluation"}
          </button>
        </div>
        {benchmark && (
          <>
            <div className="tog-metrics">
              <div className="metric-card">
                <span className="mute">Graph-backed accuracy</span>
                <div className="big-num">{benchmark.summary?.graph_backed?.accuracy_pct ?? "—"}{typeof benchmark.summary?.graph_backed?.accuracy_pct === "number" ? "%" : ""}</div>
                <span className="mute">{benchmark.summary?.graph_backed?.correct_count ?? "—"} / {benchmark.summary?.sample_size ?? benchmark.cases?.length ?? "—"} cases correct</span>
              </div>
              <div className="metric-card">
                <span className="mute">Graph-free accuracy</span>
                <div className="big-num">{benchmark.summary?.graph_free_flat?.accuracy_pct ?? "—"}{typeof benchmark.summary?.graph_free_flat?.accuracy_pct === "number" ? "%" : ""}</div>
                <span className="mute">{benchmark.summary?.graph_free_flat?.correct_count ?? "—"} / {benchmark.summary?.sample_size ?? benchmark.cases?.length ?? "—"} cases correct</span>
              </div>
              <div className="metric-card">
                <span className="mute">Sample size</span>
                <div className="big-num">{benchmark.summary?.sample_size ?? benchmark.cases?.length ?? "—"}</div>
                <span className="mute">Synthetic cases</span>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Incident</th><th>Expected</th><th>Graph-backed</th><th>Graph-free</th><th>Observed timing</th></tr></thead>
                <tbody>
                  {(benchmark.cases || []).map((item) => (
                    <tr key={item.case_id}>
                      <td><b>{item.incident_id}</b><small>{item.case_id}</small></td>
                      <td>{item.expected_root_cause || item.expected_status || "Abstain / unknown"}</td>
                      <td><span className={"badge " + (item.graph_backed.correct ? "ok" : "bad")}>{item.graph_backed.prediction || item.graph_backed.status}</span></td>
                      <td><span className={"badge " + (item.graph_free.correct ? "ok" : "bad")}>{item.graph_free.prediction || item.graph_free.status}</span></td>
                      <td className="mute">Graph {item.graph_backed.duration_ms} ms<br />Flat {item.graph_free.duration_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mute tog-help">{benchmark.summary?.methodology} {benchmark.summary?.limitation}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   MAIN ROOTLINE COMMAND CENTER APPLICATION
   ============================================================================ */
export default function App() {
  const [health, setHealth] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [overview, setOverview] = useState(null);
  const [history, setHistory] = useState([]);
  const [sel, setSel] = useState("INC-2026-101");
  const [report, setReport] = useState(null);
  const [tab, setTab] = useState("investigate");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      setHealth(await api("/api/health"));
      setIncidents((await api("/api/incidents")).incidents);
      setOverview(await api("/api/graph/overview"));
      setHistory((await api("/api/investigations")).investigations);
      setErr("");
    } catch (e) {
      setHealth(null);
      setErr(e.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function investigate() {
    setLoading(true); setErr(""); setReport(null);
    try {
      setReport(await api(`/api/investigate/${sel}`, { method: "POST" }));
      await refresh();
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  async function loadHistory(id) {
    try {
      setReport(await api(`/api/investigations/${id}`));
      setTab("investigate");
      await refresh();
    } catch (e) { setErr(e.message); }
  }

  const openIncidents = incidents.filter((i) => i.status === "open");
  const pastIncidents = incidents.filter((i) => i.status !== "open");

  return (
    <>
      <header>
        <h1>
          <span className="brand-mark">R</span> ROOTLINE OMNI
          <small>Graph-Native Incident Intelligence Console</small>
        </h1>

        <nav className="nav-bar" aria-label="Command Center Navigation">
          <button className={"nav-tab" + (tab === "investigate" ? " active" : "")} onClick={() => setTab("investigate")}>
            ⚡ Investigation
          </button>
          <button className={"nav-tab" + (tab === "topology" ? " active" : "")} onClick={() => setTab("topology")}>
            🕸️ Topology & Algorithms
          </button>
          <button className={"nav-tab" + (tab === "agent" ? " active" : "")} onClick={() => setTab("agent")}>
            🤖 Agent Trace
          </button>
          <button className={"nav-tab" + (tab === "tog" ? " active" : "")} onClick={() => setTab("tog")}>
            🧭 ToG Workbench
          </button>
          <button className={"nav-tab" + (tab === "brain" ? " active" : "")} onClick={() => setTab("brain")}>
            🧠 Company Brain
          </button>
          <button className={"nav-tab" + (tab === "benchmark" ? " active" : "")} onClick={() => setTab("benchmark")}>
            📊 Benchmark Suite
          </button>
          <button className={"nav-tab" + (tab === "history" ? " active" : "")} onClick={() => setTab("history")}>
            📁 History ({history.length})
          </button>
        </nav>

        <div className="row">
          {health ? (
            <span className="badge ok">FalkorDB: “{health.graph}” · synthetic data</span>
          ) : (
            <span className="badge bad">FalkorDB unreachable</span>
          )}
        </div>
      </header>

      <main className={tab !== "investigate" && tab !== "history" ? "full-width" : ""}>
        {(tab === "investigate" || tab === "history") && (
          <aside>
            {overview && (
              <div className="panel">
                <h2>Graph Topology</h2>
                <div className="mute" style={{ fontSize: 12 }}>
                  {Object.entries(overview.nodes).map(([k, v]) => `${v} ${k}`).join(" · ")} · {overview.dependency_edges} edges
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  {overview.severity.filter((s) => s.status === "open").map((s) => (
                    <span key={s.severity} className={"badge " + s.severity}>{s.severity}: {s.count} open</span>
                  ))}
                </div>
              </div>
            )}

            <div className="panel">
              <h2>Incident Queue</h2>
              {openIncidents.map((i) => (
                <button
                  key={i.id}
                  className={"inc" + (sel === i.id ? " sel" : "")}
                  onClick={() => { setSel(i.id); setReport(null); setTab("investigate"); }}
                >
                  <span className={"badge " + i.severity}>{i.severity}</span> <b>{i.title}</b>
                  <span className="mute">{i.id} · {i.service_name}</span>
                </button>
              ))}
              {!openIncidents.length && <p className="mute">No open incidents in graph.</p>}

              {pastIncidents.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>Resolved Incidents</h3>
                  {pastIncidents.map((i) => (
                    <div key={i.id} className="mute" style={{ fontSize: 12, padding: "4px 0" }}>
                      {i.id} · {i.title}
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}

        <section>
          {err && <div className="banner err" role="alert">{err}</div>}

          {tab === "investigate" && (
            <>
              <div className="panel">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px" }}>Active Incident: {sel}</h2>
                    <span className="mute">{incidents.find((i) => i.id === sel)?.summary || "Select an incident to investigate"}</span>
                  </div>
                  <button disabled={!sel || loading} onClick={investigate}>
                    {loading ? "Querying FalkorDB Graph…" : "Run Graph Investigation"}
                  </button>
                </div>
              </div>
              {report && <Report r={report} onDecided={loadHistory} />}
            </>
          )}

          {tab === "topology" && <TopologyTab />}
          {tab === "agent" && <AgentTab incidentId={sel} />}
          {tab === "tog" && <TogWorkbench incidentId={sel} />}
          {tab === "brain" && <BrainTab />}
          {tab === "benchmark" && <BenchmarkTab />}

          {tab === "history" && (
            <div className="panel">
              <h2>Saved Investigation Decisions (FalkorDB Graph Memory)</h2>
              {!history.length ? (
                <p className="mute">No investigation decisions recorded yet. Investigate an incident and record an approval.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>ID</th><th>Incident</th><th>Status</th><th>Top Candidate</th><th>Decision</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td><b>{h.id}</b></td>
                          <td>{h.incident_title}</td>
                          <td>{h.status}</td>
                          <td><span className="chip">{h.top_candidate || "—"}</span></td>
                          <td>
                            <span className={"badge " + (h.decision === "approved" ? "ok" : h.decision === "rejected" ? "bad" : "warn")}>
                              {h.decision}
                            </span>
                          </td>
                          <td><button className="ghost" onClick={() => loadHistory(h.id)}>Review</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
