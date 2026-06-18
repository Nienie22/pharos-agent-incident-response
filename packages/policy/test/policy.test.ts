import { describe, expect, it } from "vitest";
import {
  PlanSchema,
  buildPlan,
  isPlanExpired,
  bucketScore,
  computePlanHash,
  requiredApprovalsFor,
  PolicyError,
} from "../src/index.js";
import type { Incident, ResponseAction } from "../src/index.js";
import { idFromInputs } from "../src/plan.js";

const incident: Incident = {
  id: idFromInputs(["incident", "1"]) as `0x${string}`,
  chainId: 1,
  subject: "0x0000000000000000000000000000000000000abc",
  createdAt: 1_700_000_000_000,
  signals: [
    {
      source: "goplus",
      observedAt: 1_700_000_000_000,
      subject: "0x0000000000000000000000000000000000000abc",
      type: "MALICIOUS_APPROVAL",
      severity: 95,
      evidenceHash: "0x" + "11".repeat(32),
      confidenceBps: 9500,
    },
  ],
};

const baseAction: Omit<ResponseAction, "reasonHash"> = {
  kind: "REVOKE_APPROVAL",
  target: "0x0000000000000000000000000000000000000def",
  calldata: "0x095ea7b3" + "00".repeat(64),
  value: 0n,
};

describe("policy.score", () => {
  it("buckets CRITICAL at >= 300", () => {
    expect(bucketScore(0)).toBe("INFO");
    expect(bucketScore(49)).toBe("INFO");
    expect(bucketScore(50)).toBe("SUSPICIOUS");
    expect(bucketScore(149)).toBe("SUSPICIOUS");
    expect(bucketScore(150)).toBe("HIGH");
    expect(bucketScore(299)).toBe("HIGH");
    expect(bucketScore(300)).toBe("CRITICAL");
    expect(bucketScore(9999)).toBe("CRITICAL");
  });

  it("returns the right approval thresholds", () => {
    expect(requiredApprovalsFor("INFO")).toBe(0);
    expect(requiredApprovalsFor("SUSPICIOUS")).toBe(0);
    expect(requiredApprovalsFor("HIGH")).toBe(1);
    expect(requiredApprovalsFor("CRITICAL")).toBe(2);
  });
});

describe("policy.plan", () => {
  it("builds a valid plan", () => {
    const plan = buildPlan({
      incident,
      actions: [baseAction],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 9500,
      now: 1_700_000_000_000,
      ttlSeconds: 1800,
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.requiredApprovals).toBe(2); // CRITICAL
    expect(plan.expiresAt).toBe(1_700_001_800_000);
    expect(plan.planHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => PlanSchema.parse(plan)).not.toThrow();
  });

  it("rejects unknown actions", () => {
    expect(() =>
      buildPlan({
        incident,
        actions: [
          {
            kind: "STEAL_FUNDS" as any,
            target: baseAction.target,
            calldata: baseAction.calldata,
            value: 0n,
          },
        ],
        unconfirmedCount: 0,
        confirmedSafeCount: 0,
        goplusCoverageBps: 0,
        now: 1,
        ttlSeconds: 60,
      }),
    ).toThrow(PolicyError);
  });

  it("rejects empty action list", () => {
    expect(() =>
      buildPlan({
        incident,
        actions: [],
        unconfirmedCount: 0,
        confirmedSafeCount: 0,
        goplusCoverageBps: 0,
        now: 1,
        ttlSeconds: 60,
      }),
    ).toThrowError(new PolicyError("at least one action is required", "EMPTY_ACTIONS"));
  });

  it("marks expired plans", () => {
    const plan = buildPlan({
      incident,
      actions: [baseAction],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 0,
      now: 100,
      ttlSeconds: 60,
    });
    expect(isPlanExpired(plan, 100)).toBe(false);
    expect(isPlanExpired(plan, 160_000)).toBe(true);
  });

  it("is deterministic across calls", () => {
    const a = buildPlan({
      incident,
      actions: [baseAction],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 0,
      now: 100,
      ttlSeconds: 60,
    });
    const b = buildPlan({
      incident,
      actions: [baseAction],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 0,
      now: 100,
      ttlSeconds: 60,
    });
    expect(a.planHash).toBe(b.planHash);
  });

  it("plan hash changes when an action is added", () => {
    const a = buildPlan({
      incident,
      actions: [baseAction],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 0,
      now: 100,
      ttlSeconds: 60,
    });
    const b = buildPlan({
      incident,
      actions: [
        baseAction,
        { ...baseAction, kind: "SNAPSHOT", target: incident.subject },
      ],
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 0,
      now: 100,
      ttlSeconds: 60,
    });
    expect(a.planHash).not.toBe(b.planHash);
  });

  it("exposes a public computePlanHash helper", () => {
    const a = computePlanHash({
      incidentId: incident.id,
      chainId: 1,
      actions: [],
      expiresAt: 0,
      requiredApprovals: 0,
    });
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
