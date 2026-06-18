import { describe, expect, it } from "vitest";
import { MockClient, freshDemoState, DEMO_APPROVER, DEMO_RESPONDER, makeDemoSignature } from "../src/lib/MockClient.js";
import type { Hex } from "@pharos-incident/policy";

describe("MockClient", () => {
  it("seeds the demo state with 3 incidents", () => {
    const state = freshDemoState();
    expect(state.incidents.length).toBe(3);
    expect(state.log.length).toBe(1);
  });

  it("triages a seeded CRITICAL incident", async () => {
    const state = freshDemoState();
    const c = new MockClient(state);
    const first = state.incidents[0];
    const r = await c.triage(first.id);
    expect(["CRITICAL", "HIGH", "SUSPICIOUS", "INFO"]).toContain(r.severity);
    expect(r.score).toBeGreaterThan(0);
  });

  it("runs a full propose -> simulate -> approve -> execute -> verify -> close flow", async () => {
    const state = freshDemoState();
    const c = new MockClient(state);
    const inc = state.incidents.find((i) => i.signals.some((s) => s.severity >= 80))!;
    expect(inc).toBeTruthy();
    const plan = await c.propose(inc.id);
    expect(plan.requiredApprovals).toBeGreaterThanOrEqual(1);
    const sim = await c.simulate(plan.planHash);
    expect(sim.ok).toBe(true);
    for (let i = 0; i < plan.requiredApprovals; i++) {
      const approver = i % 2 === 0 ? DEMO_APPROVER : DEMO_RESPONDER;
      // eslint-disable-next-line no-await-in-loop
      const r = await c.approve({ planHash: plan.planHash, approver, signature: makeDemoSignature("k" + i) });
      if (i < plan.requiredApprovals - 1) expect(r.ready).toBe(false);
      else expect(r.ready).toBe(true);
    }
    const exec = await c.execute({ planHash: plan.planHash, approver: DEMO_APPROVER, signature: makeDemoSignature("exec") });
    expect(exec.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const verify = await c.verify(plan.planHash);
    expect(verify.ok).toBe(true);
    const close = await c.close(plan.planHash);
    expect(close.receipt).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("refuses execute when approvals are missing", async () => {
    const state = freshDemoState();
    const c = new MockClient(state);
    const inc = state.incidents.find((i) => i.signals.some((s) => s.severity >= 80))!;
    const plan = await c.propose(inc.id);
    if (plan.requiredApprovals >= 1) {
      await expect(
        c.execute({ planHash: plan.planHash, approver: DEMO_APPROVER, signature: makeDemoSignature("x") })
      ).rejects.toThrow();
    }
  });

  it("detect creates a new incident and pushes to log", async () => {
    const state = freshDemoState();
    const c = new MockClient(state);
    const before = state.incidents.length;
    const subject = ("0x" + "ab".repeat(20)) as Hex;
    const inc = await c.detect({
      subject,
      rawSignals: [
        {
          source: "goplus",
          type: "TEST_SIGNAL",
          severity: 50,
          confidenceBps: 8000,
          evidenceHash: ("0x" + "cd".repeat(32)) as Hex,
          observedAt: Date.now(),
        },
      ],
    });
    expect(state.incidents.length).toBe(before + 1);
    expect(inc.subject).toBe(subject);
  });
});