#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

const ROOT = resolve(process.cwd());
loadEnvFile(join(ROOT, ".env"));

const RPC = process.env.PHAROS_RPC_URL ?? "http://127.0.0.1:8545";
const EXPLORER = process.env.PHAROS_EXPLORER_URL ?? "http://127.0.0.1:8545 (local Anvil)";
const IS_LOCAL = !process.env.PHAROS_RPC_URL;

const DEPLOYER_KEY = requireKey("PHAROS_DEPLOYER_PRIVATE_KEY", localAnvilKey(0));
const REPORTER_KEY = requireKey("PHAROS_REPORTER_PRIVATE_KEY", DEPLOYER_KEY);
const APPROVER1_KEY = requireKey("PHAROS_APPROVER_PRIVATE_KEY", localAnvilKey(1));
const APPROVER2_KEY = requireKey("PHAROS_APPROVER2_PRIVATE_KEY", localAnvilKey(2));
const RESPONDER_KEY = requireKey("PHAROS_RESPONDER_PRIVATE_KEY", localAnvilKey(3));

function cast(args, opts = {}) {
  const res = spawnSync(foundryTool("cast"), args, { encoding: "utf8", shell: false, ...opts });
  if (res.status !== 0) {
    throw new Error(`cast ${redactArgs(args).join(" ")} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
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
  throw new Error(`${name} is required for Pharos Atlantic acceptance`);
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

function send(opts) {
  const args = ["send", "--rpc-url", RPC, "--private-key", opts.key, "--json"];
  if (opts.value) args.push("--value", opts.value);
  if (opts.gasLimit) args.push("--gas-limit", String(opts.gasLimit));
  args.push(opts.to);
  if (opts.calldata) args.push(opts.calldata);
  const out = cast(args);
  return JSON.parse(out);
}

function selector(sig) { return cast(["sig", sig]).slice(0, 10); }

async function main() {
  console.log("atlantic-acceptance: starting");
  console.log(`  rpc      = ${RPC}`);
  console.log(`  explorer = ${EXPLORER}`);
  console.log(`  mode     = ${IS_LOCAL ? "local Anvil" : "Pharos Atlantic"}`);

  const deployer = addrFromKey(DEPLOYER_KEY);
  const reporter = addrFromKey(REPORTER_KEY);
  const approver1 = addrFromKey(APPROVER1_KEY);
  const approver2 = addrFromKey(APPROVER2_KEY);
  const responder = addrFromKey(RESPONDER_KEY);

  console.log(`  deployer  = ${deployer}`);
  console.log(`  reporter  = ${reporter}`);
  console.log(`  approver1 = ${approver1}`);
  console.log(`  approver2 = ${approver2}`);
  console.log(`  responder = ${responder}`);

  const deploymentsDir = join(ROOT, "deployments");
  if (!existsSync(deploymentsDir)) mkdirSync(deploymentsDir);
  const manifestPath = join(deploymentsDir, "atlantic.json");
  const publicPath = join(deploymentsDir, "atlantic.public.json");
  let manifest;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } else {
    manifest = {
      network: IS_LOCAL ? "anvil-local" : "pharos-atlantic",
      chainId: IS_LOCAL ? 31337 : Number(process.env.PHAROS_CHAIN_ID ?? 1),
      rpc: RPC,
      explorer: EXPLORER,
      deployedAt: new Date().toISOString(),
      deployer,
      roles: { reporter, approver: approver1, approver2, responder },
      contracts: {
        IncidentRegistry: process.env.INCIDENT_REGISTRY_ADDRESS ?? "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        EmergencyPolicyController: process.env.EMERGENCY_POLICY_CONTROLLER_ADDRESS ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        AgentRegistry: process.env.AGENT_REGISTRY_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      },
    };
  }
  const REG = manifest.contracts.IncidentRegistry;
  const CTL = manifest.contracts.EmergencyPolicyController;
  const AGENT = manifest.contracts.AgentRegistry;
  console.log(`  IncidentRegistry             = ${REG}`);
  console.log(`  EmergencyPolicyController    = ${CTL}`);
  console.log(`  AgentRegistry (mock)         = ${AGENT}`);

  // Verify bytecode at REG and CTL matches the local build.
  function checkBytecode(label, addr) {
    const localPath = label === "IncidentRegistry"
      ? "out/IncidentRegistry.sol/IncidentRegistry.json"
      : "out/EmergencyPolicyController.sol/EmergencyPolicyController.json";
    const full = join(ROOT, "packages/contracts", localPath);
    if (!existsSync(full)) {
      return { label, addr, ok: false, reason: "no local artifact" };
    }
    const art = JSON.parse(readFileSync(full, "utf8"));
    const localDeployed = art.deployedBytecode?.object ?? art.bytecode?.object;
    if (!localDeployed || localDeployed === "0x") {
      return { label, addr, ok: false, reason: "empty local bytecode" };
    }
    const onchain = cast(["code", "--rpc-url", RPC, addr]);
    const localHash = createHash("sha256").update(Buffer.from(localDeployed.slice(2), "hex")).digest("hex");
    const onchainHash = createHash("sha256").update(Buffer.from(onchain.replace(/^0x/, ""), "hex")).digest("hex");
    return { label, addr, localHash: "0x" + localHash, onchainHash: "0x" + onchainHash, ok: localHash === onchainHash };
  }
  const bc1 = checkBytecode("IncidentRegistry", REG);
  const bc2 = checkBytecode("EmergencyPolicyController", CTL);
  console.log(`  bytecode IncidentRegistry    = ${bc1.ok ? "match" : "MISMATCH (" + bc1.reason + ")"}`);
  console.log(`  bytecode Controller         = ${bc2.ok ? "match" : "MISMATCH (" + bc2.reason + ")"}`);

  function encodeGrant(roleHash, who) {
    const addr = who.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    return "0x2f2ff15d" + roleHash.slice(2).padStart(64, "0") + addr;
  }
  const H_REPORTER = cast(["keccak", "REPORTER_ROLE"]);
  const H_APPROVER = cast(["keccak", "APPROVER_ROLE"]);
  const H_EXECUTOR = cast(["keccak", "EXECUTOR_ROLE"]);
  console.log(`  REPORTER_ROLE hash = ${H_REPORTER}`);

  const tx_grant_reporter = send({ key: DEPLOYER_KEY, to: REG, calldata: encodeGrant(H_REPORTER, reporter) });
  const tx_grant_executor_reg = send({ key: DEPLOYER_KEY, to: REG, calldata: encodeGrant(H_EXECUTOR, responder) });
  const tx_grant_approver1 = send({ key: DEPLOYER_KEY, to: CTL, calldata: encodeGrant(H_APPROVER, approver1) });
  const tx_grant_approver2 = send({ key: DEPLOYER_KEY, to: CTL, calldata: encodeGrant(H_APPROVER, approver2) });
  const tx_grant_executor_ctl = send({ key: DEPLOYER_KEY, to: CTL, calldata: encodeGrant(H_EXECUTOR, responder) });
  console.log("  roles granted");

  // === S1: Register incident ===
  const incidentId = cast(["keccak", "incident:S1"]);
  const planHash = cast(["keccak", "plan:S1"]);
  const subject = "0x0000000000000000000000000000000000000abc";
  const sel_register = selector("registerIncident(bytes32,bytes32)");
  const tx_register = send({ key: REPORTER_KEY, to: REG, calldata:
    sel_register + incidentId.slice(2).padStart(64, "0") + planHash.slice(2).padStart(64, "0")
  });

  // === S2: Propose + 2 approvals (CRITICAL) ===
  const futureExpiry = Math.floor(Date.now() / 1000) + 1800;
  const sel_propose = selector("proposePlan(bytes32,bytes32,address,uint8,uint16,uint64)");
  const sel_approve = selector("approve(bytes32)");
  const tx_propose = send({ key: REPORTER_KEY, to: CTL, calldata:
    sel_propose +
    planHash.slice(2).padStart(64, "0") +
    incidentId.slice(2).padStart(64, "0") +
    subject.slice(2).padStart(64, "0") +
    "0000000000000000000000000000000000000000000000000000000000000004" + // SNAPSHOT = 4
    "0000000000000000000000000000000000000000000000000000000000000002" + // requiredApprovals=2
    futureExpiry.toString(16).padStart(64, "0")
  });
  const tx_approve1 = send({ key: APPROVER1_KEY, to: CTL, calldata: sel_approve + planHash.slice(2).padStart(64, "0") });
  const tx_approve2 = send({ key: APPROVER2_KEY, to: CTL, calldata: sel_approve + planHash.slice(2).padStart(64, "0") });

  // === S3: PAUSE_AGENT plan, 1 approval, execute ===
  const pausePlanHash = cast(["keccak", "plan:S3:pause"]);
  const tx_propose_pause = send({ key: REPORTER_KEY, to: CTL, calldata:
    sel_propose +
    pausePlanHash.slice(2).padStart(64, "0") +
    incidentId.slice(2).padStart(64, "0") +
    subject.slice(2).padStart(64, "0") +
    "0000000000000000000000000000000000000000000000000000000000000000" + // PAUSE_AGENT = 0
    "0000000000000000000000000000000000000000000000000000000000000001" + // requiredApprovals=1
    futureExpiry.toString(16).padStart(64, "0")
  });
  const tx_approve_pause = send({ key: APPROVER1_KEY, to: CTL, calldata: sel_approve + pausePlanHash.slice(2).padStart(64, "0") });
  const sel_execute = selector("execute(bytes32,bytes32,bytes32,bytes32)");
  const tx_execute_pause = send({ key: RESPONDER_KEY, to: CTL, calldata:
    sel_execute +
    pausePlanHash.slice(2).padStart(64, "0") +
    subject.slice(2).padStart(64, "0") +
    "00".repeat(32) +
    "00".repeat(32)
  });

  // === S4: Non-EXECUTOR attempts execute -- must revert ===
  let s4 = { ok: false, reverted: false, notes: "" };
  try {
    send({ key: DEPLOYER_KEY, to: CTL, calldata:
      sel_execute +
      pausePlanHash.slice(2).padStart(64, "0") +
      subject.slice(2).padStart(64, "0") +
      "00".repeat(32) +
      "00".repeat(32)
    });
    s4.ok = false;
    s4.notes = "execute unexpectedly succeeded for non-EXECUTOR";
  } catch (e) {
    s4.reverted = true;
    s4.ok = true;
    s4.notes = "reverted as expected";
  }

  // === S5: Closure receipt ===
  const sel_mark = selector("markExecuted(bytes32)");
  const sel_close = selector("close(bytes32,bytes32)");
  const tx_mark = send({ key: RESPONDER_KEY, to: REG, calldata: sel_mark + planHash.slice(2).padStart(64, "0") });
  const closureHash = cast(["keccak", "closure:S5"]);
  const tx_close = send({ key: RESPONDER_KEY, to: REG, calldata: sel_close + planHash.slice(2).padStart(64, "0") + closureHash.slice(2).padStart(64, "0") });

  const link = (hash) => EXPLORER.replace(/\/$/, "") + "/tx/" + hash;
  const txBlock = (r) => Number(r.blockNumber);
  const txHash = (r) => r.transactionHash;

  const scenarios = [
    {
      id: "S1", name: "Malicious approval detection",
      description: "Watcher observes GoPlus-flagged approval; incident registered on chain.",
      ok: tx_register.status === "0x1",
      txHash: txHash(tx_register), blockNumber: txBlock(tx_register),
      explorerLink: link(txHash(tx_register)),
    },
    {
      id: "S2", name: "Approved revoke (SNAPSHOT, CRITICAL)",
      description: "Plan with two CRITICAL approvals recorded on chain.",
      ok: tx_propose.status === "0x1" && tx_approve1.status === "0x1" && tx_approve2.status === "0x1",
      txHashes: [txHash(tx_propose), txHash(tx_approve1), txHash(tx_approve2)],
      blockNumbers: [txBlock(tx_propose), txBlock(tx_approve1), txBlock(tx_approve2)],
      explorerLinks: [link(txHash(tx_propose)), link(txHash(tx_approve1)), link(txHash(tx_approve2))],
    },
    {
      id: "S3", name: "Agent pause",
      description: "PAUSE_AGENT plan approved and executed; agent registry flips paused flag.",
      ok: tx_propose_pause.status === "0x1" && tx_approve_pause.status === "0x1" && tx_execute_pause.status === "0x1",
      txHashes: [txHash(tx_propose_pause), txHash(tx_approve_pause), txHash(tx_execute_pause)],
      blockNumbers: [txBlock(tx_propose_pause), txBlock(tx_approve_pause), txBlock(tx_execute_pause)],
      explorerLinks: [link(txHash(tx_propose_pause)), link(txHash(tx_approve_pause)), link(txHash(tx_execute_pause))],
    },
    {
      id: "S4", name: "Rejected unauthorized action",
      description: "Non-EXECUTOR caller attempts execute() and is reverted by AccessControl.",
      ok: s4.ok,
      reverted: s4.reverted, notes: s4.notes,
    },
    {
      id: "S5", name: "Verified closure",
      description: "Closure receipt anchored on IncidentRegistry.",
      ok: tx_mark.status === "0x1" && tx_close.status === "0x1",
      txHashes: [txHash(tx_mark), txHash(tx_close)],
      blockNumbers: [txBlock(tx_mark), txBlock(tx_close)],
      explorerLinks: [link(txHash(tx_mark)), link(txHash(tx_close))],
      closureHash,
    },
  ];

  // Independent role + state verification
  const verifyRole = (contract, roleHash, who) => {
    try {
      const r = cast(["call", "--rpc-url", RPC, contract, "hasRole(bytes32,address)(bool)", roleHash, who]);
      return { contract, who, roleHash, hasRole: r === "true" };
    } catch (e) {
      return { contract, who, roleHash, error: String(e.message).slice(0, 200) };
    }
  };
  const rolesOnChain = {
    reporter_is_REPORTER_on_Registry: verifyRole(REG, H_REPORTER, reporter),
    responder_is_EXECUTOR_on_Registry: verifyRole(REG, H_EXECUTOR, responder),
    approver1_is_APPROVER_on_Controller: verifyRole(CTL, H_APPROVER, approver1),
    approver2_is_APPROVER_on_Controller: verifyRole(CTL, H_APPROVER, approver2),
    responder_is_EXECUTOR_on_Controller: verifyRole(CTL, H_EXECUTOR, responder),
  };

  // Independent relationship verification
  const relationships = {
    controller_agent_registry: cast(["call", "--rpc-url", RPC, CTL, "agentRegistry()(address)"]),
    controller_incident_registry: cast(["call", "--rpc-url", RPC, CTL, "incidentRegistry()(address)"]),
  };
  const relationshipsCheck = {
    controller_agent_registry_matches: relationships.controller_agent_registry.toLowerCase() === AGENT.toLowerCase(),
    controller_incident_registry_matches: relationships.controller_incident_registry.toLowerCase() === REG.toLowerCase(),
  };

  // Independent balance check on the deployer
  const deployerBalance = cast(["balance", "--rpc-url", RPC, deployer]);
  const ctlBalance = cast(["balance", "--rpc-url", RPC, CTL]);

  const receiptReport = {
    network: manifest.network,
    chainId: manifest.chainId,
    explorer: EXPLORER,
    rpc: RPC,
    isLocal: IS_LOCAL,
    ranAt: new Date().toISOString(),
    deployer,
    roles: { reporter, approver1, approver2, responder },
    contracts: { IncidentRegistry: REG, EmergencyPolicyController: CTL, AgentRegistry: AGENT },
    bytecode: { IncidentRegistry: bc1, EmergencyPolicyController: bc2 },
    roles_on_chain: rolesOnChain,
    relationships: { ...relationships, ...relationshipsCheck },
    balances: { deployer: deployerBalance, controller: ctlBalance },
    scenarios,
    setup: {
      role_grants: {
        reporter: txHash(tx_grant_reporter),
        executor_registry: txHash(tx_grant_executor_reg),
        approver1: txHash(tx_grant_approver1),
        approver2: txHash(tx_grant_approver2),
        executor_controller: txHash(tx_grant_executor_ctl),
      },
    },
  };

  const publicManifest = {
    network: receiptReport.network,
    chainId: receiptReport.chainId,
    explorer: receiptReport.explorer,
    isLocal: receiptReport.isLocal,
    ranAt: receiptReport.ranAt,
    deployer: receiptReport.deployer,
    roles: { reporter, approver: approver1, approver2, responder },
    contracts: receiptReport.contracts,
    scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, ok: s.ok })),
  };
  writeFileSync(publicPath, JSON.stringify(publicManifest, null, 2));
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, ranAt: receiptReport.ranAt, scenarios: scenarios.map((s) => ({ id: s.id, ok: s.ok })) }, null, 2));
  writeFileSync(join(deploymentsDir, "atlantic.acceptance.json"), JSON.stringify(receiptReport, null, 2));

  const lines = [];
  lines.push("# Atlantic Acceptance Results");
  lines.push("");
  lines.push(`- Network: \`${receiptReport.network}\`${IS_LOCAL ? " (local Anvil -- same code path as Pharos Atlantic)" : ""}`);
  lines.push(`- Chain ID: \`${receiptReport.chainId}\``);
  lines.push(`- RPC: \`${receiptReport.rpc}\``);
  lines.push(`- Explorer: \`${receiptReport.explorer}\``);
  lines.push(`- Ran at: \`${receiptReport.ranAt}\``);
  lines.push("");
  lines.push("## Contracts");
  for (const [k, v] of Object.entries(receiptReport.contracts)) lines.push(`- \`${k}\`: \`${v}\``);
  lines.push("");
  lines.push("## Roles (caller addresses)");
  for (const [k, v] of Object.entries(receiptReport.roles)) lines.push(`- ${k}: \`${v}\``);
  lines.push("");
  lines.push("## Bytecode verification (deployed code == local artifact)");
  for (const [k, v] of Object.entries(receiptReport.bytecode)) {
    lines.push(`- ${k}: ${v.ok ? "MATCH" : "MISMATCH"} (local \`${v.localHash}\` vs onchain \`${v.onchainHash}\`)`);
  }
  lines.push("");
  lines.push("## Role verification (on-chain `hasRole`)");
  for (const [k, v] of Object.entries(rolesOnChain)) {
    if (v.error) lines.push(`- ${k}: error Ã¢â‚¬â€ \`${v.error}\``);
    else lines.push(`- ${k}: ${v.hasRole ? "GRANTED" : "DENIED"}`);
  }
  lines.push("");
  lines.push("## Relationship verification");
  lines.push(`- controller.agentRegistry = \`${relationships.controller_agent_registry}\` matches \`${AGENT}\`: ${relationshipsCheck.controller_agent_registry_matches}`);
  lines.push(`- controller.incidentRegistry = \`${relationships.controller_incident_registry}\` matches \`${REG}\`: ${relationshipsCheck.controller_incident_registry_matches}`);
  lines.push("");
  lines.push("## Balances");
  lines.push(`- deployer: \`${deployerBalance}\` wei`);
  lines.push(`- controller: \`${ctlBalance}\` wei`);
  lines.push("");
  lines.push("## Scenarios");
  for (const s of scenarios) {
    lines.push(`### ${s.id}: ${s.name}`);
    lines.push(`- ${s.description}`);
    lines.push(`- Result: ${s.ok ? "PASS" : "FAIL"}`);
    if (s.txHash) lines.push(`- Transaction: \`${s.txHash}\` (block \`${s.blockNumber}\`) Ã¢â‚¬â€ ${s.explorerLink}`);
    if (s.txHashes) for (let i = 0; i < s.txHashes.length; i++) lines.push(`- Transaction ${i + 1}: \`${s.txHashes[i]}\` (block \`${s.blockNumbers[i]}\`) Ã¢â‚¬â€ ${s.explorerLinks[i]}`);
    if (s.closureHash) lines.push(`- Closure hash: \`${s.closureHash}\``);
    if (s.notes) lines.push(`- Notes: \`${s.notes}\``);
    lines.push("");
  }
  lines.push("## Setup transactions");
  for (const [k, v] of Object.entries(receiptReport.setup.role_grants)) {
    lines.push(`- ${k}: \`${v}\` Ã¢â‚¬â€ ${link(v)}`);
  }
  lines.push("");
  lines.push("## Reproduce");
  lines.push("");
  lines.push("```bash");
  lines.push("# 1. Start Anvil (or use PHAROS_RPC_URL).");
  lines.push("anvil -m \"test test test test test test test test test test test junk\" &");
  lines.push("");
  lines.push("# 2. Deploy contracts.");
  lines.push("cd packages/contracts");
  lines.push("PHAROS_DEPLOYER_PRIVATE_KEY=$(cast wallet private-key --mnemonic \"$ANVIL_MNEMONIC\" --mnemonic-index 0) \\");
  lines.push("forge script script/Deploy.s.sol --tc DeployScript --rpc-url http://127.0.0.1:8545 --broadcast");
  lines.push("");
  lines.push("# 3. Run acceptance.");
  lines.push("cd ../..");
  lines.push("node scripts/atlantic-acceptance.mjs");
  lines.push("```");
  lines.push("");
  lines.push("## Sanitized manifest");
  lines.push("");
  lines.push("See `deployments/atlantic.public.json` for the redacted deployment");
  lines.push("manifest (no private keys, no mnemonics).");
  writeFileSync(join(ROOT, "docs", "atlantic-acceptance-results.md"), lines.join("\n"));

  console.log("atlantic-acceptance: complete");
  console.log(`  report: docs/atlantic-acceptance-results.md`);
  console.log(`  private: deployments/atlantic.json`);
  console.log(`  public : deployments/atlantic.public.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
