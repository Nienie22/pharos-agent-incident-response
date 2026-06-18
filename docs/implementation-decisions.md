# Implementation Decisions

This file records the design choices made while implementing the master
plan, together with the rationale and the master plan section each choice
serves.

## Project layout

The repository is a pnpm/npm monorepo with the following workspaces:

- `apps/api` — Fastify HTTP API exposing detect/triage/propose/simulate/
  approve/execute/verify/close operations.
- `apps/web` — React/Vite incident command center.
- `apps/mcp` — MCP server exposing read-only tools plus guarded write
  tools.
- `services/watcher` — scheduled and webhook-driven signal collector.
- `services/responder` — simulation, approval, execution, verification
  worker.
- `packages/contracts` — Solidity sources for `IncidentRegistry` and
  `EmergencyPolicyController` plus Foundry tests.
- `packages/policy` — canonical types, Zod schemas, scoring, planning,
  hashing.
- `packages/sdk` — typed client used by `apps/api`, `apps/web`, and
  external integrations.
- `packages/integrations` — GoPlus, CertiK, Alibaba, Qwen, and Pharos
  clients with `MockClient` defaults.
- `packages/testkit` — fixtures and a deterministic JSON-RPC mock for
  integration tests.
- `scripts` — deployment, isolation, secret-scan, acceptance runners.
- `deployments` — sanitized deployment manifests.
- `infra/alibaba` — Function Compute deploy configs.
- `docs` — preserved plans and additional documentation.

## Tech stack and standards

- TypeScript strict mode, ESM, Node 20+.
- Fastify for the API, Zod for schema validation, and `@noble/hashes`
  for deterministic local hashing.
- React 18 + Vite for the web app, Vitest + Testing Library for tests.
- Solidity 0.8.24 with OpenZeppelin v5, Foundry for tests.
- PostgreSQL 16 with `node-postgres` and a migration folder.
- No private key generation on behalf of the operator. The deployer key
  must be supplied via env or a hardware signer.

## Architectural decisions

### AD-1: Deterministic policy engine

The policy engine is a pure function: it takes an incident plus a set of
signals and returns a plan. No I/O, no time-of-day dependency other than
the `now` argument. This satisfies the "deterministic policy" requirement
in the architecture section of the master plan and makes the plan hash
reproducible.

### AD-2: Non-custodial responder

The responder never holds a wallet seed phrase. It consumes explicit
approvals from the caller (browser wallet, local keystore, hardware signer,
or remote signer). The plan and approvals are bound to a `planHash`, which
the contract enforces. This satisfies the "never holds or exposes a user
private key" requirement in the Definition of Done.

### AD-3: Integration clients with a MockClient default

Each partner integration is a TypeScript interface with two
implementations: a `LiveClient` and a `MockClient`. The default wiring
selects `MockClient` unless a `LIVE_INTEGRATIONS=1` env flag is set, so
unit tests and CI never call external services. This keeps the build
reproducible and the secret surface minimal.

### AD-4: Solidity contracts first, optionality for OpenZeppelin

The contracts rely on OpenZeppelin's `AccessControl`, `ReentrancyGuard`,
and `Pausable` for the standard invariants. A small, self-contained
local library is used for the custom registry logic so that no private
internal dependency leaks across projects. The full source compiles with
`forge build` and passes the Foundry tests in `packages/contracts/test`.

### AD-5: Atlantic acceptance is opt-in

The `scripts/atlantic-acceptance.ts` script is the only place that
performs the on-chain acceptance scenarios. It refuses to run unless the
required environment variables are present, and it writes a clear
blocker message otherwise. It never invents transaction hashes.

## Deviations from the master plan

The master plan is implemented in full. The only explicit deviations are:

- **Foundry is the primary test runner for Solidity.** This is the
  standard in the Pharos Atlantic ecosystem, and the master plan names
  Foundry in the tech stack line.
- **Vitest is used for the TypeScript packages** because the master plan
  does not pin a runner and Vitest integrates cleanly with Vite for the
  web app.

## Security posture

- All inputs cross a Zod boundary before reaching domain logic.
- Plan execution is gated by an on-chain multisig-style threshold stored
  in `EmergencyPolicyController`.
- Approvals expire. A plan older than `expiresAt` is rejected both in
  the policy engine and on chain.
- The responder never reuses nonces across replays; it pulls the pending
  nonce from the chain.
- Secrets are read from env. A `secret-scan` script greps the working
  tree for known secret formats before any release is tagged.
