import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { loadConfig } from "./config.js";
import { createDatabasePool } from "./db.js";

const MIGRATION_LOCK = 6_886_890_101;

export interface MigrationOptions {
  advisoryLock?: boolean;
}

export async function applyMigrations(
  pool: Pick<Pool, "connect">,
  directory = join(dirname(fileURLToPath(import.meta.url)), "migrations"),
  options: MigrationOptions = {},
): Promise<void> {
  const client = await pool.connect();
  const useLock = options.advisoryLock ?? true;
  try {
    if (useLock) await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    const ledger = await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'schema_migrations'",
    );
    if (!ledger.rowCount) {
      await client.query(`
        create table schema_migrations (
          version text primary key,
          applied_at timestamptz not null default now()
        )
      `);
    }
    const files = (await readdir(directory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    for (const file of files) {
      const exists = await client.query("select 1 from schema_migrations where version = $1", [file]);
      if (exists.rowCount) continue;
      const sql = await readFile(join(directory, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    if (useLock) await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]);
    client.release();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool(config.databaseUrl);
  try {
    await applyMigrations(pool);
    process.stdout.write("Database migrations applied.\n");
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
