import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
process.env.DATA_FILE = path.join(
  mkdtempSync(path.join(os.tmpdir(), "shanab-e2e-")),
  "db.sqlite",
);
process.env.ADMIN_PASSWORD = "browser-test-password-5391";
process.env.PORT = "3100";
process.env.NODE_ENV = "production";
delete process.env.WHATSAPP_TOKEN;
if (process.env.TEST_DATABASE_URL) {
  const { default: pg } = await import("pg");
  const { postgresOptions } = await import("../server/database.js");
  const { randomBytes } = await import("node:crypto");
  const pool = new pg.Pool(postgresOptions(process.env.TEST_DATABASE_URL));
  const schema = "shanab_browser_" + randomBytes(8).toString("hex");
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.end();
  const u = new URL(process.env.TEST_DATABASE_URL);
  u.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = u.toString();
} else delete process.env.DATABASE_URL;
await import("../server/index.js");
