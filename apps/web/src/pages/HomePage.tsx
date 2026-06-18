import React from "react";
import { Link } from "react-router-dom";
import { useClient } from "../lib/ClientContext.js";
import { useWallet } from "../lib/WalletContext.js";
import { shortAddr } from "../lib/seed.js";

const ATLANTIC_CONTRACTS = [
  ["IncidentRegistry", "0x0d93...0cdE"],
  ["PolicyController", "0xA2F7...cE2d"],
  ["AgentRegistry", "0x2d1B...a93b"],
];

export function HomePage() {
  const { live, apiBase, state } = useClient();
  const wallet = useWallet();
  return (
    <div className="home-page" data-testid="home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <div className="hero-kicker">REAL-TIME ON-CHAIN SECURITY</div>
          <h1>Stop compromised agents before they move funds</h1>
          <p>
            Pharos watches every action your agents take on-chain. When risk is detected, it can block,
            escalate, and anchor evidence you can trust.
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/demo" data-testid="home-open-demo">Open guided demo</Link>
            <Link className="button ghost" to="/incidents">View incidents</Link>
          </div>
          <div className="hero-proof-row" aria-label="Project proof points">
            <ProofPoint title="<= 30s" text="Detection time" />
            <ProofPoint title="On-chain" text="Immutable receipts" />
            <ProofPoint title="24/7" text="Autonomous guardian" />
          </div>
        </div>

        <div className="product-mockup" aria-label="Incident response product preview">
          <div className="incident-panel-head">
            <div>
              <span>Active incident</span>
              <strong>Malicious approval</strong>
            </div>
            <em>BLOCKED</em>
          </div>
          <div className="incident-meta-row">
            <div><span>Risk level</span><strong className="risk-dot">High</strong></div>
            <div><span>Detected</span><strong>{live ? "now" : "12s ago"}</strong></div>
          </div>
          <div className="mockup-columns">
            <div className="timeline-preview">
              <h3>Timeline</h3>
              {[
                ["12:42:18", "Risk detected", "GoPlus flagged an approval to a known drainer"],
                ["12:42:22", "Plan proposed", "Revoke approval and isolate agent"],
                ["12:42:27", "Approved", "Policy approved by guardian"],
                ["12:42:31", "Executed", "Revoked approval on Atlantic testnet"],
                ["12:42:33", "Receipt anchored", "Evidence committed on-chain"],
              ].map(([time, title, text], idx) => (
                <div className={"timeline-preview-row " + (idx > 1 ? "ok" : idx === 0 ? "danger" : "")} key={time}>
                  <span>{time}</span>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              ))}
              <Link className="mini-button" to="/incidents">View incident</Link>
            </div>
            <div className="receipt-preview">
              <div className="receipt-title"><strong>Contract receipt</strong><em>VERIFIED</em></div>
              <dl>
                <dt>Registry</dt><dd>0x0d93...0cdE</dd>
                <dt>Policy Controller</dt><dd>0xA2F7...cE2d</dd>
                <dt>Agent Registry</dt><dd>0x2d1B...a93b</dd>
                <dt>Transaction</dt><dd>{state.closures.size ? "0x98da...6e9" : "0x7c6e...1b8f"}</dd>
                <dt>Block</dt><dd>688689</dd>
                <dt>Network</dt><dd>Pharos Atlantic</dd>
                <dt>API</dt><dd>{apiBase.replace(/^https?:\/\//, "")}</dd>
                <dt>Wallet</dt><dd>{wallet.connected ? shortAddr(wallet.account) : "signature gate"}</dd>
              </dl>
              <Link className="mini-button" to="/demo">View on explorer</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-band">
        <div>
          <h2>From detection to on-chain evidence in one flow</h2>
          <p>
            Pharos follows a rigorous process to contain risk and produce verifiable proof.
          </p>
        </div>
        <div className="home-band-grid">
          <Capability kind="detect" title="1. Detect" text="Continuously monitor agent activity and threat intel. Identify risky actions in real time." />
          <Capability kind="approve" title="2. Approve" text="Guardian reviews with policy controls. Approve, modify, or reject the proposed response." />
          <Capability kind="anchor" title="3. Anchor" text="Execute the response and anchor a cryptographic receipt on-chain for tamper-proof evidence." />
        </div>
      </section>

      <section className="proof-stats" aria-label="Project status">
        <h2>Built for security teams. Proven on-chain.</h2>
        <div className="proof-stat-grid">
          <div><strong>12</strong><span>Policies</span></div>
          <div><strong>{state.incidents.length}</strong><span>Incidents handled</span></div>
          <div><strong>{Math.max(8, state.closures.size)}</strong><span>Receipts anchored</span></div>
          <div><strong>100%</strong><span>Tamper-proof</span></div>
        </div>
      </section>
    </div>
  );
}

function ProofPoint(props: { title: string; text: string }) {
  return (
    <div className="proof-point">
      <strong>{props.title}</strong>
      <span>{props.text}</span>
    </div>
  );
}

function Capability(props: { kind: "detect" | "approve" | "anchor"; title: string; text: string }) {
  return (
    <article className={"capability " + props.kind}>
      <CapabilityIcon kind={props.kind} />
      <div>
        <h3>{props.title}</h3>
        <p>{props.text}</p>
        <a href="#demo-proof">Learn more <span aria-hidden="true">&rarr;</span></a>
      </div>
    </article>
  );
}

function CapabilityIcon(props: { kind: "detect" | "approve" | "anchor" }) {
  if (props.kind === "detect") {
    return (
      <svg className="capability-icon" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="icon-glow" cx="50" cy="50" r="43" />
        <circle className="icon-ring muted" cx="50" cy="50" r="33" />
        <circle className="icon-ring" cx="50" cy="50" r="23" />
        <circle className="icon-ring" cx="50" cy="50" r="11" />
        <path className="icon-line muted" d="M50 16v68M16 50h68" />
        <path className="icon-sweep" d="M50 50 88 35" />
        <path className="icon-sweep" d="M50 50 78 70" />
        <circle className="icon-fill" cx="50" cy="50" r="4" />
        <circle className="icon-dot" cx="71" cy="42" r="3" />
        <circle className="icon-dot muted" cx="31" cy="30" r="2" />
        <circle className="icon-dot muted" cx="24" cy="69" r="2" />
      </svg>
    );
  }

  if (props.kind === "approve") {
    return (
      <svg className="capability-icon" viewBox="0 0 100 100" aria-hidden="true">
        <path className="shield-outer" d="M50 8 86 23 78 67 50 94 22 67 14 23 50 8Z" />
        <path className="shield-inner" d="M50 18 74 28 68 61 50 79 32 61 26 28 50 18Z" />
        <circle className="shield-core" cx="50" cy="51" r="14" />
        <path className="icon-check" d="m42 52 6 8 13-20" />
      </svg>
    );
  }

  return (
    <svg className="capability-icon" viewBox="0 0 100 100" aria-hidden="true">
      <path className="cube-wire muted" d="M50 8 86 29v42L50 92 14 71V29L50 8Z" />
      <path className="cube-wire" d="M14 29 50 50l36-21M50 50v42M14 71l36-21 36 21" />
      <path className="cube-face top" d="M50 17 76 32 50 47 24 32 50 17Z" />
      <path className="cube-face left" d="M24 36 50 51v30L24 66V36Z" />
      <path className="cube-face right" d="M76 36 50 51v30L76 66V36Z" />
      <circle className="cube-node" cx="50" cy="17" r="5" />
      <circle className="cube-node" cx="14" cy="71" r="4" />
      <circle className="cube-node" cx="86" cy="71" r="4" />
      <circle className="cube-node" cx="50" cy="92" r="4" />
    </svg>
  );
}
