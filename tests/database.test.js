import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openDatabase,
  postgresOptions,
  postgresSql,
} from "../server/database.js";

test("PostgreSQL TLS remains verified even with sslmode=require in a Neon URL", () => {
  const c = postgresOptions(
    "postgresql://test-role:test-only@example.neon.tech/neondb?sslmode=require&channel_binding=require",
  );
  assert.equal(c.ssl.rejectUnauthorized, true);
  assert.equal(new URL(c.connectionString).searchParams.has("sslmode"), false);
  assert.equal(
    postgresOptions("postgresql://test-role:test-only@127.0.0.1:55432/test")
      .ssl,
    false,
  );
});
test("SQL placeholders preserve quoted question marks", () => {
  assert.equal(
    postgresSql(
      `SELECT '?' AS "?", id FROM services WHERE id=? AND name='it''s ?' AND price=?`,
    ),
    `SELECT '?' AS "?", id FROM services WHERE id=$1 AND name='it''s ?' AND price=$2`,
  );
});
test("SQLite transaction rollback cannot commit an unrelated concurrent write", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shanab-transaction-")),
    db = openDatabase(path.join(dir, "test.sqlite"));
  try {
    await db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)");
    let entered, release;
    const started = new Promise((r) => (entered = r)),
      gate = new Promise((r) => (release = r));
    const writing = db.transaction(async () => {
      await db.prepare("INSERT INTO items VALUES (?,?)").run(1, "rollback");
      entered();
      await gate;
      throw Error("expected rollback");
    });
    const rejection = assert.rejects(writing, /expected rollback/);
    await started;
    const outside = db.prepare("INSERT INTO items VALUES (?,?)").run(2, "keep");
    release();
    await rejection;
    await outside;
    assert.deepEqual(await db.prepare("SELECT * FROM items").all(), [
      { id: 2, value: "keep" },
    ]);
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
