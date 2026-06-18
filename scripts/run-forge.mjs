#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

const [, , subcommand, ...rest] = process.argv;

if (!subcommand) {
  console.error("usage: node scripts/run-forge.mjs <build|test|script|...> [forge args]");
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forge = foundryTool("forge");
if (!forge) {
  console.error([
    "Foundry forge was not found.",
    "Install Foundry, then make sure forge is on PATH.",
    "Checked PATH plus common locations:",
    ...candidateDirs().map((dir) => `  - ${dir}`),
  ].join("\n"));
  process.exit(127);
}

const contractsDir = join(ROOT, "packages/contracts");
const result = spawnSync(forge, [subcommand, ...rest], {
  cwd: contractsDir,
  encoding: "utf8",
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);

function foundryTool(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    ...pathCandidates(exe),
    ...candidateDirs().map((dir) => join(dir, exe)),
  ];
  return candidates.find((p) => p && existsSync(p));
}

function pathCandidates(exe) {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, exe));
}

function candidateDirs() {
  const home = homedir();
  const userProfile = process.env.USERPROFILE ?? home;
  const unixHome = process.env.HOME ?? home;
  return [
    join(userProfile, ".foundry", "bin"),
    join(unixHome, ".foundry", "bin"),
    join(userProfile, "foundry"),
    "C:\\foundry",
  ];
}
