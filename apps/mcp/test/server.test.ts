import { describe, expect, it, vi } from "vitest";
import { buildTools } from "../src/server.js";
import type { PharosIncidentClient } from "@pharos-incident/sdk";

const mock = (over = {}): PharosIncidentClient => ({
  detect: vi.fn(async () => ({ id: "0xi" })),
  triage: vi.fn(async () => ({ severity: "HIGH", score: 200 })),
  propose: vi.fn(async () => ({ planHash: "0xp" })),
  simulate: vi.fn(async () => ({ ok: true, digest: "0xd", warnings: [] })),
  approve: vi.fn(async () => ({ ready: true })),
  execute: vi.fn(async () => ({ txHash: "0xt" })),
  verify: vi.fn(async () => ({ ok: true, closureHash: "0xc" })),
  close: vi.fn(async () => ({ receipt: "0xr" })),
  ...over,
});

describe("mcp tools", () => {
  it("rejects execute without confirm", async () => {
    const tools = buildTools(mock());
    const ex = tools.find((t) => t.name === "incident_execute");
    await expect(ex.run({ plan: "0xp", approver: "0xa", signature: "0xs" })).rejects.toThrow(/confirm/);
  });

  it("passes confirm=true through to the SDK", async () => {
    const m = mock();
    const tools = buildTools(m);
    const ex = tools.find((t) => t.name === "incident_execute");
    const out = await ex.run({ plan: "0xp", approver: "0xa", signature: "0xs", confirm: true });
    expect(out).toEqual({ txHash: "0xt" });
    expect(m.execute.mock.calls[0][0]).toMatchObject({ planHash: "0xp" });
  });

  it("exposes a read-only triage tool", async () => {
    const m = mock();
    const tools = buildTools(m);
    const t = tools.find((tt) => tt.name === "incident_triage");
    const out = await t.run({ id: "0xi" });
    expect(out).toEqual({ severity: "HIGH", score: 200 });
  });
});
