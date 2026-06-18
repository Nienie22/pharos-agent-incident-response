# Threat Model

The Pharos Agent Incident Response system monitors wallets, agents, and
session keys that participate in the broader Pharos ecosystem. It does not
itself custody user funds; its job is to detect compromise, propose a
containment plan, and produce verifiable evidence.

## Actors

- **Wallet owner** — holds the master key. The responder never sees it.
- **Agent operator** — runs the policy engine, watcher, and responder.
- **Security responder** — receives alerts, simulates containment.
- **Multisig approver** — provides threshold approvals on chain.
- **Attacker** — tries to drain funds, hijack agents, or pivot via
  approvals.

## Compromise signals

| ID | Signal | Source | Default severity |
|----|--------|--------|------------------|
| S1 | Malicious ERC-20 approval to a known drainer | GoPlus | CRITICAL |
| S2 | Unexpected executor added to an agent | Pharos event | HIGH |
| S3 | Nonce burst (>= 20 txs / 5 min) | Pharos RPC | HIGH |
| S4 | Policy violation reported by agent | Agent event | SUSPICIOUS |
| S5 | Anomalous destination cluster | Pharos RPC | HIGH |
| S6 | Leaked session key (rotated externally) | Pharos event | CRITICAL |
| S7 | Out-of-allowlist selector | Pharos event | SUSPICIOUS |
| S8 | Reporter (watcher) outage | Internal health | INFO |

## Severity scoring

```
score = max(signal.severity) * 100
        + (unconfirmed_count * 5)
        - (confirmed_safe_count * 20)
        + (goplus_coverage_bps / 100)
```

`score` is bucketed into `INFO` (<50), `SUSPICIOUS` (50..149),
`HIGH` (150..299), `CRITICAL` (>=300). The bucketing is deterministic.

## Deduplication

Two signals collapse if their `(subject, type, 1h-bucket)` tuple matches.
The watcher keeps a sliding 24h window of fingerprints per subject.

## Escalation

A `SUSPICIOUS` incident escalates to `HIGH` automatically after 30
minutes without a benign explanation. `HIGH` escalates to `CRITICAL` if
no responder acknowledgement arrives within 10 minutes.

## Expiry

Plans expire after 30 minutes. Expired plans are rejected by both the
policy engine and the on-chain controller.

## False positives

- `S3` is downgraded if the burst is an internal scheduled job (operator
  can configure a `known-bursts.json` list).
- `S7` is downgraded if the selector matches a `known-callers.json`
  allowlist of trusted automation.

## Out of scope

- Recovering stolen assets beyond revoking the path the attacker used.
- Custodying user keys.
- Promising that the system prevents every loss.
