import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const privateKey = ("0x" + "0".repeat(63) + "1") as `0x${string}`;

function validEnv(): NodeJS.ProcessEnv {
  return {
    PHAROS_RPC_URL: "https://atlantic.dplabs-internal.com",
    PHAROS_CHAIN_ID: "688689",
    PHAROS_EXPLORER_URL: "https://atlantic.pharosscan.xyz",
    INCIDENT_REGISTRY_ADDRESS: "0x0d93b5cD4356652ef6b4776949A86979e9c00cdE",
    EMERGENCY_POLICY_CONTROLLER_ADDRESS: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
    AGENT_REGISTRY_ADDRESS: "0x2d1B360dec14e63846735939E793bcb1655Aa93b",
    PHAROS_DEPLOYER_PRIVATE_KEY: privateKey,
    DATABASE_URL: "postgres://incident:incident@localhost:5432/incident",
    PHAROS_CONFIRMATIONS: "2",
    PHAROS_RECEIPT_TIMEOUT_MS: "45000",
  };
}

describe("loadConfig", () => {
  it("parses Atlantic production config and derives the relayer address", () => {
    const config = loadConfig(validEnv());
    expect(config.chainId).toBe(688689);
    expect(config.confirmations).toBe(2);
    expect(config.receiptTimeoutMs).toBe(45_000);
    expect(config.relayerAddress).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
  });

  it("rejects any chain other than Atlantic", () => {
    expect(() => loadConfig({ ...validEnv(), PHAROS_CHAIN_ID: "1" })).toThrow(/688689/);
  });

  it("rejects missing required configuration without leaking secrets", () => {
    const env = validEnv();
    delete env.DATABASE_URL;
    let message = "";
    try {
      loadConfig(env);
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/DATABASE_URL|configuration/i);
    expect(message).not.toContain(privateKey);
  });
});
