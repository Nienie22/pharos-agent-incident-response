import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/migrate.js";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("database migrations", () => {
  it("creates durable live workflow tables and is idempotent", async () => {
    const db = newDb();
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    const directory = await mkdtemp(join(tmpdir(), "pharos-migrations-"));
    cleanup.push(directory);
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/migrations/001_live_transactions.sql", import.meta.url), "utf8"),
    );
    await writeFile(join(directory, "001_live_transactions.sql"), source);

    await applyMigrations(pool, directory, { advisoryLock: false });
    await applyMigrations(pool, directory, { advisoryLock: false });

    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      "schema_migrations",
      "incidents",
      "plans",
      "approval_intents",
      "transactions",
      "relayer_nonces",
    ]));
    const applied = await pool.query("select version from schema_migrations");
    expect(applied.rowCount).toBe(1);
    await pool.end();
  });

  it("enforces unique approval and relayer transaction nonces", async () => {
    const db = newDb();
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    const directory = await mkdtemp(join(tmpdir(), "pharos-migrations-"));
    cleanup.push(directory);
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/migrations/001_live_transactions.sql", import.meta.url), "utf8"),
    );
    await writeFile(join(directory, "001_live_transactions.sql"), source);
    await applyMigrations(pool, directory, { advisoryLock: false });

    const signer = "0x0000000000000000000000000000000000000001";
    const planHash = "0x" + "11".repeat(32);
    await pool.query(
      "insert into approval_intents (id, chain_id, plan_hash, signer, nonce, expires_at, status) values ($1,$2,$3,$4,$5,$6,$7)",
      ["a", 688689, planHash, signer, "nonce-1", new Date(Date.now() + 60_000), "issued"],
    );
    await expect(pool.query(
      "insert into approval_intents (id, chain_id, plan_hash, signer, nonce, expires_at, status) values ($1,$2,$3,$4,$5,$6,$7)",
      ["b", 688689, planHash, signer, "nonce-1", new Date(Date.now() + 60_000), "issued"],
    )).rejects.toThrow();

    await pool.query(
      "insert into transactions (id, purpose, reference_id, chain_id, sender, nonce, status) values ($1,$2,$3,$4,$5,$6,$7)",
      ["tx-a", "register", planHash, 688689, signer, "7", "created"],
    );
    await expect(pool.query(
      "insert into transactions (id, purpose, reference_id, chain_id, sender, nonce, status) values ($1,$2,$3,$4,$5,$6,$7)",
      ["tx-b", "register", planHash, 688689, signer, "7", "created"],
    )).rejects.toThrow();
    await pool.end();
  });
});
