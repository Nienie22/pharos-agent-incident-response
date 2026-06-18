import {
  type Hex,
  type IncidentSignal,
  hashString,
  idFromInputs,
} from "@pharos-incident/policy";
import { MockPharosClient, MockGoPlusClient, parseWebhook, type PharosEvent } from "@pharos-incident/integrations";

interface Fingerprint { subject: Hex; type: string; bucket: number }
const fpWindow = new Map<string, Fingerprint>();

function fingerprintKey(f: Fingerprint): string {
  return `${f.subject}:${f.type}:${f.bucket}`;
}

function currentBucket(now: number): number {
  return Math.floor(now / (60 * 60 * 1000)); // 1h buckets
}

export interface CollectedSignal extends IncidentSignal {
  fingerprint: string;
}

export interface WatcherOptions {
  pollIntervalMs: number;
  replayWindow: number;
  onSignal(s: CollectedSignal): void | Promise<void>;
}

export class Watcher {
  private cursor: bigint = 0n;
  constructor(
    private readonly chain: MockPharosClient,
    private readonly goplus: MockGoPlusClient,
    private readonly opts: WatcherOptions,
  ) {}

  ingestEvents(events: PharosEvent[], now: number): CollectedSignal[] {
    const out: CollectedSignal[] = [];
    for (const e of events) {
      const subject = ("0x" + e.topics[1]?.slice(26)) as Hex;
      const fp: Fingerprint = { subject, type: "PHAROS_EVENT", bucket: currentBucket(now) };
      const k = fingerprintKey(fp);
      if (fpWindow.has(k)) continue; // dedupe
      fpWindow.set(k, fp);
      out.push({
        source: "pharos",
        observedAt: now,
        subject,
        type: fp.type,
        severity: 60,
        evidenceHash: hashString(e.txHash + ":" + e.logIndex),
        confidenceBps: 7000,
        fingerprint: k,
      });
    }
    return out;
  }

  ingestWebhook(body: unknown, now: number): CollectedSignal | null {
    const p = parseWebhook(body);
    const fp: Fingerprint = { subject: p.subject as Hex, type: p.type, bucket: currentBucket(now) };
    const k = fingerprintKey(fp);
    if (fpWindow.has(k)) return null;
    fpWindow.set(k, fp);
    return {
      source: p.source,
      observedAt: p.observedAt,
      subject: p.subject as Hex,
      type: p.type,
      severity: p.severity,
      evidenceHash: p.evidenceHash as Hex,
      confidenceBps: p.confidenceBps,
      fingerprint: k,
    };
  }

  async tick(now: number): Promise<CollectedSignal[]> {
    const to = await this.chain.getBlockNumber();
    const events = await this.chain.getLogs(this.cursor, to);
    this.cursor = to + 1n;
    const out = this.ingestEvents(events, now);
    for (const s of out) await this.opts.onSignal(s);
    return out;
  }

  checkpoint(): { cursor: bigint; fingerprints: string[] } {
    return { cursor: this.cursor, fingerprints: Array.from(fpWindow.keys()) };
  }

  restore(state: { cursor: bigint; fingerprints: string[] }) {
    this.cursor = state.cursor;
    fpWindow.clear();
    for (const k of state.fingerprints) {
      const [subject, type, bucket] = k.split(":") as [Hex, string, string];
      fpWindow.set(k, { subject, type, bucket: Number(bucket) });
    }
  }
}

export function makeIncidentId(parts: string[]): Hex {
  return idFromInputs(parts);
}
