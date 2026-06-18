import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpClient, type ApprovalIntent } from "../src/index.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("sdk http client", () => {
  it("uses the live approval nonce, intent, and confirmation protocol", async () => {
    const responses = [
      { intentId: "intent-1", version: 1, planHash: "0x" + "00".repeat(32), chainId: 688689, approver: "0x" + "11".repeat(20), nonce: "nonce", expiresAt: 123 },
      { id: "intent-1", status: "verified" },
      { id: "intent-1", status: "confirmed", txHash: "0x" + "ab".repeat(32) },
    ];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift(),
      text: async () => "",
    })) as any;
    (globalThis as any).fetch = fetchMock;
    const c = new HttpClient("http://x");
    const planHash = ("0x" + "00".repeat(32)) as `0x${string}`;
    const approver = ("0x" + "11".repeat(20)) as `0x${string}`;
    const nonce = await c.approvalNonce(planHash, approver);
    const intent = nonce as ApprovalIntent;
    await c.submitApprovalIntent(nonce.intentId, intent, ("0x" + "22".repeat(65)) as `0x${string}`);
    const confirmed = await c.confirmApproval(nonce.intentId, ("0x" + "ab".repeat(32)) as `0x${string}`);

    expect(confirmed.status).toBe("confirmed");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://x/approvals/nonce",
      "http://x/approve",
      "http://x/approve/confirm",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expect.objectContaining({
      intentId: "intent-1",
      intent,
    }));
  });

  it("executes without replaying approval signatures and polls transaction state", async () => {
    const responses = [
      { status: "pending", txHash: "0x" + "ab".repeat(32), explorerUrl: "https://explorer/tx/x" },
      { status: "confirmed", txHash: "0x" + "ab".repeat(32) },
    ];
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => responses.shift(), text: async () => "" })) as any;
    (globalThis as any).fetch = fetchMock;
    const c = new HttpClient("http://x");
    const planHash = ("0x" + "00".repeat(32)) as `0x${string}`;
    const execution = await c.execute({ planHash });
    const transaction = await c.transaction(execution.txHash);
    expect(transaction.status).toBe("confirmed");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ planHash });
  });

  it("throws on non-ok", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "internal error",
      json: async () => ({}),
    })) as any;
    (globalThis as any).fetch = fetchMock;
    const c = new HttpClient("http://x");
    await expect(c.verify("0x" + "00".repeat(32))).rejects.toThrow(/sdk/);
  });
});
