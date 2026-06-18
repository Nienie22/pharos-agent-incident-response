import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useClient } from "../lib/ClientContext.js";
import { useWallet } from "../lib/WalletContext.js";
import { shortAddr } from "../lib/seed.js";

function Header() {
  const { live, apiBase, state } = useClient();
  const wallet = useWallet();
  const lastSync = state.lastSync;
  return (
    <header className="app-header">
      <NavLink to="/" className="brand">
        <img className="brand-mark" src="/pharos-split-beacon.svg" alt="Pharos Split Beacon" />
        <span className="brand-copy"><strong>PHAROS</strong><small>AGENT INCIDENT RESPONSE</small></span>
      </NavLink>
      <nav className="top-nav" data-testid="top-nav">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/demo">Demo</NavLink>
        <NavLink to="/incidents">Incidents</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
      </nav>
      <span className={"badge " + (live ? "live" : "demo")} data-testid="mode-badge">
        {live ? "LIVE" : "DEMO"}
      </span>
      <span className="badge" data-testid="api-base">{apiBase}</span>
      <div className="spacer" />
      <span className={"badge " + (wallet.connected && wallet.correctNetwork ? "live" : wallet.connected ? "demo" : "")} data-testid="wallet-status">
        {wallet.connected ? `${shortAddr(wallet.account!)} / ${wallet.chainId ?? "?"}` : wallet.available ? "WALLET READY" : "NO WALLET"}
      </span>
      {wallet.connected ? (
        wallet.correctNetwork ? (
          <button className="ghost compact" onClick={wallet.disconnect} data-testid="btn-wallet-disconnect">Disconnect</button>
        ) : (
          <button className="compact" onClick={wallet.switchToAtlantic} disabled={wallet.pending} data-testid="btn-wallet-switch">Switch Atlantic</button>
        )
      ) : (
        <button className="primary compact" onClick={wallet.connect} disabled={wallet.pending || !wallet.available} data-testid="btn-wallet-connect">Connect wallet</button>
      )}
      <span className="badge">v0.1.0</span>
      <span className="badge" data-testid="last-sync">
        {lastSync ? "last sync " + new Date(lastSync).toLocaleTimeString() : "no sync yet"}
      </span>
    </header>
  );
}

function StatusBar() {
  const { state, live } = useClient();
  const wallet = useWallet();
  return (
    <footer className="app-statusbar">
      <span className={live ? "ok" : "warn"} data-testid="status-mode">
        {live ? "API ONLINE" : "DEMO MODE"}
      </span>
      <span className={wallet.connected && wallet.correctNetwork ? "ok" : "warn"} data-testid="status-wallet">
        wallet: {wallet.connected ? (wallet.correctNetwork ? "ATLANTIC" : "WRONG CHAIN") : wallet.available ? "DISCONNECTED" : "UNAVAILABLE"}
      </span>
      <span>incidents: {state.incidents.length}</span>
      <span>plans: {state.plans.size}</span>
      <span>closures: {state.closures.size}</span>
      <span>log: {state.log.length}</span>
    </footer>
  );
}

function ModeBanner() {
  const { live } = useClient();
  const wallet = useWallet();
  if (live && wallet.connected && wallet.correctNetwork) return null;
  if (live && (!wallet.connected || !wallet.correctNetwork)) {
    return (
      <div className="banner-mode" data-testid="wallet-banner">
        <strong>Wallet required</strong>
        <span>Live API mode is active. Connect a wallet and switch to Pharos Atlantic before signing approvals or execution.</span>
      </div>
    );
  }
  return (
    <div className="banner-mode" data-testid="mode-banner">
      <strong>Demo mode</strong>
      <span>Showing 3 seeded incidents. All actions run in-memory against an offline mock client.</span>
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <ModeBanner />
        <Outlet />
      </main>
      <StatusBar />
    </div>
  );
}
