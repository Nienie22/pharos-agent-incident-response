# Response Policy

## Phases

```
DETECTED -> TRIAGED -> CONTAINMENT_PROPOSED -> APPROVED -> EXECUTED -> VERIFIED -> CLOSED
```

The system never skips a phase. `APPROVED` requires a multisig threshold
recorded on chain.

## Severity policy

| Severity | Required approvals | Auto-execute |
|----------|--------------------|--------------|
| INFO | 0 | No |
| SUSPICIOUS | 0 | No |
| HIGH | 1 | No |
| CRITICAL | 2 | No |

Auto-execute is always off in the MVP. The system proposes, simulates,
waits for approvals, and only then executes.

## Containment actions (allowlist)

- `PAUSE_AGENT(agentId)` — calls `EmergencyPolicyController.setPaused`.
- `REVOKE_APPROVAL(token, spender)` — calls the token's
  `approve(spender, 0)` after a pre-simulation.
- `REMOVE_EXECUTOR(agentId, executor)` — calls the agent registry's
  `removeExecutor`.
- `ROTATE_KEY_METADATA(keyId, metadataHash)` — calls the agent registry's
  rotate call to update the off-chain metadata pointer only.
- `SNAPSHOT(subject)` — calls `IncidentRegistry.snapshot(subject)` to
  anchor a static evidence hash on chain.

Any selector not in this allowlist is rejected at planning time and by
the on-chain controller.

## Replay and one-time execution

Every action carries a `(planHash, actionIndex, nonce)` tuple. The
contract rejects duplicates and replays.

## Approval expiry

Approvals expire with the plan. An approval collected against an expired
plan is not transferable to a new plan.

## Verifier

The verifier re-reads the on-chain state (allowance, paused flag,
executor set) after execution and emits a `ClosureReceipt` hash. The
hash is anchored in `IncidentRegistry`.
