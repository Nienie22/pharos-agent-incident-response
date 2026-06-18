import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { Hex, Incident, ResponsePlan } from "@pharos-incident/policy";

type Address = `0x${string}`;
type Queryable = Pick<Pool, "query">;
type Connectable = Queryable & { connect(): Promise<PoolClient> };

export type ApprovalStatus = "issued" | "verified" | "pending" | "confirmed" | "failed" | "expired";
export type TransactionStatus = "created" | "pending" | "confirmed" | "failed";

export interface ApprovalIntentRecord {
  id: string;
  chainId: number;
  planHash: Hex;
  signer: Address;
  nonce: string;
  expiresAt: number;
  signature: Hex | null;
  status: ApprovalStatus;
  txHash: Hex | null;
}

export interface TransactionRecord {
  id: string;
  purpose: string;
  referenceId: string;
  chainId: number;
  sender: Address;
  nonce: bigint;
  txHash: Hex | null;
  status: TransactionStatus;
  blockNumber: bigint | null;
  blockHash: Hex | null;
  gasUsed: bigint | null;
  receipt: unknown;
  decodedLogs: unknown[];
  errorCode: string | null;
  errorMessage: string | null;
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function rowJson<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function mapApproval(row: any): ApprovalIntentRecord {
  return {
    id: row.id,
    chainId: Number(row.chain_id),
    planHash: row.plan_hash,
    signer: row.signer,
    nonce: row.nonce,
    expiresAt: new Date(row.expires_at).getTime(),
    signature: row.signature,
    status: row.status,
    txHash: row.tx_hash,
  };
}

function mapTransaction(row: any): TransactionRecord {
  return {
    id: row.id,
    purpose: row.purpose,
    referenceId: row.reference_id,
    chainId: Number(row.chain_id),
    sender: row.sender,
    nonce: BigInt(row.nonce),
    txHash: row.tx_hash,
    status: row.status,
    blockNumber: row.block_number === null ? null : BigInt(row.block_number),
    blockHash: row.block_hash,
    gasUsed: row.gas_used === null ? null : BigInt(row.gas_used),
    receipt: row.receipt === null ? null : rowJson(row.receipt),
    decodedLogs: row.decoded_logs === null ? [] : rowJson(row.decoded_logs),
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

export class Repositories {
  constructor(private readonly pool: Connectable) {}

  async createIncident(incident: Incident): Promise<void> {
    await this.pool.query(
      `insert into incidents (id, chain_id, subject, payload)
       values ($1, $2, $3, $4::jsonb)
       on conflict (id) do nothing`,
      [incident.id.toLowerCase(), incident.chainId, incident.subject.toLowerCase(), json(incident)],
    );
  }

  async getIncident(id: Hex): Promise<Incident | null> {
    const result = await this.pool.query("select payload from incidents where id = $1", [id.toLowerCase()]);
    if (!result.rowCount) return null;
    return rowJson<Incident>(result.rows[0].payload);
  }

  async createPlan(plan: ResponsePlan): Promise<void> {
    await this.pool.query(
      `insert into plans (plan_hash, incident_id, chain_id, payload)
       values ($1, $2, $3, $4::jsonb)
       on conflict (plan_hash) do nothing`,
      [plan.planHash.toLowerCase(), plan.incidentId.toLowerCase(), plan.chainId, json(plan)],
    );
    await this.pool.query(
      "update incidents set plan_hash = $2, updated_at = now() where id = $1",
      [plan.incidentId.toLowerCase(), plan.planHash.toLowerCase()],
    );
  }

  async getPlan(planHash: Hex): Promise<ResponsePlan | null> {
    const result = await this.pool.query("select payload from plans where plan_hash = $1", [planHash.toLowerCase()]);
    if (!result.rowCount) return null;
    const plan = rowJson<any>(result.rows[0].payload);
    return {
      ...plan,
      actions: plan.actions.map((action: any) => ({ ...action, value: BigInt(action.value) })),
    } as ResponsePlan;
  }

  async getPlanByIncident(incidentId: Hex): Promise<ResponsePlan | null> {
    const result = await this.pool.query(
      "select payload from plans where incident_id = $1 order by created_at desc limit 1",
      [incidentId.toLowerCase()],
    );
    if (!result.rowCount) return null;
    const plan = rowJson<any>(result.rows[0].payload);
    return { ...plan, actions: plan.actions.map((action: any) => ({ ...action, value: BigInt(action.value) })) };
  }

  async getPlanState(planHash: Hex): Promise<string | null> {
    const result = await this.pool.query("select state from plans where plan_hash = $1", [planHash.toLowerCase()]);
    return result.rowCount ? result.rows[0].state : null;
  }

  async setPlanState(planHash: Hex, state: string): Promise<void> {
    await this.pool.query(
      "update plans set state = $2, updated_at = now() where plan_hash = $1",
      [planHash.toLowerCase(), state],
    );
  }

  async setIncidentState(incidentId: Hex, state: string): Promise<void> {
    await this.pool.query(
      "update incidents set state = $2, updated_at = now() where id = $1",
      [incidentId.toLowerCase(), state],
    );
  }

  async saveClosure(planHash: Hex, closureHash: Hex, document: unknown, closed: boolean): Promise<void> {
    await this.pool.query(
      `update incidents set closure_hash = $2, closure_document = $3::jsonb,
       state = $4, updated_at = now() where plan_hash = $1`,
      [planHash.toLowerCase(), closureHash.toLowerCase(), json(document), closed ? "closed" : "closing"],
    );
    await this.setPlanState(planHash, closed ? "closed" : "closing");
  }

  async getClosure(planHash: Hex): Promise<{ closureHash: Hex; document: unknown } | null> {
    const result = await this.pool.query(
      "select closure_hash, closure_document from incidents where plan_hash = $1",
      [planHash.toLowerCase()],
    );
    if (!result.rowCount || !result.rows[0].closure_hash) return null;
    return {
      closureHash: result.rows[0].closure_hash,
      document: rowJson(result.rows[0].closure_document),
    };
  }

  async issueApprovalNonce(input: {
    chainId: number;
    planHash: Hex;
    signer: Address;
    expiresAt: number;
  }): Promise<ApprovalIntentRecord> {
    const id = randomUUID();
    const nonce = randomBytes(24).toString("base64url");
    const result = await this.pool.query(
      `insert into approval_intents (id, chain_id, plan_hash, signer, nonce, expires_at, status)
       values ($1, $2, $3, $4, $5, $6, 'issued') returning *`,
      [id, input.chainId, input.planHash.toLowerCase(), input.signer.toLowerCase(), nonce, new Date(input.expiresAt)],
    );
    return mapApproval(result.rows[0]);
  }

  async consumeApprovalNonce(input: { id: string; signature: Hex; now: number }): Promise<ApprovalIntentRecord> {
    const result = await this.pool.query(
      `update approval_intents
       set signature = $2, status = 'verified', updated_at = now()
       where id = $1 and status = 'issued' and expires_at > $3
       returning *`,
      [input.id, input.signature, new Date(input.now)],
    );
    if (!result.rowCount) throw new Error("Approval nonce is invalid, expired, or already consumed");
    return mapApproval(result.rows[0]);
  }

  async getApprovalIntent(id: string): Promise<ApprovalIntentRecord | null> {
    const result = await this.pool.query("select * from approval_intents where id = $1", [id]);
    return result.rowCount ? mapApproval(result.rows[0]) : null;
  }

  async listConfirmedApprovals(planHash: Hex): Promise<ApprovalIntentRecord[]> {
    const result = await this.pool.query(
      "select * from approval_intents where plan_hash = $1 and status = 'confirmed' order by created_at, id",
      [planHash.toLowerCase()],
    );
    return result.rows.map(mapApproval);
  }

  async markApprovalConfirmed(id: string, txHash: Hex, receipt: unknown): Promise<ApprovalIntentRecord> {
    const result = await this.pool.query(
      `update approval_intents
       set tx_hash = $2, receipt = $3::jsonb, status = 'confirmed', updated_at = now()
       where id = $1 and status = 'verified' returning *`,
      [id, txHash.toLowerCase(), json(receipt)],
    );
    if (!result.rowCount) throw new Error("Approval intent is not verified or is already terminal");
    return mapApproval(result.rows[0]);
  }

  async reserveRelayerNonce(chainId: number, sender: Address, rpcPendingNonce: bigint): Promise<bigint> {
    const result = await this.pool.query(
      `insert into relayer_nonces (chain_id, sender, next_nonce)
       values ($1, $2, $3 + 1)
       on conflict (chain_id, sender) do update
       set next_nonce = greatest(relayer_nonces.next_nonce + 1, excluded.next_nonce), updated_at = now()
       returning next_nonce - 1 as reserved_nonce`,
      [chainId, sender.toLowerCase(), rpcPendingNonce.toString()],
    );
    return BigInt(result.rows[0].reserved_nonce);
  }

  async createTransaction(input: {
    purpose: string;
    referenceId: string;
    chainId: number;
    sender: Address;
    nonce: bigint;
  }): Promise<TransactionRecord> {
    const result = await this.pool.query(
      `insert into transactions (id, purpose, reference_id, chain_id, sender, nonce, status)
       values ($1, $2, $3, $4, $5, $6, 'created') returning *`,
      [randomUUID(), input.purpose, input.referenceId.toLowerCase(), input.chainId, input.sender.toLowerCase(), input.nonce.toString()],
    );
    return mapTransaction(result.rows[0]);
  }

  async markTransactionPending(id: string, txHash: Hex): Promise<TransactionRecord> {
    const result = await this.pool.query(
      `update transactions set tx_hash = $2, status = 'pending', updated_at = now()
       where id = $1 and status = 'created' returning *`,
      [id, txHash.toLowerCase()],
    );
    if (!result.rowCount) throw new Error("Transaction is not in created state");
    return mapTransaction(result.rows[0]);
  }

  async markTransactionConfirmed(txHash: Hex, evidence: {
    blockNumber: bigint;
    blockHash: Hex;
    gasUsed: bigint;
    receipt: unknown;
    decodedLogs: unknown[];
  }): Promise<TransactionRecord> {
    const result = await this.pool.query(
      `update transactions
       set status = 'confirmed', block_number = $2, block_hash = $3, gas_used = $4,
           receipt = $5::jsonb, decoded_logs = $6::jsonb, updated_at = now()
       where tx_hash = $1 and status = 'pending' returning *`,
      [txHash.toLowerCase(), evidence.blockNumber.toString(), evidence.blockHash.toLowerCase(),
        evidence.gasUsed.toString(), json(evidence.receipt), json(evidence.decodedLogs)],
    );
    if (!result.rowCount) throw new Error("Transaction is terminal or not pending");
    return mapTransaction(result.rows[0]);
  }

  async markTransactionFailed(txHash: Hex, errorCode: string, errorMessage: string, receipt?: unknown): Promise<TransactionRecord> {
    const result = await this.pool.query(
      `update transactions
       set status = 'failed', error_code = $2, error_message = $3, receipt = $4::jsonb, updated_at = now()
       where tx_hash = $1 and status = 'pending' returning *`,
      [txHash.toLowerCase(), errorCode, errorMessage, json(receipt ?? null)],
    );
    if (!result.rowCount) throw new Error("Transaction is terminal or not pending");
    return mapTransaction(result.rows[0]);
  }

  async getTransactionByHash(txHash: Hex): Promise<TransactionRecord | null> {
    const result = await this.pool.query("select * from transactions where tx_hash = $1", [txHash.toLowerCase()]);
    return result.rowCount ? mapTransaction(result.rows[0]) : null;
  }

  async getLatestTransaction(referenceId: string, purpose: string): Promise<TransactionRecord | null> {
    const result = await this.pool.query(
      "select * from transactions where reference_id = $1 and purpose = $2 order by created_at desc limit 1",
      [referenceId.toLowerCase(), purpose],
    );
    return result.rowCount ? mapTransaction(result.rows[0]) : null;
  }
}
