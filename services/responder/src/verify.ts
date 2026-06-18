import type { ResponsePlan } from "@pharos-incident/policy";
import type { Hex } from "@pharos-incident/policy";
import { closureHashFor } from "./execute.js";

export interface ClosureReceipt {
  planHash: Hex;
  closureHash: Hex;
  verifiedAt: number;
  ok: boolean;
}

export function buildClosureReceipt(plan: ResponsePlan, postStateDigest: Hex, now: number): ClosureReceipt {
  return {
    planHash: plan.planHash,
    closureHash: closureHashFor(plan, postStateDigest),
    verifiedAt: now,
    ok: true,
  };
}
