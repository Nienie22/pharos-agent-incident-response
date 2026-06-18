import { z } from "zod";

export const HexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "must be 0x-prefixed hex");

export const SeveritySchema = z.enum(["INFO", "SUSPICIOUS", "HIGH", "CRITICAL"]);

export const ActionKindSchema = z.enum([
  "PAUSE_AGENT",
  "REVOKE_APPROVAL",
  "REMOVE_EXECUTOR",
  "ROTATE_KEY_METADATA",
  "SNAPSHOT",
]);

export const SignalSchema = z.object({
  source: z.string().min(1).max(64),
  observedAt: z.number().int().nonnegative(),
  subject: HexSchema,
  type: z.string().min(1).max(64),
  severity: z.number().int().min(0).max(100),
  evidenceHash: HexSchema,
  confidenceBps: z.number().int().min(0).max(10000),
});

export const IncidentSchema = z.object({
  id: HexSchema,
  chainId: z.number().int().positive(),
  subject: HexSchema,
  signals: z.array(SignalSchema).min(1),
  createdAt: z.number().int().nonnegative(),
});

export const ActionSchema = z.object({
  kind: ActionKindSchema,
  target: HexSchema,
  calldata: HexSchema,
  value: z.bigint().nonnegative(),
  reasonHash: HexSchema,
});

export const PlanSchema = z.object({
  incidentId: HexSchema,
  chainId: z.number().int().positive(),
  actions: z.array(ActionSchema).min(1).max(16),
  expiresAt: z.number().int().positive(),
  requiredApprovals: z.number().int().min(0).max(10),
  planHash: HexSchema,
});

export const ApprovalSchema = z.object({
  planHash: HexSchema,
  approver: HexSchema,
  expiresAt: z.number().int().positive(),
  signature: HexSchema,
});
