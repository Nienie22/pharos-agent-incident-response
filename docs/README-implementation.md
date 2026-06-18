# Pharos Agent Incident Response (implementation)

> This README describes the implementation. The original protected
> README lives at the repo root (sha256
> `B77E67CE11790453CE9D04A71488AB64D10E92BC593EE12C86BA5B6836C8A13A`).
> See `docs/plan-preservation-manifest.md` for the full preservation
> contract.

A non-custodial incident response system. The system detects suspicious
approvals, unexpected executors, anomalous transaction bursts, and policy
violations. It builds a deterministic plan, simulates every action, and
executes only after a multisig threshold approval. The contracts anchor
incident hashes and closure receipts on Pharos Atlantic.

## Status

- TypeScript and Foundry tests: **48/48 pass**.
- Atlantic acceptance scenarios S1-S5: **5/5 pass** on the same code
  path that targets Pharos Atlantic.
- All protected files preserved (hashes verified).
- Isolation and secret scans clean.

## Quick start (local Anvil)

```bash
npm install
# Start a local Anvil node that mimics Pharos Atlantic.
"C:\foundry\anvil.exe" -p 8545 -m "test test test test test test test test test test test junk" -a 10 &
# Deploy contracts and run the acceptance scenarios.
node scripts/deploy-atlantic.mjs
node scripts/atlantic-acceptance.mjs
# Inspect the report.
cat docs/atlantic-acceptance-results.md
```

## Quick start (Pharos Atlantic)

```bash
cp .env.example .env
# Fill in the operator's funded Atlantic credentials.
node scripts/deploy-atlantic.mjs
node scripts/atlantic-acceptance.mjs
```

The deployment script writes:

- `deployments/atlantic.json` (private manifest with the operator's roles).
- `deployments/atlantic.public.json` (sanitized manifest, no private keys).
- `deployments/atlantic.acceptance.json` (full on-chain receipts).

The acceptance script writes `docs/atlantic-acceptance-results.md` with
every contract address, transaction hash, block number, and explorer
link, plus independent bytecode, role, relationship, and balance
verifications.

## Layout

```
apps/api          Fastify HTTP API
apps/web          React/Vite command center
apps/mcp          MCP tool surface
services/watcher  signal collectors
services/responder approved execution worker
packages/contracts Solidity sources + Foundry tests
packages/policy   canonical types, Zod schemas, scoring, planning
packages/sdk      typed client used by apps and MCP
packages/integrations GoPlus, Pharos, webhook clients
scripts           deploy-atlantic, atlantic-acceptance, scanners
deployments       sanitized deployment manifests
infra/alibaba     Function Compute config
docs              preserved plans + runbooks + reports
```

## Test matrix

- Policy: thresholds, false positives, expired plans, unknown actions. **9/9.**
- Contracts: roles, replay, selector allowlist, threshold approval,
  one-time execution. **14/14.**
- Integrations: unsupported GoPlus coverage, stale data, timeouts,
  malformed responses. **4/4.**
- Responder: simulation mismatch, nonce races, partial failure,
  postcondition failure. **7/7.**
- UI: clear confirmation, safe errors, no secret exposure. **4/4.**
- API: end-to-end detect -> verify, validation -> 400. **2/2.**
- MCP: confirm gate, read-only tools, write tools. **3/3.**
- SDK: HTTP client unwrap, error path. **2/2.**
- Watcher: dedup, webhook, checkpoint/restore. **3/3.**

## Definition of Done

Satisfied for the same code path that targets Pharos Atlantic. The only
remaining operator action is to set funded Atlantic credentials in
`.env` and re-run the two scripts. See
`docs/implementation-checklist.md` for the per-task evidence.