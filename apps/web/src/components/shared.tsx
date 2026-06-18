import React from "react";
import { severityFor, shortHash, shortAddr, relativeTime, scoreFor } from "../lib/seed.js";
import type { Incident, IncidentSeverity } from "@pharos-incident/policy";

export function SeverityPill(props: { severity: IncidentSeverity | string }) {
  return <span className={"severity-pill " + props.severity} data-severity={props.severity}>{props.severity}</span>;
}

export function SeverityPillForIncident(props: { incident: Incident }) {
  return <SeverityPill severity={severityFor(props.incident)} />;
}

export function IncidentCard(props: { incident: Incident; to?: string }) {
  const i = props.incident;
  const max = i.signals.reduce((m, s) => Math.max(m, s.severity), 0);
  return (
    <div className="card clickable" data-testid="incident-card" data-incident-id={i.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>{i.id.slice(0, 10)}...{i.id.slice(-4)}</h3>
        <SeverityPill severity={severityFor(i)} />
      </div>
      <div className="row"><span className="label">Subject</span><span className="value">{shortAddr(i.subject)}</span></div>
      <div className="row"><span className="label">Chain ID</span><span className="value">{i.chainId}</span></div>
      <div className="row"><span className="label">Signals</span><span className="value">{i.signals.length}</span></div>
      <div className="row"><span className="label">Max severity</span><span className="value">{max}</span></div>
      <div className="row"><span className="label">Score</span><span className="value">{scoreFor(i)}</span></div>
      <div className="row"><span className="label">Created</span><span className="value">{relativeTime(i.createdAt)}</span></div>
    </div>
  );
}

export function SignalList(props: { signals: Incident["signals"] }) {
  return (
    <ul className="signal-list" data-testid="signal-list">
      {props.signals.map((s, i) => (
        <li key={i}>
          <span className="src">{s.source}</span>
          <span style={{ marginRight: 8, fontWeight: 600 }}>{s.type}</span>
          <span style={{ color: "var(--text-mute)" }}>severity={s.severity}</span>
          <span style={{ marginLeft: 8, color: "var(--text-mute)" }}>conf={(s.confidenceBps / 100).toFixed(0)}%</span>
          <span style={{ marginLeft: 8, color: "var(--text-mute)" }}>ev={shortHash(s.evidenceHash)}</span>
          <span style={{ marginLeft: 8, color: "var(--text-mute)" }}>{relativeTime(s.observedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

export function LogView(props: { entries: { ts: number; level: string; message: string }[] }) {
  return (
    <div className="log" data-testid="log-view">
      {props.entries.map((e, i) => (
        <div className="entry" key={i}>
          <span className="ts">{new Date(e.ts).toLocaleTimeString()}</span>
          <span className={"lvl " + e.level}>{e.level}</span>
          <span className="msg">{e.message}</span>
        </div>
      ))}
    </div>
  );
}

export function Alert(props: { level: "danger" | "warn" | "info" | "ok"; children: React.ReactNode }) {
  return <div className={"alert " + props.level} role="alert">{props.children}</div>;
}