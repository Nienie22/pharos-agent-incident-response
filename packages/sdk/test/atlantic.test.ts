import { describe, expect, it } from "vitest";
import type { ResponsePlan } from "@pharos-incident/policy";
import {
  ATLANTIC,
  LIVE_ACTION_KIND,
  assertLivePlan,
  formatApprovalIntent,
  type ApprovalIntent,
} from "../src/atlantic.js";

const planHash = ("0x" + "11".repeat(32)) as `0x${string}`;
const approver = ("0x" + "22".repeat(20)) as `0x${string}`;

function plan(kind: ResponsePlan["actions"][number]["kind"] = "PAUSE_AGENT"): ResponsePlan {
  return {
    incidentId: ("0x" + "33".repeat(32)) as `0x${string}`,
    chainId: ATLANTIC.id,
    actions: [{
      kind,
      target: approver,
      calldata: "0x12345678",
      value: 0n,
      reasonHash: ("0x" + "44".repeat(32)) as `0x${string}`,
    }],
    expiresAt: 1_800_000_000_000,
    requiredApprovals: 2,
    planHash,
  };
}

describe("Atlantic live contract metadata", () => {
  it("exports the confirmed Atlantic network and deployment", () => {
    expect(ATLANTIC).toMatchObject({
      id: 688689,
      rpcUrl: "https://atlantic.dplabs-internal.com",
      explorerUrl: "https://atlantic.pharosscan.xyz",
      contracts: {
        incidentRegistry: "0x0d93b5cD4356652ef6b4776949A86979e9c00cdE",
        emergencyPolicyController: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
        agentRegistry: "0x2d1B360dec14e63846735939E793bcb1655Aa93b",
      },
    });
  });

  it("maps only action kinds implemented by the deployed controller", () => {
    expect(LIVE_ACTION_KIND).toEqual({
      PAUSE_AGENT: 0,
      REMOVE_EXECUTOR: 2,
      ROTATE_KEY_METADATA: 3,
    });
  });

  it("rejects unsupported and multi-action live plans", () => {
    expect(() => assertLivePlan(plan("SNAPSHOT"))).toThrow(/unsupported live action/i);
    const multiple = plan();
    multiple.actions.push({ ...multiple.actions[0] });
    expect(() => assertLivePlan(multiple)).toThrow(/exactly one action/i);
  });
});

describe("approval intent", () => {
  it("formats a deterministic versioned EIP-191 message", () => {
    const intent: ApprovalIntent = {
      version: 1,
      planHash,
      chainId: 688689,
      approver,
      nonce: "abc123",
      expiresAt: 1_800_000_000_000,
    };

    expect(formatApprovalIntent(intent)).toBe([
      "Pharos Incident Response Approval",
      "Version: 1",
      `Plan: ${planHash}`,
      "Chain: 688689",
      `Approver: ${approver}`,
      "Nonce: abc123",
      "Expires: 1800000000000",
    ].join("\n"));
  });
});
