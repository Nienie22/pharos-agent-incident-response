# Runbook — Compromised Agent

## Trigger
An unexpected executor is added (S2), a leaked session key is observed
(S6), or a policy violation is reported (S4).

## Steps
1. Triage: pause the agent immediately via `PAUSE_AGENT`.
2. Propose: also `REMOVE_EXECUTOR` for any new unauthorized executor.
3. Simulate and approve at `CRITICAL` threshold.
4. Execute.
5. Verify paused flag and executor set.
6. Close with a `ROTATE_KEY_METADATA` to prevent re-registration of
   the leaked key.
