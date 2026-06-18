#!/usr/bin/env node
// Secret scan. Looks for accidental private key / API key leakage in
// production source. Test files, vendored libraries, and the
// deployments/ folder (sanitized manifests) are ignored. To flag a
// hex string as a likely private key, we look for the pattern
// `NAME_KEY = 0x...` or `NAME_PRIVATE_KEY = 0x...`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(process.cwd());

const PATTERNS = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", re: /ghp_[0-9A-Za-z]{36}/ },
];
const SECRET_ASSIGN_RE = /\b(PRIVATE_KEY|MNEMONIC|SEED|SECRET|PHAROS_(DEPLOYER|REPORTER|APPROVER|RESPONDER)_?(KEY|MNEMONIC)?)\s*[:=]\s*["']?0x[0-9a-fA-F]{64}/;

const issues = [];
const IGNORED = new Set(["node_modules", ".git", "dist", "coverage", "out", "cache", "broadcast", "lib", "deployments"]);

function isTestFile(p) {
  return /[\\/](test|tests)[\\/]/.test(p);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (IGNORED.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|cjs|json|env)$/.test(name) && !isTestFile(full)) check(full);
  }
}

function check(file) {
  const text = readFileSync(file, "utf8");
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) issues.push(`${relative(ROOT, file)}: possible ${name}`);
  }
  if (SECRET_ASSIGN_RE.test(text)) {
    issues.push(`${relative(ROOT, file)}: possible eth private key (secret assignment)`);
  }
}

walk(ROOT);

if (issues.length) {
  console.error("secret-scan: FAILED");
  for (const i of issues) console.error("  - " + i);
  process.exit(1);
}
console.log("secret-scan: OK");