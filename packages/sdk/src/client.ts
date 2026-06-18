import type { Hex, ResponsePlan, Incident } from "@pharos-incident/policy";
import type { ApprovalIntent } from "./atlantic.js";

export interface DetectInput {
  subject: Hex;
  rawSignals: Array<{ source: string; type: string; severity: number; evidenceHash: Hex; confidenceBps: number; observedAt: number }>;
}
export interface SimulateOutput { ok: boolean; digest: Hex; warnings: string[] }
export interface ApproveInput { planHash: Hex; approver: Hex; signature: Hex }
export interface ExecuteInput {
  planHash: Hex;
  agentOrZero?: Hex;
  keyId?: Hex;
  metadataHash?: Hex;
  approver?: Hex;
  signature?: Hex;
}
export interface ApprovalNonceOutput extends ApprovalIntent { intentId: string }
export interface ApprovalEvidence { id: string; status: "verified" | "confirmed" | "failed"; signer?: Hex; txHash?: Hex }
export interface TransactionState {
  status: "created" | "pending" | "confirmed" | "failed";
  txHash: Hex;
  explorerUrl?: string;
  blockNumber?: string | bigint;
  errorCode?: string;
}
export interface ExecuteOutput extends TransactionState { closureHash?: Hex; verification?: unknown }
export interface VerifyOutput {
  ok: boolean;
  closureHash: Hex | null;
  onChain?: unknown;
  checks?: Record<string, boolean>;
}

export interface PharosIncidentClient {
  detect(input: DetectInput): Promise<Incident>;
  triage(incidentId: Hex): Promise<{ severity: string; score: number }>;
  propose(incidentId: Hex): Promise<ResponsePlan>;
  simulate(planHash: Hex): Promise<SimulateOutput>;
  approve(input: ApproveInput): Promise<{ ready: boolean }>;
  approvalNonce(planHash: Hex, approver: Hex): Promise<ApprovalNonceOutput>;
  submitApprovalIntent(intentId: string, intent: ApprovalIntent, signature: Hex): Promise<ApprovalEvidence>;
  confirmApproval(intentId: string, txHash: Hex): Promise<ApprovalEvidence>;
  execute(input: ExecuteInput): Promise<ExecuteOutput>;
  transaction(txHash: Hex): Promise<TransactionState>;
  verify(planHash: Hex): Promise<VerifyOutput>;
  close(planHash: Hex): Promise<{ receipt: Hex }>;
}

export class HttpClient implements PharosIncidentClient {
  constructor(private readonly base: string) {}
  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`sdk ${path} ${r.status} ${text.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  }
  private async get<T>(path: string): Promise<T> {
    const r = await fetch(`${this.base}${path}`);
    if (!r.ok) throw new Error(`sdk ${path} ${r.status}`);
    return (await r.json()) as T;
  }
  detect(input: DetectInput) { return this.post<Incident>("/detect", input); }
  triage(incidentId: Hex) { return this.get<{ severity: string; score: number }>(`/triage/${incidentId}`); }
  propose(incidentId: Hex) { return this.post<ResponsePlan>("/propose", { incidentId }); }
  simulate(planHash: Hex) { return this.post<SimulateOutput>("/simulate", { planHash }); }
  approve(input: ApproveInput) { return this.post<{ ready: boolean }>("/approve", input); }
  approvalNonce(planHash: Hex, approver: Hex) {
    return this.post<ApprovalNonceOutput>("/approvals/nonce", { planHash, approver });
  }
  submitApprovalIntent(intentId: string, intent: ApprovalIntent, signature: Hex) {
    return this.post<ApprovalEvidence>("/approve", { intentId, intent, signature });
  }
  confirmApproval(intentId: string, txHash: Hex) {
    return this.post<ApprovalEvidence>("/approve/confirm", { intentId, txHash });
  }
  execute(input: ExecuteInput) { return this.post<ExecuteOutput>("/execute", input); }
  transaction(txHash: Hex) { return this.get<TransactionState>(`/transactions/${txHash}`); }
  verify(planHash: Hex) { return this.get<VerifyOutput>(`/verify/${planHash}`); }
  close(planHash: Hex) { return this.post<{ receipt: Hex }>("/close", { planHash }); }
}
