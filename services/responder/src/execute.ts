import { packAndHash, type ResponsePlan } from "@pharos-incident/policy";
import type { Hex } from "@pharos-incident/policy";
import type { NonceQueue } from "./queue.js";
import { Authorizer } from "./authorize.js";

export interface ExecuteRequest {
  plan: ResponsePlan;
  approver: Hex;
  signature: Hex;
  now: number;
}

export interface ExecuteResult {
  ok: boolean;
  reason?: string;
  txHashes: Hex[];
  nonce: number;
}

export class Executor {
  constructor(private readonly queue: NonceQueue, private readonly authorizer: Authorizer) {}

  enqueue(req: ExecuteRequest): number {
    this.authorizer.submit(req.plan, req.approver, req.signature, req.now);
    if (!this.authorizer.isReady(req.plan)) return -1;
    if (this.queue.hasExecuted(req.plan.planHash)) throw new Error("REPLAY");
    return this.queue.pullNonce();
  }
}

export function closureHashFor(plan: ResponsePlan, postStateDigest: Hex): Hex {
  return packAndHash(
    ["bytes32", "uint256", "bytes32"],
    [plan.planHash, BigInt(plan.actions.length), postStateDigest],
  );
}
