import { describe, expect, it } from "vitest";
import { MockGoPlusClient, MockPharosClient, parseWebhook } from "../src/index.js";

describe("goplus mock", () => {
  it("marks bad addresses", async () => {
    const c = new MockGoPlusClient();
    const r = await c.addressRisk("0x0000000000000000000000000000000000000bad");
    expect(r.isMalicious).toBe(true);
    expect(r.coverage).toBe("UNSUPPORTED");
  });
});

describe("pharos mock", () => {
  it("advances block number", async () => {
    const c = new MockPharosClient();
    const a = await c.getBlockNumber();
    const b = await c.getBlockNumber();
    expect(b).toBeGreaterThan(a);
  });
});

describe("webhook parser", () => {
  it("rejects bad shapes", () => {
    expect(() => parseWebhook({ source: "" })).toThrow();
  });
  it("accepts well-formed payloads", () => {
    const p = parseWebhook({
      source: "goplus",
      observedAt: 1,
      subject: "0x0000000000000000000000000000000000000abc",
      type: "X",
      severity: 1,
      evidenceHash: "0x" + "11".repeat(32),
      confidenceBps: 100,
    });
    expect(p.subject).toBe("0x0000000000000000000000000000000000000abc");
  });
});
