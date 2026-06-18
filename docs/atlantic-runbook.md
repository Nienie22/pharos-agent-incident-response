# Atlantic Runbook

This runbook describes the exact sequence of steps required to deploy the
contracts and run the acceptance scenarios on Pharos Atlantic.

## Prerequisites

- Node 20+, npm 10+, Foundry.
- A funded deployer address on Atlantic (testnet PHAR is fine).
- Four additional accounts: reporter, two approvers, and responder. Their
  private keys are read from `PHAROS_REPORTER_PRIVATE_KEY`,
  `PHAROS_APPROVER_PRIVATE_KEY`, `PHAROS_APPROVER2_PRIVATE_KEY`, and
  `PHAROS_RESPONDER_PRIVATE_KEY`.

## Deploy

```bash
# 1. Compile
forge --root packages/contracts build

# 2. Deploy via forge create, then export the addresses.
export PHAROS_RPC_URL=https://atlantic-rpc.pharos.network
export PHAROS_DEPLOYER_PRIVATE_KEY=0x...
export PHAROS_REPORTER_PRIVATE_KEY=0x...
export PHAROS_APPROVER_PRIVATE_KEY=0x...
export PHAROS_APPROVER2_PRIVATE_KEY=0x...
export PHAROS_RESPONDER_PRIVATE_KEY=0x...
export INCIDENT_REGISTRY_ADDRESS=0x...
export EMERGENCY_POLICY_CONTROLLER_ADDRESS=0x...
export AGENT_REGISTRY_ADDRESS=0x...

# 3. Run the deployment script. It produces a sanitized public manifest.
node --experimental-strip-types scripts/deploy-atlantic.ts
```

## Accept

```bash
node --experimental-strip-types scripts/atlantic-acceptance.ts
```

The script walks the five scenarios defined in the master plan, captures
the transaction hashes and block numbers, and writes a markdown report to
`docs/atlantic-acceptance-results.md`.

## Verifying

Use the explorer URLs in the report to confirm each transaction reached
the chain. Cross-check the receipt `status` field — anything other than
`0x1` is treated as a failure and the acceptance run is repeated.
