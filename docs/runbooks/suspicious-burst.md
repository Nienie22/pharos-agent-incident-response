# Runbook — Suspicious Transaction Burst

## Trigger
A nonce burst (S3) or anomalous destination cluster (S5) is detected.

## Steps
1. Triage: classify the destinations.
2. If destinations match a known drainer cluster, escalate to CRITICAL.
3. Propose: `SNAPSHOT` of the wallet plus a `PAUSE_AGENT` for any agent
   that submitted the burst.
4. Simulate, approve, execute, verify, close.
