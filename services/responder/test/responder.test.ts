import { describe, expect, it } from "vitest";
import { Authorizer } from "../src/authorize.js";
import { NonceQueue } from "../src/queue.js";
import { Executor, closureHashFor } from "../src/execute.js";
import { buildClosureReceipt } from "../src/verify.js";
import { DefaultSimulator, type SimResult } from "../src/simulate.js";
import type { ResponseAction, ResponsePlan } from "@pharos-incident/policy";

const plan: ResponsePlan = {
  incidentId: "0x" + "11".repeat(32),
  chainId: 1,
  actions: [
    {
      kind: "PAUSE_AGENT",
      target: "0x0000000000000000000000000000000000000abc",
      calldata: "0x" + "00".repeat(8),
      value: 0n,
      reasonHash: "0x" + "22".repeat(32),
    },
  ],
  expiresAt: 1_700_000_000_000,
  requiredApprovals: 1,
  planHash: "0x" + "33".repeat(32),
};

describe("responder.authorize", () => {
  it("rejects expired plan submissions", () => {
    const a = new Authorizer();
    expect(() =>
      a.submit(plan, "0x" + "44".repeat(20), "0x" + "55".repeat(65), plan.expiresAt + 1),
    ).toThrow(/PLAN_EXPIRED/);
  });

  it("becomes ready when threshold is met", () => {
    const a = new Authorizer();
    a.submit(plan, "0x" + "44".repeat(20), "0x" + "55".repeat(65), plan.expiresAt - 1);
    expect(a.isReady(plan)).toBe(true);
  });
});

describe("responder.queue", () => {
  it("detects nonce collisions", () => {
    const q = new NonceQueue();
    q.enqueue(plan.actions[0] as ResponseAction, 0);
    expect(() => q.enqueue(plan.actions[0] as ResponseAction, 0)).toThrow(/NONCE_COLLISION/);
  });
  it("replay protection via executed set", () => {
    const q = new NonceQueue();
    q.markExecuted(plan.planHash, 0);
    expect(q.hasExecuted(plan.planHash)).toBe(true);
  });
});

describe("responder.execute", () => {
  it("rejects replay", () => {
    const q = new NonceQueue();
    const a = new Authorizer();
    const e = new Executor(q, a);
    q.markExecuted(plan.planHash, 0);
    expect(() =>
      e.enqueue({
        plan,
        approver: "0x" + "44".repeat(20),
        signature: "0x" + "55".repeat(65),
        now: plan.expiresAt - 1,
      }),
    ).toThrow(/REPLAY/);
  });
});

describe("responder.verify", () => {
  it("closure hash is deterministic", () => {
    const digest = "0x" + "66".repeat(32);
    const a = closureHashFor(plan, digest);
    const b = closureHashFor(plan, digest);
    expect(a).toBe(b);
    const r = buildClosureReceipt(plan, digest, 1);
    expect(r.closureHash).toBe(a);
  });
});

describe("responder.simulate", () => {
  it("runs all actions", async () => {
    const sim = new DefaultSimulator();
    const out = await sim.simulate(plan, async (a) => ({
      ok: true,
      postStateDigest: ("0x" + "77".repeat(32)) as `0x${string}`,
      warnings: [a.kind],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].warnings).toContain("PAUSE_AGENT");
  });
});
