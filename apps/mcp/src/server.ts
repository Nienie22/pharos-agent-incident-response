// Minimal MCP tool surface. The shape mirrors the SDK so that an LLM agent
// can drive the system. Tools are read-only by default; write tools require
// the caller to pass `confirm: true`.
import { HttpClient, type DetectInput, type ApproveInput, type ExecuteInput } from "@pharos-incident/sdk";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: any): Promise<unknown>;
}

function tool(name: string, description: string, inputSchema: Record<string, unknown>, fn: (i: any) => Promise<unknown>): Tool {
  return { name, description, inputSchema, run: fn };
}

export function buildTools(client: HttpClient): Tool[] {
  return [
    tool("incident_detect", "Run detection on a wallet subject.", {
      type: "object",
      properties: { subject: { type: "string" }, signals: { type: "array" } },
      required: ["subject", "signals"],
    }, async (i) => client.detect(i as DetectInput)),
    tool("incident_triage", "Get current severity and score for an incident.", {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    }, async (i) => client.triage(i.id)),
    tool("incident_propose", "Build a deterministic plan for an incident.", {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    }, async (i) => client.propose(i.id)),
    tool("incident_simulate", "Simulate the actions of a plan.", {
      type: "object",
      properties: { plan: { type: "string" } },
      required: ["plan"],
    }, async (i) => client.simulate(i.plan)),
    tool("incident_verify", "Read the closure receipt of a plan.", {
      type: "object",
      properties: { plan: { type: "string" } },
      required: ["plan"],
    }, async (i) => client.verify(i.plan)),
    tool("incident_approve", "Submit an approval. Requires confirm=true.", {
      type: "object",
      properties: { plan: { type: "string" }, approver: { type: "string" }, signature: { type: "string" }, confirm: { type: "boolean" } },
      required: ["plan", "approver", "signature", "confirm"],
    }, async (i) => {
      if (!i.confirm) throw new Error("confirm required");
      return client.approve({ planHash: i.plan, approver: i.approver, signature: i.signature } as ApproveInput);
    }),
    tool("incident_execute", "Execute an approved plan. Requires confirm=true.", {
      type: "object",
      properties: { plan: { type: "string" }, approver: { type: "string" }, signature: { type: "string" }, confirm: { type: "boolean" } },
      required: ["plan", "approver", "signature", "confirm"],
    }, async (i) => {
      if (!i.confirm) throw new Error("confirm required");
      return client.execute({ planHash: i.plan, approver: i.approver, signature: i.signature } as ExecuteInput);
    }),
    tool("incident_close", "Close a verified plan. Requires confirm=true.", {
      type: "object",
      properties: { plan: { type: "string" }, confirm: { type: "boolean" } },
      required: ["plan", "confirm"],
    }, async (i) => {
      if (!i.confirm) throw new Error("confirm required");
      return client.close(i.plan);
    }),
  ];
}
