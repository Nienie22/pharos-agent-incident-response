# Pharos Agent Incident Response

Security response system for detecting suspected wallet or agent compromise,
proposing containment actions, collecting approvals, and producing verifiable
incident receipts.

## Status

Implemented and deployed to Pharos Atlantic testnet.

- Local TypeScript build and workspace typechecks pass.
- JavaScript/TypeScript test suites pass for API, MCP, web, responder,
  watcher, integrations, policy, and SDK.
- Foundry contract tests are wired through `npm run contracts:test`; they
  require Foundry to be installed locally.
- Pharos Atlantic acceptance scenarios S1-S5 passed on chain ID `688689`.

Deployment evidence:

- Report: `docs/atlantic-acceptance-results.md`
- Public manifest: `deployments/atlantic.public.json`
- Full acceptance receipts: `deployments/atlantic.acceptance.json`

## Testnet Contracts

Network: `pharos-atlantic`

| Contract | Address |
| --- | --- |
| IncidentRegistry | `0x0d93b5cD4356652ef6b4776949A86979e9c00cdE` |
| EmergencyPolicyController | `0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d` |
| AgentRegistry | `0x2d1B360dec14e63846735939E793bcb1655Aa93b` |

Explorer: `https://atlantic.pharosscan.xyz`

## What Is Included

- `apps/api`: Fastify HTTP API for detect, triage, propose, simulate,
  approve, execute, verify, and close.
- `apps/web`: React/Vite Incident Command Center with live API mode,
  injected wallet connection for Pharos Atlantic signing, and default mock
  demo mode.
- `apps/mcp`: MCP tool surface with read-only tools and guarded write tools.
- `bin/cli.js`: installable CLI entrypoint for the same API surface.
- `packages/sdk`: typed TypeScript client.
- `packages/policy`: canonical types, Zod schemas, scoring, planning, hashes.
- `packages/contracts`: Solidity incident registry and policy controller.
- `services/watcher`: signal collection and checkpointing.
- `services/responder`: simulation, authorization, execution, and verification.
- `packages/integrations`: GoPlus, Pharos, and webhook clients.
- `infra/alibaba`: serverless service definitions.

## Quick Start

```bash
npm install
npm run build
npm run typecheck
npm test
```

Run the web demo:

```bash
cd apps/web
npx vite
```

Open the Vite URL, currently `http://127.0.0.1:5177` in this workspace. The
demo page includes a readiness checklist, guided stepper, mode selector,
scenario presets, "What just happened?" explanation panel, and testnet
evidence panel.

`apps/web/.env.local` points the web app at the local API:

```env
VITE_API_URL=http://127.0.0.1:8799
```

Without a reachable API, the app falls back to demo mode with seeded incidents.
On the demo page, **Demo Mode** always uses the in-memory mock client, while
**Live Testnet Mode** uses the configured API and wallet.

The header and Settings page include wallet controls. In live API mode, connect
an injected wallet, switch to Pharos Atlantic (`688689`), then approve or
execute a response plan from the incident detail page. The UI signs the plan
hash with `personal_sign` and sends the account/signature through the SDK.

Run the local API for the guided demo:

```bash
cd apps/api
set PHAROS_INCIDENT_API=1
set PORT=8799
npm start
```

Run the API:

```bash
npm run build
cd apps/api
npm start
```

Use the CLI:

```bash
npm run incident -- triage --id 0x...
npx pharos-incident detect --subject 0x0000000000000000000000000000000000000001 --signals "[]"
```

Write operations require explicit confirmation:

```bash
PHAROS_INCIDENT_CONFIRM=1 npx pharos-incident approve --plan 0x... --approver 0x... --signature 0x...
```

On Windows PowerShell:

```powershell
$env:PHAROS_INCIDENT_CONFIRM = "1"
npx pharos-incident approve --plan 0x... --approver 0x... --signature 0x...
```

## Contracts And Testnet

Install Foundry before running contract tests:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
npm run contracts:test
```

On Windows, put `forge.exe` on `PATH` or install it under one of the common
locations checked by `scripts/run-forge.mjs`:

- `%USERPROFILE%\.foundry\bin`
- `%USERPROFILE%\foundry`
- `C:\foundry`

Deploy and run acceptance against configured Pharos Atlantic credentials:

```bash
cp .env.example .env
npm run deploy:atlantic
npm run acceptance:atlantic
```

## Project Plan And Reports

- Master plan: `docs/superpowers/plans/2026-06-13-agent-incident-response-master-plan.md`
- Implementation README: `docs/README-implementation.md`
- Final verification: `docs/final-verification-report.md`
- Web demo report: `docs/web-demo-report.md`
- Implementation checklist: `docs/implementation-checklist.md`
