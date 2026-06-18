import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useClient } from "../lib/ClientContext.js";
import { useWallet } from "../lib/WalletContext.js";
import { SeverityPillForIncident, SignalList, LogView, Alert } from "../components/shared.js";
import { severityFor, shortHash, shortAddr, relativeTime } from "../lib/seed.js";
import { DEMO_APPROVER, makeDemoSignature, DEMO_RESPONDER } from "../lib/MockClient.js";
import type { Hex, ResponsePlan } from "@pharos-incident/policy";
import { ATLANTIC } from "@pharos-incident/sdk";

type Stage = "idle" | "triage" | "propose" | "simulate" | "approve-intent" | "approve-wallet" | "approve-confirm" | "execute" | "verify" | "close" | "error";

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client, state, live } = useClient();
  const wallet = useWallet();
  const incident = state.incidents.find((i) => i.id === id);
  const [stage, setStage] = useState<Stage>("idle");
  const [plan, setPlan] = useState<ResponsePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simDigest, setSimDigest] = useState<Hex | null>(null);
  const [approvals, setApprovals] = useState<number>(0);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [receipt, setReceipt] = useState<Hex | null>(null);
  const [liveClosureHash, setLiveClosureHash] = useState<Hex | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);

  useEffect(() => {
    setStage("idle");
    setPlan(null);
    setError(null);
    setSimDigest(null);
    setApprovals(0);
    setTxHash(null);
    setReceipt(null);
    setLiveClosureHash(null);
    setApprovalNotice(null);
    setTransactionStatus(null);
  }, [id]);

  if (!incident) {
    return (
      <div data-testid="incident-detail">
        <h1>Incident not found</h1>
        <p>The incident id <code>{id}</code> is not in the local store. <Link to="/incidents">Back to list</Link></p>
      </div>
    );
  }

  const closure = plan ? state.closures.get(plan.planHash) : undefined;

  async function runTriage() {
    setStage("triage");
    setError(null);
    try { await client.triage(incident!.id); setStage("idle"); }
    catch (e: any) { setStage("error"); setError(e?.message ?? "triage failed"); }
  }

  async function runPropose() {
    setStage("propose");
    setError(null);
    try {
      const p = await client.propose(incident!.id);
      setPlan(p);
      setStage("idle");
    } catch (e: any) { setStage("error"); setError(e?.message ?? "propose failed"); }
  }

  async function runSimulate() {
    if (!plan) return;
    setStage("simulate");
    setError(null);
    try {
      const r = await client.simulate(plan.planHash);
      setSimDigest(r.digest);
      setStage("idle");
    } catch (e: any) { setStage("error"); setError(e?.message ?? "simulate failed"); }
  }

  async function runApprove(approverIdx: number) {
    if (!plan) return;
    setError(null);
    setApprovalNotice(null);
    try {
      const approver = live ? wallet.account : approverIdx % 2 === 0 ? DEMO_APPROVER : DEMO_RESPONDER;
      if (!approver) throw new Error("Connect a wallet before approving a live plan.");
      if (live) {
        setStage("approve-intent");
        const intent = await client.approvalNonce(plan.planHash, approver);
        const signature = await wallet.signApprovalIntent(intent);
        await client.submitApprovalIntent(intent.intentId, intent, signature);
        setStage("approve-wallet");
        const approvalTxHash = await wallet.approvePlan(plan.planHash);
        setTxHash(approvalTxHash);
        setTransactionStatus("pending");
        setStage("approve-confirm");
        const confirmed = await client.confirmApproval(intent.intentId, approvalTxHash);
        if (confirmed.status !== "confirmed") throw new Error("Approval receipt is not confirmed on-chain.");
        setTransactionStatus("confirmed");
        setApprovals((count) => count + 1);
        setApprovalNotice("Approval confirmed on Pharos Atlantic");
        setStage("idle");
        return;
      }
      setStage("approve-intent");
      const signature = makeDemoSignature("appr:" + approverIdx);
      const r = await client.approve({ planHash: plan.planHash, approver, signature });
      setApprovals((n) => n + 1);
      setStage("idle");
      if (!r.ready && plan.requiredApprovals > 1) {
        setError("Threshold not met yet; need " + plan.requiredApprovals + " approvals.");
      }
    } catch (e: any) { setStage("error"); setError(e?.message ?? "approve failed"); }
  }

  async function runExecute() {
    if (!plan) return;
    setStage("execute");
    setError(null);
    try {
      const r = await client.execute({
        planHash: plan.planHash,
        ...(live ? {} : { approver: DEMO_APPROVER, signature: makeDemoSignature("exec") }),
      });
      setTxHash(r.txHash);
      setTransactionStatus(r.status);
      if (r.closureHash) {
        setLiveClosureHash(r.closureHash);
        setReceipt(r.closureHash);
      }
      setStage("idle");
    } catch (e: any) { setStage("error"); setError(e?.message ?? "execute failed"); }
  }

  async function runVerify() {
    if (!plan) return;
    setStage("verify");
    setError(null);
    try {
      const r = await client.verify(plan.planHash);
      setReceipt(r.closureHash ?? null);
      setStage("idle");
    } catch (e: any) { setStage("error"); setError(e?.message ?? "verify failed"); }
  }

  async function runClose() {
    if (!plan) return;
    setStage("close");
    setError(null);
    try {
      const r = await client.close(plan.planHash);
      setReceipt(r.receipt);
      setStage("idle");
    } catch (e: any) { setStage("error"); setError(e?.message ?? "close failed"); }
  }

  const isBusy = stage !== "idle";
  const liveWalletBlocked = live && (!wallet.connected || !wallet.correctNetwork);
  const max = incident.signals.reduce((m, s) => Math.max(m, s.severity), 0);
  const hasClosure = Boolean(closure || liveClosureHash);

  return (
    <div data-testid="incident-detail">
      <Link to="/incidents">&#8592; back to incidents</Link>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>Incident {incident.id.slice(0, 10)}...</h1>
        <SeverityPillForIncident incident={incident} />
      </div>
      <p>Subject: <code>{shortAddr(incident.subject)}</code> &middot; chain {incident.chainId} &middot; created {relativeTime(incident.createdAt)}</p>

      {error ? <Alert level="danger">{error}</Alert> : null}
      {approvalNotice ? <Alert level="ok">{approvalNotice}</Alert> : null}
      {liveWalletBlocked ? (
        <Alert level="warn">
          Live mode requires a connected wallet on Pharos Atlantic before approvals or execution can be signed.
        </Alert>
      ) : null}

      <div className="split">
        <div>
          <div className="card">
            <h3>Timeline</h3>
            <ul className="timeline">
              {incident.signals.map((s, i) => (
                <li key={i}>
                  <span className={"dot " + (s.severity >= 80 ? "danger" : s.severity >= 50 ? "warn" : "ok")} />
                  <div className="content">
                    <div className="head">{s.type} <span style={{ color: "var(--text-mute)", fontWeight: 400 }}>from {s.source}</span></div>
                    <div className="meta">severity={s.severity} &middot; conf={(s.confidenceBps / 100).toFixed(0)}% &middot; ev={shortHash(s.evidenceHash)} &middot; {relativeTime(s.observedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Signals ({incident.signals.length})</h3>
            <SignalList signals={incident.signals} />
          </div>
        </div>

        <div>
          <div className="card">
            <h3>Response plan</h3>
            {!plan ? (
              <>
                <p>No plan proposed yet. Severity score: {severityFor(incident)} (max signal severity: {max}).</p>
                <div className="action-row">
                  <button onClick={runTriage} disabled={isBusy} data-testid="btn-triage">Triage</button>
                  <button className="primary" onClick={runPropose} disabled={isBusy} data-testid="btn-propose">Propose plan</button>
                </div>
              </>
            ) : (
              <>
                <div className="row"><span className="label">Plan hash</span><span className="value">{shortHash(plan.planHash)}</span></div>
                <div className="row"><span className="label">Required approvals</span><span className="value">{plan.requiredApprovals}</span></div>
                <div className="row"><span className="label">Confirmed on-chain</span><span className="value" data-testid="approval-count">{approvals}/{plan.requiredApprovals}</span></div>
                <div className="row"><span className="label">Expires</span><span className="value">{new Date(plan.expiresAt).toLocaleTimeString()}</span></div>
                <div className="row"><span className="label">Actions</span><span className="value">{plan.actions.length}</span></div>
                <ul className="signal-list" style={{ marginTop: 6 }}>
                  {plan.actions.map((a, i) => (
                    <li key={i} data-state={hasClosure ? "CLOSED" : approvals >= plan.requiredApprovals ? "APPROVED" : simDigest ? "SIMULATED" : "PROPOSED"}>
                      <span className="src">{a.kind}</span>
                      <span style={{ marginLeft: 8 }}>target={shortAddr(a.target)}</span>
                      <span style={{ marginLeft: 8, color: "var(--text-mute)" }}>calldata={a.calldata.slice(0, 14)}...</span>
                      <span style={{ marginLeft: 8, color: "var(--text-mute)" }}>value=0</span>
                      <span style={{ marginLeft: 8, color: "var(--text-mute)" }}>reason={shortHash(a.reasonHash)}</span>
                    </li>
                  ))}
                </ul>
                <div className="action-row" style={{ marginTop: 8 }}>
                  <button onClick={runSimulate} disabled={isBusy || !!simDigest} data-testid="btn-simulate">Simulate</button>
                  {Array.from({ length: plan.requiredApprovals }).map((_, i) => (
                    <button key={i} onClick={() => runApprove(i)} disabled={isBusy || liveWalletBlocked || approvals > i || hasClosure} data-testid={"btn-approve-" + i}>
                      Approve #{i + 1}
                    </button>
                  ))}
                  <button className="primary" onClick={runExecute} disabled={isBusy || approvals < plan.requiredApprovals || hasClosure} data-testid="btn-execute">
                    Execute
                  </button>
                </div>
                {simDigest ? <p style={{ marginTop: 6, fontSize: 12, color: "var(--ok)" }} data-testid="sim-ok">simulation ok, digest {shortHash(simDigest)}</p> : null}
              </>
            )}
          </div>

          {plan ? (
            <div className="card">
              <h3>Closure</h3>
              {!hasClosure ? (
                <p style={{ color: "var(--text-mute)" }} data-testid="closure-empty">No closure yet. Execute the plan above to broadcast the on-chain action.</p>
              ) : (
                <>
                  <div className="row"><span className="label">Tx hash</span><span className="value" data-testid="closure-tx">{shortHash(txHash ?? closure?.txHash ?? "0x")}</span></div>
                  <div className="row"><span className="label">Approvers</span><span className="value">{live ? approvals : closure?.approvers.length ?? 0}</span></div>
                  <div className="row"><span className="label">Receipt</span><span className="value" data-testid="closure-receipt">{shortHash(liveClosureHash ?? closure?.receipt ?? "0x")}</span></div>
                  <div className="action-row" style={{ marginTop: 8 }}>
                    <button onClick={runVerify} disabled={isBusy} data-testid="btn-verify">Verify</button>
                    {!live ? <button onClick={runClose} disabled={isBusy} data-testid="btn-close">Close</button> : null}
                  </div>
                  {receipt ? <p style={{ marginTop: 6, fontSize: 12, color: "var(--ok)" }} data-testid="verify-ok">verify ok: {shortHash(receipt)}</p> : null}
                </>
              )}
            </div>
          ) : null}

          {txHash ? (
            <Alert level={transactionStatus === "failed" ? "danger" : "ok"}>
              Transaction {transactionStatus ?? "broadcast"}: <a href={`${ATLANTIC.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer"><code>{shortHash(txHash)}</code></a>
            </Alert>
          ) : null}
        </div>
      </div>

      <h2>Activity log (last 12)</h2>
      <LogView entries={state.log.slice(0, 12)} />
    </div>
  );
}
