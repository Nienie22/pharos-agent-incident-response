# Web demo report (2026-06-14)

## What was built

The web app at `apps/web` is now a full interactive demo of the Pharos Agent Incident
Response pipeline. It works in two modes:

- **Live mode** &mdash; when `VITE_API_URL` points to a reachable HTTP API, the UI talks
  to it via the `HttpClient` from `@pharos-incident/sdk`. If the API is reachable the
  status bar shows `API ONLINE` and the mode badge in the header shows `LIVE`.
- **Demo mode (default)** &mdash; when no API is reachable, the UI uses an in-memory
  `MockClient` that satisfies the `PharosIncidentClient` interface. A banner in the
  main area makes this visible to the user.

The same UI is used in both modes. No special "demo routes" are needed.

## New files

```
apps/web/src/
  App.tsx                          # router setup, wraps everything in ClientProvider
  components/AppLayout.tsx         # header / sidebar / status bar / mode banner
  components/shared.tsx            # SeverityPill, IncidentCard, SignalList, LogView, Alert
  lib/MockClient.ts                # offline PharosIncidentClient + DemoState
  lib/ClientContext.tsx            # React context: live detection + reset + auto tick
  lib/seed.ts                      # 3 demo incidents + helpers (severity, shortHash, ...)
  lib/policyAdapter.ts             # thin re-export so the demo can call buildPlan() directly
  pages/DashboardPage.tsx          # KPIs + recent incidents + activity log
  pages/IncidentsListPage.tsx      # filterable / searchable incident table
  pages/IncidentDetailPage.tsx     # full pipeline: triage / propose / simulate / approve / execute / verify / close
  pages/DemoScenariosPage.tsx      # 3 canned scenarios that run end-to-end
  pages/SettingsPage.tsx           # API base, demo reset, about
  styles/app.css                   # dark security theme (no external CSS deps)
  main.tsx                         # now renders <App /> + imports app.css

apps/web/test/
  MockClient.test.ts               # 5 unit tests covering MockClient behaviour
  pages.test.tsx                   # 5 page-level tests using MemoryRouter
```

The pre-existing `apps/web/src/components/CommandCenter.tsx` and its
`apps/web/test/CommandCenter.test.tsx` are kept unchanged so the original dashboard
component is still available. The router does not mount it, but its 4 tests still pass.

## Routes

- `/` &mdash; Dashboard with KPIs, recent incidents, and the live activity log.
- `/incidents` &mdash; Table view with severity filter and free-text search.
- `/incidents/:id` &mdash; Full incident detail: timeline, signals, plan, approvals,
  execution, closure, with action buttons for every step.
- `/demo` &mdash; Three canned scenarios:
  - Malicious approval (CRITICAL, expected action `REVOKE_APPROVAL`)
  - Suspicious tx burst (HIGH, expected action `SNAPSHOT`)
  - Leaked session key (CRITICAL, expected action `PAUSE_AGENT`)
  Each scenario runs the full `detect -> triage -> propose -> simulate -> approve ->
  execute -> verify -> close` pipeline against the mock client and updates the log
  in real time. A "Run all scenarios" button runs them sequentially. A "Reset demo
  state" button rebuilds the in-memory store from the 3 seed incidents.
- `/settings` &mdash; Edit the API base URL, reset the demo state, see the current
  mode and counters.

## Data flow

```
+----------------+      +-----------------+      +--------------------+
| React UI       | ---> | ClientProvider  | ---> | HttpClient | Mock  |
| (pages, hooks) |      | (live detection |      |   Client           |
|                | <--- |  + state + tick)| <--- | (PharosIncident-   |
+----------------+      +-----------------+      |  Client interface) |
                                                   +--------------------+
```

`ClientProvider` probes the configured API base once. If the probe fails it falls
back to `MockClient`. A 1Hz tick keeps relative timestamps fresh in the UI without
re-fetching anything.

## Verification

- `npx tsc -p tsconfig.json --noEmit` in `apps/web`: silent (no errors).
- `npx tsc -p tsconfig.json` at the root: silent.
- `npx vitest run --no-coverage` in `apps/web`:
  - `CommandCenter.test.tsx` &mdash; 4 passed (kept)
  - `MockClient.test.ts` &mdash; 5 passed
  - `pages.test.tsx` &mdash; 5 passed
  - **14 passed, 0 failed**
- `npx vite build` in `apps/web`:
  ```
  dist/index.html                 0.41 kB
  dist/assets/index-*.css         8.69 kB
  dist/assets/index-*.js        265.71 kB
  built in 1.75s
  ```
- Workspace tests (`npm run test --workspaces --if-present`):
  - `@pharos-incident/api` &mdash; 2 passed
  - `@pharos-incident/mcp` &mdash; 3 passed
  - `@pharos-incident/web` &mdash; 14 passed (4 + 5 + 5)
  - `@pharos-incident/responder` &mdash; 7 passed
  - `@pharos-incident/watcher` &mdash; 3 passed
  - **29 vitest passed, 0 failed**
- Foundry tests in `packages/contracts`: **14 passed, 0 failed** (8
  `EmergencyPolicyController` + 6 `IncidentRegistry`).
- `node scripts/isolation-check.mjs` &mdash; `isolation-check: OK`.
- `node scripts/secret-scan.mjs` &mdash; `secret-scan: OK`.

Total verified: **29 vitest + 14 forge = 43 unit/integration tests pass**, plus the
5 Atlantic acceptance scenarios that were recorded earlier in
`docs/atlantic-acceptance-results.md`. With the 5 acceptance scenarios this matches
the 48-test target the master plan documents.

## Protected files

The protected files have not been modified:

| File | SHA-256 |
| --- | --- |
| `README.md` | `B77E67CE11790453CE9D04A71488AB64D10E92BC593EE12C86BA5B6836C8A13A` |
| `docs/superpowers/plans/2026-06-13-agent-incident-response-master-plan.md` | `ED2EBADD0D89AB24F7830DA4ED9CA110F7C8A591C43C1484BA42724960DF0E25` |

Both hashes match the values recorded in
`docs/plan-preservation-manifest.md` and
`docs/plan-preservation-final-report.md`.

## Dependencies

One new runtime dependency was added: `react-router-dom@^6.26.0` (and its
`react-router` peer) inside the `@pharos-incident/web` workspace only. It is
declared in `apps/web/package.json` and is now present in `package-lock.json`.

## How to try it

```bash
# 1. Install
npm install

# 2. Run all tests
npm run test --workspaces --if-present

# 3. Typecheck
npx tsc -p tsconfig.json

# 4. Build the web app
cd apps/web && npx vite build

# 5. Run the web app in dev mode (auto-falls back to demo mode if no API)
cd apps/web && npx vite
# then open http://localhost:5173
```

In demo mode the app boots with 3 seed incidents and you can run a scenario from
the "Demo Scenarios" page or open an incident from the "Incidents" page and step
through the full pipeline manually.