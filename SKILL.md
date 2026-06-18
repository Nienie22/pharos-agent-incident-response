---
name: pharos-agent-incident-response
description: Use when an agent needs to operate, extend, deploy, or integrate the Pharos Agent Incident Response system, including incident detection, triage, response planning, simulation, approvals, execution, closure, CLI, SDK, MCP tools, API, web command center, watcher/responder services, policy package, integrations, or Pharos Atlantic contracts.
---

# Pharos Agent Incident Response

Use this skill to work on the Pharos Agent Incident Response project as an agent-facing incident operations system. The project helps detect compromised on-chain agents, triage incidents, create response plans, simulate the impact, collect approvals, execute guarded actions, and close incidents with audit evidence.

## Start Here

1. Read `README.md` for the public project overview, architecture diagrams, and package map.
2. Inspect the package or app you are changing before editing.
3. Keep generated media, local credentials, screenshots, logs, and render artifacts local-only.
4. Run the relevant validation commands before committing or publishing.

## Repository Map

- `apps/api`: HTTP API for incidents, agents, evidence, plans, approvals, and executions.
- `apps/web`: command center UI and guided demo experience.
- `apps/mcp`: MCP server exposing incident-response tools to compatible agents.
- `bin/cli.js`: CLI entrypoint published as `pharos-incident`.
- `packages/sdk`: TypeScript SDK for API clients and programmatic workflows.
- `packages/policy`: shared schemas, severity scoring, response plans, and action hashes.
- `packages/contracts`: Solidity contracts for response registries and execution control.
- `packages/integrations`: external hooks and integration helpers.
- `services/watcher`: event and telemetry watcher service.
- `services/responder`: response execution service.
- `scripts`: validation, deployment, packaging, and safety scripts.

## Incident Flow

Follow this operational flow when adding or using features:

1. Detect an alert from watcher telemetry, on-chain evidence, or an integration.
2. Create or update the incident record with evidence and affected agent context.
3. Score severity with policy logic and choose an appropriate response plan.
4. Simulate the plan before execution whenever the workflow supports it.
5. Require explicit approval for write actions.
6. Execute guarded actions through the CLI, API, MCP tool, responder service, or contract path.
7. Record receipts, resulting state, and closure notes.

## CLI

Use the CLI for local operations and demos:

```bash
npm run incident -- --help
pharos-incident --help
```

For write actions, require explicit confirmation:

```bash
PHAROS_INCIDENT_CONFIRM=1 pharos-incident execute --incident <id> --plan <plan>
```

Never claim a transaction or remediation succeeded unless the command returned a real receipt or the workflow is explicitly running in demo mode.

## SDK

Use `@pharos-incident/sdk` for programmatic clients:

```ts
import { PharosIncidentClient } from "@pharos-incident/sdk";

const client = new PharosIncidentClient({
  baseUrl: process.env.PHAROS_INCIDENT_API_URL
});

const incident = await client.incidents.get("incident-id");
```

Keep SDK changes compatible with the public API surface and update examples when method names or response shapes change.

## MCP

Use `apps/mcp` when exposing the workflow to agents. Expected tool categories include:

- Agent inventory and health lookup.
- Incident creation, lookup, update, and closure.
- Evidence attachment and retrieval.
- Severity scoring and response-plan generation.
- Simulation, approval, execution, and audit trail retrieval.

For MCP write operations, require a confirmation flag such as `confirm: true`. Do not silently execute a response action from an agent prompt.

## Contracts

Use contract commands for Pharos Atlantic or local Solidity validation:

```bash
npm run contracts:build
npm run contracts:test
npm run deploy:atlantic
npm run acceptance:atlantic
```

Treat contract addresses, private keys, RPC URLs, and deployment receipts as sensitive operational material. Do not commit secrets or private deployment files.

## Validation

Run the narrowest validation that covers the change. For broad changes, use:

```bash
npm install
npm run build
npm run typecheck
npm test
npm run secret-scan
```

Before committing or pushing, always run:

```bash
git status --short --ignored
npm run secret-scan
```

Confirm local-only paths remain untracked or ignored, especially `.env`, `video/`, `docs/superpowers/`, `artifacts/`, logs, screenshots, `dist/`, and generated deployment bundles.

## Publishing

Public npm packages should be published in dependency order:

1. `@pharos-incident/policy`
2. `@pharos-incident/sdk`
3. `@pharos-incident/mcp`
4. `pharos-agent-incident-response`

Use `npm publish --dry-run --access public` before real publishing. Real publishing requires authenticated npm credentials and should not include local-only artifacts.

## Safety Rules

- Do not commit `.env`, API keys, private keys, GitHub tokens, npm tokens, RPC credentials, or wallet material.
- Do not delete local artifacts unless the user explicitly asks for deletion.
- Do not stage media/render/superpower files unless the user explicitly asks to publish them.
- Do not invent blockchain receipts, transaction hashes, approvals, or incident outcomes.
- Prefer existing package boundaries and local helpers over new abstractions.
- Keep README, SDK examples, CLI help, and MCP tool behavior consistent when changing public workflows.
