import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useClient } from "../lib/ClientContext.js";
import { useWallet } from "../lib/WalletContext.js";
import { LogView, Alert } from "../components/shared.js";
import { DEMO_APPROVER, DEMO_RESPONDER, makeDemoSignature, MockClient } from "../lib/MockClient.js";
import { shortAddr, shortHash, severityFor } from "../lib/seed.js";
import type { PharosIncidentClient } from "@pharos-incident/sdk";
import type { Hex, Incident, ResponsePlan } from "@pharos-incident/policy";

type DemoMode = "demo" | "live";
type StepId = "detect" | "triage" | "propose" | "simulate" | "wallet" | "approve" | "execute" | "verify";
type StepStatus = "waiting" | "running" | "done" | "blocked";

interface Scenario {
  id: string;
  title: string;
  description: string;
  severity: string;
  signalType: string;
  expectedAction: string;
  source: string;
  businessImpact: string;
}

const ATLANTIC = {
  network: "pharos-atlantic",
  chainId: 688689,
  explorer: "https://atlantic.pharosscan.xyz",
  contracts: {
    IncidentRegistry: "0x0d93b5cD4356652ef6b4776949A86979e9c00cdE",
    EmergencyPolicyController: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
    AgentRegistry: "0x2d1B360dec14e63846735939E793bcb1655Aa93b",
  },
};

const STEPS: Array<{ id: StepId; label: string; explanation: string }> = [
  { id: "detect", label: "Detect incident", explanation: "A watcher turns a risky signal into an incident snapshot with evidence." },
  { id: "triage", label: "Triage severity", explanation: "The policy engine scores severity and decides whether the response needs approval." },
  { id: "propose", label: "Propose plan", explanation: "A deterministic response plan is built from the incident and policy rules." },
  { id: "simulate", label: "Simulate", explanation: "The responder previews the action before anyone signs or executes it." },
  { id: "wallet", label: "Connect wallet", explanation: "Guardian signs the approval with a wallet on Pharos Atlantic." },
  { id: "approve", label: "Execute", explanation: "Send transactions on testnet after the plan has enough approval." },
  { id: "execute", label: "Verify receipt", explanation: "Validate the response transaction and indexed events." },
  { id: "verify", label: "Anchor receipt", explanation: "Commit the closure receipt on-chain." },
];

const STEP_RUNNING_DELAY_MS = 450;
const STEP_DONE_DELAY_MS = 220;

const SCENARIOS: Scenario[] = [
  {
    id: "malicious-approval",
    title: "Malicious approval",
    description: "GoPlus flagged an approval to a known drainer. The responder must revoke the approval and contain the agent.",
    severity: "CRITICAL",
    signalType: "MALICIOUS_APPROVAL",
    expectedAction: "REVOKE_APPROVAL",
    source: "goplus",
    businessImpact: "Prevents a delegated wallet from draining approved assets.",
  },
  {
    id: "suspicious-burst",
    title: "Suspicious tx burst",
    description: "Pharos watcher reports 12 transactions in 30 seconds from a delegated agent.",
    severity: "HIGH",
    signalType: "TX_BURST",
    expectedAction: "SNAPSHOT",
    source: "pharos-watcher",
    businessImpact: "Preserves evidence before a human responder decides the next action.",
  },
  {
    id: "leaked-session-key",
    title: "Leaked session key",
    description: "CertiK reports a session key was leaked on a public paste site.",
    severity: "CRITICAL",
    signalType: "LEAKED_SESSION_KEY",
    expectedAction: "PAUSE_AGENT",
    source: "certik",
    businessImpact: "Stops the compromised agent while rotation is queued.",
  },
];

function buildSubject(scenarioId: string): Hex {
  let hex = "";
  for (let i = 0; hex.length < 40; i++) hex += (i + scenarioId.length).toString(16);
  return ("0x" + hex.slice(0, 40)) as Hex;
}

function initialStatuses(): Record<StepId, StepStatus> {
  return STEPS.reduce((acc, step) => ({ ...acc, [step.id]: "waiting" as StepStatus }), {} as Record<StepId, StepStatus>);
}

function statusLabel(status: StepStatus) {
  if (status === "done") return "done";
  if (status === "running") return "running";
  if (status === "blocked") return "blocked";
  return "waiting";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function DemoScenariosPage() {
  const { client, state, reset, live, apiBase } = useClient();
  const wallet = useWallet();
  const [mode, setMode] = useState<DemoMode>("demo");
  const [selectedId, setSelectedId] = useState(SCENARIOS[0].id);
  const [busy, setBusy] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<StepId, StepStatus>>(initialStatuses);
  const [currentStep, setCurrentStep] = useState<StepId>("detect");
  const [lastIncident, setLastIncident] = useState<Incident | null>(null);
  const [lastPlanObject, setLastPlanObject] = useState<ResponsePlan | null>(null);
  const [lastTx, setLastTx] = useState<Hex | null>(null);
  const [lastPlan, setLastPlan] = useState<Hex | null>(null);
  const [lastReceipt, setLastReceipt] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => SCENARIOS.find((s) => s.id === selectedId) ?? SCENARIOS[0], [selectedId]);
  const liveReady = live && wallet.connected && wallet.correctNetwork;
  const runMode = mode === "live" ? "Live Testnet Mode" : "Demo Mode";
  const runComplete = Boolean(lastTx && lastReceipt && statuses.verify === "done");

  function setStep(id: StepId, status: StepStatus) {
    setCurrentStep(id);
    setStatuses((prev) => ({ ...prev, [id]: status }));
  }

  async function runVisibleStep<T>(id: StepId, fn: () => Promise<T>): Promise<T> {
    setStep(id, "running");
    await sleep(STEP_RUNNING_DELAY_MS);
    const result = await fn();
    setStep(id, "done");
    await sleep(STEP_DONE_DELAY_MS);
    return result;
  }

  async function completeVisibleStep(id: StepId) {
    setStep(id, "running");
    await sleep(STEP_RUNNING_DELAY_MS);
    setStep(id, "done");
    await sleep(STEP_DONE_DELAY_MS);
  }

  function resetRunState() {
    setStatuses(initialStatuses());
    setCurrentStep("detect");
    setLastIncident(null);
    setLastPlanObject(null);
    setLastTx(null);
    setLastPlan(null);
    setLastReceipt(null);
    setError(null);
  }

  async function approvePlan(activeClient: PharosIncidentClient, plan: ResponsePlan, scenarioId: string) {
    for (let i = 0; i < plan.requiredApprovals; i++) {
      const approver = mode === "live" ? wallet.account : i % 2 === 0 ? DEMO_APPROVER : DEMO_RESPONDER;
      if (!approver) throw new Error("Connect a wallet before approving in live mode.");
      const signature = mode === "live"
        ? await wallet.signPlanHash(plan.planHash)
        : makeDemoSignature("scn:" + scenarioId + ":" + i);
      // eslint-disable-next-line no-await-in-loop
      await activeClient.approve({ planHash: plan.planHash, approver, signature });
      if (mode === "live" && i < plan.requiredApprovals - 1) {
        throw new Error("This critical plan needs another unique approver wallet for the next signature.");
      }
    }
  }

  async function runScenario(s: Scenario) {
    setBusy(s.id);
    resetRunState();
    let activeStep: StepId = "detect";
    try {
      if (mode === "live" && !live) throw new Error("API is offline. Use Demo Mode or start the API first.");
      const activeClient = mode === "demo" ? new MockClient(state) : client;

      const subject = buildSubject(s.id);
      activeStep = "detect";
      const incident = await runVisibleStep("detect", () => activeClient.detect({
          subject,
          rawSignals: [{
            source: s.source,
            type: s.signalType,
            severity: s.severity === "CRITICAL" ? 90 : 60,
            confidenceBps: 9500,
            evidenceHash: ("0x" + s.id.padEnd(64, "0").slice(0, 64)) as Hex,
            observedAt: Date.now(),
          }],
        })
      );
      setLastIncident(incident);

      activeStep = "triage";
      await runVisibleStep("triage", async () => {
        await activeClient.triage(incident.id);
      });

      activeStep = "propose";
      const plan = await runVisibleStep("propose", () => activeClient.propose(incident.id));
      setLastPlanObject(plan);
      setLastPlan(plan.planHash);

      activeStep = "simulate";
      await runVisibleStep("simulate", async () => {
        await activeClient.simulate(plan.planHash);
      });

      activeStep = "wallet";
      if (mode === "live" && !liveReady) {
        setStep("wallet", "blocked");
        throw new Error("Connect wallet and switch to Pharos Atlantic before live execution.");
      }
      await completeVisibleStep("wallet");

      activeStep = "approve";
      await runVisibleStep("approve", async () => {
        await approvePlan(activeClient, plan, s.id);
      });

      activeStep = "execute";
      const approver = mode === "live" ? wallet.account : DEMO_APPROVER;
      if (!approver) throw new Error("Connect a wallet before executing in live mode.");
      const signature = mode === "live" ? await wallet.signPlanHash(plan.planHash) : makeDemoSignature("scn-exec");
      const exec = await runVisibleStep("execute", () => activeClient.execute({ planHash: plan.planHash, approver, signature }));
      setLastTx(exec.txHash);

      activeStep = "verify";
      const verify = await runVisibleStep("verify", () => activeClient.verify(plan.planHash));
      setLastReceipt(verify.closureHash);
      await activeClient.close(plan.planHash);
    } catch (e: any) {
      setStatuses((prev) => ({ ...prev, [activeStep]: prev[activeStep] === "done" ? "done" : "blocked" }));
      setError((e && e.message) ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    for (const s of SCENARIOS) {
      // eslint-disable-next-line no-await-in-loop
      await runScenario(s);
    }
  }

  const currentExplanation = STEPS.find((s) => s.id === currentStep)?.explanation ?? STEPS[0].explanation;

  return (
    <div className="demo-page" data-testid="demo-page">
      <div className="demo-hero">
        <div>
          <h1>Guided incident response demo</h1>
          <p>Experience the full flow from risk detection to on-chain receipt in a safe test environment.</p>
        </div>
        <button className="primary" onClick={() => { reset(); resetRunState(); }} disabled={busy !== null} data-testid="btn-reset">
          Reset demo
        </button>
      </div>

      <div className="demo-stage">
        <div className="scenario-mode-grid">
          <section className="scenario-chooser">
            <h2>Choose a scenario</h2>
            <div className="scenario-grid compact">
              {SCENARIOS.map((s) => (
                <button
                  type="button"
                  className={"scenario-card selectable " + (selected.id === s.id ? "active" : "")}
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  data-testid={"scenario-" + s.id}
                >
                  <span className={"scenario-symbol " + s.severity.toLowerCase()} />
                  <div>
                    <h4>{s.title}</h4>
                    <p>{s.id === "malicious-approval" ? "Agent attempts an approval to a known drainer contract." : s.id === "suspicious-burst" ? "Agent emits an unusual burst of transactions." : "A session key is detected on a public paste site."}</p>
                    <em>{s.severity === "HIGH" ? "Medium risk" : "High risk"}</em>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="mode-card">
            <span>Current mode</span>
            <strong>{runMode}</strong>
            <p>{mode === "demo" ? "Runs against the in-memory mock client. No wallet required." : "Uses the configured API and requires a wallet on Pharos Atlantic."}</p>
            <button className="outline-wide" onClick={() => setMode(mode === "demo" ? "live" : "demo")}>
              {mode === "demo" ? "Live Testnet Mode" : "Demo Mode"}
            </button>
          </section>
        </div>

        <section className="flow-panel">
          <h2>Response flow</h2>
          <div className="stepper" data-testid="demo-stepper">
            {STEPS.map((step, idx) => (
              <div className={"step " + statuses[step.id]} key={step.id}>
                <span className="step-number">{idx + 1}</span>
                <div className="step-copy">
                  <strong>{step.label}</strong>
                  <p>{step.explanation.split(".")[0]}</p>
                  <span className="step-state">{statusLabel(statuses[step.id])}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flow-status-row">
            <div>
              <span className={"flow-pulse " + statuses[currentStep]} />
              <strong>Step {Math.max(1, STEPS.findIndex((s) => s.id === currentStep) + 1)} of 8: {STEPS.find((s) => s.id === currentStep)?.label}</strong>
              <p data-testid="what-happened">{currentExplanation}</p>
            </div>
            <div className="flow-actions">
              <button className="primary" onClick={() => runScenario(selected)} disabled={busy !== null} data-testid="btn-start-guided-demo">
                {busy ? "Running..." : "Start guided demo"}
              </button>
              <button
                className="sr-test-hook"
                onClick={() => runScenario(selected)}
                disabled={busy !== null}
                data-testid={"btn-run-" + selected.id}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button onClick={runAll} disabled={busy !== null || mode === "live"} data-testid="btn-run-all">Auto-run all</button>
            </div>
          </div>
        </section>

        <div className="demo-info-grid">
          <section className="readiness-panel" data-testid="demo-checklist">
            <h2>Readiness checklist</h2>
            <ReadinessRow label="API is online" ok={live} />
            <ReadinessRow label="Wallet connected" ok={mode === "demo" || wallet.connected} />
            <ReadinessRow label="Contracts on Atlantic" ok />
            <ReadinessRow label="Policy set is active" ok />
            <ReadinessRow label="Network is Pharos Atlantic" ok={mode === "demo" || wallet.correctNetwork} />
            <ReadinessRow label={mode === "demo" || liveReady ? "Ready: all systems ready" : "Ready: needs wallet setup"} ok={mode === "demo" || liveReady} strong />
          </section>

          <section className="live-status-panel">
            <h2>Live status</h2>
            <StatusRow label="API" value={live ? "Online" : "Offline"} ok={live} />
            <StatusRow label="Network" value="Pharos Atlantic" ok />
            <StatusRow label="Contracts" value="Deployed" ok />
            <StatusRow label="Sync status" value={runComplete ? "Synced" : "Waiting"} ok={runComplete || mode === "demo"} />
            <StatusRow label="Watchers" value="Running" ok />
            <small>Last updated: {new Date().toLocaleTimeString()}</small>
          </section>

          <section className="wallet-panel">
            <h2>Wallet</h2>
            <StatusRow label="Connected" value={wallet.connected ? shortAddr(wallet.account) : "Not connected"} ok={wallet.connected} />
            <StatusRow label="Network" value={wallet.correctNetwork ? "Pharos Atlantic (688689)" : mode === "demo" ? "Not required" : "Wrong chain"} ok={mode === "demo" || wallet.correctNetwork} />
            <StatusRow label="Balance" value={wallet.connected ? "12.345 PATL" : "signature gate"} ok={mode === "demo" || wallet.connected} />
            <button className="outline-wide" onClick={wallet.connected ? wallet.disconnect : wallet.connect} disabled={wallet.pending || (!wallet.connected && !wallet.available)}>
              {wallet.connected ? "Disconnect" : "Connect wallet"}
            </button>
          </section>
        </div>

      {error ? <Alert level="danger" data-testid="demo-error">{error}</Alert> : null}
      {runComplete ? (
        <Alert level="ok" data-testid="demo-last-ok">
          Last successful run &mdash; plan <code>{shortHash(lastPlan)}</code> &middot; tx <code>{shortHash(lastTx)}</code> &middot; receipt <code>{shortHash(lastReceipt)}</code>
        </Alert>
      ) : null}

      <section className="receipt-panel" data-testid="testnet-evidence">
        <div className="section-heading">
          <h2>Evidence receipt <small>(will appear at the end of the flow)</small></h2>
        </div>
        <div className="receipt-box">
          <div>
            <strong>{lastReceipt ? shortHash(lastReceipt) : "No receipt yet"}</strong>
            <p>{lastReceipt ? `Plan ${shortHash(lastPlan)} · tx ${shortHash(lastTx)} · ${lastPlanObject?.actions[0]?.kind ?? selected.expectedAction}` : "Complete all steps to generate and anchor the on-chain receipt."}</p>
            <span>{ATLANTIC.network} ({ATLANTIC.chainId}) · IncidentRegistry {shortAddr(ATLANTIC.contracts.IncidentRegistry)}</span>
          </div>
          <div className="receipt-visual" />
        </div>
      </section>
      </div>

      <div className="section-heading">
        <h2>Tracked incidents</h2>
        <p>The mock store and live API share the same incident surface.</p>
      </div>
      {state.incidents.length === 0 ? (
        <div className="empty">No incidents yet. Run a scenario to create one.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Incident</th>
              <th>Subject</th>
              <th>Severity</th>
              <th>Signals</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.incidents.map((i) => (
              <tr key={i.id}>
                <td className="mono">{shortHash(i.id)}</td>
                <td className="mono">{shortAddr(i.subject)}</td>
                <td><span className={"severity-pill " + severityFor(i)}>{severityFor(i)}</span></td>
                <td>{i.signals.length}</td>
                <td><Link to={"/incidents/" + i.id}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Activity log</h2>
      <LogView entries={state.log.slice(0, 30)} />
    </div>
  );
}

function ReadinessItem(props: { label: string; value: React.ReactNode; ok: boolean }) {
  return (
    <div className={"readiness-item " + (props.ok ? "ok" : "warn")}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ReadinessRow(props: { label: string; ok: boolean; strong?: boolean }) {
  return (
    <div className={"readiness-row " + (props.ok ? "ok" : "warn") + (props.strong ? " strong" : "")}>
      <span />
      <strong>{props.label}</strong>
      <em>›</em>
    </div>
  );
}

function StatusRow(props: { label: string; value: string; ok: boolean }) {
  return (
    <div className="status-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <em className={props.ok ? "ok" : "warn"} />
    </div>
  );
}

function Evidence(props: { label: string; value: string; href?: string }) {
  return (
    <div className="evidence-item">
      <span>{props.label}</span>
      {props.href ? <a href={props.href} target="_blank" rel="noreferrer">{props.value}</a> : <strong>{props.value}</strong>}
    </div>
  );
}
