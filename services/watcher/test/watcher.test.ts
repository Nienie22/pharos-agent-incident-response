import { describe, expect, it } from "vitest";
import { Watcher } from "../src/index.js";
import { MockPharosClient, MockGoPlusClient } from "@pharos-incident/integrations";
import type { PharosEvent } from "@pharos-incident/integrations";

describe("watcher", () => {
  it("deduplicates signals per hour bucket", () => {
    const events: PharosEvent[] = [
      {
        blockNumber: 1,
        txHash: "0x" + "ab".repeat(32),
        logIndex: 0,
        address: "0x0000000000000000000000000000000000000111",
        topics: [
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000abc" + "0".repeat(24),
        ],
        data: "0x",
      },
    ];
    const c = new MockPharosClient(events);
    const w = new Watcher(c, new MockGoPlusClient(), {
      pollIntervalMs: 1000,
      replayWindow: 10,
      onSignal: () => {},
    });
    const a = w.ingestEvents(events, 1);
    const b = w.ingestEvents(events, 1);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  it("parses and ingests webhooks", () => {
    const w = new Watcher(new MockPharosClient(), new MockGoPlusClient(), {
      pollIntervalMs: 0,
      replayWindow: 0,
      onSignal: () => {},
    });
    const s = w.ingestWebhook(
      {
        source: "goplus",
        observedAt: 100,
        subject: "0x0000000000000000000000000000000000000abc",
        type: "MALICIOUS_APPROVAL",
        severity: 95,
        evidenceHash: "0x" + "11".repeat(32),
        confidenceBps: 9000,
      },
      100,
    );
    expect(s?.type).toBe("MALICIOUS_APPROVAL");
  });

  it("supports checkpoint and restore", () => {
    const w = new Watcher(new MockPharosClient(), new MockGoPlusClient(), {
      pollIntervalMs: 0,
      replayWindow: 0,
      onSignal: () => {},
    });
    w.ingestWebhook(
      {
        source: "x",
        observedAt: 1,
        subject: "0x0000000000000000000000000000000000000abc",
        type: "Y",
        severity: 1,
        evidenceHash: "0x" + "11".repeat(32),
        confidenceBps: 1,
      },
      1,
    );
    const cp = w.checkpoint();
    const w2 = new Watcher(new MockPharosClient(), new MockGoPlusClient(), {
      pollIntervalMs: 0,
      replayWindow: 0,
      onSignal: () => {},
    });
    w2.restore(cp);
    const dup = w2.ingestWebhook(
      {
        source: "x",
        observedAt: 1,
        subject: "0x0000000000000000000000000000000000000abc",
        type: "Y",
        severity: 1,
        evidenceHash: "0x" + "11".repeat(32),
        confidenceBps: 1,
      },
      1,
    );
    expect(dup).toBeNull();
  });
});
