import { describe, expect, it, vi } from "vitest";
import { LivePharosClient, type PharosChain } from "../src/pharos.js";

const chain: PharosChain = {
  chainId: 688689,
  rpcUrl: "https://rpc.invalid",
  explorerUrl: "https://explorer.invalid",
  watchAddresses: ["0x0000000000000000000000000000000000000001"],
  fromBlock: 0n,
};

describe("LivePharosClient", () => {
  it("reads and normalizes logs from the public client", async () => {
    const getLogs = vi.fn().mockResolvedValue([{
      blockNumber: 123n,
      transactionHash: "0x" + "11".repeat(32),
      logIndex: 4,
      address: "0x0000000000000000000000000000000000000001",
      topics: ["0x" + "22".repeat(32)],
      data: "0x1234",
    }]);
    const client = new LivePharosClient(chain, { getLogs } as never);

    const result = await client.getLogs(100n, 200n, chain.watchAddresses);

    expect(getLogs).toHaveBeenCalledWith({
      fromBlock: 100n,
      toBlock: 200n,
      address: chain.watchAddresses,
    });
    expect(result).toEqual([{
      blockNumber: 123,
      txHash: "0x" + "11".repeat(32),
      logIndex: 4,
      address: chain.watchAddresses[0],
      topics: ["0x" + "22".repeat(32)],
      data: "0x1234",
    }]);
  });

  it("reads pending transaction count and latest block", async () => {
    const publicClient = {
      getTransactionCount: vi.fn().mockResolvedValue(9),
      getBlockNumber: vi.fn().mockResolvedValue(456n),
    };
    const client = new LivePharosClient(chain, publicClient as never);
    const address = "0x0000000000000000000000000000000000000002";

    await expect(client.getTransactionCount(address)).resolves.toBe(9);
    await expect(client.getBlockNumber()).resolves.toBe(456n);
    expect(publicClient.getTransactionCount).toHaveBeenCalledWith({ address, blockTag: "pending" });
  });

  it("propagates RPC errors", async () => {
    const client = new LivePharosClient(chain, {
      getBlockNumber: vi.fn().mockRejectedValue(new Error("rpc unavailable")),
    } as never);

    await expect(client.getBlockNumber()).rejects.toThrow("rpc unavailable");
  });
});
