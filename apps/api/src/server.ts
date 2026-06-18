import Fastify from "fastify";
import { z } from "zod";
import { getAddress, type Hex } from "viem";
import {
  IncidentSchema,
  bucketScore,
  idFromInputs,
  scoreIncident,
  type Incident,
} from "@pharos-incident/policy";
import { ATLANTIC, type ApprovalIntent } from "@pharos-incident/sdk";
import { ApprovalService } from "./approval.js";
import { ChainGateway } from "./chain.js";
import { loadConfig } from "./config.js";
import { createDatabasePool } from "./db.js";
import { IncidentOrchestrator } from "./orchestrator.js";
import { Repositories } from "./repositories.js";

export interface ServerDependencies {
  repositories: Repositories;
  orchestrator: IncidentOrchestrator;
  approval: ApprovalService;
  chain: ChainGateway;
  databaseHealth: () => Promise<boolean>;
}

export interface ServerOptions {
  logger?: boolean;
  dependencies: ServerDependencies;
}

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

function statusForError(message: string): number {
  if (/unknown incident|unknown plan|unknown tracked/i.test(message)) return 404;
  if (/APPROVER_ROLE|signer|sender|authorization/i.test(message)) return 403;
  if (/nonce|already|terminal|threshold|not verified|does not match/i.test(message)) return 409;
  if (/RPC|database|connection/i.test(message)) return 503;
  return 500;
}

const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hex);
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => getAddress(value));

const DetectBody = z.object({
  subject: Address,
  rawSignals: z.array(z.object({
    source: z.string().min(1),
    type: z.string().min(1),
    severity: z.number().int().min(0).max(100),
    confidenceBps: z.number().int().min(0).max(10_000),
    evidenceHash: Hex32,
    observedAt: z.number().int().nonnegative(),
  })).min(1).optional(),
  signals: z.array(z.object({
    source: z.string().min(1),
    type: z.string().min(1),
    severity: z.number().int().min(0).max(100),
    confidenceBps: z.number().int().min(0).max(10_000),
    evidenceHash: Hex32,
    observedAt: z.number().int().nonnegative(),
  })).min(1).optional(),
}).refine((body) => Boolean(body.rawSignals?.length || body.signals?.length), {
  message: "rawSignals or signals is required",
}).transform((body) => ({ subject: body.subject, rawSignals: body.rawSignals ?? body.signals ?? [] }));

const ApprovalIntentSchema = z.object({
  version: z.literal(1),
  planHash: Hex32,
  chainId: z.literal(ATLANTIC.id),
  approver: Address,
  nonce: z.string().min(16),
  expiresAt: z.number().int().positive(),
});

export function buildServer(options: ServerOptions) {
  const { dependencies } = options;
  const app = Fastify({ logger: options.logger ?? false });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    reply.header("access-control-allow-headers", "content-type");
  });
  app.options("/*", async (_request, reply) => reply.code(204).send());
  app.setReplySerializer((payload) => JSON.stringify(serialize(payload)));
  app.setErrorHandler((error, _request, reply) => {
    const candidate = error as { name?: string; message?: string; issues?: unknown };
    if (candidate.name === "ZodError") {
      return reply.code(400).send({ error: "validation_failed", issues: candidate.issues });
    }
    const message = candidate.message ?? "Unknown error";
    return reply.code(statusForError(message)).send({ error: "request_failed", message });
  });

  app.post("/detect", async (request) => {
    const body = DetectBody.parse(request.body);
    const createdAt = Date.now();
    const id = idFromInputs([
      "detect",
      String(ATLANTIC.id),
      body.subject.toLowerCase(),
      ...body.rawSignals.map((signal) => signal.evidenceHash.toLowerCase()),
      String(createdAt),
    ]);
    const incident = IncidentSchema.parse({
      id,
      chainId: ATLANTIC.id,
      subject: body.subject,
      signals: body.rawSignals.map((signal) => ({ ...signal, subject: body.subject })),
      createdAt,
    }) as Incident;
    await dependencies.repositories.createIncident(incident);
    return incident;
  });

  app.get("/triage/:id", async (request, reply) => {
    const id = Hex32.parse((request.params as { id: string }).id);
    const incident = await dependencies.repositories.getIncident(id);
    if (!incident) return reply.code(404).send({ error: "not_found" });
    const score = scoreIncident({
      signals: incident.signals,
      now: Date.now(),
      unconfirmedCount: 0,
      confirmedSafeCount: 0,
      goplusCoverageBps: 0,
    });
    return { severity: bucketScore(score), score };
  });

  app.post("/propose", async (request) => {
    const body = z.object({ incidentId: Hex32 }).parse(request.body);
    const result = await dependencies.orchestrator.propose(body.incidentId);
    return { ...result.plan, onchain: { status: result.status, transaction: result.transaction } };
  });

  app.post("/approvals/nonce", async (request, reply) => {
    const body = z.object({ planHash: Hex32, approver: Address }).parse(request.body);
    const plan = await dependencies.repositories.getPlan(body.planHash);
    if (!plan) return reply.code(404).send({ error: "no_plan" });
    const expiresAt = Math.min(plan.expiresAt, Date.now() + 5 * 60_000);
    const record = await dependencies.repositories.issueApprovalNonce({
      chainId: ATLANTIC.id,
      planHash: body.planHash,
      signer: body.approver,
      expiresAt,
    });
    return {
      intentId: record.id,
      version: 1,
      planHash: record.planHash,
      chainId: ATLANTIC.id,
      approver: body.approver,
      nonce: record.nonce,
      expiresAt: record.expiresAt,
    };
  });

  app.post("/approve", async (request) => {
    const body = z.object({
      intentId: z.string().uuid().or(z.string().min(1)),
      intent: ApprovalIntentSchema,
      signature: z.string().regex(/^0x[0-9a-fA-F]+$/).transform((value) => value as Hex),
    }).parse(request.body);
    return dependencies.approval.verifyIntent(
      body.intentId,
      body.intent as ApprovalIntent,
      body.signature,
      Date.now(),
    );
  });

  app.post("/approve/confirm", async (request) => {
    const body = z.object({ intentId: z.string().min(1), txHash: Hex32 }).parse(request.body);
    return dependencies.approval.confirmApproval(body.intentId, body.txHash);
  });

  app.post("/execute", async (request, reply) => {
    const body = z.object({
      planHash: Hex32,
      agentOrZero: Hex32.optional(),
      keyId: Hex32.optional(),
      metadataHash: Hex32.optional(),
    }).parse(request.body);
    const result = await dependencies.orchestrator.execute(body.planHash, body);
    return reply.code(result.status === "pending" ? 202 : 200).send(result);
  });

  app.get("/transactions/:hash", async (request, reply) => {
    const hash = Hex32.parse((request.params as { hash: string }).hash);
    const record = await dependencies.repositories.getTransactionByHash(hash);
    if (!record) return reply.code(404).send({ error: "not_found" });
    if (record.status === "pending") return dependencies.chain.reconcileTransaction(hash);
    return record;
  });

  app.get("/verify/:planHash", async (request, reply) => {
    const planHash = Hex32.parse((request.params as { planHash: string }).planHash);
    const plan = await dependencies.repositories.getPlan(planHash);
    if (!plan) return reply.code(404).send({ error: "no_plan" });
    const [onChain, closure] = await Promise.all([
      dependencies.chain.verifyIncident(plan.incidentId, planHash),
      dependencies.repositories.getClosure(planHash),
    ]);
    const incidentMatches = String(onChain.incident?.incidentId ?? onChain.incident?.[0]).toLowerCase() === plan.incidentId.toLowerCase()
      && String(onChain.incident?.planHash ?? onChain.incident?.[1]).toLowerCase() === planHash.toLowerCase();
    const closureObserved = String(onChain.closure?.closureHash ?? onChain.closure?.[1] ?? "").toLowerCase();
    const closureMatches = Boolean(closure && closureObserved === closure.closureHash.toLowerCase());
    const controllerExecuted = Boolean(onChain.controllerPlan?.executed ?? onChain.controllerPlan?.[6]);
    const ok = incidentMatches && onChain.executed === true && controllerExecuted && closureMatches;
    return {
      ok,
      planHash,
      closureHash: closure?.closureHash ?? null,
      onChain,
      checks: { incidentMatches, executed: onChain.executed === true, controllerExecuted, closureMatches },
    };
  });

  app.post("/close", async (request, reply) => {
    const body = z.object({ planHash: Hex32 }).parse(request.body);
    const closure = await dependencies.repositories.getClosure(body.planHash);
    if (!closure) return reply.code(404).send({ error: "no_closure" });
    return { receipt: closure.closureHash };
  });

  app.get("/health", async () => {
    const [database, chain] = await Promise.all([
      dependencies.databaseHealth().catch(() => false),
      dependencies.chain.health().catch(() => null),
    ]);
    return {
      ok: database && Boolean(chain?.chainOk && chain.contractsOk && chain.rolesOk && chain.relayerBalance > 0n),
      database,
      rpc: chain?.chainOk ?? false,
      contracts: chain?.contractsOk ?? false,
      roles: chain?.rolesOk ?? false,
      relayerBalance: chain?.relayerBalance ?? 0n,
      chainId: chain?.chainId ?? null,
    };
  });

  return app;
}

export function createProductionDependencies(): ServerDependencies {
  const config = loadConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const repositories = new Repositories(pool);
  const chain = new ChainGateway(config, repositories);
  const approval = new ApprovalService(repositories, chain, config.controllerAddress);
  const orchestrator = new IncidentOrchestrator(repositories, chain);
  return {
    repositories,
    chain,
    approval,
    orchestrator,
    databaseHealth: async () => {
      const result = await pool.query("select 1 as ok");
      return result.rows[0]?.ok === 1;
    },
  };
}

if (typeof process !== "undefined" && process.env?.PHAROS_INCIDENT_API === "1") {
  const port = Number(process.env.PORT ?? 8787);
  const app = buildServer({ logger: true, dependencies: createProductionDependencies() });
  app.listen({ port, host: "0.0.0.0" }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
