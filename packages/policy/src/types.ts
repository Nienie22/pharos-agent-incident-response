export type Hex = `0x${string}`;

export type IncidentSeverity = "INFO" | "SUSPICIOUS" | "HIGH" | "CRITICAL";

export type ActionKind =
  | "PAUSE_AGENT"
  | "REVOKE_APPROVAL"
  | "REMOVE_EXECUTOR"
  | "ROTATE_KEY_METADATA"
  | "SNAPSHOT";

export interface IncidentSignal {
  source: string;
  observedAt: number;
  subject: Hex;
  type: string;
  severity: number; // 0..100
  evidenceHash: Hex;
  confidenceBps: number; // 0..10000
}

export interface Incident {
  id: Hex;
  chainId: number;
  subject: Hex;
  signals: IncidentSignal[];
  createdAt: number;
}

export interface ResponseAction {
  kind: ActionKind;
  target: Hex;
  calldata: Hex;
  value: bigint;
  reasonHash: Hex;
}

export interface ResponsePlan {
  incidentId: Hex;
  chainId: number;
  actions: ResponseAction[];
  expiresAt: number;
  requiredApprovals: number;
  planHash: Hex;
}

export interface Approval {
  planHash: Hex;
  approver: Hex;
  expiresAt: number;
  signature: Hex;
}
