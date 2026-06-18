# Isolation Verification

This document records how the project is kept strictly independent of any
other Pharos future-idea workspace.

## Hard rules

1. The package namespace is `@pharos-incident/*`. No `pharos-*` or
   `@pharos/*` (non-incident) packages are imported by this project.
2. No file under another future-idea directory is read, copied, or symlinked
   into this workspace. Implementation files live only under this
   `<IDEA_FOLDER>`.
3. All secrets, RPC URLs, deployer keys, and API keys are read from a
   local `.env` file or from environment variables. They are never
   imported from another project.
4. The PostgreSQL database, the watcher queue, and the responder job
   runner all use a fresh local instance by default. Connection strings
   default to `postgres://incident:incident@localhost:5432/incident`.
5. The Pharos Atlantic deployment is performed by a deployer wallet
   generated for this project, with addresses recorded in
   `deployments/atlantic.json`. No historical deployment from another
   project is reused.

## Verification procedure (run by maintainers)

```text
node scripts/isolation-check.mjs
```

The check performs:

- A scan of `package.json` files for forbidden cross-project imports.
- A scan of source files for absolute paths referencing any sibling
  `pharos-future-ideas/0*-*` directory.
- A scan of environment variables and `.env` files for any value that also
  appears in another future-idea workspace.
- A confirmation that no `deployments/*.json` contains an address
  previously published by another project.

## Result of the initial isolation check

Recorded in `docs/isolation-check-report.md`. Re-runs after any change
overwrite that report. A green report is a precondition for the final
acceptance step.
