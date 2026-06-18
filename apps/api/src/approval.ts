import {
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  parseEventLogs,
  verifyMessage,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  ATLANTIC,
  emergencyPolicyControllerAbi,
  formatApprovalIntent,
  type ApprovalIntent,
} from "@pharos-incident/sdk";
import { Repositories, type ApprovalIntentRecord } from "./repositories.js";

export interface ApprovalChainReader {
  hasApproverRole(address: Address): Promise<boolean>;
  getTransaction(hash: Hex): Promise<{ from: Address; to: Address | null; input: Hex }>;
  getTransactionReceipt(hash: Hex): Promise<{
    status: "success" | "reverted";
    logs: Log[];
  }>;
}

export class ApprovalService {
  private readonly controllerAddress: Address;

  constructor(
    private readonly repositories: Repositories,
    private readonly chain: ApprovalChainReader,
    controllerAddress: string,
  ) {
    this.controllerAddress = getAddress(controllerAddress);
  }

  async verifyIntent(id: string, intent: ApprovalIntent, signature: Hex, now: number): Promise<ApprovalIntentRecord> {
    const stored = await this.repositories.getApprovalIntent(id);
    if (!stored) throw new Error("Unknown approval nonce");
    if (intent.version !== 1 || intent.chainId !== ATLANTIC.id) throw new Error("Invalid approval intent domain");
    if (now >= intent.expiresAt || now >= stored.expiresAt) throw new Error("Approval intent expired");
    if (
      stored.planHash.toLowerCase() !== intent.planHash.toLowerCase()
      || stored.signer.toLowerCase() !== intent.approver.toLowerCase()
      || stored.nonce !== intent.nonce
      || stored.expiresAt !== intent.expiresAt
    ) {
      throw new Error("Approval intent does not match issued nonce");
    }
    const valid = await verifyMessage({
      address: getAddress(intent.approver),
      message: formatApprovalIntent(intent),
      signature,
    });
    if (!valid) throw new Error("Approval signature signer does not match approver");
    if (!await this.chain.hasApproverRole(getAddress(intent.approver))) {
      throw new Error("Approval signer does not have APPROVER_ROLE");
    }
    return this.repositories.consumeApprovalNonce({ id, signature, now });
  }

  async confirmApproval(id: string, txHash: Hex): Promise<ApprovalIntentRecord> {
    const stored = await this.repositories.getApprovalIntent(id);
    if (!stored || stored.status !== "verified") throw new Error("Approval intent is not verified");
    const [transaction, receipt] = await Promise.all([
      this.chain.getTransaction(txHash),
      this.chain.getTransactionReceipt(txHash),
    ]);
    if (receipt.status !== "success") throw new Error("Approval transaction reverted");
    if (!isAddressEqual(transaction.from, getAddress(stored.signer))) {
      throw new Error("Approval transaction sender does not match signer");
    }
    if (!transaction.to || !isAddressEqual(transaction.to, this.controllerAddress)) {
      throw new Error("Approval transaction target does not match controller");
    }
    let decoded: ReturnType<typeof decodeFunctionData<typeof emergencyPolicyControllerAbi>>;
    try {
      decoded = decodeFunctionData({ abi: emergencyPolicyControllerAbi, data: transaction.input });
    } catch {
      throw new Error("Approval transaction calldata is invalid");
    }
    if (decoded.functionName !== "approve" || String(decoded.args[0]).toLowerCase() !== stored.planHash.toLowerCase()) {
      throw new Error("Approval transaction calldata does not match plan");
    }
    const logs = parseEventLogs({
      abi: emergencyPolicyControllerAbi,
      eventName: "PlanApproved",
      logs: receipt.logs,
      strict: true,
    });
    const matched = logs.some((log) =>
      log.address && isAddressEqual(log.address, this.controllerAddress)
      && log.args.planHash.toLowerCase() === stored.planHash.toLowerCase()
      && isAddressEqual(log.args.approver, getAddress(stored.signer)),
    );
    if (!matched) throw new Error("Approval transaction is missing matching PlanApproved event");
    return this.repositories.markApprovalConfirmed(id, txHash, receipt);
  }
}
