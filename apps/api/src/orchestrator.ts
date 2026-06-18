import { keccak256, toFunctionSelector, toHex, type Hex } from "viem";
import { buildPlan, type Incident, type ResponsePlan } from "@pharos-incident/policy";
import { assertLivePlan } from "@pharos-incident/sdk";
import type { ExecutionArguments, TrackedTransaction } from "./chain.js";
import { Repositories } from "./repositories.js";

export interface OrchestratorChain {
  registerIncident(incidentId: Hex, planHash: Hex): Promise<TrackedTransaction>;
  proposePlan(plan: ResponsePlan): Promise<TrackedTransaction>;
  readPlan(planHash: Hex): Promise<any>;
  executePlan(plan: ResponsePlan, args?: ExecutionArguments): Promise<TrackedTransaction>;
  markExecuted(planHash: Hex): Promise<TrackedTransaction>;
  closeIncident(planHash: Hex, closureHash: Hex): Promise<TrackedTransaction>;
  verifyIncident(incidentId: Hex, planHash: Hex): Promise<any>;
  reconcileTransaction?(txHash: Hex): Promise<TrackedTransaction>;
}

export interface ProposalResult {
  plan: ResponsePlan;
  status: "pending" | "confirmed" | "failed";
  transaction: TrackedTransaction;
}

export interface ExecutionResult {
  status: "pending" | "confirmed" | "failed";
  txHash: Hex;
  closureHash?: Hex;
  verification?: unknown;
}

function canonicalClosure(input: {
  plan: ResponsePlan;
  approvals: Array<{ signer: string; txHash: Hex | null }>;
  execution: TrackedTransaction;
  registryExecution: TrackedTransaction;
}) {
  return {
    version: 1,
    chainId: input.plan.chainId,
    incidentId: input.plan.incidentId,
    planHash: input.plan.planHash,
    approvals: input.approvals.map((approval) => ({ signer: approval.signer, txHash: approval.txHash })),
    execution: { txHash: input.execution.txHash, blockNumber: input.execution.blockNumber?.toString() ?? null },
    registryExecution: {
      txHash: input.registryExecution.txHash,
      blockNumber: input.registryExecution.blockNumber?.toString() ?? null,
    },
  };
}

export class IncidentOrchestrator {
  constructor(private readonly repositories: Repositories, private readonly chain: OrchestratorChain) {}

  async propose(incidentId: Hex, now = Date.now()): Promise<ProposalResult> {
    const incident = await this.repositories.getIncident(incidentId);
    if (!incident) throw new Error("Unknown incident");
    let plan = await this.repositories.getPlanByIncident(incidentId);
    if (!plan) {
      plan = buildPlan({
        incident,
        actions: [{
          kind: "PAUSE_AGENT",
          target: incident.subject,
          calldata: toFunctionSelector("setPaused(address)"),
          value: 0n,
        }],
        unconfirmedCount: 0,
        confirmedSafeCount: 0,
        goplusCoverageBps: 0,
        now,
        ttlSeconds: 1_800,
      });
      assertLivePlan(plan);
      await this.repositories.createPlan(plan);
    }
    let state = await this.repositories.getPlanState(plan.planHash);
    if (state === "proposed" || state === "approved" || state === "executing" || state === "executed" || state === "closing" || state === "closed") {
      const existing = await this.repositories.getLatestTransaction(plan.planHash, "propose_plan");
      const transaction: TrackedTransaction = existing?.txHash
        ? {
            status: existing.status === "failed" ? "failed" : existing.status === "confirmed" ? "confirmed" : "pending",
            txHash: existing.txHash,
            explorerUrl: "",
          }
        : { status: "confirmed", txHash: "0x" as Hex, explorerUrl: "" };
      return { plan, status: "confirmed", transaction };
    }

    const registration = await this.runStep(plan.planHash, "register_incident", () =>
      this.chain.registerIncident(plan!.incidentId, plan!.planHash));
    if (registration.status !== "confirmed") {
      await this.repositories.setPlanState(plan.planHash, registration.status === "failed" ? "failed" : "registering");
      return { plan, status: registration.status, transaction: registration };
    }
    await this.repositories.setPlanState(plan.planHash, "registered");
    await this.repositories.setIncidentState(plan.incidentId, "registered");

    const proposal = await this.runStep(plan.planHash, "propose_plan", () => this.chain.proposePlan(plan!));
    if (proposal.status === "confirmed") {
      await this.repositories.setPlanState(plan.planHash, "proposed");
      await this.repositories.setIncidentState(plan.incidentId, "proposed");
    } else {
      await this.repositories.setPlanState(plan.planHash, proposal.status === "failed" ? "failed" : "proposing");
    }
    return { plan, status: proposal.status, transaction: proposal };
  }

  async execute(planHash: Hex, args: ExecutionArguments = {}): Promise<ExecutionResult> {
    const plan = await this.repositories.getPlan(planHash);
    if (!plan) throw new Error("Unknown plan");
    const state = await this.repositories.getPlanState(planHash);
    if (state === "closed") {
      const closure = await this.repositories.getClosure(planHash);
      if (!closure) throw new Error("Closed plan is missing closure evidence");
      const closeTx = await this.repositories.getLatestTransaction(planHash, "close_incident");
      return {
        status: "confirmed",
        txHash: closeTx?.txHash ?? "0x",
        closureHash: closure.closureHash,
        verification: await this.chain.verifyIncident(plan.incidentId, planHash),
      };
    }
    const onChainPlan = await this.chain.readPlan(planHash);
    const required = Number(onChainPlan.requiredApprovals ?? onChainPlan[2]);
    const count = Number(onChainPlan.approvalCount ?? onChainPlan[3]);
    if (count < required) throw new Error(`On-chain approval threshold not met: ${count}/${required}`);

    const execution = await this.runStep(planHash, "execute_plan", () => this.chain.executePlan(plan, args));
    if (execution.status !== "confirmed") {
      await this.repositories.setPlanState(planHash, execution.status === "failed" ? "failed" : "executing");
      return { status: execution.status, txHash: execution.txHash };
    }
    await this.repositories.setPlanState(planHash, "executed");

    const registryExecution = await this.runStep(planHash, "mark_executed", () => this.chain.markExecuted(planHash));
    if (registryExecution.status !== "confirmed") {
      return { status: registryExecution.status, txHash: registryExecution.txHash };
    }
    const approvals = await this.repositories.listConfirmedApprovals(planHash);
    const document = canonicalClosure({ plan, approvals, execution, registryExecution });
    const closureHash = keccak256(toHex(JSON.stringify(document)));
    await this.repositories.saveClosure(planHash, closureHash, document, false);

    const close = await this.runStep(planHash, "close_incident", () => this.chain.closeIncident(planHash, closureHash));
    if (close.status !== "confirmed") return { status: close.status, txHash: close.txHash, closureHash };
    await this.repositories.saveClosure(planHash, closureHash, document, true);
    return {
      status: "confirmed",
      txHash: close.txHash,
      closureHash,
      verification: await this.chain.verifyIncident(plan.incidentId, planHash),
    };
  }

  private async runStep(referenceId: Hex, purpose: string, send: () => Promise<TrackedTransaction>): Promise<TrackedTransaction> {
    const existing = await this.repositories.getLatestTransaction(referenceId, purpose);
    if (existing?.txHash && existing.status === "pending" && this.chain.reconcileTransaction) {
      return this.chain.reconcileTransaction(existing.txHash);
    }
    if (existing?.txHash && (existing.status === "confirmed" || existing.status === "failed")) {
      return {
        status: existing.status,
        txHash: existing.txHash,
        explorerUrl: "",
        ...(existing.blockNumber === null ? {} : { blockNumber: existing.blockNumber }),
        ...(existing.errorCode === null ? {} : { errorCode: existing.errorCode }),
      };
    }
    return send();
  }
}
