import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useClient } from "../lib/ClientContext.js";
import { IncidentCard, LogView, Alert } from "../components/shared.js";
import { severityFor, scoreFor } from "../lib/seed.js";

export function DashboardPage() {
  const { state } = useClient();
  const stats = useMemo(() => {
    const by: Record<string, number> = { CRITICAL: 0, HIGH: 0, SUSPICIOUS: 0, INFO: 0 };
    for (const i of state.incidents) by[severityFor(i)] = (by[severityFor(i)] || 0) + 1;
    return by;
  }, [state.incidents]);

  return (
    <div data-testid="dashboard-page">
      <h1>Dashboard</h1>
      <p>Live overview of incidents, plans, and closures detected by the Pharos agent incident response pipeline.</p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Total incidents</div><div className="value">{state.incidents.length}</div></div>
        <div className="kpi"><div className="label">Critical</div><div className="value danger">{stats.CRITICAL}</div></div>
        <div className="kpi"><div className="label">High</div><div className="value warn">{stats.HIGH}</div></div>
        <div className="kpi"><div className="label">Plans proposed</div><div className="value">{state.plans.size}</div></div>
        <div className="kpi"><div className="label">Closures</div><div className="value ok">{state.closures.size}</div></div>
      </div>

      {state.incidents.length === 0 ? (
        <Alert level="info">No incidents detected yet. <Link to="/demo">Run a demo scenario</Link> to seed activity.</Alert>
      ) : null}

      <h2>Recent incidents</h2>
      <div className="split">
        {state.incidents.slice(0, 4).map((i) => (
          <Link key={i.id} to={"/incidents/" + i.id} style={{ textDecoration: "none", color: "inherit" }}>
            <IncidentCard incident={i} />
          </Link>
        ))}
      </div>

      <h2>Activity log</h2>
      <LogView entries={state.log.slice(0, 30)} />
    </div>
  );
}