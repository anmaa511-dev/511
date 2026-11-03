import { openDatabase } from "./database.js";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export const id = () => randomBytes(18).toString("hex");
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const passwordHash = (p) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
};
export function verifyPassword(p, h) {
  try {
    const [s, d] = h.split(":");
    return timingSafeEqual(scryptSync(p, s, 64), Buffer.from(d, "hex"));
  } catch {
    return false;
  }
}
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function text(v, max = 160) {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    fail("تحقق من البيانات المدخلة");
  return v.trim();
}
export function money(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100000)
    fail("المبلغ غير صالح");
  return Math.round(v * 100);
}
export function phone(v) {
  let s = String(v ?? "")
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[\s+()-]/g, "");
  if (/^05\d{8}$/.test(s)) s = "966" + s.slice(1);
  if (!/^9665\d{8}$/.test(s)) fail("أدخل رقم جوال سعودي صحيح");
  return s;
}
export const nowSaudi = () => new Date(Date.now() + 3 * 3600000).toISOString();
export async function openStore(
  file,
  connectionString = process.env.DATABASE_URL,
  adminPassword = process.env.ADMIN_PASSWORD,
) {
  const db = openDatabase(file, connectionString);
  try {
    await db.transaction(async () => {
      await db.exec(`
 CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL,duration INTEGER NOT NULL,position INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,value DOUBLE PRECISION NOT NULL,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,duration INTEGER NOT NULL,lines TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',created TEXT NOT NULL,consent INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY,number INTEGER UNIQUE NOT NULL,booking_id TEXT UNIQUE REFERENCES bookings(id),name TEXT NOT NULL,phone TEXT NOT NULL,lines TEXT NOT NULL,discount_type TEXT NOT NULL,discount_value DOUBLE PRECISION NOT NULL,offer_name TEXT NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft',token TEXT UNIQUE NOT NULL,created TEXT NOT NULL,issued_at TEXT);
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,expires BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,invoice_id TEXT UNIQUE REFERENCES invoices(id),status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_try BIGINT NOT NULL DEFAULT 0,error TEXT,provider_id TEXT);
 `);
      if (db.driver === "sqlite") {
        for (const [table, column, type] of [
          ["bookings", "consent", "INTEGER NOT NULL DEFAULT 0"],
          ["invoices", "issued_at", "TEXT"],
        ]) {
          if (
            !(await db.prepare(`PRAGMA table_info(${table})`).all()).some(
              (c) => c.name === column,
            )
          )
            await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        }
      }
    });
    const set = async (k, v) =>
      await db
        .prepare(
          "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(k, String(v));
    const get = async (k) =>
      (await db.prepare("SELECT value FROM settings WHERE key=?").get(k))
        ?.value;
    await db.transaction(async () => {
      if (!(await get("initialized"))) {
        const defaults = [
          ["hair", "قص شعر", "قَصّة متقنة، على ذوقك.", 35, 30],
          ["beard", "تهذيب اللحية", "تفاصيل مرتبة وإطلالة أنيقة.", 25, 20],
          ["combo", "شعر + لحية", "إطلالة متكاملة في جلسة واحدة.", 55, 45],
          ["skin", "تنظيف البشرة", "انتعاش وعناية تستحقها بشرتك.", 60, 40],
          ["kids", "حلاقة أطفال", "عناية لطيفة لأناقة الصغار.", 25, 25],
          ["care", "العناية الكاملة", "شعر، لحية، وعناية بالبشرة.", 110, 90],
        ];
        for (const [i, n, d, p, m] of defaults)
          await db.prepare("INSERT INTO services VALUES (?,?,?,?,?,?,1)").run(
            i,
            n,
            d,
            p * 100,
            m,
            defaults.findIndex((x) => x[0] === i),
          );
        for (const [k, v] of Object.entries({
          business_name: "شنب",
          open: "10:00",
          close: "22:00",
          map_url: "https://maps.app.goo.gl/h8DGk2gT85depDNs5",
          business_phone: "",
          initialized: "1",
        }))
          await set(k, v);
      }
    });
    if (adminPassword && !(await get("admin_hash"))) {
      if (adminPassword.length < 10)
        throw new Error("ADMIN_PASSWORD must contain at least 10 characters");
      await set("admin_hash", passwordHash(adminPassword));
    }
    if (db.driver === "postgres" && !(await get("admin_hash")))
      throw Error(
        "Set ADMIN_PASSWORD (at least 10 characters) before the first PostgreSQL deployment",
      );
    const keyFile =
      db.driver === "sqlite"
        ? path.join(path.dirname(file), "setup-key.txt")
        : null;
    if (!(await get("admin_hash")) && keyFile && !existsSync(keyFile))
      writeFileSync(keyFile, id(), { mode: 0o600 });
    const setupKey = () =>
      keyFile && existsSync(keyFile)
        ? readFileSync(keyFile, "utf8").trim()
        : null;
    return { db, set, get, setupKey };
  } catch (error) {
    await db.close();
    throw error;
  }
}
export async function services(store, all = false) {
  return await store.db
    .prepare(
      "SELECT * FROM services " +
        (all ? "" : "WHERE active=1 ") +
        "ORDER BY position, id",
    )
    .all();
}
export async function settings(store) {
  const rows = await store.db
    .prepare(
      "SELECT key,value FROM settings WHERE key IN ('business_name','open','close','map_url','business_phone')",
    )
    .all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
const mins = (t) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
const time = (m) =>
  `${Math.floor(m / 60)}`.padStart(2, "0") + ":" + `${m % 60}`.padStart(2, "0");
export async function linesFor(store, ids) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 12 ||
    new Set(ids).size !== ids.length
  )
    fail("اختر خدمة واحدة على الأقل دون تكرار");
  const result = [];
  for (const i of ids) {
    const s = await store.db
      .prepare("SELECT * FROM services WHERE id=? AND active=1")
      .get(String(i));
    if (!s) fail("إحدى الخدمات لم تعد متاحة");
    result.push({
      id: s.id,
      name: s.name,
      price: s.price,
      duration: s.duration,
    });
  }
  return result;
}
export async function slots(store, date, duration) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  )
    fail("التاريخ غير صالح");
  const today = nowSaudi().slice(0, 10);
  const horizon = new Date(Date.now() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  if (date < today || date > horizon)
    fail("اختر موعدًا خلال الستين يومًا القادمة");
  const busy = await store.db
    .prepare(
      "SELECT time,duration FROM bookings WHERE date=? AND status!='cancelled'",
    )
    .all(date);
  const hours = await settings(store);
  const results = [];
  for (let m = mins(hours.open); m + duration <= mins(hours.close); m += 15) {
    if (
      new Date(`${date}T${time(m)}:00+03:00`).getTime() <=
      Date.now() + 15 * 60000
    )
      continue;
    results.push({
      time: time(m),
      available: !busy.some(
        (b) => m < mins(b.time) + b.duration && m + duration > mins(b.time),
      ),
    });
  }
  return results;
}
export async function createBooking(store, data) {
  if (data.consent !== true)
    fail("يجب الموافقة على استخدام بيانات الحجز والفاتورة");
  const name = text(data.name, 80),
    p = phone(data.phone),
    lines = await linesFor(store, data.serviceIds);
  const duration = lines.reduce((s, l) => s + l.duration, 0);
  const { db } = store;
  return db.transaction(async () => {
    if (
      !(await slots(store, data.date, duration)).some(
        (s) => s.time === data.time && s.available,
      )
    )
      fail("هذا الموعد غير متاح، اختر وقتًا آخر", 409);
    const b = {
      id: id(),
      name,
      phone: p,
      date: data.date,
      time: data.time,
      duration,
      lines,
      status: "confirmed",
      created: new Date().toISOString(),
    };
    await db
      .prepare(
        "INSERT INTO bookings (id,name,phone,date,time,duration,lines,status,created,consent) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        b.id,
        b.name,
        b.phone,
        b.date,
        b.time,
        b.duration,
        JSON.stringify(lines),
        b.status,
        b.created,
        1,
      );
    return b;
  });
}
export function invoiceFor(store, bid) {
  const { db } = store;
  return db.transaction(async () => {
    let inv = await db
      .prepare("SELECT * FROM invoices WHERE booking_id=?")
      .get(bid);
    if (inv) return { ...inv, lines: JSON.parse(inv.lines) };
    const b = await db.prepare("SELECT * FROM bookings WHERE id=?").get(bid);
    if (!b) fail("الحجز غير موجود", 404);
    const lines = JSON.parse(b.lines),
      subtotal = lines.reduce((s, l) => s + l.price, 0);
    const number = (
      await db
        .prepare("SELECT COALESCE(MAX(number),1000)+1 AS n FROM invoices")
        .get()
    ).n;
    await db
      .prepare(
        "INSERT INTO invoices (id,number,booking_id,name,phone,lines,discount_type,discount_value,offer_name,subtotal,discount,total,status,token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id(),
        number,
        bid,
        b.name,
        b.phone,
        b.lines,
        "fixed",
        0,
        "",
        subtotal,
        0,
        subtotal,
        "draft",
        id(),
        new Date().toISOString(),
      );
    return {
      ...(await db
        .prepare("SELECT * FROM invoices WHERE booking_id=?")
        .get(bid)),
      lines,
    };
  });
}
