import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openStore, createBooking, invoiceFor, slots } from "../server/core.js";
import { createApi, deliverMessages } from "../server/api.js";

const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shanab-test-"));
  const store = openStore(path.join(dir, "test.sqlite"));
  return {
    store,
    clean() {
      store.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const booking = (store, overrides = {}) =>
  createBooking(store, {
    name: "عميل اختبار",
    phone: "0501234567",
    date,
    time: "10:00",
    serviceIds: ["hair"],
    consent: true,
    ...overrides,
  });
async function app(t) {
  const f = fixture();
  const api = createApi(f.store);
  const server = http.createServer(api);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  let cookie = "";
  async function req(p, method = "GET", data, extra = {}) {
    const r = await fetch(base + "/api" + p, {
      method,
      headers: {
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return { status: r.status, body: await r.json(), headers: r.headers };
  }
  t.after(async () => {
    await new Promise((r) => server.close(r));
    f.clean();
  });
  return {
    ...f,
    req,
    async login() {
      let r = await req("/auth/setup", "POST", {
        key: f.store.setupKey(),
        password: "test-password-8735",
      });
      assert.equal(r.status, 200);
      r = await req("/auth/login", "POST", { password: "test-password-8735" });
      assert.equal(r.status, 200);
      assert.match(r.headers.get("set-cookie"), /HttpOnly/);
      return r;
    },
  };
}

test("booking enforces overlaps for full duration and releases cancelled times", () => {
  const f = fixture();
  try {
    const b = booking(f.store, { serviceIds: ["combo"] });
    assert.equal(b.duration, 45);
    assert.throws(
      () => booking(f.store, { time: "10:30" }),
      (e) => e.status === 409,
    );
    assert.equal(
      slots(f.store, date, 30).find((s) => s.time === "10:45").available,
      true,
    );
    f.store.db
      .prepare("UPDATE bookings SET status='cancelled' WHERE id=?")
      .run(b.id);
    assert.equal(booking(f.store, { time: "10:15" }).time, "10:15");
  } finally {
    f.clean();
  }
});
test("booking rejects invalid dates, phones, duplicate services, consent and late finish", () => {
  const f = fixture();
  try {
    for (const override of [
      { date: "2026-02-30" },
      { date: "2020-01-01" },
      { phone: "123" },
      { serviceIds: ["hair", "hair"] },
      { consent: false },
      { time: "21:45", serviceIds: ["care"] },
    ])
      assert.throws(() => booking(f.store, override));
  } finally {
    f.clean();
  }
});
test("admin protected; bootstrap requires one-time key; cross-origin writes rejected", async (t) => {
  const a = await app(t);
  assert.equal((await a.req("/admin/dashboard")).status, 401);
  assert.equal(
    (
      await a.req("/auth/setup", "POST", {
        key: "wrong",
        password: "long-password",
      })
    ).status,
    401,
  );
  await a.login();
  assert.equal(
    (
      await a.req("/auth/setup", "POST", {
        key: a.store.setupKey(),
        password: "long-password",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await a.req(
        "/admin/settings",
        "POST",
        {},
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
  assert.equal((await a.req("/admin/dashboard")).status, 200);
  await a.req("/auth/logout", "POST", {});
  assert.equal((await a.req("/admin/dashboard")).status, 401);
});
test("concurrent booking requests cannot reserve the same slot", async (t) => {
  const a = await app(t);
  const body = {
    name: "اختبار تزامن",
    phone: "0551234567",
    date,
    time: "12:00",
    serviceIds: ["hair"],
    consent: true,
  };
  const r = await Promise.all([
    a.req("/bookings", "POST", body),
    a.req("/bookings", "POST", body),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    a.store.db.prepare("SELECT COUNT(*) n FROM bookings").get().n,
    1,
  );
});
test("invoice discounts, offers, snapshots, issue immutability and token privacy", async (t) => {
  const a = await app(t);
  await a.login();
  const b = booking(a.store);
  let { body: inv, status } = await a.req("/admin/invoices", "POST", {
    bookingId: b.id,
  });
  assert.equal(status, 200);
  assert.equal(inv.subtotal, 3500);
  assert.equal((await a.req("/invoice/" + inv.token)).status, 404);
  const hair = a.store.db
    .prepare("SELECT * FROM services WHERE id='hair'")
    .get();
  assert.equal(
    (await a.req("/admin/services", "POST", { ...hair, price: 99 })).status,
    200,
  );
  let r = await a.req("/admin/invoices/" + inv.id, "PUT", {
    serviceIds: ["hair", "beard"],
    discountType: "percent",
    discountValue: 10,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.subtotal, 6000);
  assert.equal(r.body.total, 5400);
  const beard = a.store.db
    .prepare("SELECT * FROM services WHERE id='beard'")
    .get();
  assert.equal(
    (await a.req("/admin/services", "POST", { ...beard, price: 45 })).status,
    200,
  );

  r = await a.req("/admin/invoices/" + inv.id, "PUT", {
    serviceIds: ["hair"],
    discountType: "percent",
    discountValue: 110,
  });
  assert.equal(r.status, 400);
  r = await a.req("/admin/invoices/" + inv.id, "PUT", {
    serviceIds: ["hair", "beard"],
    discountType: "fixed",
    discountValue: 5,
  });
  assert.equal(r.body.total, 5500);
  await a.req("/admin/offers", "POST", {
    name: "عرض تجريبي",
    type: "percent",
    value: 20,
  });
  const offer = a.store.db.prepare("SELECT * FROM offers").get();
  r = await a.req("/admin/invoices/" + inv.id, "PUT", {
    serviceIds: ["hair", "beard"],
    offerId: offer.id,
  });
  assert.equal(r.body.total, 4800);
  assert.equal(r.body.offer_name, "عرض تجريبي");
  r = await a.req("/admin/invoices/" + inv.id + "/issue", "POST", {});
  assert.equal(r.status, 200);
  assert.equal(r.body.queued, false);
  const issued = await a.req("/invoice/" + inv.token);
  assert.equal(issued.body.total, 4800);
  assert.ok(issued.body.issued_at);
  assert.equal(issued.body.phone, undefined);
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
  assert.equal(
    (await a.req("/admin/invoices", "POST", { bookingId: b.id })).body.id,
    inv.id,
  );
});
test("catalog reorder is atomic and requires all services", async (t) => {
  const a = await app(t);
  await a.login();
  const ids = a.store.db
    .prepare("SELECT id FROM services ORDER BY position")
    .all()
    .map((s) => s.id)
    .reverse();
  assert.equal(
    (await a.req("/admin/services/reorder", "POST", { ids: ids.slice(1) }))
      .status,
    400,
  );
  assert.equal(
    (await a.req("/admin/services/reorder", "POST", { ids })).status,
    200,
  );
  assert.deepEqual(
    a.store.db
      .prepare("SELECT id FROM services ORDER BY position")
      .all()
      .map((s) => s.id),
    ids,
  );
});
test("WhatsApp template dispatch uses final total and records provider acceptance without duplication", async (t) => {
  const a = await app(t);
  await a.login();
  const saved = {};
  for (const [k, v] of Object.entries({
    WHATSAPP_TOKEN: "test-only-no-real-token",
    WHATSAPP_PHONE_NUMBER_ID: "12345",
    WHATSAPP_TEMPLATE_NAME: "invoice_test",
    PUBLIC_URL: "https://example.com",
  })) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const b = booking(a.store);
  const inv = invoiceFor(a.store, b.id);
  await a.req("/admin/invoices/" + inv.id + "/issue", "POST", {});
  await a.req("/admin/invoices/" + inv.id + "/issue", "POST", {});
  let calls = 0;
  await deliverMessages(a.store, async (url, opts) => {
    calls++;
    const body = JSON.parse(opts.body);
    assert.equal(body.to, "966501234567");
    assert.equal(body.type, "template");
    assert.equal(body.template.components[0].parameters[2].text, "35.00");
    assert.match(
      body.template.components[0].parameters[3].text,
      /^https:\/\/example.com\/invoice\//,
    );
    return {
      ok: true,
      json: async () => ({ messages: [{ id: "test-provider-id" }] }),
    };
  });
  await deliverMessages(a.store, async () => {
    throw Error("must not resend");
  });
  assert.equal(calls, 1);
  assert.equal(
    a.store.db.prepare("SELECT status FROM messages").get().status,
    "accepted",
  );
});
test("ambiguous WhatsApp network failures require review rather than automatic resend", async (t) => {
  const a = await app(t);
  const env = {
      WHATSAPP_TOKEN: "test-only",
      WHATSAPP_PHONE_NUMBER_ID: "123",
      WHATSAPP_TEMPLATE_NAME: "test",
      PUBLIC_URL: "https://example.com",
    },
    old = {};
  for (const k in env) {
    old[k] = process.env[k];
    process.env[k] = env[k];
  }
  t.after(() => {
    for (const k in env) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  });
  const b = booking(a.store),
    inv = invoiceFor(a.store, b.id);
  a.store.db
    .prepare("UPDATE invoices SET status='issued' WHERE id=?")
    .run(inv.id);
  a.store.db
    .prepare(
      "INSERT INTO messages(id,invoice_id,status) VALUES('test',?,'pending')",
    )
    .run(inv.id);
  let calls = 0;
  await deliverMessages(a.store, async () => {
    calls++;
    throw new Error("network");
  });
  await deliverMessages(a.store, async () => {
    calls++;
  });
  assert.equal(calls, 1);
  assert.equal(
    a.store.db.prepare("SELECT status FROM messages").get().status,
    "failed",
  );
});
