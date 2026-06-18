import type {
  ActionKind,
  Hex,
  Incident,
  ResponseAction,
  ResponsePlan,
} from "./types.js";
import { hashAction, hashString, packAndHash } from "./hashes.js";
import {
  bucketScore,
  requiredApprovalsFor,
  scoreIncident,
} from "./score.js";

export class PolicyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PolicyError";
  }
}

const ALLOWLIST: ReadonlySet<ActionKind> = new Set([
  "PAUSE_AGENT",
  "REVOKE_APPROVAL",
  "REMOVE_EXECUTOR",
  "ROTATE_KEY_METADATA",
  "SNAPSHOT",
]);

export interface BuildPlanInput {
  incident: Incident;
  actions: Omit<ResponseAction, "reasonHash">[];
  unconfirmedCount: number;
  confirmedSafeCount: number;
  goplusCoverageBps: number;
  now: number;
  ttlSeconds: number;
  safeRecipients?: Hex[]; // optional denylist; here used as a no-op stub
}

export function buildPlan(input: BuildPlanInput): ResponsePlan {
  const score = scoreIncident({
    signals: input.incident.signals,
    now: input.now,
    unconfirmedCount: input.unconfirmedCount,
    confirmedSafeCount: input.confirmedSafeCount,
    goplusCoverageBps: input.goplusCoverageBps,
  });
  const severity = bucketScore(score);
  const requiredApprovals = requiredApprovalsFor(severity);

  if (input.actions.length === 0) {
    throw new PolicyError("at least one action is required", "EMPTY_ACTIONS");
  }
  for (const a of input.actions) {
    if (!ALLOWLIST.has(a.kind)) {
      throw new PolicyError(`unknown action kind: ${a.kind}`, "UNKNOWN_ACTION");
    }
    if (!a.target.startsWith("0x") || a.target.length !== 42) {
      throw new PolicyError(`invalid target: ${a.target}`, "BAD_TARGET");
    }
    if (!a.calldata.startsWith("0x") || a.calldata.length < 10) {
      throw new PolicyError(`invalid calldata for ${a.kind}`, "BAD_CALLDATA");
    }
    if (a.value < 0n) {
      throw new PolicyError(`negative value for ${a.kind}`, "BAD_VALUE");
    }
  }
  const expiresAt = input.now + input.ttlSeconds * 1000;

  const enriched: ResponseAction[] = input.actions.map((a) => ({
    ...a,
    reasonHash: packAndHash(
      ["bytes32", "string", "address"],
      [input.incident.id, a.kind, a.target],
    ),
  }));

  const planHash = computePlanHash({
    incidentId: input.incident.id,
    chainId: input.incident.chainId,
    actions: enriched,
    expiresAt,
    requiredApprovals,
  });

  return {
    incidentId: input.incident.id,
    chainId: input.incident.chainId,
    actions: enriched,
    expiresAt,
    requiredApprovals,
    planHash,
  };
}

export function isPlanExpired(plan: ResponsePlan, now: number): boolean {
  return now >= plan.expiresAt;
}

export function computePlanHash(p: {
  incidentId: Hex;
  chainId: number;
  actions: ResponseAction[];
  expiresAt: number;
  requiredApprovals: number;
}): Hex {
  const actionHashes = p.actions
    .map((a) => hashAction(a))
    .map((h) => h.slice(2))
    .join("");
  return packAndHash(
    ["bytes32", "uint256", "uint256", "uint256", "string"],
    [
      p.incidentId,
      BigInt(p.chainId),
      BigInt(p.expiresAt),
      BigInt(p.requiredApprovals),
      "0x" + actionHashes,
    ],
  );
}

export function actionSummary(plan: ResponsePlan): string {
  return plan.actions
    .map((a) => `${a.kind}@${a.target}:${a.calldata.slice(0, 10)}…`)
    .join("|");
}

// Tiny helper used by tests
export function idFromInputs(parts: string[]): Hex {
  return hashString(parts.join(":"));
}
