import { z } from "zod";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ATLANTIC } from "@pharos-incident/sdk";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => getAddress(value));
const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/) as z.ZodType<Hex>;

const ConfigSchema = z.object({
  PHAROS_RPC_URL: z.string().url(),
  PHAROS_CHAIN_ID: z.coerce.number().int().refine((value) => value === ATLANTIC.id, {
    message: `must be Pharos Atlantic chain ${ATLANTIC.id}`,
  }),
  PHAROS_EXPLORER_URL: z.string().url(),
  INCIDENT_REGISTRY_ADDRESS: address,
  EMERGENCY_POLICY_CONTROLLER_ADDRESS: address,
  AGENT_REGISTRY_ADDRESS: address,
  PHAROS_DEPLOYER_PRIVATE_KEY: privateKey,
  DATABASE_URL: z.string().min(1),
  PHAROS_CONFIRMATIONS: z.coerce.number().int().min(1).max(64).default(2),
  PHAROS_RECEIPT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(240_000).default(45_000),
});

export interface AppConfig {
  rpcUrl: string;
  chainId: typeof ATLANTIC.id;
  explorerUrl: string;
  incidentRegistryAddress: Address;
  controllerAddress: Address;
  agentRegistryAddress: Address;
  relayerPrivateKey: Hex;
  relayerAddress: Address;
  databaseUrl: string;
  confirmations: number;
  receiptTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) =>
      `${issue.path.join(".") || "configuration"}: ${issue.message}`,
    );
    throw new Error(`Invalid production configuration: ${issues.join("; ")}`);
  }
  const value = parsed.data;
  const relayerAddress = privateKeyToAccount(value.PHAROS_DEPLOYER_PRIVATE_KEY).address;
  return {
    rpcUrl: value.PHAROS_RPC_URL,
    chainId: value.PHAROS_CHAIN_ID as typeof ATLANTIC.id,
    explorerUrl: value.PHAROS_EXPLORER_URL.replace(/\/$/, ""),
    incidentRegistryAddress: value.INCIDENT_REGISTRY_ADDRESS,
    controllerAddress: value.EMERGENCY_POLICY_CONTROLLER_ADDRESS,
    agentRegistryAddress: value.AGENT_REGISTRY_ADDRESS,
    relayerPrivateKey: value.PHAROS_DEPLOYER_PRIVATE_KEY,
    relayerAddress,
    databaseUrl: value.DATABASE_URL,
    confirmations: value.PHAROS_CONFIRMATIONS,
    receiptTimeoutMs: value.PHAROS_RECEIPT_TIMEOUT_MS,
  };
}
