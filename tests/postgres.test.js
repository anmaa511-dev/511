import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { postgresOptions } from "../server/database.js";
import { openStore, createBooking, invoiceFor } from "../server/core.js";
import { createApi } from "../server/api.js";

const skip = !process.env.TEST_DATABASE_URL;
const date = new Date(Date.now() + 86400000 + 3 * 3600000)
  .toISOString()
  .slice(0, 10);
const fields = {
  name: "عميل PostgreSQL",
  phone: "0501234567",
  date,
  time: "10:00",
  serviceIds: ["hair"],
  consent: true,
};
async function fixture(t) {
  const admin = new pg.Pool(postgresOptions(process.env.TEST_DATABASE_URL));
  const schema = "shanab_test_" + randomBytes(8).toString("hex");
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  const stores = [];
  async function open(adminPassword = "postgres-test-password-5391") {
    const s = await openStore(
      "/unwritable/render-disk-is-not-needed/db.sqlite",
      url.toString(),
      adminPassword,
    );
    stores.push(s);
    return s;
  }
  async function close(s) {
    stores.splice(stores.indexOf(s), 1);
    await s.db.close();
  }
  t.after(async () => {
    await Promise.all(stores.map((s) => s.db.close()));
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  return { store: await open(), open, close };
}
async function app(t, store, cookie = "") {
  const server = http.createServer(createApi(store));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    cookie: () => cookie,
    async req(p, method = "GET", data) {
      const r = await fetch(base + "/api" + p, {
        method,
        headers: {
          ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
          Cookie: cookie,
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      if (r.headers.has("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return { status: r.status, body: await r.json() };
    },
  };
}
test(
  "PostgreSQL full invoice flow and stored admin/session/booking survive a new connection",
  { skip },
  async (t) => {
    const f = await fixture(t),
      a = await app(t, f.store);
    assert.equal(f.store.db.driver, "postgres");
    assert.equal((await a.req("/auth/status")).body.setupRequired, false);
    assert.equal((await a.req("/admin/dashboard")).status, 401);
    assert.equal(
      (
        await a.req("/auth/login", "POST", {
          password: "postgres-test-password-5391",
        })
      ).status,
      200,
    );
    const b = await a.req("/bookings", "POST", fields);
    assert.equal(b.status, 201);
    let inv = (await a.req("/admin/invoices", "POST", { bookingId: b.body.id }))
      .body;
    assert.equal(
      (
        await a.req("/admin/offers", "POST", {
          name: "عرض الوفاء",
          type: "percent",
          value: 20,
        })
      ).status,
      200,
    );
    let dashboard = (await a.req("/admin/dashboard")).body;
    const offer = dashboard.offers[0];
    let r = await a.req("/admin/invoices/" + inv.id, "PUT", {
      serviceIds: ["hair", "beard"],
      offerId: offer.id,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 4800);
    assert.equal((await a.req("/invoice/" + inv.token)).status, 404);
    assert.equal(
      (await a.req("/admin/invoices/" + inv.id + "/issue", "POST", {})).status,
      200,
    );
    assert.equal((await a.req("/invoice/" + inv.token)).body.total, 4800);
    assert.equal(
      (
        await a.req("/admin/invoices/" + inv.id, "PUT", {
          serviceIds: ["hair"],
          discountType: "fixed",
          discountValue: 0,
        })
      ).status,
      409,
    );
    const cookie = a.cookie();
    await f.close(f.store);
    const reopened = await f.open(),
      second = await app(t, reopened, cookie);
    dashboard = (await second.req("/admin/dashboard")).body;
    assert.equal(dashboard.bookings.length, 1);
    assert.equal(dashboard.invoices.length, 1);
    assert.equal(dashboard.invoices[0].total, 4800);
    assert.equal(dashboard.invoices[0].status, "issued");
    assert.ok(dashboard.invoices[0].issued_at);
    assert.equal(
      (await second.req("/invoice/" + inv.token)).body.phone,
      undefined,
    );
    // Failed writes roll back without changing saved data.
    await assert.rejects(
      reopened.db.transaction(async () => {
        await reopened.set("business_name", "should roll back");
        throw Error("rollback test");
      }),
      /rollback test/,
    );
    assert.equal(await reopened.get("business_name"), "شنب");
  },
);
test(
  "independent PostgreSQL clients serialize booking overlap and invoice numbering",
  { skip },
  async (t) => {
    const f = await fixture(t),
      other = await f.open();
    const results = await Promise.allSettled([
      createBooking(f.store, fields),
      createBooking(other, fields),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected");
    assert.equal(rejected.reason.status, 409);
    const b = results.find((r) => r.status === "fulfilled").value;
    const invoices = await Promise.all([
      invoiceFor(f.store, b.id),
      invoiceFor(other, b.id),
    ]);
    assert.equal(invoices[0].id, invoices[1].id);
    const later = await createBooking(other, { ...fields, time: "12:00" });
    const third = await invoiceFor(other, later.id);
    assert.equal(third.number, invoices[0].number + 1);
    const a = await app(t, f.store);
    await a.req("/auth/login", "POST", {
      password: "postgres-test-password-5391",
    });
    const ids = (await a.req("/admin/dashboard")).body.services
      .map((s) => s.id)
      .reverse();
    assert.equal(
      (await a.req("/admin/services/reorder", "POST", { ids })).status,
      200,
    );
    assert.deepEqual(
      (await a.req("/public")).body.services.map((s) => s.id),
      ids,
    );
    assert.equal(
      (
        await a.req("/admin/bookings/" + later.id, "PATCH", {
          status: "cancelled",
        })
      ).status,
      200,
    );
    assert.equal(
      (await createBooking(f.store, { ...fields, time: "12:00" })).time,
      "12:00",
    );
  },
);

test(
  "PostgreSQL bootstrap fails cleanly without an owner password",
  { skip },
  async (t) => {
    const f = await fixture(t);
    await f.store.db
      .prepare("DELETE FROM settings WHERE key='admin_hash'")
      .run();
    await assert.rejects(f.open(null), /Set ADMIN_PASSWORD/);
  },
);
