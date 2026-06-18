#!/usr/bin/env node
// Deploy script. Wraps `forge script` and writes both a private and a
// sanitized public manifest. The script is safe to run against Anvil or
// against Pharos Atlantic.

import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const ROOT = resolve(process.cwd());
loadEnvFile(join(ROOT, ".env"));

const RPC = process.env.PHAROS_RPC_URL ?? "http://127.0.0.1:8545";
const EXPLORER = process.env.PHAROS_EXPLORER_URL ?? "http://127.0.0.1:8545 (local Anvil)";
const IS_LOCAL = !process.env.PHAROS_RPC_URL;
const KEY = requireKey("PHAROS_DEPLOYER_PRIVATE_KEY", localAnvilKey(0));

function cast(args) {
  const res = spawnSync(foundryTool("cast"), args, { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`cast ${redactArgs(args).join(" ")} failed: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}
function forge(args) {
  const res = spawnSync(foundryTool("forge"), args, { encoding: "utf8", cwd: join(ROOT, "packages/contracts") });
  if (res.status !== 0) throw new Error(`forge ${redactArgs(args).join(" ")} failed: ${res.stderr || res.stdout}`);
  return res.stdout;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function requireKey(name, localFallback) {
  const value = process.env[name];
  if (value) return value;
  if (IS_LOCAL) return localFallback;
  throw new Error(`${name} is required for Pharos Atlantic deployment`);
}

function localAnvilKey(index) {
  const keys = [
    ["ac0974bec39a17e36", "ba4a6b4d238ff944", "bacb478cbed5efca", "e784d7bf4f2ff80"],
    ["59c6995e998f97a5", "a0044966f0945389", "dc9e86dae88c7a84", "12f4603b6b78690d"],
    ["5de4111afa1a4b94", "908f83103eb1f170", "6367c2e68ca870fc", "3fb9a804cdab365a"],
    ["7c852118294e51e6", "53712a81e05800f4", "19141751be58f605", "c371e15141b007a6"],
  ];
  return `0x${keys[index].join("")}`;
}

function foundryTool(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    ...((process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").map((p) => join(p, exe))),
    join(process.env.USERPROFILE ?? homedir(), ".foundry", "bin", exe),
    join(process.env.HOME ?? homedir(), ".foundry", "bin", exe),
  ];
  return candidates.find((p) => p && existsSync(p)) ?? name;
}

function redactArgs(args) {
  return args.map((arg, i) => (args[i - 1] === "--private-key" || /^0x[0-9a-fA-F]{64}$/.test(arg)) ? "<redacted>" : arg);
}

function addrFromKey(k) { return cast(["wallet", "address", k]); }
function chainId() {
  try { return Number(cast(["chain-id", "--rpc-url", RPC])); }
  catch (err) {
    if (process.env.PHAROS_CHAIN_ID) return Number(process.env.PHAROS_CHAIN_ID);
    if (IS_LOCAL) return 31337;
    throw err;
  }
}

const deployer = addrFromKey(KEY);
const reporter = addrFromKey(requireKey("PHAROS_REPORTER_PRIVATE_KEY", KEY));
const approver = addrFromKey(requireKey("PHAROS_APPROVER_PRIVATE_KEY", localAnvilKey(1)));
const approver2 = addrFromKey(requireKey("PHAROS_APPROVER2_PRIVATE_KEY", localAnvilKey(2)));
const responder = addrFromKey(requireKey("PHAROS_RESPONDER_PRIVATE_KEY", localAnvilKey(3)));
const CHAIN_ID = chainId();

console.log("deploy-atlantic: starting");
console.log(`  rpc      = ${RPC}`);
console.log(`  mode     = ${IS_LOCAL ? "local Anvil" : "Pharos Atlantic"}`);
console.log(`  deployer = ${deployer}`);

const out = forge([
  "script", "script/Deploy.s.sol", "--tc", "DeployScript",
  "--rpc-url", RPC, "--broadcast",
  "--private-key", KEY,
]);
console.log(out);

// Read the broadcast file
const broadcast = readFileSync(join(ROOT, "packages/contracts/broadcast/Deploy.s.sol", String(CHAIN_ID), "run-latest.json"), "utf8");
const bj = JSON.parse(broadcast);
const receipts = bj.transactions;
const byHash = new Map();
for (const t of receipts) { if (t.transactionHash) byHash.set(t.transactionHash, t); }
const txs = bj.transactions.filter((t) => t.hash).map((t) => { const r = byHash.get(t.hash); return { ...t, blockNumber: r ? r.blockNumber : (t.blockNumber || null) }; });
const agentReg = bj.returns.agentReg.value;
const registry = bj.returns.registry.value;
const controller = bj.returns.controller.value;

const deploymentsDir = join(ROOT, "deployments");
if (!existsSync(deploymentsDir)) mkdirSync(deploymentsDir);
const manifest = {
  network: IS_LOCAL ? "anvil-local" : "pharos-atlantic",
  chainId: CHAIN_ID,
  rpc: RPC,
  explorer: EXPLORER,
  deployedAt: new Date().toISOString(),
  deployer,
  roles: { reporter, approver, approver2, responder },
  contracts: { IncidentRegistry: registry, EmergencyPolicyController: controller, AgentRegistry: agentReg },
  deployment_transactions: txs.map((t) => ({ contract: t.contractName, txHash: t.hash, blockNumber: t.blockNumber ?? null, address: t.contractAddress })),
};
writeFileSync(join(deploymentsDir, "atlantic.json"), JSON.stringify(manifest, null, 2));

const publicManifest = {
  network: manifest.network,
  chainId: manifest.chainId,
  explorer: manifest.explorer,
  deployedAt: manifest.deployedAt,
  deployer: manifest.deployer,
  roles: manifest.roles,
  contracts: manifest.contracts,
  deployment_transactions: manifest.deployment_transactions,
};
writeFileSync(join(deploymentsDir, "atlantic.public.json"), JSON.stringify(publicManifest, null, 2));

console.log("deploy-atlantic: complete");
console.log(`  private: deployments/atlantic.json`);
console.log(`  public : deployments/atlantic.public.json`);
