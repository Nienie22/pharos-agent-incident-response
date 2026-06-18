import React, { useState } from "react";
import { useClient } from "../lib/ClientContext.js";
import { useWallet } from "../lib/WalletContext.js";
import { Alert } from "../components/shared.js";
import { shortAddr } from "../lib/seed.js";

export function SettingsPage() {
  const { apiBase, setApiBase, live, state, reset } = useClient();
  const wallet = useWallet();
  const [draft, setDraft] = useState<string>(apiBase);

  function apply() {
    setApiBase(draft);
  }

  return (
    <div data-testid="settings-page">
      <h1>Settings</h1>
      <p>Configure how the web client talks to the Pharos agent incident response API.</p>

      <div className="card">
        <h3>API base URL</h3>
        <p>When the API is reachable, the client switches to live mode automatically. Edit the URL and apply to retry.</p>
        <div className="field">
          <label htmlFor="api">API base</label>
          <input id="api" value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="api-input" />
        </div>
        <div className="action-row">
          <button className="primary" onClick={apply} data-testid="btn-apply">Apply</button>
          <button onClick={() => setDraft(apiBase)}>Reset to current</button>
        </div>
        <p style={{ marginTop: 8 }}>Current: <code data-testid="api-current">{apiBase}</code></p>
        {live
          ? <Alert level="ok">Live mode active &mdash; calls go to the API at the configured base URL.</Alert>
          : <Alert level="info">Demo mode &mdash; API is not reachable. All actions run against the in-memory mock client.</Alert>}
      </div>

      <div className="card">
        <h3>Wallet</h3>
        <p>Connect an injected wallet to sign live approvals and execution requests on Pharos Atlantic.</p>
        <div className="wallet-grid">
          <div className="row"><span className="label">Provider</span><span className="value">{wallet.available ? "detected" : "not detected"}</span></div>
          <div className="row"><span className="label">Account</span><span className="value" data-testid="wallet-account">{wallet.account ? shortAddr(wallet.account) : "not connected"}</span></div>
          <div className="row"><span className="label">Chain</span><span className="value" data-testid="wallet-chain">{wallet.chainId ?? "unknown"}</span></div>
          <div className="row"><span className="label">Target</span><span className="value">Pharos Atlantic (688689)</span></div>
        </div>
        <div className="action-row" style={{ marginTop: 8 }}>
          {!wallet.connected ? (
            <button className="primary" onClick={wallet.connect} disabled={wallet.pending || !wallet.available} data-testid="btn-settings-wallet-connect">Connect wallet</button>
          ) : (
            <button onClick={wallet.disconnect} disabled={wallet.pending} data-testid="btn-settings-wallet-disconnect">Disconnect</button>
          )}
          <button onClick={wallet.switchToAtlantic} disabled={wallet.pending || !wallet.available} data-testid="btn-settings-wallet-switch">Switch to Atlantic</button>
        </div>
        {wallet.error ? <Alert level="danger">{wallet.error}</Alert> : null}
        {wallet.connected && wallet.correctNetwork
          ? <Alert level="ok">Wallet is connected to Pharos Atlantic and ready to sign response plans.</Alert>
          : <Alert level="warn">Live response actions require a connected wallet on Pharos Atlantic.</Alert>}
      </div>

      <div className="card">
        <h3>Demo state</h3>
        <p>Reset the in-memory state to the 3 seed incidents and clear all plans, approvals, closures, and the log.</p>
        <button className="danger" onClick={reset} data-testid="btn-reset-state">Reset demo state</button>
        <p style={{ marginTop: 8 }}>Incidents tracked: <strong>{state.incidents.length}</strong> &middot; log entries: <strong>{state.log.length}</strong></p>
      </div>

      <div className="card">
        <h3>About</h3>
        <p>Pharos Agent Incident Response &mdash; non-custodial watcher + responder for autonomous agents.</p>
        <p style={{ fontSize: 11, color: "var(--text-mute)" }}>
          This UI is part of the open-source implementation at <code>apps/web</code>. The mock client is used when
          the API is offline so the dashboard, scenarios, and incident flow can always be demonstrated.
        </p>
      </div>
    </div>
  );
}
