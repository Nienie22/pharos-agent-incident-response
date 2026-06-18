import type { Hex } from "@pharos-incident/policy";
import { z } from "zod";

export const WebhookPayloadSchema = z.object({
  source: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  subject: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  type: z.string().min(1),
  severity: z.number().int().min(0).max(100),
  evidenceHash: z.string().regex(/^0x[0-9a-fA-F]*$/),
  confidenceBps: z.number().int().min(0).max(10000),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export function parseWebhook(body: unknown): WebhookPayload {
  return WebhookPayloadSchema.parse(body);
}

export function makeWebhookSecret(): string {
  return "whsec_" + Math.random().toString(36).slice(2, 12);
}
