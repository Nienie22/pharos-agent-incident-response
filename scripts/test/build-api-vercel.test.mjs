import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { buildApiVercel } from "../build-api-vercel.mjs";

test("bundles the real API entry without the old SHA fake transaction handler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pharos-api-bundle-"));
  try {
    const output = join(directory, "index.mjs");
    await buildApiVercel(output);
    const source = await readFile(output, "utf8");
    assert.ok(source.length > 100_000);
    assert.match(source, /PHAROS_DEPLOYER_PRIVATE_KEY/);
    assert.match(source, /registerIncident/);
    assert.doesNotMatch(source, /createHash\("sha256"\)/);
    Object.assign(process.env, {
      PHAROS_RPC_URL: "https://atlantic.dplabs-internal.com",
      PHAROS_CHAIN_ID: "688689",
      PHAROS_EXPLORER_URL: "https://atlantic.pharosscan.xyz",
      INCIDENT_REGISTRY_ADDRESS: "0x0d93b5cD4356652ef6b4776949A86979e9c00cdE",
      EMERGENCY_POLICY_CONTROLLER_ADDRESS: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
      AGENT_REGISTRY_ADDRESS: "0x2d1B360dec14e63846735939E793bcb1655Aa93b",
      PHAROS_DEPLOYER_PRIVATE_KEY: "0x" + "0".repeat(63) + "1",
      DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
    });
    const module = await import(pathToFileURL(output).href);
    assert.equal(typeof module.default, "function");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
