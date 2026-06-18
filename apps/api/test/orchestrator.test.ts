import { readFile } from "node:fs/promises";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "@pharos-incident/policy";
import { IncidentOrchestrator, type OrchestratorChain } from "../src/orchestrator.js";
import { Repositories } from "../src/repositories.js";

const incident: Incident = {
  id: ("0x" + "11".repeat(32)) as `0x${string}`,
  chainId: 688689,
  subject: "0x0000000000000000000000000000000000000001",
  signals: [{
    source: "goplus",
    type: "MALICIOUS_APPROVAL",
    severity: 95,
    confidenceBps: 9500,
    evidenceHash: ("0x" + "22".repeat(32)) as `0x${string}`,
    subject: "0x0000000000000000000000000000000000000001",
    observedAt: 1_800_000_000_000,
  }],
  createdAt: 1_800_000_000_000,
};

const tx = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as `0x${string}`;
let repositories: Repositories;
let chain: OrchestratorChain;
let orchestrator: IncidentOrchestrator;

beforeEach(async () => {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const sql = await readFile(new URL("../src/migrations/001_live_transactions.sql", import.meta.url), "utf8");
  await pool.query(sql);
  repositories = new Repositories(pool as never);
  chain = {
    registerIncident: vi.fn().mockResolvedValue({ status: "confirmed", txHash: tx(1), explorerUrl: "x", blockNumber: 1n }),
    proposePlan: vi.fn().mockResolvedValue({ status: "confirmed", txHash: tx(2), explorerUrl: "x", blockNumber: 2n }),
    readPlan: vi.fn().mockResolvedValue([incident.id, 1_900_000_000n, 2, 2, incident.subject, 0, false]),
    executePlan: vi.fn().mockResolvedValue({ status: "confirmed", txHash: tx(3), explorerUrl: "x", blockNumber: 3n }),
    markExecuted: vi.fn().mockResolvedValue({ status: "confirmed", txHash: tx(4), explorerUrl: "x", blockNumber: 4n }),
    closeIncident: vi.fn().mockResolvedValue({ status: "confirmed", txHash: tx(5), explorerUrl: "x", blockNumber: 5n }),
    verifyIncident: vi.fn().mockResolvedValue({ executed: true }),
  };
  orchestrator = new IncidentOrchestrator(repositories, chain);
});

async function confirmApproval(planHash: `0x${string}`, signer: `0x${string}`, n: number) {
  const approval = await repositories.issueApprovalNonce({
    chainId: 688689,
    planHash,
    signer,
    expiresAt: Date.now() + 60_000,
  });
  await repositories.consumeApprovalNonce({
    id: approval.id,
    signature: ("0x" + "44".repeat(65)) as `0x${string}`,
    now: Date.now(),
  });
  await repositories.markApprovalConfirmed(approval.id, tx(10 + n), { status: "success" });
}

describe("IncidentOrchestrator", () => {
  it("registers before proposing and resumes a pending registration", async () => {
    vi.mocked(chain.registerIncident)
      .mockResolvedValueOnce({ status: "pending", txHash: tx(1), explorerUrl: "x" })
      .mockResolvedValueOnce({ status: "confirmed", txHash: tx(1), explorerUrl: "x", blockNumber: 1n });
    await repositories.createIncident(incident);

    const first = await orchestrator.propose(incident.id, 1_800_000_100_000);
    expect(first.status).toBe("pending");
    expect(chain.proposePlan).not.toHaveBeenCalled();

    const second = await orchestrator.propose(incident.id, 1_800_000_100_000);
    expect(second.status).toBe("confirmed");
    expect(chain.registerIncident).toHaveBeenCalledTimes(2);
    expect(chain.proposePlan).toHaveBeenCalledTimes(1);
  });

  it("executes, marks, closes, and is idempotent after closure", async () => {
    await repositories.createIncident(incident);
    const proposed = await orchestrator.propose(incident.id, 1_800_000_100_000);
    await confirmApproval(proposed.plan.planHash, "0x0000000000000000000000000000000000000002", 1);
    await confirmApproval(proposed.plan.planHash, "0x0000000000000000000000000000000000000003", 2);

    const result = await orchestrator.execute(proposed.plan.planHash);
    expect(result.status).toBe("confirmed");
    expect(result.closureHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.executePlan).toHaveBeenCalledTimes(1);
    expect(chain.markExecuted).toHaveBeenCalledTimes(1);
    expect(chain.closeIncident).toHaveBeenCalledWith(proposed.plan.planHash, result.closureHash);

    const repeated = await orchestrator.execute(proposed.plan.planHash);
    expect(repeated).toMatchObject({ status: "confirmed", closureHash: result.closureHash });
    expect(chain.executePlan).toHaveBeenCalledTimes(1);
    expect(chain.closeIncident).toHaveBeenCalledTimes(1);
  });

  it("refuses execution when the controller threshold is not met", async () => {
    await repositories.createIncident(incident);
    const proposed = await orchestrator.propose(incident.id, 1_800_000_100_000);
    vi.mocked(chain.readPlan).mockResolvedValue([incident.id, 1_900_000_000n, 2, 1, incident.subject, 0, false]);

    await expect(orchestrator.execute(proposed.plan.planHash)).rejects.toThrow(/threshold/i);
    expect(chain.executePlan).not.toHaveBeenCalled();
  });
});
