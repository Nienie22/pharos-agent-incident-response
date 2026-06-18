import type { Hex, ResponsePlan } from "@pharos-incident/policy";

export const ATLANTIC = {
  id: 688689,
  name: "Pharos Atlantic",
  nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
  rpcUrl: "https://atlantic.dplabs-internal.com",
  explorerUrl: "https://atlantic.pharosscan.xyz",
  contracts: {
    incidentRegistry: "0x0d93b5cD4356652ef6b4776949A86979e9c00cdE",
    emergencyPolicyController: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
    agentRegistry: "0x2d1B360dec14e63846735939E793bcb1655Aa93b",
  },
} as const;

export const LIVE_ACTION_KIND = {
  PAUSE_AGENT: 0,
  REMOVE_EXECUTOR: 2,
  ROTATE_KEY_METADATA: 3,
} as const;

export type LiveActionKind = keyof typeof LIVE_ACTION_KIND;

export const accessControlAbi = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [],
  },
] as const;

export const emergencyPolicyControllerAbi = [
  ...accessControlAbi,
  {
    type: "function",
    name: "proposePlan",
    stateMutability: "nonpayable",
    inputs: [
      { name: "planHash", type: "bytes32" },
      { name: "incidentId", type: "bytes32" },
      { name: "target", type: "address" },
      { name: "kind", type: "uint8" },
      { name: "requiredApprovals", type: "uint16" },
      { name: "expiresAt", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "planHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "planHash", type: "bytes32" },
      { name: "agentOrZero", type: "bytes32" },
      { name: "keyId", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" },
    ],
    outputs: [{ name: "selector", type: "bytes4" }],
  },
  {
    type: "function",
    name: "plans",
    stateMutability: "view",
    inputs: [{ name: "planHash", type: "bytes32" }],
    outputs: [
      { name: "incidentId", type: "bytes32" },
      { name: "expiresAt", type: "uint64" },
      { name: "requiredApprovals", type: "uint16" },
      { name: "approvalCount", type: "uint16" },
      { name: "target", type: "address" },
      { name: "kind", type: "uint8" },
      { name: "executed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "approvals",
    stateMutability: "view",
    inputs: [{ name: "planHash", type: "bytes32" }, { name: "approver", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "PlanProposed",
    inputs: [
      { indexed: true, name: "planHash", type: "bytes32" },
      { indexed: true, name: "incidentId", type: "bytes32" },
      { indexed: true, name: "target", type: "address" },
      { indexed: false, name: "kind", type: "uint8" },
      { indexed: false, name: "requiredApprovals", type: "uint16" },
      { indexed: false, name: "expiresAt", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "PlanApproved",
    inputs: [
      { indexed: true, name: "planHash", type: "bytes32" },
      { indexed: true, name: "approver", type: "address" },
      { indexed: false, name: "newCount", type: "uint16" },
    ],
  },
  {
    type: "event",
    name: "PlanExecuted",
    inputs: [
      { indexed: true, name: "planHash", type: "bytes32" },
      { indexed: true, name: "executor", type: "address" },
    ],
  },
] as const;

export const incidentRegistryAbi = [
  ...accessControlAbi,
  {
    type: "function",
    name: "registerIncident",
    stateMutability: "nonpayable",
    inputs: [{ name: "incidentId", type: "bytes32" }, { name: "planHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "markExecuted",
    stateMutability: "nonpayable",
    inputs: [{ name: "planHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "close",
    stateMutability: "nonpayable",
    inputs: [{ name: "planHash", type: "bytes32" }, { name: "closureHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "incidents",
    stateMutability: "view",
    inputs: [{ name: "incidentId", type: "bytes32" }],
    outputs: [
      { name: "incidentId", type: "bytes32" },
      { name: "planHash", type: "bytes32" },
      { name: "reporter", type: "address" },
      { name: "createdAt", type: "uint64" },
      { name: "blockNumber", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "executed",
    stateMutability: "view",
    inputs: [{ name: "planHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "closures",
    stateMutability: "view",
    inputs: [{ name: "planHash", type: "bytes32" }],
    outputs: [
      { name: "planHash", type: "bytes32" },
      { name: "closureHash", type: "bytes32" },
      { name: "executor", type: "address" },
      { name: "blockNumber", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "IncidentRegistered",
    inputs: [
      { indexed: true, name: "incidentId", type: "bytes32" },
      { indexed: true, name: "planHash", type: "bytes32" },
      { indexed: true, name: "reporter", type: "address" },
      { indexed: false, name: "blockNumber", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "IncidentExecuted",
    inputs: [
      { indexed: true, name: "planHash", type: "bytes32" },
      { indexed: true, name: "executor", type: "address" },
      { indexed: false, name: "blockNumber", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "IncidentClosed",
    inputs: [
      { indexed: true, name: "planHash", type: "bytes32" },
      { indexed: true, name: "closureHash", type: "bytes32" },
      { indexed: true, name: "executor", type: "address" },
      { indexed: false, name: "blockNumber", type: "uint64" },
    ],
  },
] as const;

export interface ApprovalIntent {
  version: 1;
  planHash: Hex;
  chainId: typeof ATLANTIC.id;
  approver: Hex;
  nonce: string;
  expiresAt: number;
}

export function assertLivePlan(plan: ResponsePlan): asserts plan is ResponsePlan & {
  actions: [ResponsePlan["actions"][number] & { kind: LiveActionKind }];
} {
  if (plan.chainId !== ATLANTIC.id) throw new Error(`Live plan must use chain ${ATLANTIC.id}`);
  if (plan.actions.length !== 1) throw new Error("Live plan must contain exactly one action");
  if (!(plan.actions[0].kind in LIVE_ACTION_KIND)) {
    throw new Error(`Unsupported live action: ${plan.actions[0].kind}`);
  }
}

export function formatApprovalIntent(intent: ApprovalIntent): string {
  return [
    "Pharos Incident Response Approval",
    `Version: ${intent.version}`,
    `Plan: ${intent.planHash}`,
    `Chain: ${intent.chainId}`,
    `Approver: ${intent.approver}`,
    `Nonce: ${intent.nonce}`,
    `Expires: ${intent.expiresAt}`,
  ].join("\n");
}
