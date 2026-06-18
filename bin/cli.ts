#!/usr/bin/env node
// Pharos Agent Incident Response CLI.
// Subcommands: detect, triage, propose, simulate, approve, execute, verify, close.
// All operations are read-only by default. Write operations require
// PHAROS_INCIDENT_CONFIRM=1.

import { HttpClient } from "@pharos-incident/sdk";

const base = process.env.PHAROS_INCIDENT_API_URL ?? "http://localhost:8787";
const client = new HttpClient(base);

const [, , cmd, ...rest] = process.argv;

const usage = [
  "usage: pharos-incident <command> [options]",
  "",
  "commands:",
  "  detect   --subject <address> --signals <json>",
  "  triage   --id <incident-id>",
  "  propose  --id <incident-id>",
  "  simulate --plan <plan-hash>",
  "  approve  --plan <plan-hash> --approver <address> --signature <hex>",
  "  execute  --plan <plan-hash> --approver <address> --signature <hex>",
  "  verify   --plan <plan-hash>",
  "  close    --plan <plan-hash>",
].join("\n");

function arg(name) {
  const i = rest.indexOf(`--${name}`);
  if (i < 0) throw new Error(`missing --${name}`);
  return rest[i + 1];
}

function requireConfirm(label) {
  if (process.env.PHAROS_INCIDENT_CONFIRM !== "1") {
    console.error(`refusing to ${label} without PHAROS_INCIDENT_CONFIRM=1`);
    process.exit(2);
  }
}

async function main() {
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(usage);
    process.exit(cmd ? 0 : 2);
  }

  switch (cmd) {
    case "detect": {
      const r = await client.detect({ subject: arg("subject"), rawSignals: JSON.parse(arg("signals")) });
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "triage": {
      const r = await client.triage(arg("id"));
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "propose": {
      const r = await client.propose(arg("id"));
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "simulate": {
      const r = await client.simulate(arg("plan"));
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "approve": {
      requireConfirm("approve");
      const r = await client.approve({ planHash: arg("plan"), approver: arg("approver"), signature: arg("signature") });
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "execute": {
      requireConfirm("execute");
      const r = await client.execute({ planHash: arg("plan"), approver: arg("approver"), signature: arg("signature") });
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "verify": {
      const r = await client.verify(arg("plan"));
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case "close": {
      requireConfirm("close");
      const r = await client.close(arg("plan"));
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    default:
      console.error(usage);
      process.exit(2);
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
