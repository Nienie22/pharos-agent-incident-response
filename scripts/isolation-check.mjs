#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(process.cwd());
const FORBIDDEN_RE = /(?:^|[\s"`'(])\.\.?\/(?:pharos-future-ideas|..)\/(?!01-agent-incident-response)\w+/;
const IGNORED = new Set([
  "node_modules", ".git", "dist", "coverage", "out", "cache", "broadcast",
]);

const issues = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (IGNORED.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (rel.split(/[\\/]/).includes("lib")) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|cjs|json|sol|md)$/.test(name)) check(full);
  }
}

function check(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (FORBIDDEN_RE.test(line)) {
      issues.push(`${relative(ROOT, file)}:${idx + 1} references another future-ideas workspace`);
    }
  });
}

if (!existsSync(join(ROOT, "package.json"))) {
  console.error("isolation-check: package.json not found");
  process.exit(2);
}

walk(ROOT);

if (issues.length) {
  console.error("isolation-check: FAILED");
  for (const i of issues) console.error("  - " + i);
  process.exit(1);
}
console.log("isolation-check: OK (no cross-project references detected)");