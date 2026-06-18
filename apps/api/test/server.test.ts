import { describe, expect, it, vi } from "vitest";
import { buildServer, type ServerDependencies } from "../src/server.js";

const incidentId = ("0x" + "11".repeat(32)) as `0x${string}`;
const planHash = ("0x" + "22".repeat(32)) as `0x${string}`;
const txHash = ("0x" + "33".repeat(32)) as `0x${string}`;
const closureHash = ("0x" + "44".repeat(32)) as `0x${string}`;
const subject = "0x0000000000000000000000000000000000000001" as const;

function dependencies(): ServerDependencies {
  const incident = {
    id: incidentId,
    chainId: 688689,
    subject,
    signals: [],
    createdAt: Date.now(),
  };
  const plan = {
    incidentId,
    chainId: 688689,
    actions: [{ kind: "PAUSE_AGENT", target: subject, calldata: "0x12345678", value: 0n, reasonHash: closureHash }],
    expiresAt: Date.now() + 60_000,
    requiredApprovals: 2,
    planHash,
  } as const;
  return {
    repositories: {
      createIncident: vi.fn(),
      getIncident: vi.fn().mockResolvedValue(incident),
      getPlan: vi.fn().mockResolvedValue(plan),
      issueApprovalNonce: vi.fn().mockResolvedValue({
        id: "intent-1", chainId: 688689, planHash, signer: subject,
        nonce: "nonce-1234567890abcdef", expiresAt: Date.now() + 60_000, signature: null, status: "issued", txHash: null,
      }),
      getTransactionByHash: vi.fn().mockResolvedValue({ status: "confirmed", txHash }),
      getClosure: vi.fn().mockResolvedValue({ closureHash, document: { version: 1 } }),
    } as never,
    orchestrator: {
      propose: vi.fn().mockResolvedValue({
        plan,
        status: "confirmed",
        transaction: { status: "confirmed", txHash, explorerUrl: `https://atlantic.pharosscan.xyz/tx/${txHash}` },
      }),
      execute: vi.fn().mockResolvedValue({ status: "confirmed", txHash, closureHash, verification: { executed: true } }),
    } as never,
    approval: {
      verifyIntent: vi.fn().mockResolvedValue({ id: "intent-1", status: "verified", signer: subject }),
      confirmApproval: vi.fn().mockResolvedValue({ id: "intent-1", status: "confirmed", signer: subject, txHash }),
    } as never,
    chain: {
      health: vi.fn().mockResolvedValue({ chainId: 688689, chainOk: true, contractsOk: true, rolesOk: true, relayerBalance: 1n }),
      verifyIncident: vi.fn().mockResolvedValue({
        incident: [incidentId, planHash, subject, 1n, 1n],
        executed: true,
        closure: [planHash, closureHash, subject, 2n],
        controllerPlan: [incidentId, 1n, 2, 2, subject, 0, true],
      }),
      reconcileTransaction: vi.fn(),
    } as never,
    databaseHealth: vi.fn().mockResolvedValue(true),
  };
}

describe("live API", () => {
  it("persists detection on Atlantic", async () => {
    const deps = dependencies();
    const app = buildServer({ dependencies: deps });
    const response = await app.inject({
      method: "POST",
      url: "/detect",
      payload: {
        subject,
        rawSignals: [{
          source: "goplus", type: "MALICIOUS_APPROVAL", severity: 95,
          confidenceBps: 9500, evidenceHash: closureHash, observedAt: Date.now(),
        }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().chainId).toBe(688689);
    expect(deps.repositories.createIncident).toHaveBeenCalledOnce();
  });

  it("exposes separate approval intent and receipt confirmation routes", async () => {
    const deps = dependencies();
    const app = buildServer({ dependencies: deps });
    const nonce = await app.inject({ method: "POST", url: "/approvals/nonce", payload: { planHash, approver: subject } });
    expect(nonce.statusCode).toBe(200);
    expect(nonce.json()).toMatchObject({ version: 1, chainId: 688689, nonce: "nonce-1234567890abcdef", intentId: "intent-1" });

    const intent = { version: 1, planHash, chainId: 688689, approver: subject, nonce: "nonce-1234567890abcdef", expiresAt: nonce.json().expiresAt };
    const verified = await app.inject({ method: "POST", url: "/approve", payload: { intentId: "intent-1", intent, signature: "0x1234" } });
    expect(verified.json().status).toBe("verified");

    const confirmed = await app.inject({ method: "POST", url: "/approve/confirm", payload: { intentId: "intent-1", txHash } });
    expect(confirmed.json()).toMatchObject({ status: "confirmed", txHash });
  });

  it("returns tracked execution and verifies registry state", async () => {
    const deps = dependencies();
    const app = buildServer({ dependencies: deps });
    const execution = await app.inject({ method: "POST", url: "/execute", payload: { planHash } });
    expect(execution.json()).toMatchObject({ status: "confirmed", txHash, closureHash });

    const verification = await app.inject({ method: "GET", url: `/verify/${planHash}` });
    expect(verification.json()).toMatchObject({ ok: true, closureHash });
    expect(verification.json().onChain.executed).toBe(true);
  });

  it("reports database, RPC, contracts and relayer role health", async () => {
    const app = buildServer({ dependencies: dependencies() });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.json()).toMatchObject({
      ok: true,
      database: true,
      rpc: true,
      contracts: true,
      roles: true,
    });
  });

  it("rejects malformed payloads with 400", async () => {
    const app = buildServer({ dependencies: dependencies() });
    const response = await app.inject({ method: "POST", url: "/detect", payload: { subject: "bad", rawSignals: [] } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_failed");
  });
});
