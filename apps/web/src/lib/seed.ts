import type { Hex, Incident, IncidentSeverity } from "@pharos-incident/policy";

export interface ApprovalRecord {
  approver: Hex;
  signature: Hex;
  ts: number;
}

export interface ClosureRecord {
  planHash: Hex;
  txHash: Hex;
  approvers: Hex[];
  closedAt: number;
  receipt: Hex;
}

const evHash = (label: string): Hex => ("0x" + label.padEnd(64, "0").slice(0, 64)) as Hex;

export const SEED_INCIDENTS: Incident[] = [
  {
    id: ("0x" + "a1".repeat(32)) as Hex,
    chainId: 1,
    subject: ("0x7c01dc0e02f966c19c9c50e0f2c2c8e8e4de3a11") as Hex,
    signals: [
      {
        source: "goplus",
        type: "MALICIOUS_APPROVAL",
        subject: ("0x7c01dc0e02f966c19c9c50e0f2c2c8e8e4de3a11") as Hex,
        severity: 95,
        confidenceBps: 9800,
        evidenceHash: evHash("goplus:malicious-approval"),
        observedAt: Date.now() - 90_000,
      },
      {
        source: "pharos-watcher",
        type: "UNUSUAL_GAS_PRICE",
        subject: ("0x7c01dc0e02f966c19c9c50e0f2c2c8e8e4de3a11") as Hex,
        severity: 70,
        confidenceBps: 8800,
        evidenceHash: evHash("watcher:gas-spike"),
        observedAt: Date.now() - 60_000,
      },
    ],
    createdAt: Date.now() - 90_000,
  },
  {
    id: ("0x" + "b2".repeat(32)) as Hex,
    chainId: 1,
    subject: ("0x9d4f0e2da0bc19ce9f12b3a8c2e7f1b3a1d0c99e0") as Hex,
    signals: [
      {
        source: "pharos-watcher",
        type: "TX_BURST",
        subject: ("0x9d4f0e2da0bc19ce9f12b3a8c2e7f1b3a1d0c99e0") as Hex,
        severity: 60,
        confidenceBps: 7500,
        evidenceHash: evHash("watcher:tx-burst"),
        observedAt: Date.now() - 45_000,
      },
      {
        source: "goplus",
        type: "SUSPICIOUS_CONTRACT_INTERACTION",
        subject: ("0x9d4f0e2da0bc19ce9f12b3a8c2e7f1b3a1d0c99e0") as Hex,
        severity: 50,
        confidenceBps: 7000,
        evidenceHash: evHash("goplus:suspicious-dex"),
        observedAt: Date.now() - 30_000,
      },
    ],
    createdAt: Date.now() - 45_000,
  },
  {
    id: ("0x" + "c3".repeat(32)) as Hex,
    chainId: 1,
    subject: ("0x5a8e2c1a9f3b7d4e8c2a1b0c9d8e7f6a5b4c3d2e") as Hex,
    signals: [
      {
        source: "certik",
        type: "LEAKED_SESSION_KEY",
        subject: ("0x5a8e2c1a9f3b7d4e8c2a1b0c9d8e7f6a5b4c3d2e") as Hex,
        severity: 90,
        confidenceBps: 9700,
        evidenceHash: evHash("certik:leaked-key"),
        observedAt: Date.now() - 15_000,
      },
    ],
    createdAt: Date.now() - 15_000,
  },
];

export function severityFor(incident: Incident): IncidentSeverity {
  const max = incident.signals.reduce((m, s) => Math.max(m, s.severity), 0);
  if (max >= 80) return "CRITICAL";
  if (max >= 50) return "HIGH";
  if (max >= 20) return "SUSPICIOUS";
  return "INFO";
}

export function shortHash(h: string | null | undefined, n: number = 6): string {
  if (!h) return "(none)";
  if (h.length <= 2 + n * 2) return h;
  return h.slice(0, 2 + n * 2) + "...";
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "(none)";
  if (a.length < 42) return a;
  return a.slice(0, 6) + "..." + a.slice(-4);
}

export function relativeTime(ts: number): string {
  if (!ts) return "n/a";
  const delta = Date.now() - ts;
  if (delta < 60_000) return Math.floor(delta / 1000) + "s ago";
  if (delta < 3_600_000) return Math.floor(delta / 60_000) + "m ago";
  if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + "h ago";
  return Math.floor(delta / 86_400_000) + "d ago";
}

export function scoreFor(incident: Incident): number {
  return incident.signals.reduce((m, s) => Math.max(m, s.severity * 100), 0);
}