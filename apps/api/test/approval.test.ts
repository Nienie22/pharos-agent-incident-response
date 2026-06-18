import { readFile } from "node:fs/promises";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { emergencyPolicyControllerAbi, formatApprovalIntent, type ApprovalIntent } from "@pharos-incident/sdk";
import { ApprovalService, type ApprovalChainReader } from "../src/approval.js";
import { Repositories } from "../src/repositories.js";

const account = privateKeyToAccount(("0x" + "0".repeat(63) + "1") as `0x${string}`);
const other = privateKeyToAccount(("0x" + "0".repeat(63) + "2") as `0x${string}`);
const planHash = ("0x" + "11".repeat(32)) as `0x${string}`;
const controller = "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d";

let repositories: Repositories;
let chain: ApprovalChainReader;
let service: ApprovalService;

beforeEach(async () => {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const sql = await readFile(new URL("../src/migrations/001_live_transactions.sql", import.meta.url), "utf8");
  await pool.query(sql);
  repositories = new Repositories(pool as never);
  chain = {
    hasApproverRole: vi.fn().mockResolvedValue(true),
    getTransaction: vi.fn(),
    getTransactionReceipt: vi.fn(),
  };
  service = new ApprovalService(repositories, chain, controller);
});

async function issue(): Promise<{ id: string; intent: ApprovalIntent; signature: `0x${string}` }> {
  const record = await repositories.issueApprovalNonce({
    chainId: 688689,
    planHash,
    signer: account.address,
    expiresAt: Date.now() + 60_000,
  });
  const intent: ApprovalIntent = {
    version: 1,
    planHash,
    chainId: 688689,
    approver: account.address,
    nonce: record.nonce,
    expiresAt: record.expiresAt,
  };
  const signature = await account.signMessage({ message: formatApprovalIntent(intent) });
  return { id: record.id, intent, signature };
}

describe("ApprovalService", () => {
  it("recovers an authorized signer and consumes the nonce", async () => {
    const input = await issue();
    const verified = await service.verifyIntent(input.id, input.intent, input.signature, Date.now());

    expect(verified.status).toBe("verified");
    expect(chain.hasApproverRole).toHaveBeenCalledWith(account.address);
    await expect(service.verifyIntent(input.id, input.intent, input.signature, Date.now()))
      .rejects.toThrow(/nonce|consumed/i);
  });

  it("rejects a signature from a different wallet without consuming the nonce", async () => {
    const input = await issue();
    const wrongSignature = await other.signMessage({ message: formatApprovalIntent(input.intent) });
    await expect(service.verifyIntent(input.id, input.intent, wrongSignature, Date.now()))
      .rejects.toThrow(/signer/i);

    await expect(service.verifyIntent(input.id, input.intent, input.signature, Date.now()))
      .resolves.toMatchObject({ status: "verified" });
  });

  it("rejects an expired intent and a signer without APPROVER_ROLE", async () => {
    const expired = await issue();
    await expect(service.verifyIntent(expired.id, expired.intent, expired.signature, expired.intent.expiresAt + 1))
      .rejects.toThrow(/expired/i);

    const unauthorized = await issue();
    vi.mocked(chain.hasApproverRole).mockResolvedValue(false);
    await expect(service.verifyIntent(unauthorized.id, unauthorized.intent, unauthorized.signature, Date.now()))
      .rejects.toThrow(/APPROVER_ROLE/i);
  });

  it("confirms only a successful matching approve transaction and event", async () => {
    const input = await issue();
    await service.verifyIntent(input.id, input.intent, input.signature, Date.now());
    const txHash = ("0x" + "55".repeat(32)) as `0x${string}`;
    vi.mocked(chain.getTransaction).mockResolvedValue({
      from: account.address,
      to: controller,
      input: encodeFunctionData({ abi: emergencyPolicyControllerAbi, functionName: "approve", args: [planHash] }),
    });
    vi.mocked(chain.getTransactionReceipt).mockResolvedValue({
      status: "success",
      logs: [{
        address: controller,
        topics: encodeEventTopics({
          abi: emergencyPolicyControllerAbi,
          eventName: "PlanApproved",
          args: { planHash, approver: account.address },
        }),
        data: encodeAbiParameters([{ type: "uint16" }], [1]),
      }],
    });

    await expect(service.confirmApproval(input.id, txHash)).resolves.toMatchObject({
      status: "confirmed",
      txHash,
    });
  });

  it("rejects reverted or mismatched approval transactions", async () => {
    const input = await issue();
    await service.verifyIntent(input.id, input.intent, input.signature, Date.now());
    const txHash = ("0x" + "66".repeat(32)) as `0x${string}`;
    vi.mocked(chain.getTransaction).mockResolvedValue({
      from: other.address,
      to: controller,
      input: "0x",
    });
    vi.mocked(chain.getTransactionReceipt).mockResolvedValue({ status: "reverted", logs: [] });

    await expect(service.confirmApproval(input.id, txHash)).rejects.toThrow(/reverted|sender/i);
  });
});
