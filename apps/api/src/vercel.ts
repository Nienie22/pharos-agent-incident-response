import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer, createProductionDependencies } from "./server.js";

const app = buildServer({ dependencies: createProductionDependencies() });
let ready: Promise<void> | null = null;

function stripApiPrefix(req: IncomingMessage) {
  if (!req.url) return;
  req.url = req.url.replace(/^\/api(?=\/|$)/, "") || "/";
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  stripApiPrefix(req);
  ready ??= Promise.resolve(app.ready()).then(() => undefined);
  await ready;
  app.routing(req, res);
}
