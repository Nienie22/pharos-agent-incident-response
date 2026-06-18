import type { Hex } from "@pharos-incident/policy";
import { createPublicClient, defineChain, http, type Address, type Log, type PublicClient } from "viem";

export interface PharosEvent {
  blockNumber: number;
  txHash: Hex;
  logIndex: number;
  address: Hex;
  topics: Hex[];
  data: Hex;
}

export interface PharosChain {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  watchAddresses: Hex[];
  fromBlock: bigint;
}

export interface PharosClient {
  getLogs(from: bigint, to: bigint, address?: Hex[]): Promise<PharosEvent[]>;
  getTransactionCount(address: Hex): Promise<number>;
  getBlockNumber(): Promise<bigint>;
}

export class MockPharosClient implements PharosClient {
  private nonce = 0;
  private block = 100n;
  constructor(private readonly events: PharosEvent[] = []) {}
  async getLogs(_from: bigint, _to: bigint, _address?: Hex[]): Promise<PharosEvent[]> { return this.events; }
  async getTransactionCount(_address: Hex): Promise<number> { return this.nonce++; }
  async getBlockNumber(): Promise<bigint> { return this.block++; }
}

export class LivePharosClient implements PharosClient {
  private readonly client: Pick<PublicClient, "getLogs" | "getTransactionCount" | "getBlockNumber">;

  constructor(private readonly chain: PharosChain, client?: Pick<PublicClient, "getLogs" | "getTransactionCount" | "getBlockNumber">) {
    const viemChain = defineChain({
      id: chain.chainId,
      name: "Pharos Atlantic",
      nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpcUrl] } },
      blockExplorers: chain.explorerUrl
        ? { default: { name: "PharosScan", url: chain.explorerUrl } }
        : undefined,
    });
    this.client = client ?? createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });
  }

  async getLogs(from: bigint, to: bigint, address?: Hex[]): Promise<PharosEvent[]> {
    const logs = await this.client.getLogs({
      fromBlock: from,
      toBlock: to,
      ...(address?.length ? { address: address as Address[] } : {}),
    });
    return logs.map((log: Log) => {
      if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
        throw new Error("RPC returned an unmined log");
      }
      return {
        blockNumber: Number(log.blockNumber),
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        address: log.address,
        topics: [...log.topics],
        data: log.data,
      };
    });
  }

  async getTransactionCount(address: Hex): Promise<number> {
    return this.client.getTransactionCount({ address: address as Address, blockTag: "pending" });
  }

  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }
}

export function makePharos(): PharosClient {
  if (process.env.LIVE_INTEGRATIONS === "1" && process.env.PHAROS_RPC_URL) {
    return new LivePharosClient({
      chainId: Number(process.env.PHAROS_CHAIN_ID ?? 1),
      rpcUrl: process.env.PHAROS_RPC_URL,
      explorerUrl: process.env.PHAROS_EXPLORER_URL ?? "",
      watchAddresses: [],
      fromBlock: 0n,
    });
  }
  return new MockPharosClient();
}
