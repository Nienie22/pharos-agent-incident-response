import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import { ChainGateway } from "../src/chain.js";

const hash = ("0x" + "11".repeat(32)) as `0x${string}`;
const config: AppConfig = {
  rpcUrl: "https://rpc.invalid",
  chainId: 688689,
  explorerUrl: "https://atlantic.pharosscan.xyz",
  incidentRegistryAddress: "0x0d93b5cD4356652ef6b4776949A86979e9c00cdE",
  controllerAddress: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
  agentRegistryAddress: "0x2d1B360dec14e63846735939E793bcb1655Aa93b",
  relayerPrivateKey: ("0x" + "0".repeat(63) + "1") as `0x${string}`,
  relayerAddress: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  databaseUrl: "postgres://unused",
  confirmations: 2,
  receiptTimeoutMs: 10_000,
};

function harness(receipt: unknown = {
  status: "success",
  blockNumber: 123n,
  blockHash: "0x" + "22".repeat(32),
  gasUsed: 45_000n,
  logs: [],
}) {
  const calls: string[] = [];
  const repositories = {
    reserveRelayerNonce: vi.fn(async () => { calls.push("reserve"); return 7n; }),
    createTransaction: vi.fn(async () => { calls.push("create"); return { id: "tx-id" }; }),
    markTransactionPending: vi.fn(async (_id, txHash) => { calls.push("pending"); return { id: "tx-id", txHash, status: "pending" }; }),
    markTransactionConfirmed: vi.fn(async (_txHash, evidence) => { calls.push("confirmed"); return { id: "tx-id", txHash: _txHash, status: "confirmed", ...evidence }; }),
    markTransactionFailed: vi.fn(async (_txHash, code, message) => { calls.push("failed"); return { id: "tx-id", txHash: _txHash, status: "failed", errorCode: code, errorMessage: message }; }),
  };
  const publicClient = {
    getTransactionCount: vi.fn().mockResolvedValue(7),
    simulateContract: vi.fn(async () => { calls.push("simulate"); return { request: { gas: 100_000n } }; }),
    waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getChainId: vi.fn().mockResolvedValue(688689),
    getBytecode: vi.fn().mockResolvedValue("0x1234"),
    getBalance: vi.fn().mockResolvedValue(1_000_000n),
    readContract: vi.fn().mockResolvedValue(true),
    getTransaction: vi.fn(),
    getTransactionReceipt: vi.fn(),
  };
  const walletClient = {
    writeContract: vi.fn(async () => { calls.push("broadcast"); return hash; }),
  };
  const gateway = new ChainGateway(config, repositories as never, { publicClient, walletClient } as never);
  return { gateway, repositories, publicClient, walletClient, calls };
}

describe("ChainGateway", () => {
  it("persists and confirms a successful registry write", async () => {
    const h = harness();
    const result = await h.gateway.registerIncident(
      ("0x" + "33".repeat(32)) as `0x${string}`,
      ("0x" + "44".repeat(32)) as `0x${string}`,
    );

    expect(result.status).toBe("confirmed");
    expect(result.txHash).toBe(hash);
    expect(h.calls).toEqual(["reserve", "create", "simulate", "broadcast", "pending", "confirmed"]);
    expect(h.publicClient.waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({
      hash,
      confirmations: 2,
      timeout: 10_000,
    }));
  });

  it("keeps a broadcast transaction pending when receipt waiting times out", async () => {
    const h = harness();
    const timeout = new Error("Timed out waiting for receipt");
    timeout.name = "WaitForTransactionReceiptTimeoutError";
    h.publicClient.waitForTransactionReceipt.mockRejectedValue(timeout);

    const result = await h.gateway.markExecuted(("0x" + "44".repeat(32)) as `0x${string}`);

    expect(result.status).toBe("pending");
    expect(h.repositories.markTransactionFailed).not.toHaveBeenCalled();
  });

  it("records a reverted receipt as failed", async () => {
    const h = harness({
      status: "reverted",
      blockNumber: 124n,
      blockHash: "0x" + "55".repeat(32),
      gasUsed: 50_000n,
      logs: [],
    });

    const result = await h.gateway.closeIncident(
      ("0x" + "44".repeat(32)) as `0x${string}`,
      ("0x" + "66".repeat(32)) as `0x${string}`,
    );

    expect(result.status).toBe("failed");
    expect(h.repositories.markTransactionFailed).toHaveBeenCalledWith(hash, "REVERTED", expect.any(String), expect.anything());
  });

  it("checks chain, bytecode, role and balance in health", async () => {
    const h = harness();
    const health = await h.gateway.health();
    expect(health).toEqual({
      chainId: 688689,
      chainOk: true,
      contractsOk: true,
      rolesOk: true,
      relayerBalance: 1_000_000n,
    });
    expect(h.publicClient.getBytecode).toHaveBeenCalledTimes(3);
  });
});
