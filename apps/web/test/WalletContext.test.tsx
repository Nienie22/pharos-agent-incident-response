import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WalletProvider, useWallet } from "../src/lib/WalletContext.js";
import { encodeFunctionData } from "viem";
import { emergencyPolicyControllerAbi } from "@pharos-incident/sdk";

const planHash = ("0x" + "11".repeat(32)) as `0x${string}`;
const approvalIntent = {
  version: 1 as const,
  planHash,
  chainId: 688689 as const,
  approver: "0x00000000000000000000000000000000000a71ce" as `0x${string}`,
  nonce: "nonce-1234567890abcdef",
  expiresAt: 1_800_000_000_000,
};

function Harness() {
  const wallet = useWallet();
  return (
    <div>
      <div data-testid="account">{wallet.account ?? "none"}</div>
      <div data-testid="chain">{wallet.chainId ?? "none"}</div>
      <div data-testid="network">{wallet.correctNetwork ? "ok" : "wrong"}</div>
      <button onClick={wallet.connect}>connect</button>
      <button onClick={wallet.switchToAtlantic}>switch</button>
      <button onClick={() => wallet.signApprovalIntent(approvalIntent).then((sig) => {
        document.body.setAttribute("data-sig", sig);
      })}>sign</button>
      <button onClick={() => wallet.approvePlan(planHash).then((hash) => {
        document.body.setAttribute("data-tx", hash);
      })}>approve</button>
    </div>
  );
}

describe("WalletProvider", () => {
  it("connects, switches to Pharos Atlantic, and signs a plan hash", async () => {
    let chainId = "0x1";
    const account = "0x00000000000000000000000000000000000a71ce";
    const request = vi.fn(async ({ method, params }: { method: string; params?: any[] }) => {
      if (method === "eth_chainId") return chainId;
      if (method === "eth_accounts") return [];
      if (method === "eth_requestAccounts") return [account];
      if (method === "wallet_switchEthereumChain") {
        chainId = params?.[0]?.chainId;
        return null;
      }
      if (method === "personal_sign") return "0x" + "ab".repeat(65);
      if (method === "eth_sendTransaction") return "0x" + "cd".repeat(32);
      return null;
    });
    (window as any).ethereum = { request, on: vi.fn(), removeListener: vi.fn() };

    render(<WalletProvider><Harness /></WalletProvider>);

    fireEvent.click(screen.getByText("connect"));
    await waitFor(() => expect(screen.getByTestId("account").textContent).toBe(account));
    expect(screen.getByTestId("chain").textContent).toBe("1");

    fireEvent.click(screen.getByText("switch"));
    await waitFor(() => expect(screen.getByTestId("network").textContent).toBe("ok"));

    fireEvent.click(screen.getByText("sign"));
    await waitFor(() => expect(document.body.getAttribute("data-sig")).toMatch(/^0xabab/));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "personal_sign",
      params: expect.arrayContaining([expect.stringContaining("Nonce: nonce-1234567890abcdef")]),
    }));

    fireEvent.click(screen.getByText("approve"));
    await waitFor(() => expect(document.body.getAttribute("data-tx")).toMatch(/^0xcdcd/));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "eth_sendTransaction",
      params: [expect.objectContaining({
        to: "0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d",
        data: encodeFunctionData({ abi: emergencyPolicyControllerAbi, functionName: "approve", args: [planHash] }),
      })],
    }), undefined);
  });
});
