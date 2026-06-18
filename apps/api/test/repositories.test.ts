import { readFile } from "node:fs/promises";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";
import type { Incident, ResponsePlan } from "@pharos-incident/policy";
import { applyMigrations } from "../src/migrate.js";
import { Repositories } from "../src/repositories.js";

const incident: Incident = {
  id: ("0x" + "11".repeat(32)) as `0x${string}`,
  chainId: 688689,
  subject: "0x0000000000000000000000000000000000000001",
  signals: [],
  createdAt: 1_800_000_000_000,
};
const plan: ResponsePlan = {
  incidentId: incident.id,
  chainId: 688689,
  actions: [{
    kind: "PAUSE_AGENT",
    target: incident.subject,
    calldata: "0x12345678",
    value: 0n,
    reasonHash: ("0x" + "22".repeat(32)) as `0x${string}`,
  }],
  expiresAt: 1_800_000_900_000,
  requiredApprovals: 2,
  planHash: ("0x" + "33".repeat(32)) as `0x${string}`,
};

let pool: any;
let repositories: Repositories;

beforeEach(async () => {
  const db = newDb();
  const adapter = db.adapters.createPg();
  pool = new adapter.Pool();
  const sql = await readFile(new URL("../src/migrations/001_live_transactions.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  await client.query(sql);
  client.release();
  repositories = new Repositories(pool);
});

describe("Repositories", () => {
  it("persists incidents and bigint-containing plans", async () => {
    await repositories.createIncident(incident);
    await repositories.createPlan(plan);

    await expect(repositories.getIncident(incident.id)).resolves.toEqual(incident);
    await expect(repositories.getPlan(plan.planHash)).resolves.toEqual(plan);
  });

  it("issues and atomically consumes an approval nonce once", async () => {
    const signer = "0x0000000000000000000000000000000000000002" as const;
    const approval = await repositories.issueApprovalNonce({
      chainId: 688689,
      planHash: plan.planHash,
      signer,
      expiresAt: Date.now() + 60_000,
    });

    const consumed = await repositories.consumeApprovalNonce({
      id: approval.id,
      signature: ("0x" + "44".repeat(65)) as `0x${string}`,
      now: Date.now(),
    });
    expect(consumed.status).toBe("verified");
    await expect(repositories.consumeApprovalNonce({
      id: approval.id,
      signature: ("0x" + "44".repeat(65)) as `0x${string}`,
      now: Date.now(),
    })).rejects.toThrow(/nonce/i);
  });

  it("reserves distinct sequential relayer nonces concurrently", async () => {
    const sender = "0x0000000000000000000000000000000000000003" as const;
    const values = await Promise.all([
      repositories.reserveRelayerNonce(688689, sender, 7n),
      repositories.reserveRelayerNonce(688689, sender, 7n),
      repositories.reserveRelayerNonce(688689, sender, 7n),
    ]);
    expect(values.map(Number).sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });

  it("persists legal transaction state transitions", async () => {
    const created = await repositories.createTransaction({
      purpose: "register_incident",
      referenceId: plan.planHash,
      chainId: 688689,
      sender: "0x0000000000000000000000000000000000000003",
      nonce: 12n,
    });
    const hash = ("0x" + "55".repeat(32)) as `0x${string}`;
    await repositories.markTransactionPending(created.id, hash);
    await repositories.markTransactionConfirmed(hash, {
      blockNumber: 123n,
      blockHash: ("0x" + "66".repeat(32)) as `0x${string}`,
      gasUsed: 45_000n,
      receipt: { status: "success" },
      decodedLogs: [{ eventName: "IncidentRegistered" }],
    });

    const record = await repositories.getTransactionByHash(hash);
    expect(record).toMatchObject({ status: "confirmed", blockNumber: 123n, gasUsed: 45_000n });
    await expect(repositories.markTransactionFailed(hash, "REVERTED", "late failure"))
      .rejects.toThrow(/terminal/i);
  });
});
