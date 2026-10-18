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
            <span className="eyebrow">{isAdr ? "ARCHITECTURE DECISION" : "OPERATOR RUNBOOK"}</span>
            <h2 id="context-title">{item.title}</h2>
            <span className="badge">{item.id}</span>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close details">Close ✕</button>
        </div>
        {isAdr ? (
          <>
            <h3>Recorded decision</h3>
            <p>{item.decision}</p>
            <div className="banner warn">This is synthetic architecture context for demonstration. Verify against the current system before acting.</div>
          </>
        ) : (
          <>
            <p className="mute">Read-only guidance · synthetic demo content · no commands are executed by Rootline.</p>
            <ol className="runbook-steps">{(item.steps || []).map((step, i) => <li key={i}>{step}</li>)}</ol>
            <div className="banner warn">Use approved operational procedures and human operator review. These steps are illustrative and are not a substitute for your team's production runbook.</div>
          </>
        )}
      </section>
    </div>
  );
}

function PrivacyScopeDialog({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">SUBMISSION DISCLOSURE</span>
            <h2 id="privacy-title">Synthetic Data & Privacy Scope</h2>
            <span className="badge ok">Local Console · Zero External Telemetry</span>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close dialog">Close ✕</button>
        </div>
        <h3>Demonstration & Safety Scope</h3>
        <p>All incidents, services, evidence records, runbooks, and architecture decisions in ROOTLINE OMNI are <b>entirely synthetic and fictional</b>. ROOTLINE does not connect to real production telemetry, does not execute destructive automated commands, and requires human approval for all diagnostic actions.</p>
        <h3>Privacy & Data Collection</h3>
        <p>This application runs as a local operator console communicating strictly between the React client and local FastAPI backend. No user data, cookies, third-party analytics, or telemetry are transmitted to external servers.</p>
        <h3>Heuristic Scores</h3>
        <p>Candidate ranking scores are deterministic heuristic weights calculated from graph distance, deployment recency, historical pattern matches, and evidence polarity. They represent explainable heuristic rank scores, <b>not statistical probabilities</b>.</p>
        <button className="ghost" onClick={onClose} style={{ marginTop: 12 }}>Close</button>
      </section>
    </div>
  );
}

function Candidate({ c, top }) {
  const [open, setOpen] = useState(top);
  const [context, setContext] = useState(null);
  return (
    <div className={"cand" + (top ? " top" : "")}>
      <span className="score" title="Heuristic ranking score, not a probability">{c.score.toFixed(2)}</span>
      <b>#{c.rank} {c.name}</b> <span className="badge">{c.kind}</span> <span className="mute">{c.team || "Owner unknown"}</span>
      <Path ids={c.path} />
      <button className="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide details" : "Show evidence & context"}</button>
      {open && (
        <div>
          <h3>Score breakdown (deterministic heuristic)</h3>
          <table><tbody>{Object.entries(c.score_breakdown).map(([k, v]) => (<tr key={k}><td>{k.replaceAll("_", " ")}</td><td>{v.toFixed(2)}</td></tr>))}</tbody></table>
          {c.deployment && (
            <>
              <h3>Recent deployment</h3>
              <div className="ev"><b>{c.deployment.id}</b> {c.deployment.summary} <small>({c.deployment.hours_before}h before incident)</small></div>
            </>
          )}
          <h3>Evidence</h3>
          {[...c.supporting_evidence, ...c.contradicting_evidence].map((e) => (
            <div key={e.id} className={"ev " + e.polarity}><b>{e.id}</b> [{e.polarity}] {e.text} <small>{e.time}</small></div>
          ))}
          {!c.supporting_evidence.length && !c.contradicting_evidence.length && <p className="mute">No evidence linked.</p>}
          <h3>Historical incidents (graph)</h3>
          {c.history.map((h) => (
            <div key={h.incident_id} className="ev"><b>{h.incident_id}</b> {h.title} <small>pattern {h.pattern}</small><br />Resolution: {h.resolution}</div>
          ))}
          {!c.history.length && <p className="mute">None.</p>}
          <h3>Limitations</h3>
          <ul>{c.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          <h3>Suggested verification</h3>
          <p>{c.verification_step}</p>
          <h3>Company context <span className="badge">retrieved from FalkorDB</span></h3>
          <p>Owner team: <b>{c.team || "unknown"}</b></p>
          {c.runbooks.map((r) => (
            <div key={r.id} className="context-row">
              <div><b>{r.title}</b><small>{r.id} · linked through APPLIES_TO</small></div>
              <button className="ghost" onClick={() => setContext(r)}>Open runbook</button>
            </div>
          ))}
          {c.adrs.map((a) => (
            <div key={a.id} className="context-row">
              <div><b>{a.title}</b><small>{a.id} · linked through GOVERNS</small></div>
              <button className="ghost" onClick={() => setContext(a)}>View decision</button>
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
      <h2>Investigation trace <span className="badge">real backend stages and timings</span></h2>
      <div className="mute trace-note">Deterministic workflow · actual graph operations and elapsed stage timings · no autonomous-agent claim</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Stage</th><th>Graph/tool operations</th><th>ms</th><th>Observed result</th></tr>
          </thead>
          <tbody>
            {trace.map((t) => (
              <tr key={t.stage}>
                <td>{t.stage.replaceAll("_", " ")}</td>
                <td>{(t.operations || []).join(" · ") || "deterministic ranking"}</td>
                <td>{t.ms}</td>
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
    { label: `BASELINE · ${result.before.top_candidate || "INCONCLUSIVE"}`, path: before, y: 44, color: "#57c7ff" },
    { label: `SIMULATED TOP · ${result.after.top_candidate || "INCONCLUSIVE"}`, path: after, y: 118, color: "#f0b35a" },
  ];
  const nodeX = (i, count) => (count <= 1 ? 450 : 80 + i * (740 / (count - 1)));
  return (
    <div className="path-viz-wrap">
      <div className="viz-title">
        <span>Counterfactual path comparison</span>
        <span className="mute">same incident · same ranking rules</span>
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
                      <rect x={x - 53} y={lane.y - 15} width="106" height="30" rx="7" fill="#122337" stroke={lane.color} strokeWidth="1.5" />
                      <text x={x} y={lane.y + 4} textAnchor="middle" className="svg-node">{node.length > 15 ? node.slice(0, 13) + "…" : node}</text>
                    </g>
                  );
                })}
              </>
            )}
          </g>
        ))}
        {removed.map((edge, i) => (
          <g key={edge.from + edge.to + i}>
            <line x1="245" y1="158" x2="655" y2="158" stroke="#ff6b75" strokeWidth="2" strokeDasharray="7 5" />
            <line x1="445" y1="149" x2="455" y2="167" stroke="#ff6b75" strokeWidth="3" />
            <line x1="455" y1="149" x2="445" y2="167" stroke="#ff6b75" strokeWidth="3" />
            <text x="450" y="181" textAnchor="middle" className="svg-cut">CUT {edge.from} → {edge.to}</text>
          </g>
        ))}
      </svg>
      <div className="viz-legend">
        <span><i className="dot blue" /> Baseline</span>
        <span><i className="dot amber" /> Simulated</span>
        <span><i className="dot red" /> Removed edge</span>
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

  const presets = [
    { label: "🎯 Key Cut: inventory → cache", edge: "inventory-service|cache-redis", desc: "Forces candidate path rerouting through payment-service" },
    { label: "🛡️ Negative Control: search → index", edge: "search-service|search-index", desc: "Unrelated subsystem: topology modified in sim, but ranking unchanged" },
    { label: "✂️ Upstream Cut: frontend → gateway", edge: "web-frontend|api-gateway", desc: "Prunes callers; contracts blast radius" },
  ];

  useEffect(() => {
    api("/api/graph/edges").then((d) => setEdges(d.edges)).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    setRes(null);
    setPick("");
  }, [incidentId]);

  async function runEdge(targetPick) {
    const edgeVal = targetPick || pick;
    const [from, to] = edgeVal.split("|");
    if (!from || !to) return;
    setBusy(true);
    setErr("");
    try {
      const result = await api("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, remove_edges: [{ from, to }] }),
      });
      setRes(result);
      if (!result.isolation?.baseline_topology_unchanged || !result.isolation?.baseline_unchanged || !result.isolation?.simulation_graph_deleted) {
        setErr("Safety check alert: inspect the isolation report before trusting this simulation.");
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel surgery-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">COUNTERFACTUAL LAB</span>
          <h2>Live Graph Surgery</h2>
          <p className="mute">Remove a dependency in an isolated graph copy. The baseline is not intentionally mutated.</p>
        </div>
        <span className="badge">FalkorDB · GRAPH.COPY</span>
      </div>

      <div className="surgery-presets" role="group" aria-label="Live Graph Surgery presets">
        <span className="mute tiny preset-title">DEMO PRESETS:</span>
        {presets.map((p) => (
          <button
            key={p.edge}
            className={"ghost preset-chip" + (pick === p.edge ? " active" : "")}
            onClick={() => { setPick(p.edge); runEdge(p.edge); }}
            title={p.desc}
            disabled={busy}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="row surgery-controls">
        <label htmlFor="edge" className="mute">Custom dependency to cut</label>
        <select id="edge" value={pick} onChange={(e) => { setPick(e.target.value); setErr(""); }}>
          <option value="">Select a dependency…</option>
          {edges.map((e) => (
            <option key={e.from + e.to} value={e.from + "|" + e.to}>{e.from} → {e.to}</option>
          ))}
        </select>
        <button disabled={!pick || busy} onClick={() => runEdge()}>
          {busy ? "Cloning graph & rerunning…" : "Cut edge and compare"}
        </button>
      </div>

      {err && <div className="banner err" role="alert">{err}</div>}
      {!res && !busy && (
        <div className="surgery-empty">
          <div className="surgery-icon">⤫</div>
          <b>Run a counterfactual experiment</b>
          <span className="mute">Click a preset above or choose an edge from the dropdown to compare the graph result before and after.</span>
        </div>
      )}
      {busy && (
        <div className="surgery-empty">
          <div className="spinner" />
          <b>Cloning graph into isolated temporary copy…</b>
          <span className="mute">FalkorDB executing GRAPH.COPY, edge deletion, investigation rerun, and invariant verification.</span>
        </div>
      )}
      {res && (
        <>
          <div className={"banner " + (res.changed ? "warn" : "ok")} style={{ marginTop: 10 }}>
            <b>{res.changed ? "Investigation changed" : "Investigation unchanged"}</b>
            <div>{res.changed ? "The removed relationship altered candidate rankings or paths." : "A redundant route remained, or this edge is unrelated to the failure path (Negative Control)."}</div>
            <div className="safety-grid">
              <span>Baseline topology <b className={res.isolation.baseline_topology_unchanged ? "good-text" : "bad-text"}>{res.isolation.baseline_topology_unchanged ? "UNCHANGED" : "CHECK"}</b></span>
              <span>Baseline result <b className={res.isolation.baseline_unchanged ? "good-text" : "bad-text"}>{res.isolation.baseline_unchanged ? "UNCHANGED" : "CHECK"}</b></span>
              <span>Temporary graph <b className={res.isolation.simulation_graph_deleted ? "good-text" : "bad-text"}>{res.isolation.simulation_graph_deleted ? "CLEANED" : "CLEANUP FAILED"}</b></span>
              <span>Audit record <b>{res.audit_saved ? "SAVED" : "NOT SAVED"}</b></span>
              <span>Candidate <b>{res.before.top_candidate || "inconclusive"} → {res.after.top_candidate || "inconclusive"}</b></span>
            </div>
          </div>
          <CausalPathViz result={res} />
          {res.candidate_changes.length > 0 && (
            <>
              <h3>Candidate impact</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Candidate</th><th>Before</th><th>After</th><th>Path after</th></tr>
                  </thead>
                  <tbody>
                    {res.candidate_changes.map((c) => (
                      <tr key={c.service_id}>
                        <td>{c.service_id}</td>
                        <td><Rank x={c.before} /></td>
                        <td><Rank x={c.after} /></td>
                        <td className="mute">{c.after ? c.after.path.join(" → ") : "unreachable"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {(res.blast_radius_removed.length > 0 || res.blast_radius_added.length > 0) && (
            <p>Blast radius changes — removed: {res.blast_radius_removed.join(", ") || "none"}; added: {res.blast_radius_added.join(", ") || "none"}.</p>
          )}
          <p className="mute tiny">Edge count in simulation: {res.isolation.simulation_edges ?? "not reported"} · baseline edges: {res.isolation.baseline_edges_before} → {res.isolation.baseline_edges_after} · measured at {res.generated_at}</p>
        </>
      )}
    </div>
  );
}

function Report({ r, onDecided }) {
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const inconclusive = r.conclusion.status === "inconclusive";

  async function decide(decision) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/investigations/${r.investigation_id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rationale }),
      });
      onDecided(r.investigation_id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function copyAudit() {
    const payload = {
      investigation_id: r.investigation_id,
      incident_id: r.incident.id,
      status: r.conclusion.status,
      top_candidate: r.conclusion.top_candidate,
      recommended_action: r.recommended_action,
      decision: r.decision,
      generated_at: r.generated_at,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <div className={"banner " + (inconclusive ? "warn" : "ok")}>
        <b>{inconclusive ? "Inconclusive" : "Ranked"}</b> · {r.conclusion.note}
        <div className="mute">Investigation {r.investigation_id} · source: FalkorDB (synthetic data) · {r.generated_at}</div>
      </div>
      <div className="panel">
        <h2>Candidate causes <span className="badge">deterministic heuristic · not probability</span></h2>
        {r.candidates.length ? (
          r.candidates.slice(0, 5).map((c, i) => <Candidate key={c.service_id} c={c} top={i === 0 && !inconclusive} />)
        ) : (
          <p className="mute">No candidate services were reachable in the graph.</p>
        )}
      </div>
      <Trace trace={r.trace || []} />
      <Surgery incidentId={r.incident.id} />
      <div className="panel">
        <h2>Blast radius of {r.blast_radius.affected_service}</h2>
        {r.blast_radius.count === 0 ? (
          <p className="mute">No other service depends on it.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Service</th><th>Tier</th><th>Hops</th><th>Team</th><th>Path</th></tr>
              </thead>
              <tbody>
                {r.blast_radius.dependents.map((d) => (
                  <tr key={d.service_id}>
                    <td>{d.name}</td>
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
          <h2>Related earlier decisions (graph memory)</h2>
          {r.prior_investigations.map((p) => (
            <div key={p.investigation_id} className="ev">
              <b>{p.investigation_id}</b> {p.incident_title}: <b>{p.decision}</b> — {p.rationale} <small>{p.decided}</small>
            </div>
          ))}
        </div>
      )}
      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>Proposed action <span className="badge warn">needs operator approval · nothing is executed</span></h2>
            <p>{r.recommended_action.text}</p>
          </div>
          <button className="ghost copy-btn" onClick={copyAudit} title="Copy investigation audit payload">
            {copied ? "✓ Copied JSON" : "📋 Copy Audit JSON"}
          </button>
        </div>
        {r.decision.status === "pending" ? (
          <>
            <label htmlFor="rat">Operator Rationale (Required for compliance)</label>
            <textarea id="rat" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Provide rationale for approval or rejection (min 3 characters)" />
            {err && <div className="banner err" role="alert">{err}</div>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="green" disabled={busy || rationale.trim().length < 3} onClick={() => decide("approved")}>Approve Recommendation</button>
              <button className="red" disabled={busy || rationale.trim().length < 3} onClick={() => decide("rejected")}>Reject Recommendation</button>
            </div>
          </>
        ) : (
          <div className={"banner " + (r.decision.status === "approved" ? "ok" : "err")}>
            Decision recorded in graph: <b>{r.decision.status}</b> — {r.decision.rationale} <span className="mute">{r.decision.decided}</span>
          </div>
        )}
      </div>
    </>
  );
}

function CompanyBrainView({ brain }) {
  const [activeModal, setActiveModal] = useState(null);
  if (!brain) return <p className="mute">Loading Company Brain from FalkorDB…</p>;

  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TRACK 03 · CONNECTED KNOWLEDGE</span>
          <h2>Company Brain & Architecture Context</h2>
          <p className="mute">Read-only operational knowledge and governance retrieved directly through FalkorDB relationships (`APPLIES_TO`, `GOVERNS`, `OWNS`).</p>
        </div>
        <span className="badge ok">FalkorDB Graph</span>
      </div>

      <h3>Operator Runbooks ({brain.runbooks.length})</h3>
      <div className="brain-grid">
        {brain.runbooks.map((rb) => (
          <div key={rb.id} className="brain-card">
            <div>
              <span className="badge">{rb.id}</span>
              <b>{rb.title}</b>
              <div className="mute tiny">Applies to: {rb.services.join(", ")}</div>
            </div>
            <button className="ghost" onClick={() => setActiveModal({ ...rb, steps: rb.steps })}>Open Runbook Steps</button>
          </div>
        ))}
      </div>

      <h3>Architecture Decision Records ({brain.adrs.length})</h3>
      <div className="brain-grid">
        {brain.adrs.map((adr) => (
          <div key={adr.id} className="brain-card">
            <div>
              <span className="badge">{adr.id}</span>
              <b>{adr.title}</b>
              <div className="mute tiny">Governs: {adr.services.join(", ")}</div>
            </div>
            <button className="ghost" onClick={() => setActiveModal({ ...adr, decision: adr.decision })}>View Decision</button>
          </div>
        ))}
      </div>

      <h3>Service Ownership Teams ({brain.teams.length})</h3>
      <div className="brain-grid">
        {brain.teams.map((t) => (
          <div key={t.id} className="brain-card">
            <div>
              <span className="badge">{t.id}</span>
              <b>{t.name} Team</b>
              <div className="mute tiny">Owned services: {t.services.join(", ")}</div>
            </div>
          </div>
        ))}
      </div>

      <RunbookDialog item={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}

function InvestigationSkeleton() {
  return (
    <div className="skeleton-wrap" aria-label="Loading investigation">
      <div className="skeleton-bar" style={{ width: "60%", height: 32 }} />
      <div className="skeleton-bar" style={{ width: "100%", height: 120 }} />
      <div className="skeleton-bar" style={{ width: "80%", height: 80 }} />
      <div className="skeleton-bar" style={{ width: "100%", height: 200 }} />
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [overview, setOverview] = useState(null);
  const [history, setHistory] = useState([]);
  const [brain, setBrain] = useState(null);
  const [sel, setSel] = useState("INC-2026-101");
  const [report, setReport] = useState(null);
  const [tab, setTab] = useState("investigate");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  async function refresh() {
    try {
      const [h, inc, ov, hist, br] = await Promise.all([
        api("/api/health"),
        api("/api/incidents"),
        api("/api/graph/overview"),
        api("/api/investigations"),
        api("/api/company-brain").catch(() => null),
      ]);
      setHealth(h);
      setIncidents(inc.incidents);
      setOverview(ov);
      setHistory(hist.investigations);
      if (br) setBrain(br);
      setErr("");
    } catch (e) {
      setHealth(null);
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function investigate(targetId) {
    const id = targetId || sel;
    if (!id) return;
    setLoading(true);
    setErr("");
    setReport(null);
    try {
      const rep = await api(`/api/investigate/${id}`, { method: "POST" });
      setReport(rep);
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function load(id) {
    try {
      setReport(await api(`/api/investigations/${id}`));
      setTab("investigate");
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  const open = incidents.filter((i) => i.status === "open");
  const past = incidents.filter((i) => i.status !== "open");

  return (
    <>
      <header>
        <h1>
          <span className="brand-mark">R</span> ROOTLINE <small>graph-native incident intelligence</small>
        </h1>
        <div className="row">
          {health ? (
            <span className="badge ok">FalkorDB connected · graph “{health.graph}” · synthetic data</span>
          ) : (
            <span className="badge bad">FalkorDB unreachable</span>
          )}
          {health && !health.seeded && (
            <span className="badge warn">graph empty: run python -m backend.seed</span>
          )}
          <button className="ghost privacy-btn" onClick={() => setPrivacyOpen(true)}>
            Privacy & Scope
          </button>
        </div>
      </header>

      <main>
        <aside>
          {overview && (
            <div className="panel">
              <h2>Graph overview</h2>
              <div className="mute">
                {Object.entries(overview.nodes).map(([k, v]) => `${v} ${k}`).join(" · ")} · {overview.dependency_edges} dependency edges
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {overview.severity.filter((s) => s.status === "open").map((s) => (
                  <span key={s.severity} className={"badge " + s.severity}>{s.severity}: {s.count} open</span>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <h2>Incident queue</h2>
            <div className="quick-incidents">
              <span className="mute tiny">QUICK SWITCH:</span>
              <div className="row" style={{ gap: 4, margin: "4px 0 8px" }}>
                {open.map((i) => (
                  <button
                    key={i.id}
                    className={"ghost tiny-chip" + (sel === i.id ? " active" : "")}
                    onClick={() => { setSel(i.id); setReport(null); setTab("investigate"); }}
                  >
                    {i.id}
                  </button>
                ))}
              </div>
            </div>

            {open.map((i) => (
              <button
                key={i.id}
                className={"inc" + (sel === i.id ? " sel" : "")}
                onClick={() => { setSel(i.id); setReport(null); setTab("investigate"); }}
              >
                <span className={"badge " + i.severity}>{i.severity}</span> <b>{i.title}</b>
                <span className="mute">{i.id} · {i.service_name} · {i.time}</span>
              </button>
            ))}
            {!open.length && <p className="mute">No incidents. Is the graph seeded?</p>}
            {past.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Resolved in graph history</h3>
                {past.map((i) => (
                  <div key={i.id} className="mute tiny" style={{ padding: "4px 0" }}>
                    <b>{i.id}</b> · {i.title}
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>

        <section>
          {err && <div className="banner err" role="alert">{err}</div>}
          <div className="tabs">
            <button className={tab === "investigate" ? "" : "ghost"} onClick={() => setTab("investigate")}>
              ⚡ Investigation
            </button>
            <button className={tab === "brain" ? "" : "ghost"} onClick={() => setTab("brain")}>
              🧠 Company Brain
            </button>
            <button className={tab === "history" ? "" : "ghost"} onClick={() => setTab("history")}>
              💾 Saved Investigations ({history.length})
            </button>
          </div>

          {tab === "investigate" && (
            <>
              <div className="panel">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="row">
                    <button disabled={!sel || loading} onClick={() => investigate()}>
                      {loading ? "Querying graph…" : "Run investigation"}
                    </button>
                    <span className="mute">{sel ? `Selected ${sel}` : "Select an incident from the queue"}</span>
                  </div>
                  {report && (
                    <span className="badge ok">Investigation Active</span>
                  )}
                </div>
                {sel && <p style={{ marginTop: 8 }}>{incidents.find((i) => i.id === sel)?.summary}</p>}
              </div>

              {loading && <InvestigationSkeleton />}
              {!loading && report && <Report r={report} onDecided={load} />}
              {!loading && !report && (
                <div className="panel surgery-empty">
                  <div className="surgery-icon">🔍</div>
                  <b>Ready to investigate {sel}</b>
                  <span className="mute">Click "Run investigation" above to query dependencies, deployments, evidence, and historical resolutions in FalkorDB.</span>
                </div>
              )}
            </>
          )}

          {tab === "brain" && <CompanyBrainView brain={brain} />}

          {tab === "history" && (
            <div className="panel">
              <h2>Saved investigations (read from FalkorDB)</h2>
              {!history.length && <p className="mute">None yet. Run an investigation and record a decision.</p>}
              {history.length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>ID</th><th>Incident</th><th>Status</th><th>Top Candidate</th><th>Decision</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td>{h.id}</td>
                          <td>{h.incident_title}</td>
                          <td>{h.status}</td>
                          <td>{h.top_candidate || "—"}</td>
                          <td>
                            <span className={"badge " + (h.decision === "approved" ? "ok" : h.decision === "rejected" ? "bad" : "warn")}>
                              {h.decision}
                            </span>
                          </td>
                          <td><button className="ghost" onClick={() => load(h.id)}>Open</button></td>
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

      <PrivacyScopeDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </>
  );
}
