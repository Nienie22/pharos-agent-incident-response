import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  padHex,
  parseEventLogs,
  stringToHex,
  zeroHash,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ResponsePlan } from "@pharos-incident/policy";
import {
  LIVE_ACTION_KIND,
  assertLivePlan,
  emergencyPolicyControllerAbi,
  incidentRegistryAbi,
} from "@pharos-incident/sdk";
import type { ApprovalChainReader } from "./approval.js";
import type { AppConfig } from "./config.js";
import { Repositories } from "./repositories.js";

const APPROVER_ROLE = keccak256(stringToHex("APPROVER_ROLE"));
const EXECUTOR_ROLE = keccak256(stringToHex("EXECUTOR_ROLE"));
const REPORTER_ROLE = keccak256(stringToHex("REPORTER_ROLE"));

export type TrackedStatus = "pending" | "confirmed" | "failed";

export interface TrackedTransaction {
  status: TrackedStatus;
  txHash: Hex;
  explorerUrl: string;
  blockNumber?: bigint;
  errorCode?: string;
}

export interface ExecutionArguments {
  agentOrZero?: Hex;
  keyId?: Hex;
  metadataHash?: Hex;
}

export interface ChainHealth {
  chainId: number;
  chainOk: boolean;
  contractsOk: boolean;
  rolesOk: boolean;
  relayerBalance: bigint;
}

interface ClientDependencies {
  publicClient: any;
  walletClient: any;
}

function asBytes32Address(address: Address): Hex {
  return padHex(address, { size: 32 });
}

function receiptEvidence(receipt: TransactionReceipt) {
  return {
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed,
    receipt,
    decodedLogs: [
      ...parseEventLogs({ abi: emergencyPolicyControllerAbi, logs: receipt.logs, strict: false }),
      ...parseEventLogs({ abi: incidentRegistryAbi, logs: receipt.logs, strict: false }),
    ],
  };
}

export class ChainGateway implements ApprovalChainReader {
  readonly publicClient: any;
  readonly walletClient: any;
  private readonly account;

  constructor(
    private readonly config: AppConfig,
    private readonly repositories: Repositories,
    dependencies?: ClientDependencies,
  ) {
    this.account = privateKeyToAccount(config.relayerPrivateKey);
    const chain = defineChain({
      id: config.chainId,
      name: "Pharos Atlantic",
      nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
      blockExplorers: { default: { name: "PharosScan", url: config.explorerUrl } },
    });
    this.publicClient = dependencies?.publicClient ?? createPublicClient({ chain, transport: http(config.rpcUrl) });
    this.walletClient = dependencies?.walletClient ?? createWalletClient({
      account: this.account,
      chain,
      transport: http(config.rpcUrl),
    });
  }

  async health(): Promise<ChainHealth> {
    const [chainId, incidentCode, controllerCode, agentCode, balance, controllerExecutor, registryReporter, registryExecutor] = await Promise.all([
      this.publicClient.getChainId(),
      this.publicClient.getBytecode({ address: this.config.incidentRegistryAddress }),
      this.publicClient.getBytecode({ address: this.config.controllerAddress }),
      this.publicClient.getBytecode({ address: this.config.agentRegistryAddress }),
      this.publicClient.getBalance({ address: this.config.relayerAddress }),
      this.readRole(this.config.controllerAddress, EXECUTOR_ROLE, this.config.relayerAddress),
      this.readRole(this.config.incidentRegistryAddress, REPORTER_ROLE, this.config.relayerAddress),
      this.readRole(this.config.incidentRegistryAddress, EXECUTOR_ROLE, this.config.relayerAddress),
    ]);
    return {
      chainId,
      chainOk: chainId === this.config.chainId,
      contractsOk: [incidentCode, controllerCode, agentCode].every((code) => Boolean(code && code !== "0x")),
      rolesOk: controllerExecutor && registryReporter && registryExecutor,
      relayerBalance: balance,
    };
  }

  async hasApproverRole(address: Address): Promise<boolean> {
    return this.readRole(this.config.controllerAddress, APPROVER_ROLE, address);
  }

  async getTransaction(hash: Hex): Promise<{ from: Address; to: Address | null; input: Hex }> {
    const transaction = await this.publicClient.getTransaction({ hash });
    return { from: transaction.from, to: transaction.to, input: transaction.input };
  }

  async getTransactionReceipt(hash: Hex): Promise<any> {
    return this.publicClient.getTransactionReceipt({ hash });
  }

  async registerIncident(incidentId: Hex, planHash: Hex): Promise<TrackedTransaction> {
    return this.writeContract("register_incident", planHash, {
      address: this.config.incidentRegistryAddress,
      abi: incidentRegistryAbi,
      functionName: "registerIncident",
      args: [incidentId, planHash],
    });
  }

  async proposePlan(plan: ResponsePlan): Promise<TrackedTransaction> {
    assertLivePlan(plan);
    const action = plan.actions[0];
    return this.writeContract("propose_plan", plan.planHash, {
      address: this.config.controllerAddress,
      abi: emergencyPolicyControllerAbi,
      functionName: "proposePlan",
      args: [
        plan.planHash,
        plan.incidentId,
        getAddress(action.target),
        LIVE_ACTION_KIND[action.kind],
        plan.requiredApprovals,
        BigInt(Math.floor(plan.expiresAt / 1_000)),
      ],
    });
  }

  async executePlan(plan: ResponsePlan, args: ExecutionArguments = {}): Promise<TrackedTransaction> {
    assertLivePlan(plan);
    const action = plan.actions[0];
    let agentOrZero = args.agentOrZero ?? zeroHash;
    let keyId = args.keyId ?? zeroHash;
    let metadataHash = args.metadataHash ?? zeroHash;
    if (action.kind === "PAUSE_AGENT") agentOrZero = asBytes32Address(getAddress(action.target));
    if (action.kind === "REMOVE_EXECUTOR" && agentOrZero === zeroHash) {
      throw new Error("REMOVE_EXECUTOR requires agentOrZero");
    }
    if (action.kind === "ROTATE_KEY_METADATA" && (keyId === zeroHash || metadataHash === zeroHash)) {
      throw new Error("ROTATE_KEY_METADATA requires keyId and metadataHash");
    }
    return this.writeContract("execute_plan", plan.planHash, {
      address: this.config.controllerAddress,
      abi: emergencyPolicyControllerAbi,
      functionName: "execute",
      args: [plan.planHash, agentOrZero, keyId, metadataHash],
    });
  }

  async markExecuted(planHash: Hex): Promise<TrackedTransaction> {
    return this.writeContract("mark_executed", planHash, {
      address: this.config.incidentRegistryAddress,
      abi: incidentRegistryAbi,
      functionName: "markExecuted",
      args: [planHash],
    });
  }

  async closeIncident(planHash: Hex, closureHash: Hex): Promise<TrackedTransaction> {
    return this.writeContract("close_incident", planHash, {
      address: this.config.incidentRegistryAddress,
      abi: incidentRegistryAbi,
      functionName: "close",
      args: [planHash, closureHash],
    });
  }

  async readPlan(planHash: Hex): Promise<any> {
    return this.publicClient.readContract({
      address: this.config.controllerAddress,
      abi: emergencyPolicyControllerAbi,
      functionName: "plans",
      args: [planHash],
    });
  }

  async verifyIncident(incidentId: Hex, planHash: Hex): Promise<any> {
    const [incident, executed, closure, controllerPlan] = await Promise.all([
      this.publicClient.readContract({
        address: this.config.incidentRegistryAddress,
        abi: incidentRegistryAbi,
        functionName: "incidents",
        args: [incidentId],
      }),
      this.publicClient.readContract({
        address: this.config.incidentRegistryAddress,
        abi: incidentRegistryAbi,
        functionName: "executed",
        args: [planHash],
      }),
      this.publicClient.readContract({
        address: this.config.incidentRegistryAddress,
        abi: incidentRegistryAbi,
        functionName: "closures",
        args: [planHash],
      }),
      this.readPlan(planHash),
    ]);
    return { incident, executed, closure, controllerPlan };
  }

  async reconcileTransaction(txHash: Hex): Promise<TrackedTransaction> {
    const transaction = await this.repositories.getTransactionByHash(txHash);
    if (!transaction) throw new Error("Unknown tracked transaction");
    const base: TrackedTransaction = {
      status: transaction.status === "created" ? "pending" : transaction.status,
      txHash,
      explorerUrl: `${this.config.explorerUrl}/tx/${txHash}`,
      ...(transaction.blockNumber === null ? {} : { blockNumber: transaction.blockNumber }),
      ...(transaction.errorCode === null ? {} : { errorCode: transaction.errorCode }),
    };
    if (transaction.status === "confirmed" || transaction.status === "failed") return base;
    let receipt: TransactionReceipt;
    try {
      receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
    } catch {
      return base;
    }
    if (receipt.status !== "success") {
      await this.repositories.markTransactionFailed(txHash, "REVERTED", `${transaction.purpose} transaction reverted`, receipt);
      return { ...base, status: "failed", blockNumber: receipt.blockNumber, errorCode: "REVERTED" };
    }
    await this.repositories.markTransactionConfirmed(txHash, receiptEvidence(receipt));
    return { ...base, status: "confirmed", blockNumber: receipt.blockNumber };
  }

  private async readRole(contract: Address, role: Hex, account: Address): Promise<boolean> {
    return this.publicClient.readContract({
      address: contract,
      abi: contract === this.config.controllerAddress ? emergencyPolicyControllerAbi : incidentRegistryAbi,
      functionName: "hasRole",
      args: [role, account],
    });
  }

  private async writeContract(purpose: string, referenceId: string, call: Record<string, unknown>): Promise<TrackedTransaction> {
    const rpcNonce = BigInt(await this.publicClient.getTransactionCount({
      address: this.config.relayerAddress,
      blockTag: "pending",
    }));
    const nonce = await this.repositories.reserveRelayerNonce(this.config.chainId, this.config.relayerAddress, rpcNonce);
    const transaction = await this.repositories.createTransaction({
      purpose,
      referenceId,
      chainId: this.config.chainId,
      sender: this.config.relayerAddress,
      nonce,
    });
    const simulation = await this.publicClient.simulateContract({ ...call, account: this.account, nonce });
    const txHash: Hex = await this.walletClient.writeContract({ ...simulation.request, account: this.account, nonce });
    await this.repositories.markTransactionPending(transaction.id, txHash);
    const pending: TrackedTransaction = {
      status: "pending",
      txHash,
      explorerUrl: `${this.config.explorerUrl}/tx/${txHash}`,
    };
    let receipt: TransactionReceipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: this.config.confirmations,
        timeout: this.config.receiptTimeoutMs,
      });
    } catch {
      return pending;
    }
    if (receipt.status !== "success") {
      await this.repositories.markTransactionFailed(txHash, "REVERTED", `${purpose} transaction reverted`, receipt);
      return { ...pending, status: "failed", blockNumber: receipt.blockNumber, errorCode: "REVERTED" };
    }
    await this.repositories.markTransactionConfirmed(txHash, receiptEvidence(receipt));
    return { ...pending, status: "confirmed", blockNumber: receipt.blockNumber };
  }
}
