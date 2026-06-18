#!/usr/bin/env node
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ATLANTIC,
  emergencyPolicyControllerAbi,
  incidentRegistryAbi,
} from "@pharos-incident/sdk";

const EXECUTOR_ROLE = keccak256(stringToHex("EXECUTOR_ROLE"));
const REPORTER_ROLE = keccak256(stringToHex("REPORTER_ROLE"));

const GRANTS = [
  { key: "controllerExecutor", contract: "controller", role: EXECUTOR_ROLE },
  { key: "registryReporter", contract: "registry", role: REPORTER_ROLE },
  { key: "registryExecutor", contract: "registry", role: EXECUTOR_ROLE },
];

export function requiredRoleGrants(current) {
  return GRANTS.filter((grant) => !current[grant.key]);
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const privateKey = process.env.PHAROS_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "")) {
    throw new Error("PHAROS_DEPLOYER_PRIVATE_KEY is required");
  }
  const rpcUrl = process.env.PHAROS_RPC_URL ?? ATLANTIC.rpcUrl;
  const chainId = Number(process.env.PHAROS_CHAIN_ID ?? ATLANTIC.id);
  if (chainId !== ATLANTIC.id) throw new Error(`Expected Pharos Atlantic chain ${ATLANTIC.id}`);
  const controller = process.env.EMERGENCY_POLICY_CONTROLLER_ADDRESS ?? ATLANTIC.contracts.emergencyPolicyController;
  const registry = process.env.INCIDENT_REGISTRY_ADDRESS ?? ATLANTIC.contracts.incidentRegistry;
  const agentRegistry = process.env.AGENT_REGISTRY_ADDRESS ?? ATLANTIC.contracts.agentRegistry;
  const account = privateKeyToAccount(privateKey);
  const chain = defineChain({
    id: ATLANTIC.id,
    name: ATLANTIC.name,
    nativeCurrency: ATLANTIC.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "PharosScan", url: ATLANTIC.explorerUrl } },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== ATLANTIC.id) throw new Error(`RPC returned chain ${actualChainId}`);
  const [controllerCode, registryCode, agentCode, balance] = await Promise.all([
    publicClient.getBytecode({ address: controller }),
    publicClient.getBytecode({ address: registry }),
    publicClient.getBytecode({ address: agentRegistry }),
    publicClient.getBalance({ address: account.address }),
  ]);
  if ([controllerCode, registryCode, agentCode].some((code) => !code || code === "0x")) {
    throw new Error("One or more configured contracts have no bytecode");
  }
  if (balance === 0n) throw new Error("Relayer has no native token for gas");

  const role = async (address, abi, value) => publicClient.readContract({
    address,
    abi,
    functionName: "hasRole",
    args: [value, account.address],
  });
  const [controllerAdmin, registryAdmin, controllerExecutor, registryReporter, registryExecutor] = await Promise.all([
    role(controller, emergencyPolicyControllerAbi, zeroHash),
    role(registry, incidentRegistryAbi, zeroHash),
    role(controller, emergencyPolicyControllerAbi, EXECUTOR_ROLE),
    role(registry, incidentRegistryAbi, REPORTER_ROLE),
    role(registry, incidentRegistryAbi, EXECUTOR_ROLE),
  ]);
  if (!controllerAdmin || !registryAdmin) throw new Error("Relayer key does not hold DEFAULT_ADMIN_ROLE");

  const current = { controllerExecutor, registryReporter, registryExecutor };
  const transactions = [];
  for (const grant of requiredRoleGrants(current)) {
    const address = grant.contract === "controller" ? controller : registry;
    const abi = grant.contract === "controller" ? emergencyPolicyControllerAbi : incidentRegistryAbi;
    const { request } = await publicClient.simulateContract({
      account,
      address,
      abi,
      functionName: "grantRole",
      args: [grant.role, account.address],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
    if (receipt.status !== "success") throw new Error(`Role grant ${grant.key} reverted`);
    transactions.push({
      role: grant.key,
      hash,
      blockNumber: receipt.blockNumber.toString(),
      explorerUrl: `${ATLANTIC.explorerUrl}/tx/${hash}`,
    });
  }

  const confirmed = {
    controllerExecutor: await role(controller, emergencyPolicyControllerAbi, EXECUTOR_ROLE),
    registryReporter: await role(registry, incidentRegistryAbi, REPORTER_ROLE),
    registryExecutor: await role(registry, incidentRegistryAbi, EXECUTOR_ROLE),
  };
  if (Object.values(confirmed).some((value) => !value)) throw new Error("Relayer role verification failed");
  process.stdout.write(`${JSON.stringify({
    chainId: actualChainId,
    relayer: account.address,
    balanceWei: balance.toString(),
    confirmed,
    transactions,
  }, null, 2)}\n`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
