# Runbook — Approval Drain

## Trigger
A malicious ERC-20 approval (S1) is observed by GoPlus, or an unusual
spender appears in `Approval` events.

## Steps
1. Triage: confirm via GoPlus that the spender is flagged.
2. Propose: `REVOKE_APPROVAL(token, spender)`.
3. Simulate: confirm the post-state allowance is zero and the caller
   has enough gas.
4. Approve: collect `CRITICAL` threshold approvals.
5. Execute: send the revoke transaction.
6. Verify: re-read `allowance(owner, spender) == 0`.
7. Close: anchor the closure receipt in `IncidentRegistry`.
