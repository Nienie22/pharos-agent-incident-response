import type { IncidentSeverity, IncidentSignal } from "./types.js";

export interface ScoreInputs {
  signals: IncidentSignal[];
  now: number;
  unconfirmedCount: number;
  confirmedSafeCount: number;
  goplusCoverageBps: number;
}

export function scoreIncident(input: ScoreInputs): number {
  const max = input.signals.reduce((m, s) => Math.max(m, s.severity), 0);
  return (
    max * 100 +
    input.unconfirmedCount * 5 -
    input.confirmedSafeCount * 20 +
    Math.floor(input.goplusCoverageBps / 100)
  );
}

export function bucketScore(score: number): IncidentSeverity {
  if (score >= 300) return "CRITICAL";
  if (score >= 150) return "HIGH";
  if (score >= 50) return "SUSPICIOUS";
  return "INFO";
}

export function requiredApprovalsFor(sev: IncidentSeverity): number {
  switch (sev) {
    case "CRITICAL":
      return 2;
    case "HIGH":
      return 1;
    default:
      return 0;
  }
}
