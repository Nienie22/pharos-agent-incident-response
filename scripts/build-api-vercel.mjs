#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(import.meta.dirname, "..");

export async function buildApiVercel(outfile = resolve(ROOT, "deployments/api-vercel/api/index.mjs")) {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [resolve(ROOT, "apps/api/src/vercel.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    treeShaking: true,
    sourcemap: false,
    legalComments: "none",
    external: ["pg-native"],
  });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  buildApiVercel().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
