import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Hex } from "@pharos-incident/policy";
import {
  ATLANTIC,
  emergencyPolicyControllerAbi,
  formatApprovalIntent,
  type ApprovalIntent,
} from "@pharos-incident/sdk";
import { createWalletClient, custom, defineChain, getAddress } from "viem";

const PHAROS_ATLANTIC_CHAIN_ID = 688689;
const PHAROS_ATLANTIC_CHAIN_HEX = "0xa8231";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export interface WalletContextValue {
  available: boolean;
  connected: boolean;
  account: Hex | null;
  chainId: number | null;
  chainHex: string | null;
  correctNetwork: boolean;
  pending: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToAtlantic: () => Promise<void>;
  signApprovalIntent: (intent: ApprovalIntent) => Promise<Hex>;
  approvePlan: (planHash: Hex) => Promise<Hex>;
  signPlanHash: (planHash: Hex) => Promise<Hex>;
}

const Ctx = createContext<WalletContextValue | null>(null);

function getProvider(): EthereumProvider | undefined {
  return typeof window === "undefined" ? undefined : window.ethereum;
}

function chainHexToNumber(chainHex: string | null): number | null {
  if (!chainHex) return null;
  const parsed = Number.parseInt(chainHex, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAddress(value: unknown): Hex | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value as Hex;
}

export function WalletProvider(props: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [account, setAccount] = useState<Hex | null>(null);
  const [chainHex, setChainHex] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshChain = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;
    const current = await provider.request({ method: "eth_chainId" });
    if (typeof current === "string") setChainHex(current.toLowerCase());
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    setError(null);
    if (!provider) {
      setError("No injected wallet detected.");
      return;
    }
    setPending(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(accounts) ? normalizeAddress(accounts[0]) : null;
      if (!first) throw new Error("Wallet did not return an account.");
      setAccount(first);
      await refreshChain();
    } catch (e: any) {
      setError(e?.message ?? "Wallet connection failed.");
    } finally {
      setPending(false);
    }
  }, [refreshChain]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setError(null);
  }, []);

  const switchToAtlantic = useCallback(async () => {
    const provider = getProvider();
    setError(null);
    if (!provider) {
      setError("No injected wallet detected.");
      return;
    }
    setPending(true);
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: PHAROS_ATLANTIC_CHAIN_HEX }],
        });
      } catch (switchError: any) {
        if (switchError?.code !== 4902) throw switchError;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: PHAROS_ATLANTIC_CHAIN_HEX,
            chainName: "Pharos Atlantic",
            nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
            rpcUrls: ["https://atlantic.dplabs-internal.com"],
            blockExplorerUrls: ["https://atlantic.pharosscan.xyz"],
          }],
        });
      }
      await refreshChain();
    } catch (e: any) {
      setError(e?.message ?? "Could not switch to Pharos Atlantic.");
    } finally {
      setPending(false);
    }
  }, [refreshChain]);

  const signPlanHash = useCallback(async (planHash: Hex): Promise<Hex> => {
    const provider = getProvider();
    if (!provider) throw new Error("No injected wallet detected.");
    if (!account) throw new Error("Connect wallet before signing.");
    if (chainHex?.toLowerCase() !== PHAROS_ATLANTIC_CHAIN_HEX) {
      throw new Error("Switch wallet to Pharos Atlantic before signing.");
    }
    const message = `Pharos Incident Response\nPlan: ${planHash}\nChain: ${PHAROS_ATLANTIC_CHAIN_ID}`;
    const sig = await provider.request({
      method: "personal_sign",
      params: [message, account],
    });
    if (typeof sig !== "string" || !/^0x[0-9a-fA-F]+$/.test(sig)) {
      throw new Error("Wallet returned an invalid signature.");
    }
    return sig as Hex;
  }, [account, chainHex]);

  const signApprovalIntent = useCallback(async (intent: ApprovalIntent): Promise<Hex> => {
    const provider = getProvider();
    if (!provider) throw new Error("No injected wallet detected.");
    if (!account) throw new Error("Connect wallet before signing.");
    if (chainHex?.toLowerCase() !== PHAROS_ATLANTIC_CHAIN_HEX) {
      throw new Error("Switch wallet to Pharos Atlantic before signing.");
    }
    if (intent.chainId !== PHAROS_ATLANTIC_CHAIN_ID || intent.approver.toLowerCase() !== account.toLowerCase()) {
      throw new Error("Approval intent does not match connected wallet or chain.");
    }
    const signature = await provider.request({
      method: "personal_sign",
      params: [formatApprovalIntent(intent), account],
    });
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new Error("Wallet returned an invalid signature.");
    }
    return signature as Hex;
  }, [account, chainHex]);

  const approvePlan = useCallback(async (planHash: Hex): Promise<Hex> => {
    const provider = getProvider();
    if (!provider) throw new Error("No injected wallet detected.");
    if (!account) throw new Error("Connect wallet before approving.");
    if (chainHex?.toLowerCase() !== PHAROS_ATLANTIC_CHAIN_HEX) {
      throw new Error("Switch wallet to Pharos Atlantic before approving.");
    }
    const chain = defineChain({
      id: ATLANTIC.id,
      name: ATLANTIC.name,
      nativeCurrency: ATLANTIC.nativeCurrency,
      rpcUrls: { default: { http: [ATLANTIC.rpcUrl] } },
      blockExplorers: { default: { name: "PharosScan", url: ATLANTIC.explorerUrl } },
    });
    const walletClient = createWalletClient({
      account: getAddress(account),
      chain,
      transport: custom(provider as any),
    });
    return walletClient.writeContract({
      address: ATLANTIC.contracts.emergencyPolicyController,
      abi: emergencyPolicyControllerAbi,
      functionName: "approve",
      args: [planHash],
    });
  }, [account, chainHex]);

  useEffect(() => {
    const provider = getProvider();
    setAvailable(Boolean(provider));
    if (!provider) return;

    refreshChain().catch(() => undefined);
    provider.request({ method: "eth_accounts" })
      .then((accounts) => {
        const first = Array.isArray(accounts) ? normalizeAddress(accounts[0]) : null;
        if (first) setAccount(first);
      })
      .catch(() => undefined);

    const onAccountsChanged = (accounts: unknown[]) => {
      setAccount(normalizeAddress(accounts?.[0]) ?? null);
    };
    const onChainChanged = (next: string) => {
      setChainHex(typeof next === "string" ? next.toLowerCase() : null);
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [refreshChain]);

  const chainId = chainHexToNumber(chainHex);
  const value = useMemo<WalletContextValue>(() => ({
    available,
    connected: Boolean(account),
    account,
    chainId,
    chainHex,
    correctNetwork: chainId === PHAROS_ATLANTIC_CHAIN_ID,
    pending,
    error,
    connect,
    disconnect,
    switchToAtlantic,
    signApprovalIntent,
    approvePlan,
    signPlanHash,
  }), [available, account, chainId, chainHex, pending, error, connect, disconnect, switchToAtlantic, signApprovalIntent, approvePlan, signPlanHash]);

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useWallet(): WalletContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside WalletProvider");
  return v;
}
