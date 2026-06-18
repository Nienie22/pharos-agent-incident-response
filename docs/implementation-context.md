# Implementation Context

This document describes the environment in which the implementation was
executed. It is required reading for any reviewer who wants to reproduce or
audit the work.

## Workspace

- Root: `<IDEA_FOLDER>` (the directory that contains `README.md` and the
  protected master plan).
- Operating system: Windows (PowerShell 7+ assumed).
- Shell: `powershell` (the default shell for this Codex desktop thread).

## Tooling baseline detected

| Tool | How it was checked | Result |
|------|--------------------|--------|
| `node` | not executed in this turn | not verified |
| `npm`  | not executed in this turn | not verified |
| `git`  | not executed in this turn | not verified |
| `forge` (Foundry) | not executed in this turn | not verified |

> The implementation must be runnable on a developer machine that has Node.js
> 20+, npm 10+, git, and (optionally) Foundry installed. The README inside
> the project documents the exact prerequisite check commands.

## What this project owns

The project is self-contained. It uses:

- A new `@pharos-incident/*` npm namespace.
- New deployer / reporter / approver / responder credentials that are
  generated locally (no keys, RPC URLs, API keys, contract addresses, or
  deployment manifests imported from any other project).
- A new local-only PostgreSQL via `docker compose` (no shared DB).
- A new Pharos Atlantic deployment produced with these new credentials.

## What this project explicitly does not use

- No `node_modules`, lockfiles, secrets, contract artifacts, deployment
  manifests, or generated SDK code copied from any other Pharos future-idea
  workspace.
- No private keys generated on behalf of the user. When the responder needs a
  signer, it consumes a `PHAROS_DEPLOYER_PRIVATE_KEY` (etc.) read from a
  local `.env` file that is git-ignored.
- No real calls to GoPlus, CertiK, or Alibaba are hard-coded. Each
  integration is implemented behind a typed client with a `MockClient`
  default that runs in tests and offline mode, and a `LiveClient` selected
  by environment variable.

## External partner access at runtime

| Partner | Production path | Offline / test path |
|---------|-----------------|---------------------|
| Pharos Atlantic RPC | `PHAROS_RPC_URL` env var | `MockRpc` in tests |
| GoPlus | `GOPLUS_API_KEY` env var | `MockGoPlusClient` |
| CertiK Skill Scanner | `CERTIK_API_KEY` env var | `MockCertiKClient` |
| Alibaba Function Compute | deploys via `infra/alibaba` | local `services/watcher` worker |
| Qwen / Model Studio | `QWEN_API_KEY` env var | deterministic local summariser |
| PostgreSQL | `DATABASE_URL` env var | `docker compose up postgres` |

## Atlantic acceptance

The master plan requires running the contract suite on Pharos Atlantic. The
implementation includes a runnable end-to-end script
(`scripts/atlantic-acceptance.ts`) that:

1. Compiles and deploys the contracts using only credentials supplied by the
   operator (no other project state).
2. Captures contract addresses, transaction hashes, block numbers, and
   explorer links.
3. Walks the Atlantic scenarios defined in the master plan.
4. Writes a sanitised public manifest to `deployments/atlantic.public.json`
   (no private keys, no mnemonics).
5. Writes the acceptance results to `docs/atlantic-acceptance-results.md`.

If credentials are not supplied, the script exits with a clear blocker
message. It never fabricates hashes or addresses.
