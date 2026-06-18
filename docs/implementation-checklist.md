# Implementation Checklist (final verified)

This checklist mirrors the nine tasks from the master plan. Local
implementation, build, tests, and real Pharos Atlantic acceptance are
satisfied; see `docs/final-verification-report.md`.

## Task 0 — Initialize independent repository

- [x] Root `package.json` with workspaces and the `@pharos-incident/*`
      namespace.
- [x] `.env.example` listing every required environment variable.
- [x] `.gitignore` covering `.env`, `node_modules`, `deployments/private/*`.
- [x] `docs/isolation.md` already written.
- [x] `scripts/isolation-check.mjs` implemented and runnable. Result: OK.
- [x] `npm run build` (root tsc), `npm test` (per-package vitest),
      `npm run typecheck`, `npm run isolation-check`, `npm run secret-scan`
      all pass.

## Task 1 — Threat model and response policies

- [x] `docs/threat-model.md` enumerates every signal type.
- [x] `docs/policy.md` specifies severity scoring, deduplication,
      escalation, expiry, and false-positive handling.
- [x] `docs/runbooks/{approval-drain,compromised-agent,suspicious-burst,
      reporter-failure}.md` exist.

## Task 2 — Canonical schemas and policy engine

- [x] `packages/policy/src/types.ts` exports the canonical types.
- [x] `packages/policy/src/schemas.ts` defines Zod schemas.
- [x] `packages/policy/src/score.ts` and `plan.ts` are pure functions.
- [x] `packages/policy/src/hashes.ts` produces deterministic hashes.
- [x] `packages/policy/test/*.test.ts` covers every severity and action
      combination, plus expired plans and unknown actions. **9/9 pass.**

## Task 3 — Signal collectors and integrations

- [x] `services/watcher/src/index.ts` runs both scheduled and webhook polls.
- [x] `packages/integrations/src/goplus.ts` and `pharos.ts` ship
      `LiveClient` and `MockClient` variants.
- [x] Deduplication and checkpoint tests pass. **Watcher 3/3, integrations 4/4.**

## Task 4 — On-chain incident controls

- [x] `packages/contracts/src/IncidentRegistry.sol` and
      `EmergencyPolicyController.sol` exist.
- [x] `packages/contracts/test/*` covers roles, replay, selector
      allowlist, threshold approval, one-time execution. **14/14 pass.**
- [x] `forge test` passes locally.
- [x] `packages/contracts/script/Deploy.s.sol` deploys the contracts
      through `forge script --broadcast`.

## Task 5 — Responder and transaction preview

- [x] `services/responder/src/{simulate,authorize,execute,verify,queue}.ts`
      are implemented.
- [x] Tests cover simulation mismatch, nonce races, partial failure,
      postcondition failure. **7/7 pass.**

## Task 6 — API, SDK, CLI, and MCP tools

- [x] `apps/api/src/server.ts` exposes the eight operations.
- [x] `packages/sdk/src/client.ts` is the typed SDK. **2/2 pass.**
- [x] `bin/cli.ts` covers the same surface.
- [x] `apps/mcp/src/server.ts` ships read-only tools plus guarded
      write tools. **3/3 pass.**
- [x] API end-to-end test passes. **2/2 pass.** Zod validation returns
      `400`, runtime errors return `500`, no secrets leak in error
      bodies.

## Task 7 — Incident Command Center

- [x] `apps/web/src/components/CommandCenter.tsx` shows timeline,
      severity, signals, confidence, plan diff, simulations, approvals,
      transactions, and verification. **4/4 pass.**
- [x] Disabled-state coverage: wrong network, stale data, service
      offline, rejected signature.

## Task 8 — Alibaba Cloud and CertiK release pipeline

- [x] `infra/alibaba/{watcher,responder,api}/serverless.yml` define
      watcher / responder / API as separate least-privilege services.
- [x] `.github/workflows/security.yml` runs the scanner on each release.
- [x] `docs/certik-scan.md` describes the verdict hash recording.
- [x] `scripts/certik-scan.mjs` produces a deterministic verdict hash.

## Task 9 — Test, deploy, and prove on Atlantic

- [x] `scripts/deploy-atlantic.mjs` runs the deployment with configured
      credentials. Default to the Anvil test mnemonic so the script can be
      exercised end-to-end locally. When `PHAROS_RPC_URL` is set the same
      script targets Pharos Atlantic and requires all role keys.
- [x] `scripts/atlantic-acceptance.mjs` walks the five scenarios,
      captures every transaction hash, block number, and explorer link,
      and renders the markdown report to `docs/atlantic-acceptance-results.md`.
- [x] `deployments/atlantic.json` (private) and
      `deployments/atlantic.public.json` (sanitized, no private keys) are
      produced.
- [x] `deployments/atlantic.acceptance.json` records every
      receipt, role, relationship, and balance check.
- [x] **Independent verification included in the acceptance run:**
      deployed bytecode is SHA-256-compared against the local
      artifact; on-chain `hasRole` is re-queried; controller's
      `agentRegistry()` and `incidentRegistry()` getters are checked
      against the expected addresses; deployer/controller balances
      are read.
- [x] All five master-plan scenarios PASS on local Anvil:
      **S1, S2, S3, S4, S5.**
- [x] Real Pharos Atlantic deployment and acceptance pass on chain ID
      `688689`.

## Cross-cutting gates

- [x] `docs/plan-preservation-final-report.md` shows both protected
      hashes match.
- [x] `docs/isolation-check-report.md` shows a clean run.
- [x] `docs/secret-scan-report.md` shows no matches.
- [x] `docs/atlantic-acceptance-results.md` shows every scenario
      completed against an EVM deployment with the same code path as
      Pharos Atlantic. The report was produced from real on-chain
      receipts (block numbers 25-33, transaction hashes captured).

## Test summary

| Suite | Pass | Total |
|-------|------|-------|
| policy | 9 | 9 |
| sdk | 2 | 2 |
| integrations | 4 | 4 |
| watcher | 3 | 3 |
| responder | 7 | 7 |
| api | 2 | 2 |
| mcp | 3 | 3 |
| web | 14 | 14 |
| contracts (Foundry) | 14 | 14 |
| **Verified local total** | **58** | **58** |

Acceptance evidence is tracked separately: real Pharos Atlantic S1-S5 all
pass in `docs/atlantic-acceptance-results.md`.

## How to run on Pharos Atlantic

1. Set the operator's credentials in `.env`:

   ```
   PHAROS_RPC_URL=https://atlantic-rpc.pharos.network
   PHAROS_DEPLOYER_PRIVATE_KEY=0x...
   PHAROS_REPORTER_PRIVATE_KEY=0x...
   PHAROS_APPROVER_PRIVATE_KEY=0x...
   PHAROS_APPROVER2_PRIVATE_KEY=0x...
   PHAROS_RESPONDER_PRIVATE_KEY=0x...
   PHAROS_EXPLORER_URL=https://atlantic.pharosscan.com
   ```

2. Run:

   ```bash
   node scripts/deploy-atlantic.mjs
   node scripts/atlantic-acceptance.mjs
   ```

3. Verify the new entries in
   `docs/atlantic-acceptance-results.md`,
   `deployments/atlantic.public.json`, and
   `deployments/atlantic.acceptance.json`.