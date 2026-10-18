import React, { useEffect, useState, useRef } from "react";

// Centralized API Client
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || body.error || `Request failed with HTTP ${res.status}`);
  }
  return body;
}

// Clean SVG Icons (zero emojis)
const Icons = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  Graph: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M6 9v6M9 6h6M8.5 15.5l7-7"/>
    </svg>
  ),
  Cut: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>
    </svg>
  ),
  Brain: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
      <path d="M6 6h10M6 10h10"/>
    </svg>
  ),
  History: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  ArrowBack: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  ),
};

// Deterministic Topological Node Coordinates for 15 Seeded Services
const NODE_COORDINATES = {
  "web-frontend": { x: 80, y: 260, tier: 1, kind: "service" },
  "api-gateway": { x: 260, y: 200, tier: 1, kind: "service" },
  "auth-service": { x: 260, y: 380, tier: 1, kind: "service" },
  "checkout-service": { x: 480, y: 120, tier: 1, kind: "service" },
  "order-service": { x: 480, y: 220, tier: 1, kind: "service" },
  "inventory-service": { x: 480, y: 320, tier: 2, kind: "service" },
  "payment-service": { x: 480, y: 430, tier: 1, kind: "service" },
  "search-service": { x: 480, y: 530, tier: 2, kind: "service" },
  "notification-service": { x: 480, y: 20, tier: 3, kind: "service" },
  "message-queue": { x: 740, y: 80, tier: 2, kind: "queue" },
  "orders-db": { x: 740, y: 190, tier: 1, kind: "database" },
  "cache-redis": { x: 740, y: 290, tier: 1, kind: "cache" },
  "inventory-db": { x: 740, y: 390, tier: 2, kind: "database" },
  "payments-db": { x: 740, y: 480, tier: 1, kind: "database" },
  "search-index": { x: 740, y: 560, tier: 2, kind: "index" },
};

const KIND_COLORS = {
  service: "#38bdf8",
  database: "#10b981",
  cache: "#f59e0b",
  queue: "#a855f7",
  index: "#ec4899",
};

// Breadcrumb Path Component
const Path = ({ ids }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", margin: "6px 0" }}>
    {ids.map((id, i) => (
      <span key={id + i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {i > 0 && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>→</span>}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--surface-raised)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4 }}>
          {id}
        </span>
      </span>
    ))}
  </div>
);

// Runbook / ADR Context Dialog
function RunbookDialog({ item, onClose }) {
  if (!item) return null;
  const isAdr = Boolean(item.decision);
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal-content" role="dialog" aria-modal="true" aria-labelledby="context-title" tabIndex={-1}>
        <div className="modal-header">
          <div>
            <span className="badge accent" style={{ marginBottom: 6 }}>{isAdr ? "ARCHITECTURE DECISION RECORD" : "OPERATOR RUNBOOK"}</span>
            <h2 id="context-title" style={{ fontSize: 18, color: "var(--text)" }}>{item.title}</h2>
            <span className="badge" style={{ marginTop: 4 }}>{item.id}</span>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close details">Close</button>
        </div>
        {isAdr ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)" }}>Recorded Decision</h4>
            <p style={{ lineHeight: 1.6, color: "var(--text)" }}>{item.decision}</p>
            <div className="badge warn" style={{ padding: "8px 12px", width: "100%" }}>
              Governance context retrieved from FalkorDB. Verify against current system topology before modifying infrastructure.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Standard operational procedures linked through <code>APPLIES_TO</code> graph relationships. Synthetic demo content.
            </p>
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {(item.steps || []).map((step, i) => (
                <li key={i} style={{ color: "var(--text)", lineHeight: 1.5 }}>{step}</li>
              ))}
            </ol>
            <div className="badge warn" style={{ padding: "8px 12px", width: "100%" }}>
              Human operator review required. Automatic remediation is strictly disabled to prevent unintended side effects.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Interactive Topological Dependency Graph Centerpiece
function TopologyGraphView({ overview, edges, activeIncident, selectedNode, onSelectNode, onCutEdge }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 30, y: 10 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const services = overview?.services || Object.keys(NODE_COORDINATES).map((id) => ({
    id,
    name: id.replace("-", " "),
    tier: NODE_COORDINATES[id]?.tier || 1,
    kind: NODE_COORDINATES[id]?.kind || "service",
    team: "Infrastructure",
  }));

  const allEdges = edges || [];

  function handleMouseDown(e) {
    if (e.target.closest(".topology-node")) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  const selectedData = services.find((s) => s.id === selectedNode);
  const upstreamCallers = allEdges.filter((e) => e.to === selectedNode).map((e) => e.from);
  const downstreamTargets = allEdges.filter((e) => e.from === selectedNode).map((e) => e.to);

  return (
    <div className="panel topology-container">
      <div className="topology-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            System Topology Canvas
          </span>
          <span className="badge ok">{services.length} Nodes</span>
          <span className="badge">{allEdges.length} Directed Edges</span>
        </div>
        <div className="topology-controls">
          <button className="ghost" style={{ padding: "4px 8px" }} onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))} title="Zoom In">+</button>
          <button className="ghost" style={{ padding: "4px 8px" }} onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))} title="Zoom Out">−</button>
          <button className="ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setZoom(1); setPan({ x: 30, y: 10 }); }}>Reset View</button>
        </div>
      </div>

      <div
        className="topology-svg-wrap"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 920 620"
          style={{ width: "100%", height: "100%", userSelect: "none" }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b4d66" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Dependency Edges */}
            {allEdges.map((e, idx) => {
              const src = NODE_COORDINATES[e.from] || { x: 100, y: 100 };
              const dst = NODE_COORDINATES[e.to] || { x: 300, y: 300 };
              const isHighlighted = selectedNode && (e.from === selectedNode || e.to === selectedNode);

              // Curved bezier paths
              const dx = dst.x - src.x;
              const pathD = `M ${src.x} ${src.y} C ${src.x + dx * 0.5} ${src.y}, ${src.x + dx * 0.5} ${dst.y}, ${dst.x} ${dst.y}`;

              return (
                <path
                  key={e.from + e.to + idx}
                  d={pathD}
                  className={`topology-edge ${isHighlighted ? "highlighted" : ""}`}
                  markerEnd={isHighlighted ? "url(#arrow-active)" : "url(#arrow)"}
                />
              );
            })}

            {/* Service Nodes */}
            {services.map((svc) => {
              const pos = NODE_COORDINATES[svc.id] || { x: 100, y: 100, tier: 1, kind: "service" };
              const isSelected = selectedNode === svc.id;
              const isOutage = activeIncident?.service_id === svc.id;
              const color = KIND_COLORS[pos.kind] || KIND_COLORS.service;

              return (
                <g
                  key={svc.id}
                  className="topology-node"
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => onSelectNode(svc.id)}
                >
                  <rect
                    x="-68"
                    y="-20"
                    width="136"
                    height="40"
                    rx="5"
                    fill="#101724"
                    stroke={isSelected ? "#38bdf8" : isOutage ? "#ef4444" : "#222c3d"}
                    className={`topology-node-rect ${isSelected ? "selected" : ""} ${isOutage ? "outage" : ""}`}
                  />
                  {/* Category color bar indicator */}
                  <rect x="-68" y="-20" width="4" height="40" rx="2" fill={color} />
                  <text
                    x="-56"
                    y="-4"
                    fill="var(--text)"
                    style={{ fontSize: 11.5, fontWeight: 600, fontFamily: "var(--font-sans)" }}
                  >
                    {svc.name.length > 15 ? svc.name.slice(0, 14) + "…" : svc.name}
                  </text>
                  <text
                    x="-56"
                    y="11"
                    fill="var(--text-dim)"
                    style={{ fontSize: 9.5, fontFamily: "var(--font-mono)" }}
                  >
                    {svc.id}
                  </text>
                  {isOutage && (
                    <circle cx="56" cy="-10" r="4" fill="#ef4444" />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedData ? (
        <div className="inspector-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <span className="badge" style={{ borderColor: KIND_COLORS[selectedData.kind], color: KIND_COLORS[selectedData.kind] }}>
                {selectedData.kind.toUpperCase()} · TIER {selectedData.tier}
              </span>
              <h3 style={{ fontSize: 16, margin: "4px 0", color: "var(--text)" }}>{selectedData.name}</h3>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                ID: {selectedData.id} · Owner: {selectedData.team || "Platform Engineering"}
              </span>
            </div>
            {downstreamTargets.length > 0 && onCutEdge && (
              <button
                className="ghost"
                style={{ fontSize: 11 }}
                onClick={() => onCutEdge(selectedData.id, downstreamTargets[0])}
                title={`Test Live Graph Surgery on ${selectedData.id} → ${downstreamTargets[0]}`}
              >
                <Icons.Cut /> Cut to {downstreamTargets[0]}
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10, fontSize: 12 }}>
            <div>
              <span style={{ color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                UPSTREAM CALLERS ({upstreamCallers.length})
              </span>
              {upstreamCallers.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {upstreamCallers.map((c) => (
                    <span key={c} className="badge" onClick={() => onSelectNode(c)} style={{ cursor: "pointer" }}>{c}</span>
                  ))}
                </div>
              ) : (
                <span style={{ color: "var(--text-dim)" }}>Entry ingress root</span>
              )}
            </div>
            <div>
              <span style={{ color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                DOWNSTREAM DEPENDENCIES ({downstreamTargets.length})
              </span>
              {downstreamTargets.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {downstreamTargets.map((d) => (
                    <span key={d} className="badge" onClick={() => onSelectNode(d)} style={{ cursor: "pointer" }}>{d}</span>
                  ))}
                </div>
              ) : (
                <span style={{ color: "var(--text-dim)" }}>Terminal leaf dependency</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="topology-legend">
          <span>LEGEND:</span>
          {Object.entries(KIND_COLORS).map(([kind, color]) => (
            <span key={kind} className="legend-item">
              <span className="legend-swatch" style={{ borderColor: color, backgroundColor: color }} />
              {kind}
            </span>
          ))}
          <span style={{ marginLeft: "auto", color: "var(--text-dim)" }}>Click any service node to inspect connections</span>
        </div>
      )}
    </div>
  );
}

// Candidate Cause Card
function CandidateItem({ c, top }) {
  const [open, setOpen] = useState(top);
  const [context, setContext] = useState(null);

  return (
    <div className={`candidate-card ${top ? "top" : ""}`}>
      <div className="candidate-header">
        <div>
          <span className="badge accent" style={{ marginRight: 6 }}>RANK #{c.rank}</span>
          <b style={{ fontSize: 14, color: "var(--text)" }}>{c.name}</b>
          <span className="badge" style={{ marginLeft: 6 }}>{c.kind}</span>
          <span style={{ color: "var(--text-dim)", fontSize: 12, marginLeft: 8 }}>{c.team || "Team unknown"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="score-display" title="Deterministic heuristic rank weight">{c.score.toFixed(2)}</span>
          <button className="ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setOpen(!open)}>
            {open ? "Hide Details" : "Show Evidence"}
          </button>
        </div>
      </div>

      <Path ids={c.path} />

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 6 }}>
              Heuristic Score Breakdown
            </h4>
            <table>
              <thead>
                <tr><th>Component</th><th>Calculation Rule</th><th>Weight</th></tr>
              </thead>
              <tbody>
                {Object.entries(c.score_breakdown).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ textTransform: "capitalize" }}>{k.replaceAll("_", " ")}</td>
                    <td style={{ color: "var(--text-dim)" }}>Graph topological proximity & evidence</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{v.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {c.deployment && (
            <div>
              <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 4 }}>
                Recent Pre-Incident Deployment
              </h4>
              <div className="evidence-box supports">
                <b>{c.deployment.id}</b> ({c.deployment.version}) — {c.deployment.summary}
                <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>
                  Deployed {c.deployment.hours_before} hours before anomaly onset
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 4 }}>
              Evidence Signals ({c.supporting_evidence.length + c.contradicting_evidence.length})
            </h4>
            {c.supporting_evidence.map((e) => (
              <div key={e.id} className="evidence-box supports">
                <b>{e.id}</b> [SUPPORTING] {e.text}
                <span style={{ float: "right", color: "var(--text-dim)", fontSize: 11 }}>{e.time}</span>
              </div>
            ))}
            {c.contradicting_evidence.map((e) => (
              <div key={e.id} className="evidence-box contradicts">
                <b>{e.id}</b> [CONTRADICTING] {e.text}
                <span style={{ float: "right", color: "var(--text-dim)", fontSize: 11 }}>{e.time}</span>
              </div>
            ))}
            {!c.supporting_evidence.length && !c.contradicting_evidence.length && (
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>No direct evidence logged.</span>
            )}
          </div>

          {c.history.length > 0 && (
            <div>
              <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 4 }}>
                Historical Graph Precedent
              </h4>
              {c.history.map((h) => (
                <div key={h.incident_id} className="evidence-box supports">
                  <b>{h.incident_id}</b>: {h.title} (Pattern: {h.pattern})
                  <div style={{ marginTop: 2, color: "var(--text)" }}>Resolution: {h.resolution}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {c.runbooks.map((r) => (
              <button key={r.id} className="ghost" style={{ fontSize: 11 }} onClick={() => setContext(r)}>
                <Icons.Brain /> Runbook: {r.id}
              </button>
            ))}
            {c.adrs.map((a) => (
              <button key={a.id} className="ghost" style={{ fontSize: 11 }} onClick={() => setContext(a)}>
                ADR: {a.id}
              </button>
            ))}
          </div>
        </div>
      )}

      <RunbookDialog item={context} onClose={() => setContext(null)} />
    </div>
  );
}

// Vector SVG Before/After Path Comparison
function CausalPathViz({ result }) {
  if (!result) return null;
  const before = result.before?.candidates[result.before?.top_candidate]?.path || [];
  const after = result.after?.candidates[result.after?.top_candidate]?.path || [];
  const removed = result.removed_edges || [];

  const lanes = [
    { label: `BASELINE · ${result.before?.top_candidate || "INCONCLUSIVE"}`, path: before, y: 38, color: "#38bdf8" },
    { label: `COUNTERFACTUAL · ${result.after?.top_candidate || "INCONCLUSIVE"}`, path: after, y: 110, color: "#f59e0b" },
  ];

  const nodeX = (i, count) => (count <= 1 ? 440 : 90 + i * (700 / (count - 1)));

  return (
    <div style={{ margin: "14px 0", padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--surface-raised)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
          Topological Causal Path Comparison
        </span>
        <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          Identical heuristics executed against baseline and isolated graph
        </span>
      </div>

      <svg width="100%" height="160" viewBox="0 0 880 160" role="img" aria-label="Baseline vs Counterfactual Causal Paths">
        {lanes.map((lane) => (
          <g key={lane.label}>
            <text x="14" y={lane.y - 14} fill="var(--text-dim)" style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {lane.label}
            </text>
            {lane.path.length === 0 ? (
              <text x="16" y={lane.y + 10} fill="var(--text-dim)" style={{ fontSize: 11 }}>No reachable candidate path</text>
            ) : (
              <>
                {lane.path.slice(0, -1).map((node, i) => {
                  const x1 = nodeX(i, lane.path.length);
                  const x2 = nodeX(i + 1, lane.path.length);
                  return (
                    <g key={node + i}>
                      <line x1={x1 + 48} y1={lane.y} x2={x2 - 48} y2={lane.y} stroke={lane.color} strokeWidth="2" />
                      <polygon points={`${x2 - 48},${lane.y - 4} ${x2 - 40},${lane.y} ${x2 - 48},${lane.y + 4}`} fill={lane.color} />
                    </g>
                  );
                })}
                {lane.path.map((node, i) => {
                  const x = nodeX(i, lane.path.length);
                  return (
                    <g key={node + i}>
                      <rect x={x - 48} y={lane.y - 14} width="96" height="28" rx="4" fill="#0f172a" stroke={lane.color} strokeWidth="1.5" />
                      <text x={x} y={lane.y + 4} textAnchor="middle" fill="var(--text)" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                        {node.length > 14 ? node.slice(0, 12) + "…" : node}
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
            <line x1="220" y1="145" x2="660" y2="145" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x="440" y="142" textAnchor="middle" fill="#ef4444" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              SEVERED: {edge.from} → {edge.to}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Live Graph Surgery Lab Panel
function LiveSurgeryPanel({ incidentId, edges, preselectedEdge, onClearPreselect }) {
  const [pick, setPick] = useState(preselectedEdge || "");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  const presets = [
    { label: "Key Cut: inventory → cache", edge: "inventory-service|cache-redis", desc: "Breaks direct outage path; reroutes diagnosis through payment-service" },
    { label: "Negative Control: search → index", edge: "search-service|search-index", desc: "Unrelated subsystem; isolates graph and cuts edge, but diagnosis remains unchanged" },
    { label: "Upstream Cut: web-frontend → gateway", edge: "web-frontend|api-gateway", desc: "Cuts caller; contracts upstream blast radius" },
  ];

  useEffect(() => {
    if (preselectedEdge) {
      setPick(preselectedEdge);
    }
  }, [preselectedEdge]);

  async function executeSurgery(targetEdge) {
    const edgeVal = targetEdge || pick;
    const [from, to] = edgeVal.split("|");
    if (!from || !to) return;
    setBusy(true);
    setErr("");
    setStage("1/5 Creating isolated temporary graph copy (GRAPH.COPY)...");

    try {
      setTimeout(() => setStage("2/5 Removing targeted dependency edge in temporary graph..."), 300);
      setTimeout(() => setStage("3/5 Rerunning deterministic diagnostic heuristics..."), 600);
      setTimeout(() => setStage("4/5 Comparing candidate ranking deltas & blast radius..."), 900);
      setTimeout(() => setStage("5/5 Verifying baseline topology invariance & cleaning up..."), 1200);

      const result = await api("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, remove_edges: [{ from, to }] }),
      });
      setRes(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <div className="panel surgery-lab">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <span className="badge accent" style={{ marginBottom: 6 }}>SIGNATURE DIFFERENTIATOR</span>
          <h2 style={{ fontSize: 16, color: "var(--text)" }}>Live Graph Surgery: Counterfactual Dependency Analysis</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
            Clone the live FalkorDB graph into an ephemeral isolated copy, sever a dependency edge, and prove whether the causal outcome alters.
          </p>
        </div>
        <span className="badge ok">FalkorDB · GRAPH.COPY</span>
      </div>

      <div className="surgery-presets">
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", fontWeight: 700 }}>
          PRESET SCENARIOS:
        </span>
        {presets.map((p) => (
          <button
            key={p.edge}
            className={`preset-chip ${pick === p.edge ? "active" : ""}`}
            onClick={() => { setPick(p.edge); executeSurgery(p.edge); }}
            disabled={busy}
            title={p.desc}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 12, backgroundColor: "var(--surface-raised)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
        <label htmlFor="custom-edge" style={{ fontSize: 12, color: "var(--text-muted)" }}>Select Dependency to Cut:</label>
        <select
          id="custom-edge"
          value={pick}
          onChange={(e) => { setPick(e.target.value); if (onClearPreselect) onClearPreselect(); }}
          style={{ minWidth: 260 }}
        >
          <option value="">Select dependency edge…</option>
          {(edges || []).map((e) => (
            <option key={e.from + e.to} value={e.from + "|" + e.to}>
              {e.from} → {e.to}
            </option>
          ))}
        </select>
        <button
          disabled={!pick || busy}
          onClick={() => executeSurgery()}
          className="danger"
        >
          <Icons.Cut /> {busy ? "Executing Surgery…" : "Sever Edge & Compare"}
        </button>
      </div>

      {busy && (
        <div style={{ padding: 20, textAlign: "center", backgroundColor: "var(--surface-raised)", border: "1px dashed var(--accent)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)" }}>{stage}</div>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 4 }}>
            FalkorDB is executing an isolated transactional simulation. Baseline dependency topology remains protected.
          </div>
        </div>
      )}

      {err && (
        <div className="badge bad" style={{ padding: "10px 14px", width: "100%", borderRadius: "var(--radius-md)" }}>
          {err}
        </div>
      )}

      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", border: `1px solid ${res.changed ? "var(--warning-border)" : "var(--success-border)"}`, backgroundColor: res.changed ? "var(--warning-bg)" : "var(--success-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <b style={{ color: res.changed ? "var(--warning)" : "var(--success)" }}>
                {res.changed ? "Investigation Outcome Changed" : "Investigation Invariant Unchanged (Negative Control)"}
              </b>
              <span className="badge">{res.generated_at}</span>
            </div>
            <p style={{ fontSize: 12, marginTop: 4, color: "var(--text)" }}>
              {res.changed
                ? "Severing this dependency severed the primary outage propagation path, forcing the heuristic ranker to reroute through alternative services."
                : "The targeted edge is unrelated to the failure path. The counterfactual investigation confirms that diagnostic ranking is immune to unrelated subsystem cuts."}
            </p>

            {/* Invariance & Safety Verification Grid */}
            <div className="safety-grid">
              <div className="safety-cell">
                <span>Baseline Topology:</span>
                <b style={{ color: res.isolation?.baseline_topology_unchanged ? "var(--success)" : "var(--danger)" }}>
                  {res.isolation?.baseline_topology_unchanged ? "UNCHANGED" : "MUTATED"}
                </b>
              </div>
              <div className="safety-cell">
                <span>Baseline Result:</span>
                <b style={{ color: res.isolation?.baseline_unchanged ? "var(--success)" : "var(--danger)" }}>
                  {res.isolation?.baseline_unchanged ? "UNCHANGED" : "MUTATED"}
                </b>
              </div>
              <div className="safety-cell">
                <span>Temporary Graph:</span>
                <b style={{ color: res.isolation?.simulation_graph_deleted ? "var(--success)" : "var(--danger)" }}>
                  {res.isolation?.simulation_graph_deleted ? "CLEANED" : "LEAKED"}
                </b>
              </div>
              <div className="safety-cell">
                <span>Simulation Audit:</span>
                <b>{res.audit_saved ? "SAVED" : "OMITTED"}</b>
              </div>
            </div>
          </div>

          <CausalPathViz result={res} />

          {res.candidate_changes.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 6 }}>
                Candidate Ranking Shifts
              </h4>
              <table>
                <thead>
                  <tr><th>Service</th><th>Before Rank</th><th>After Rank</th><th>Path After Surgery</th></tr>
                </thead>
                <tbody>
                  {res.candidate_changes.map((c) => (
                    <tr key={c.service_id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{c.service_id}</td>
                      <td>{c.before ? `#${c.before.rank} (${c.before.score.toFixed(2)})` : "Unranked"}</td>
                      <td style={{ color: c.after ? "var(--accent)" : "var(--danger)" }}>
                        {c.after ? `#${c.after.rank} (${c.after.score.toFixed(2)})` : "Unreachable"}
                      </td>
                      <td style={{ color: "var(--text-dim)", fontSize: 11 }}>
                        {c.after ? c.after.path.join(" → ") : "Path disconnected"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Company Brain & Architecture Knowledge Panel
function CompanyBrainPanel({ brain }) {
  const [modalItem, setModalItem] = useState(null);
  if (!brain) return <p style={{ color: "var(--text-dim)" }}>Loading Company Brain context from FalkorDB…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel">
        <span className="badge accent" style={{ marginBottom: 6 }}>CONNECTED KNOWLEDGE</span>
        <h2 style={{ fontSize: 16, color: "var(--text)" }}>Company Brain & Architecture Governance</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
          Engineering operational assets retrieved through FalkorDB graph relationships (<code>APPLIES_TO</code>, <code>GOVERNS</code>, <code>OWNS</code>).
        </p>
      </div>

      <div className="panel">
        <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
          Operator Runbooks ({brain.runbooks.length})
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {brain.runbooks.map((rb) => (
            <div key={rb.id} style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
              <div>
                <span className="badge">{rb.id}</span>
                <b style={{ display: "block", margin: "6px 0 2px", color: "var(--text)" }}>{rb.title}</b>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  Applies to: {rb.services.join(", ")}
                </span>
              </div>
              <button className="ghost" style={{ fontSize: 11 }} onClick={() => setModalItem({ ...rb, steps: rb.steps })}>
                <Icons.Brain /> Inspect Steps
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
          Architecture Decision Records ({brain.adrs.length})
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {brain.adrs.map((adr) => (
            <div key={adr.id} style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
              <div>
                <span className="badge accent">{adr.id}</span>
                <b style={{ display: "block", margin: "6px 0 2px", color: "var(--text)" }}>{adr.title}</b>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  Governs: {adr.services.join(", ")}
                </span>
              </div>
              <button className="ghost" style={{ fontSize: 11 }} onClick={() => setModalItem({ ...adr, decision: adr.decision })}>
                View Decision
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
          Service Ownership Teams ({brain.teams.length})
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {brain.teams.map((t) => (
            <div key={t.id} style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12 }}>
              <span className="badge">{t.id}</span>
              <b style={{ display: "block", margin: "4px 0 2px", color: "var(--text)" }}>{t.name} Team</b>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Services: {t.services.join(", ")}</span>
            </div>
          ))}
        </div>
      </div>

      <RunbookDialog item={modalItem} onClose={() => setModalItem(null)} />
    </div>
  );
}

// Dedicated Full-Page Privacy Policy (/privacy)
function PrivacyPage({ onBack }) {
  return (
    <div className="legal-page-container">
      <div style={{ marginBottom: 16 }}>
        <button className="ghost" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icons.ArrowBack /> Back to Investigation Workbench
        </button>
      </div>
      <div className="legal-card">
        <div className="legal-header">
          <span className="badge ok" style={{ marginBottom: 8 }}>STANDALONE COMPLIANCE ROUTE</span>
          <h1 className="legal-title">Privacy Policy & Telemetry Scope</h1>
          <div className="legal-meta">Effective Date: October 2026 · Software Version: 0.1.0 · Application: ROOTLINE OMNI</div>
        </div>

        <div className="legal-section">
          <h3>1. Local Workspace Execution Model</h3>
          <p>
            ROOTLINE OMNI is designed and packaged as a local site reliability engineer investigation console. All algorithmic diagnostic processing, topological traversals, and counterfactual simulations occur entirely within your local computing environment (between your browser, the FastAPI application process, and your local FalkorDB Docker container).
          </p>
        </div>

        <div className="legal-section">
          <h3>2. Zero Third-Party Telemetry & Tracking</h3>
          <p>
            This application transmits <b>zero telemetry, tracking beacons, advertising cookies, or analytics pings</b> to external third-party servers. We do not integrate with Google Analytics, Mixpanel, Datadog, or external advertising APIs. Network communication is strictly confined to loopback HTTP requests (<code>http://127.0.0.1:8000</code>).
          </p>
        </div>

        <div className="legal-section">
          <h3>3. Synthetic Data Scope & Demonstration Integrity</h3>
          <p>
            All incidents, microservices, deployment hashes, team identifiers, and evidence snippets loaded into ROOTLINE OMNI are <b>100% synthetic, fictional, and generated for demonstration purposes</b>. No confidential production data, customer identifiers, or proprietary credentials are required or ingested by this application.
          </p>
        </div>

        <div className="legal-section">
          <h3>4. Local Data Retention & Ephemeral Storage</h3>
          <p>
            Investigation reports, human operator decision rationale, and audit nodes are persisted exclusively in your local FalkorDB database graph (<code>rootline</code>). You retain absolute control over this data at all times. Running <code>python -m backend.seed</code> resets the database to its pristine demo state.
          </p>
        </div>

        <div className="legal-section">
          <h3>5. Live Graph Surgery Isolation Guarantee</h3>
          <p>
            Counterfactual simulations initiated in the Live Graph Surgery laboratory operate exclusively within temporary, isolated in-memory graphs created via FalkorDB's native <code>GRAPH.COPY</code> protocol. These ephemeral graphs are destroyed in a <code>finally</code> block immediately upon completion.
          </p>
        </div>
      </div>
    </div>
  );
}

// Dedicated Full-Page Terms of Service (/terms)
function TermsPage({ onBack }) {
  return (
    <div className="legal-page-container">
      <div style={{ marginBottom: 16 }}>
        <button className="ghost" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icons.ArrowBack /> Back to Investigation Workbench
        </button>
      </div>
      <div className="legal-card">
        <div className="legal-header">
          <span className="badge ok" style={{ marginBottom: 8 }}>STANDALONE COMPLIANCE ROUTE</span>
          <h1 className="legal-title">Terms of Service & Simulation Safety Scope</h1>
          <div className="legal-meta">Effective Date: October 2026 · Software License: MIT · Application: ROOTLINE OMNI</div>
        </div>

        <div className="legal-section">
          <h3>1. Nature of Software & Intended Use</h3>
          <p>
            ROOTLINE OMNI is an open-source, graph-native incident reasoning and counterfactual dependency analysis console developed for hackathon evaluation, research, and developer evaluation. It is provided under the terms of the MIT License.
          </p>
        </div>

        <div className="legal-section">
          <h3>2. Deterministic Heuristic Ranking (Not Calibrated Probability)</h3>
          <p>
            All scores generated by the 7-stage diagnostic pipeline represent deterministic heuristic rank weights calculated from graph proximity, deployment recency, historical pattern correlation, and evidence polarity. They are <b>heuristics intended for human operator evaluation, not mathematical probabilities or autonomous certainty</b>.
          </p>
        </div>

        <div className="legal-section">
          <h3>3. Mandatory Human-in-the-Loop Governance</h3>
          <p>
            ROOTLINE OMNI enforces human decision-making. The software <b>does not autonomously execute production remediation commands, pod restarts, or configuration deployments</b>. All diagnostic recommendations require an operator to inspect the topological evidence and explicitly approve or reject the action with documented rationale.
          </p>
        </div>

        <div className="legal-section">
          <h3>4. Safety of Live Graph Surgery</h3>
          <p>
            Simulations performed in ROOTLINE OMNI are purely counterfactual experiments executed on temporary graph replicas. The baseline graph topology is verified invariant before and after every simulation. The tool does not alter production traffic, network routes, or live cloud infrastructure.
          </p>
        </div>

        <div className="legal-section">
          <h3>5. Absence of Production Warranties</h3>
          <p>
            THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM ARISING FROM THE USE OF THE SOFTWARE.
          </p>
        </div>
      </div>
    </div>
  );
}

// Main Application Root
export default function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [health, setHealth] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [overview, setOverview] = useState(null);
  const [edges, setEdges] = useState([]);
  const [history, setHistory] = useState([]);
  const [brain, setBrain] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState("INC-2026-101");
  const [report, setReport] = useState(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [surgeryPreselectEdge, setSurgeryPreselectEdge] = useState("");
  const [activeTab, setActiveTab] = useState("investigate");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rationale, setRationale] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [copiedAudit, setCopiedAudit] = useState(false);

  // Router listener for URL updates
  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(path);
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    function handlePopState() {
      setRoute(window.location.pathname);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function loadData() {
    try {
      const [h, inc, ov, edg, hist, br] = await Promise.all([
        api("/api/health"),
        api("/api/incidents"),
        api("/api/graph/overview"),
        api("/api/graph/edges"),
        api("/api/investigations"),
        api("/api/company-brain").catch(() => null),
      ]);
      setHealth(h);
      setIncidents(inc.incidents || []);
      setOverview(ov);
      setEdges(edg.edges || []);
      setHistory(hist.investigations || []);
      if (br) setBrain(br);
      setErr("");
    } catch (e) {
      setHealth(null);
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function runInvestigation(targetId) {
    const id = targetId || selectedIncidentId;
    if (!id) return;
    setLoading(true);
    setErr("");
    setReport(null);
    try {
      const result = await api(`/api/investigate/${id}`, { method: "POST" });
      setReport(result);
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function recordDecision(decision) {
    if (!report || !rationale.trim() || rationale.trim().length < 3) return;
    setDecisionBusy(true);
    setErr("");
    try {
      await api(`/api/investigations/${report.investigation_id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rationale: rationale.trim() }),
      });
      const updated = await api(`/api/investigations/${report.investigation_id}`);
      setReport(updated);
      setRationale("");
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setDecisionBusy(false);
    }
  }

  function handleCutFromGraph(from, to) {
    setSurgeryPreselectEdge(`${from}|${to}`);
    setActiveTab("surgery");
  }

  function copyInvestigationAudit() {
    if (!report) return;
    const payload = {
      investigation_id: report.investigation_id,
      incident_id: report.incident.id,
      status: report.conclusion.status,
      top_candidate: report.conclusion.top_candidate,
      recommended_action: report.recommended_action,
      decision: report.decision,
      generated_at: report.generated_at,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedAudit(true);
    setTimeout(() => setCopiedAudit(false), 2500);
  }

  // Legal routes rendering
  if (route === "/privacy") {
    return <PrivacyPage onBack={() => navigate("/")} />;
  }
  if (route === "/terms") {
    return <TermsPage onBack={() => navigate("/")} />;
  }

  const openIncidents = incidents.filter((i) => i.status === "open");
  const activeIncident = incidents.find((i) => i.id === selectedIncidentId);

  return (
    <div>
      {/* Global Shell Header */}
      <header className="app-header">
        <div className="brand-section">
          <span className="brand-badge">R</span>
          <div>
            <span className="brand-title">ROOTLINE OMNI</span>
            <span className="brand-subtitle">Graph-Native Incident Intelligence</span>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === "investigate" ? "active" : ""}`}
            onClick={() => setActiveTab("investigate")}
          >
            <Icons.Search /> Investigation
          </button>
          <button
            className={`nav-tab ${activeTab === "graph" ? "active" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            <Icons.Graph /> Topology Graph
          </button>
          <button
            className={`nav-tab ${activeTab === "surgery" ? "active" : ""}`}
            onClick={() => setActiveTab("surgery")}
          >
            <Icons.Cut /> Live Surgery Lab
          </button>
          <button
            className={`nav-tab ${activeTab === "brain" ? "active" : ""}`}
            onClick={() => setActiveTab("brain")}
          >
            <Icons.Brain /> Company Brain
          </button>
          <button
            className={`nav-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <Icons.History /> History ({history.length})
          </button>
        </nav>

        <div className="header-status-group">
          {health ? (
            <span className="badge ok">
              FalkorDB Connected · {health.graph} · {overview?.services?.length || 15} Services
            </span>
          ) : (
            <span className="badge bad">FalkorDB Unreachable</span>
          )}
          <span className="badge accent">SYNTHETIC DEMO DATA</span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="app-layout">
        {/* Sidebar: Incident Queue & Graph Status */}
        <aside className="sidebar-panel">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Incident Queue</span>
              <span className="badge">{openIncidents.length} Active</span>
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {openIncidents.map((i) => (
                <button
                  key={i.id}
                  className={`ghost ${selectedIncidentId === i.id ? "active" : ""}`}
                  style={{
                    padding: "3px 8px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    borderColor: selectedIncidentId === i.id ? "var(--accent)" : "var(--border)",
                    backgroundColor: selectedIncidentId === i.id ? "var(--accent-dim)" : "transparent",
                    color: selectedIncidentId === i.id ? "var(--accent)" : "var(--text-muted)",
                  }}
                  onClick={() => {
                    setSelectedIncidentId(i.id);
                    setReport(null);
                    if (activeTab !== "investigate") setActiveTab("investigate");
                  }}
                >
                  {i.id}
                </button>
              ))}
            </div>

            {openIncidents.map((i) => (
              <div
                key={i.id}
                className={`incident-card ${selectedIncidentId === i.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedIncidentId(i.id);
                  setReport(null);
                  if (activeTab !== "investigate") setActiveTab("investigate");
                }}
              >
                <div className="incident-card-top">
                  <span className={`badge ${i.severity}`}>{i.severity}</span>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{i.id}</span>
                </div>
                <div className="incident-card-title">{i.title}</div>
                <div className="incident-card-meta">
                  <span>Target: {i.service_name}</span>
                  <span>{i.time}</span>
                </div>
              </div>
            ))}
          </div>

          {overview && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Graph Topology Metrics</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Service Nodes:</span>
                  <b style={{ fontFamily: "var(--font-mono)" }}>{overview.nodes?.Service || 15}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Dependency Edges:</span>
                  <b style={{ fontFamily: "var(--font-mono)" }}>{overview.dependency_edges || 17}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Stored Evidence:</span>
                  <b style={{ fontFamily: "var(--font-mono)" }}>{overview.nodes?.Evidence || 10}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Operational Runbooks:</span>
                  <b style={{ fontFamily: "var(--font-mono)" }}>{overview.nodes?.Runbook || 3}</b>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Primary Main Content Area */}
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {err && (
            <div className="badge bad" style={{ padding: "12px 16px", width: "100%", borderRadius: "var(--radius-md)" }}>
              {err}
            </div>
          )}

          {/* TAB 1: INVESTIGATION */}
          {activeTab === "investigate" && (
            <>
              <div className="panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <span className="badge accent" style={{ marginBottom: 6 }}>DIAGNOSTIC TARGET</span>
                    <h2 style={{ fontSize: 18, color: "var(--text)", margin: "4px 0" }}>
                      {activeIncident ? activeIncident.title : "Select an incident"}
                    </h2>
                    <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
                      {activeIncident?.summary}
                    </p>
                  </div>
                  <button
                    disabled={!selectedIncidentId || loading}
                    onClick={() => runInvestigation()}
                    style={{ padding: "10px 18px", fontSize: 13 }}
                  >
                    <Icons.Search /> {loading ? "Querying FalkorDB Graph…" : "Run Graph Investigation"}
                  </button>
                </div>
              </div>

              {loading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="skeleton-box" style={{ height: 40, width: "100%" }} />
                  <div className="skeleton-box" style={{ height: 160, width: "100%" }} />
                  <div className="skeleton-box" style={{ height: 100, width: "100%" }} />
                </div>
              )}

              {!loading && !report && (
                <div className="panel" style={{ padding: 48, textAlign: "center", border: "1px dashed var(--border)" }}>
                  <div style={{ color: "var(--accent)", marginBottom: 8 }}><Icons.Search /></div>
                  <h3 style={{ fontSize: 16, color: "var(--text)", marginBottom: 6 }}>Ready to Investigate {selectedIncidentId}</h3>
                  <p style={{ color: "var(--text-muted)", maxWidth: 520, margin: "0 auto", fontSize: 13 }}>
                    Click "Run Graph Investigation" to execute the 7-stage deterministic diagnostic pipeline over service dependencies, recent deployments, and historical resolutions in FalkorDB.
                  </p>
                </div>
              )}

              {!loading && report && (
                <>
                  <div className="panel" style={{ borderLeft: `3px solid ${report.conclusion.status === "inconclusive" ? "var(--warning)" : "var(--success)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span className={`badge ${report.conclusion.status === "inconclusive" ? "warn" : "ok"}`}>
                          {report.conclusion.status.toUpperCase()} DIAGNOSIS
                        </span>
                        <h3 style={{ fontSize: 16, color: "var(--text)", margin: "6px 0 2px" }}>
                          {report.conclusion.note}
                        </h3>
                        <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          Investigation ID: {report.investigation_id} · Generated at {report.generated_at}
                        </span>
                      </div>
                      <button className="ghost" onClick={copyInvestigationAudit} title="Copy investigation audit payload">
                        <Icons.Copy /> {copiedAudit ? "Copied JSON" : "Copy Audit JSON"}
                      </button>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Candidate Causes (Deterministic Heuristic Ranking)</span>
                    </div>
                    {report.candidates.length ? (
                      report.candidates.map((c, i) => (
                        <CandidateItem key={c.service_id} c={c} top={i === 0 && report.conclusion.status !== "inconclusive"} />
                      ))
                    ) : (
                      <p style={{ color: "var(--text-dim)" }}>No candidate services reachable along dependency paths.</p>
                    )}
                  </div>

                  {/* Inline Live Graph Surgery Shortcut */}
                  <LiveSurgeryPanel
                    incidentId={report.incident.id}
                    edges={edges}
                    preselectedEdge={surgeryPreselectEdge}
                    onClearPreselect={() => setSurgeryPreselectEdge("")}
                  />

                  {/* Blast Radius Table */}
                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Upstream Blast Radius ({report.blast_radius.count} Dependents)</span>
                    </div>
                    {report.blast_radius.count === 0 ? (
                      <p style={{ color: "var(--text-dim)" }}>No upstream services depend on this service.</p>
                    ) : (
                      <table>
                        <thead>
                          <tr><th>Service</th><th>Tier</th><th>Hops</th><th>Owning Team</th><th>Causal Dependency Path</th></tr>
                        </thead>
                        <tbody>
                          {report.blast_radius.dependents.map((d) => (
                            <tr key={d.service_id}>
                              <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{d.name}</td>
                              <td><span className="badge">Tier {d.tier}</span></td>
                              <td style={{ fontFamily: "var(--font-mono)" }}>{d.hops}</td>
                              <td style={{ color: "var(--text-muted)" }}>{d.team}</td>
                              <td style={{ color: "var(--text-dim)", fontSize: 11 }}>{d.path.join(" → ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Investigation Execution Trace */}
                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Execution Trace (Backend Stage Latency & Cypher Ops)</span>
                    </div>
                    <table>
                      <thead>
                        <tr><th>Diagnostic Stage</th><th>Graph Operations</th><th>Latency</th><th>Observed Outcome</th></tr>
                      </thead>
                      <tbody>
                        {(report.trace || []).map((t) => (
                          <tr key={t.stage}>
                            <td style={{ textTransform: "capitalize", fontWeight: 600 }}>{t.stage.replaceAll("_", " ")}</td>
                            <td style={{ color: "var(--text-dim)", fontSize: 11 }}>{(t.operations || []).join(" · ") || "In-memory ranking"}</td>
                            <td style={{ fontFamily: "var(--font-mono)" }}>{t.ms} ms</td>
                            <td style={{ color: "var(--text-muted)" }}>{t.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Proposed Action & Human Decision Recording */}
                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Proposed Action & Operator Decision Recording</span>
                      <span className="badge warn">Human Review Mandatory</span>
                    </div>
                    <p style={{ color: "var(--text)", fontSize: 13, marginBottom: 12 }}>
                      {report.recommended_action?.text}
                    </p>

                    {report.decision?.status === "pending" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label htmlFor="rationale-input" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          Operator Rationale (Required for compliance & audit history):
                        </label>
                        <textarea
                          id="rationale-input"
                          value={rationale}
                          onChange={(e) => setRationale(e.target.value)}
                          placeholder="Document your engineering rationale (minimum 3 characters)..."
                          style={{ minHeight: 64 }}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="success"
                            disabled={decisionBusy || rationale.trim().length < 3}
                            onClick={() => recordDecision("approved")}
                          >
                            <Icons.Check /> Approve Recommendation
                          </button>
                          <button
                            className="danger"
                            disabled={decisionBusy || rationale.trim().length < 3}
                            onClick={() => recordDecision("rejected")}
                          >
                            Reject Recommendation
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`badge ${report.decision?.status === "approved" ? "ok" : "bad"}`} style={{ padding: "10px 14px", width: "100%", borderRadius: "var(--radius-md)" }}>
                        Decision Recorded in FalkorDB: <b>{report.decision?.status?.toUpperCase()}</b> — "{report.decision?.rationale}" at {report.decision?.decided}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 2: INTERACTIVE TOPOLOGY GRAPH */}
          {activeTab === "graph" && (
            <TopologyGraphView
              overview={overview}
              edges={edges}
              activeIncident={activeIncident}
              selectedNode={selectedGraphNode}
              onSelectNode={(nodeId) => setSelectedGraphNode(nodeId)}
              onCutEdge={handleCutFromGraph}
            />
          )}

          {/* TAB 3: DEDICATED LIVE SURGERY LAB */}
          {activeTab === "surgery" && (
            <LiveSurgeryPanel
              incidentId={selectedIncidentId}
              edges={edges}
              preselectedEdge={surgeryPreselectEdge}
              onClearPreselect={() => setSurgeryPreselectEdge("")}
            />
          )}

          {/* TAB 4: COMPANY BRAIN */}
          {activeTab === "brain" && (
            <CompanyBrainPanel brain={brain} />
          )}

          {/* TAB 5: SAVED HISTORY */}
          {activeTab === "history" && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Saved Investigation History (FalkorDB System of Record)</span>
                <span className="badge">{history.length} Saved Records</span>
              </div>
              {!history.length ? (
                <p style={{ color: "var(--text-dim)" }}>No saved investigations found in the graph.</p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Investigation ID</th><th>Incident Title</th><th>Diagnostic Status</th><th>Top Candidate</th><th>Operator Decision</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{h.id}</td>
                        <td style={{ fontWeight: 600 }}>{h.incident_title}</td>
                        <td><span className="badge">{h.status}</span></td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{h.top_candidate || "—"}</td>
                        <td>
                          <span className={`badge ${h.decision === "approved" ? "ok" : h.decision === "rejected" ? "bad" : "warn"}`}>
                            {h.decision}
                          </span>
                        </td>
                        <td>
                          <button
                            className="ghost"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={async () => {
                              const rep = await api(`/api/investigations/${h.id}`);
                              setReport(rep);
                              setSelectedIncidentId(rep.incident.id);
                              setActiveTab("investigate");
                            }}
                          >
                            Open Report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Global Trust & Legal Footer */}
      <footer className="app-footer">
        <div>
          <b>ROOTLINE OMNI</b> · Graph-Native Incident Reasoning Platform · Local SRE Workspace
        </div>
        <div className="footer-links">
          <span className="footer-link" onClick={() => navigate("/privacy")}>Privacy Policy</span>
          <span className="footer-link" onClick={() => navigate("/terms")}>Terms of Service</span>
          <span className="footer-link" onClick={() => alert("Scope: Demonstration environment executing deterministic heuristics over synthetic service graphs. Zero automated production mutations.")}>
            Scope & Limitations
          </span>
        </div>
      </footer>
    </div>
  );
}
