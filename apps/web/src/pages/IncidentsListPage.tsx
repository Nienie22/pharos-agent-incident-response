import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useClient } from "../lib/ClientContext.js";
import { IncidentCard, SeverityPill } from "../components/shared.js";
import { severityFor, scoreFor } from "../lib/seed.js";

type Filter = "ALL" | "CRITICAL" | "HIGH" | "SUSPICIOUS" | "INFO";

export function IncidentsListPage() {
  const { state } = useClient();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState<string>("");

  const visible = useMemo(() => {
    return state.incidents.filter((i) => {
      if (filter !== "ALL" && severityFor(i) !== filter) return false;
      if (q && !(i.id.includes(q) || i.subject.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [state.incidents, filter, q]);

  return (
    <div data-testid="incidents-page">
      <h1>Incidents</h1>
      <p>All incidents currently tracked by the watcher pipeline.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} data-testid="filter-select">
          <option value="ALL">All severities</option>
          <option value="CRITICAL">Critical only</option>
          <option value="HIGH">High only</option>
          <option value="SUSPICIOUS">Suspicious only</option>
          <option value="INFO">Info only</option>
        </select>
        <input
          type="text"
          placeholder="Search by id or subject..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="search-input"
          style={{ flex: 1, background: "var(--bg-elev-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontFamily: "var(--mono)" }}
        />
      </div>

      <table className="table" data-testid="incident-table">
        <thead>
          <tr>
            <th>Incident</th>
            <th>Subject</th>
            <th>Severity</th>
            <th>Signals</th>
            <th>Score</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((i) => (
            <tr key={i.id} data-testid="incident-row">
              <td className="mono">{i.id.slice(0, 10)}...</td>
              <td className="mono">{i.subject.slice(0, 10)}...</td>
              <td><SeverityPill severity={severityFor(i)} /></td>
              <td>{i.signals.length}</td>
              <td>{scoreFor(i)}</td>
              <td>{new Date(i.createdAt).toLocaleTimeString()}</td>
              <td><Link to={"/incidents/" + i.id}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>

      {visible.length === 0 ? (
        <div className="empty" data-testid="empty">No incidents match the current filter.</div>
      ) : null}
    </div>
  );
}