import type {
  PharosIncidentClient,
  DetectInput,
  SimulateOutput,
  ApproveInput,
  ExecuteInput,
  VerifyOutput,
  ApprovalIntent,
  ApprovalNonceOutput,
  ApprovalEvidence,
  TransactionState,
  ExecuteOutput,
} from "@pharos-incident/sdk";
import { hashString, packAndHash, type Hex, type Incident, type ResponsePlan } from "@pharos-incident/policy";
import { SEED_INCIDENTS, type ApprovalRecord, type ClosureRecord } from "./seed.js";
import { buildPlan } from "./policyAdapter.js";

export type DemoMode = "live" | "offline";

export interface DemoState {
  mode: DemoMode;
  incidents: Incident[];
  plans: Map<Hex, ResponsePlan>;
  approvals: Map<Hex, ApprovalRecord[]>;
  closures: Map<Hex, ClosureRecord>;
  log: DemoLogEntry[];
  online: boolean;
  lastSync: number | null;
}

export interface DemoLogEntry {
  ts: number;
  level: "info" | "warn" | "error" | "ok";
  message: string;
}

const empty = ("0x" + "00".repeat(32)) as Hex;

function fakeTxHash(seed: string): Hex {
  return hashString(seed + ":" + Date.now() + ":" + Math.random());
}

function fakeAddr(seed: number): Hex {
  // Return a lowercase 20-byte address without checksum requirements.
  return ("0x" + seed.toString(16).padStart(40, "0").toLowerCase()) as Hex;
}

function fakeCalldata(name: string): Hex {
  // Build a deterministic, valid 0x + hex calldata with at least 4 bytes selector.
  const selector = hashString(name).slice(0, 10);
  const tail = hashString(name + Date.now()).slice(2, 10);
  return (selector + tail) as Hex;
}

export function freshDemoState(): DemoState {
  const state: DemoState = {
    mode: "offline",
    incidents: SEED_INCIDENTS.map((i) => ({ ...i, signals: i.signals.map((s) => ({ ...s })) })),
    plans: new Map(),
    approvals: new Map(),
    closures: new Map(),
    log: [
      { ts: Date.now(), level: "info", message: "Demo client initialised with 3 seed incidents." },
    ],
    online: false,
    lastSync: null,
  };
  return state;
}

export class MockClient implements PharosIncidentClient {
  private readonly approvalIntents = new Map<string, ApprovalIntent>();
  private readonly transactions = new Map<Hex, TransactionState>();

  constructor(public readonly state: DemoState) {}

  private push(level: DemoLogEntry["level"], message: string) {
    this.state.log.unshift({ ts: Date.now(), level, message });
    if (this.state.log.length > 200) this.state.log.pop();
  }

  async detect(input: DetectInput): Promise<Incident> {
    this.push("info", "detect: ingesting " + input.rawSignals.length + " signal(s)");
    const id = hashString(JSON.stringify(input) + ":" + Date.now());
    const incident: Incident = {
      id,
      chainId: 1,
      subject: input.subject,
      signals: input.rawSignals.map((s) => ({ ...s, subject: input.subject })),
      createdAt: Date.now(),
    };
    this.state.incidents.unshift(incident);
    this.push("ok", "detect: created incident " + id.slice(0, 10) + "...");
    return incident;
  }

  async triage(incidentId: Hex): Promise<{ severity: string; score: number }> {
    const inc = this.state.incidents.find((i) => i.id === incidentId);
    if (!inc) throw new Error("triage: incident " + incidentId + " not found");
    const score = inc.signals.reduce((m, s) => Math.max(m, s.severity * 100), 0);
    const severity = score >= 300 ? "CRITICAL" : score >= 150 ? "HIGH" : score >= 50 ? "SUSPICIOUS" : "INFO";
    this.push("info", "triage: " + incidentId.slice(0, 10) + "... -> " + severity + " (" + score + ")");
    return { severity, score };
  }

  async propose(incidentId: Hex): Promise<ResponsePlan> {
    const inc = this.state.incidents.find((i) => i.id === incidentId);
    if (!inc) throw new Error("propose: incident " + incidentId + " not found");
    const max = inc.signals.reduce((m, s) => Math.max(m, s.severity), 0);
    const isCrit = max >= 80;
    const kind: ResponsePlan["actions"][number]["kind"] = isCrit
      ? inc.signals.some((s) => s.type.includes("APPROVAL"))
        ? "REVOKE_APPROVAL"
        : "PAUSE_AGENT"
      : "SNAPSHOT";
    const plan = buildPlan({
      incident: inc,
      actions: [
        {
          kind,
          target: inc.subject,
          calldata: fakeCalldata(kind),
          value: 0n,
        },
      ],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 9500,
      now: Date.now(),
      ttlSeconds: 900,
    });
    this.state.plans.set(plan.planHash, plan);
    this.push("ok", "propose: plan " + plan.planHash.slice(0, 10) + "... (" + plan.actions.length + " action, " + plan.requiredApprovals + " approval(s))");
    return plan;
  }

  async simulate(planHash: Hex): Promise<SimulateOutput> {
    const plan = this.state.plans.get(planHash);
    if (!plan) throw new Error("simulate: unknown plan");
    this.push("info", "simulate: replaying " + plan.actions.length + " action(s) against fork");
    return { ok: true, digest: fakeTxHash("simulate:" + planHash) as Hex, warnings: [] };
  }

  async approve(input: ApproveInput): Promise<{ ready: boolean }> {
    const plan = this.state.plans.get(input.planHash);
    if (!plan) throw new Error("approve: unknown plan");
    const list = this.state.approvals.get(input.planHash) ?? [];
    list.push({
      approver: input.approver,
      signature: input.signature,
      ts: Date.now(),
    });
    this.state.approvals.set(input.planHash, list);
    const ready = list.length >= plan.requiredApprovals;
    this.push(ready ? "ok" : "info", "approve: " + list.length + "/" + plan.requiredApprovals + " for " + input.planHash.slice(0, 10) + "...");
    return { ready };
  }

  async approvalNonce(planHash: Hex, approver: Hex): Promise<ApprovalNonceOutput> {
    const intentId = `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const intent: ApprovalIntent = {
      version: 1,
      planHash,
      chainId: 688689,
      approver,
      nonce: `offline-${hashString(intentId).slice(2, 34)}`,
      expiresAt: Date.now() + 5 * 60_000,
    };
    this.approvalIntents.set(intentId, intent);
    return { intentId, ...intent };
  }

  async submitApprovalIntent(intentId: string, intent: ApprovalIntent, signature: Hex): Promise<ApprovalEvidence> {
    const stored = this.approvalIntents.get(intentId);
    if (!stored || stored.nonce !== intent.nonce) throw new Error("offline approval intent not found");
    await this.approve({ planHash: intent.planHash, approver: intent.approver, signature });
    return { id: intentId, status: "verified", signer: intent.approver };
  }

  async confirmApproval(intentId: string, txHash: Hex): Promise<ApprovalEvidence> {
    const stored = this.approvalIntents.get(intentId);
    if (!stored) throw new Error("offline approval intent not found");
    return { id: intentId, status: "confirmed", signer: stored.approver, txHash };
  }

  async execute(input: ExecuteInput): Promise<ExecuteOutput> {
    const plan = this.state.plans.get(input.planHash);
    if (!plan) throw new Error("execute: unknown plan");
    const list = this.state.approvals.get(input.planHash) ?? [];
    if (list.length < plan.requiredApprovals) {
      this.push("error", "execute: insufficient approvals (" + list.length + "/" + plan.requiredApprovals + ")");
      throw new Error("execute: insufficient approvals");
    }
    if (Date.now() >= plan.expiresAt) {
      this.push("error", "execute: plan expired");
      throw new Error("execute: plan expired");
    }
    const txHash = fakeTxHash("execute:" + input.planHash) as Hex;
    const closure: ClosureRecord = {
      planHash: input.planHash,
      txHash,
      approvers: list.map((a) => a.approver),
      closedAt: Date.now(),
      receipt: packAndHash(
        ["bytes32", "bytes32", "uint256"],
        [input.planHash, txHash, BigInt(Date.now())],
      ),
    };
    this.state.closures.set(input.planHash, closure);
    this.transactions.set(txHash, { status: "confirmed", txHash });
    this.state.lastSync = Date.now();
    this.push("ok", "execute: tx " + txHash.slice(0, 10) + "... broadcast; plan " + input.planHash.slice(0, 10) + "... closed");
    return { status: "confirmed", txHash, closureHash: closure.receipt };
  }

  async transaction(txHash: Hex): Promise<TransactionState> {
    const transaction = this.transactions.get(txHash);
    if (!transaction) throw new Error("offline transaction not found");
    return transaction;
  }

  async verify(planHash: Hex): Promise<VerifyOutput> {
    const c = this.state.closures.get(planHash);
    if (!c) {
      this.push("warn", "verify: no closure for " + planHash.slice(0, 10) + "...");
      return { ok: false, closureHash: empty };
    }
    this.push("ok", "verify: closure ok, receipt " + c.receipt.slice(0, 10) + "...");
    return { ok: true, closureHash: c.receipt };
  }

  async close(planHash: Hex): Promise<{ receipt: Hex }> {
    const c = this.state.closures.get(planHash);
    if (!c) throw new Error("close: no closure");
    this.push("ok", "close: receipt " + c.receipt.slice(0, 10) + "...");
    return { receipt: c.receipt };
  }
}

export const DEMO_APPROVER = fakeAddr(0xA11CE);
export const DEMO_RESPONDER = fakeAddr(0xB0B);
export const DEMO_REPORTER = fakeAddr(0xC0DE);

export function makeDemoSignature(seed: string): Hex {
  return hashString(seed);
}
