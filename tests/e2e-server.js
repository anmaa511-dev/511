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
await import("../server/index.js");
