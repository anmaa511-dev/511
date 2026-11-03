import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Only translate placeholders, never quoted text or identifiers.
export function postgresSql(sql) {
  let i = 0,
    quoted = null,
    result = "";
  for (let n = 0; n < sql.length; n++) {
    const c = sql[n];
    if (quoted) {
      result += c;
      if (c === quoted) {
        if (sql[n + 1] === quoted) {
          result += sql[++n];
        } else quoted = null;
      }
    } else if (c === "'" || c === '"') {
      quoted = c;
      result += c;
    } else result += c === "?" ? "$" + ++i : c;
  }
  return result;
}
export function postgresOptions(connectionString) {
  let u;
  try {
    u = new URL(connectionString);
  } catch {
    throw Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    throw Error("DATABASE_URL must be a PostgreSQL connection URL");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  for (const key of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "uselibpqcompat",
  ])
    u.searchParams.delete(key);
  return {
    connectionString: u.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    query_timeout: 20000,
    statement_timeout: 20000,
  };
}
export function openDatabase(file, connectionString) {
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const sqlite = connectionString
    ? null
    : (mkdirSync(path.dirname(file), { recursive: true }),
      new DatabaseSync(file));
  const pool = connectionString
    ? new pg.Pool(postgresOptions(connectionString))
    : null;
  pool?.on("error", (e) =>
    console.error("Database pool error:", e.code ?? "connection failure"),
  );
  if (sqlite) sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  async function exclusive(fn) {
    const prev = queue;
    let release;
    queue = new Promise((r) => {
      release = r;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async function query(sql, params = []) {
    const owner = context.getStore();
    if (pool) {
      const result = await (owner?.client ?? pool).query(
        postgresSql(sql),
        params,
      );
      return { rows: result.rows ?? [], changes: result.rowCount ?? 0 };
    }
    const execute = () => {
      if (!params.length && /^(CREATE|ALTER)/i.test(sql.trim())) {
        sqlite.exec(sql);
        return { rows: [], changes: 0 };
      }
      const q = sqlite.prepare(sql);
      return q.columns().length
        ? { rows: q.all(...params).map((row) => ({ ...row })), changes: 0 }
        : { rows: [], changes: q.run(...params).changes };
    };
    return owner ? execute() : exclusive(execute);
  }
  const db = {
    driver: pool ? "postgres" : "sqlite",
    prepare(sql) {
      return {
        async get(...params) {
          return (await query(sql, params)).rows[0];
        },
        async all(...params) {
          return (await query(sql, params)).rows;
        },
        async run(...params) {
          return { changes: (await query(sql, params)).changes };
        },
      };
    },
    async exec(sql) {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql.trim()))
        throw Error("Use db.transaction for transaction boundaries");
      return query(sql);
    },
    async transaction(fn, { write = true } = {}) {
      if (context.getStore()) return fn();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          if (write) await client.query("SELECT pg_advisory_xact_lock(511)");
          const result = await context.run({ client }, fn);
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }
      return exclusive(() =>
        context.run({ sqlite: true }, async () => {
          sqlite.exec("BEGIN IMMEDIATE");
          try {
            const result = await fn();
            sqlite.exec("COMMIT");
            return result;
          } catch (e) {
            sqlite.exec("ROLLBACK");
            throw e;
          }
        }),
      );
    },
    async close() {
      if (pool) await pool.end();
      else await exclusive(() => sqlite.close());
    },
  };
  return db;
}
