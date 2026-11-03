import {
  id,
  hash,
  verifyPassword,
  passwordHash,
  fail,
  text,
  money,
  phone,
  services,
  settings,
  slots,
  linesFor,
  createBooking,
  invoiceFor,
} from "./core.js";
const decode = (row) => (row ? { ...row, lines: JSON.parse(row.lines) } : null);
export function whatsappConfigured() {
  return !!(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_TEMPLATE_NAME &&
    process.env.PUBLIC_URL?.startsWith("https://")
  );
}
export function createApi(store) {
  const attempts = new Map();
  function rate(key, max, window = 60000) {
    const t = Date.now();
    let b = attempts.get(key);
    if (!b || b.end < t) {
      b = { n: 0, end: t + window };
      attempts.set(key, b);
    }
    if (++b.n > max) fail("محاولات كثيرة، حاول بعد قليل", 429);
    if (attempts.size > 10000)
      for (const [k, v] of attempts) if (v.end < t) attempts.delete(k);
  }
  const { db, get, set } = store;
  return async function api(req, res) {
    const url = new URL(req.url, "http://localhost"),
      p = url.pathname,
      method = req.method;
    if (!p.startsWith("/api/")) return false;
    const json = (data, status = 200) => ({ data, status });
    const send = (data, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
      return true;
    };
    try {
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host)
          fail("مصدر الطلب غير مسموح", 403);
        if (
          !String(req.headers["content-type"] ?? "").startsWith(
            "application/json",
          )
        )
          fail("نوع الطلب غير مدعوم", 415);
      }
      let data = {};
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        let body = "";
        for await (const c of req) {
          body += c;
          if (Buffer.byteLength(body) > 32768) fail("الطلب كبير جدًا", 413);
        }
        try {
          data = body ? JSON.parse(body) : {};
        } catch {
          fail("الطلب غير صالح");
        }
      }
      if (!data || typeof data !== "object" || Array.isArray(data))
        fail("الطلب غير صالح");
      const ip = req.socket.remoteAddress || "unknown";
      const result = await db.transaction(
        async () => {
          if (p === "/api/public" && method === "GET")
            return json({
              services: await services(store),
              settings: await settings(store),
            });
          if (p === "/api/slots" && method === "GET") {
            rate("slots" + ip, 120);
            const ls = await linesFor(
              store,
              url.searchParams.get("services")?.split(","),
            );
            return json(
              await slots(
                store,
                url.searchParams.get("date") ?? "",
                ls.reduce((a, s) => a + s.duration, 0),
              ),
            );
          }
          if (p === "/api/bookings" && method === "POST") {
            rate("booking" + ip, 10, 3600000);
            return json(await createBooking(store, data), 201);
          }
          if (p.startsWith("/api/invoice/") && method === "GET") {
            rate("invoice" + ip, 120);
            const inv = await db
              .prepare(
                "SELECT number,name,lines,discount_type,discount_value,offer_name,subtotal,discount,total,created,issued_at,status FROM invoices WHERE token=? AND status='issued'",
              )
              .get(p.split("/").pop());
            if (!inv) fail("الفاتورة غير موجودة", 404);
            return json({ ...decode(inv), settings: await settings(store) });
          }
          if (p === "/api/auth/status" && method === "GET")
            return json({ setupRequired: !(await get("admin_hash")) });
          if (p === "/api/auth/setup" && method === "POST") {
            rate("setup" + ip, 5, 15 * 60000);
            if (await get("admin_hash"))
              fail("تم إعداد حساب الإدارة مسبقًا", 409);
            if (
              typeof data.key !== "string" ||
              hash(data.key) !== hash(store.setupKey() ?? id())
            )
              fail("رمز التهيئة غير صحيح", 401);
            if (
              typeof data.password !== "string" ||
              data.password.length < 10 ||
              data.password.length > 200
            )
              fail("كلمة المرور يجب أن تكون من ١٠ إلى ٢٠٠ حرف");
            await set("admin_hash", passwordHash(data.password));
            return json({ ok: true });
          }
          if (p === "/api/auth/login" && method === "POST") {
            rate("login" + ip, 10, 15 * 60000);
            if (
              typeof data.password !== "string" ||
              data.password.length > 200 ||
              !verifyPassword(data.password, (await get("admin_hash")) ?? "")
            )
              fail("كلمة المرور غير صحيحة", 401);
            await db
              .prepare("DELETE FROM sessions WHERE expires<?")
              .run(Date.now());
            const token = id();
            await db
              .prepare("INSERT INTO sessions VALUES (?,?)")
              .run(hash(token), Date.now() + 12 * 3600000);
            res.setHeader(
              "Set-Cookie",
              `shanab_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
            );
            return json({ ok: true });
          }
          if (p.startsWith("/api/admin/") || p === "/api/auth/logout") {
            const token = req.headers.cookie
              ?.split(";")
              .map((s) => s.trim())
              .find((s) => s.startsWith("shanab_session="))
              ?.split("=")[1];
            if (
              !token ||
              !(await db
                .prepare("SELECT 1 FROM sessions WHERE token=? AND expires>?")
                .get(hash(token), Date.now()))
            )
              fail("سجّل دخولك للمتابعة", 401);
            if (p === "/api/auth/logout") {
              await db
                .prepare("DELETE FROM sessions WHERE token=?")
                .run(hash(token));
              res.setHeader(
                "Set-Cookie",
                "shanab_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
              );
              return json({ ok: true });
            }
            if (p === "/api/admin/dashboard" && method === "GET")
              return json({
                bookings: (
                  await db
                    .prepare(
                      "SELECT * FROM bookings ORDER BY date DESC,time DESC",
                    )
                    .all()
                ).map(decode),
                invoices: (
                  await db
                    .prepare(
                      "SELECT i.*,m.status AS message_status,m.error AS message_error FROM invoices i LEFT JOIN messages m ON m.invoice_id=i.id ORDER BY number DESC",
                    )
                    .all()
                ).map(decode),
                services: await services(store, true),
                offers: await db
                  .prepare("SELECT * FROM offers ORDER BY name,id")
                  .all(),
                settings: await settings(store),
                whatsappConfigured: whatsappConfigured(),
              });
            if (p === "/api/admin/services/reorder" && method === "POST") {
              const all = (await services(store, true)).map((s) => s.id);
              if (
                !Array.isArray(data.ids) ||
                data.ids.length !== all.length ||
                new Set(data.ids).size !== all.length ||
                data.ids.some((i) => !all.includes(i))
              )
                fail("قائمة ترتيب الخدمات غير صالحة");
              for (const [i, sid] of data.ids.entries())
                await db
                  .prepare("UPDATE services SET position=? WHERE id=?")
                  .run(i, sid);
              return json({ ok: true });
            }
            if (p === "/api/admin/services" && method === "POST") {
              const name = text(data.name, 80),
                description = text(data.description, 200),
                price = money(data.price),
                duration = Number(data.duration);
              if (!Number.isInteger(duration) || duration < 5 || duration > 240)
                fail("مدة الخدمة بين ٥ و٢٤٠ دقيقة");
              const sid = data.id || id();
              if (
                data.id &&
                !(await db
                  .prepare("SELECT 1 FROM services WHERE id=?")
                  .get(sid))
              )
                fail("الخدمة غير موجودة", 404);
              const position = Number(data.position ?? 0);
              if (!Number.isInteger(position) || Math.abs(position) > 9999)
                fail("ترتيب الخدمة غير صالح");
              await db
                .prepare(
                  "INSERT INTO services VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price=excluded.price,duration=excluded.duration,position=excluded.position,active=excluded.active",
                )
                .run(
                  sid,
                  name,
                  description,
                  price,
                  duration,
                  position,
                  data.active === false || data.active === 0 ? 0 : 1,
                );
              return json({ ok: true });
            }
            if (p === "/api/admin/offers" && method === "POST") {
              const name = text(data.name, 80);
              if (!["fixed", "percent"].includes(data.type))
                fail("نوع الخصم غير صالح");
              const value = Number(data.value);
              if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > (data.type === "percent" ? 100 : 10000)
              )
                fail("قيمة العرض غير صالحة");
              await db
                .prepare(
                  "INSERT INTO offers VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,value=excluded.value,active=excluded.active",
                )
                .run(
                  data.id || id(),
                  name,
                  data.type,
                  value,
                  data.active === false || data.active === 0 ? 0 : 1,
                );
              return json({ ok: true });
            }
            if (p === "/api/admin/settings" && method === "POST") {
              if (
                !/^\d{2}:\d{2}$/.test(data.open) ||
                !/^\d{2}:\d{2}$/.test(data.close) ||
                data.open >= data.close ||
                [data.open, data.close].some(
                  (t) => Number(t.slice(0, 2)) > 23 || Number(t.slice(3)) > 59,
                )
              )
                fail("تحقق من ساعات العمل");
              let map;
              try {
                map = new URL(data.map_url);
                if (
                  map.protocol !== "https:" ||
                  ![
                    "maps.app.goo.gl",
                    "maps.google.com",
                    "www.google.com",
                  ].includes(map.hostname)
                )
                  throw Error();
              } catch {
                fail("أدخل رابط خرائط Google صالحًا");
              }
              const updated = {
                business_name: text(data.business_name, 80),
                open: data.open,
                close: data.close,
                map_url: map.toString(),
                business_phone: data.business_phone
                  ? phone(data.business_phone)
                  : "",
              };
              for (const [k, v] of Object.entries(updated)) await set(k, v);
              return json({ ok: true });
            }
            const booking = p.match(/^\/api\/admin\/bookings\/([a-f0-9]+)$/);
            if (booking && method === "PATCH") {
              if (
                !["confirmed", "completed", "cancelled"].includes(data.status)
              )
                fail("حالة غير صالحة");
              const b = await db
                .prepare("SELECT status FROM bookings WHERE id=?")
                .get(booking[1]);
              if (!b) fail("الحجز غير موجود", 404);
              if (b.status === "cancelled" && data.status !== "cancelled")
                fail("الحجز الملغى لا يمكن إعادة تفعيله؛ أنشئ حجزًا جديدًا");
              await db
                .prepare("UPDATE bookings SET status=? WHERE id=?")
                .run(data.status, booking[1]);
              return json({ ok: true });
            }
            if (p === "/api/admin/invoices" && method === "POST")
              return json(await invoiceFor(store, text(data.bookingId)));
            const invoice = p.match(/^\/api\/admin\/invoices\/([a-f0-9]+)$/);
            if (invoice && method === "PUT") {
              const inv = await db
                .prepare("SELECT * FROM invoices WHERE id=?")
                .get(invoice[1]);
              if (!inv) fail("الفاتورة غير موجودة", 404);
              if (inv.status === "issued")
                fail("الفاتورة المصدرة محفوظة؛ لا يمكن تعديلها", 409);
              // Retain booked prices; newly added services use the current catalog price.
              const booked = JSON.parse(
                (
                  await db
                    .prepare("SELECT lines FROM bookings WHERE id=?")
                    .get(inv.booking_id)
                ).lines,
              );
              if (
                !Array.isArray(data.serviceIds) ||
                !data.serviceIds.length ||
                data.serviceIds.length > 12 ||
                new Set(data.serviceIds).size !== data.serviceIds.length
              )
                fail("اختر الخدمات دون تكرار");
              const existingLines = JSON.parse(inv.lines);
              const lines = await Promise.all(
                data.serviceIds.map(
                  async (sid) =>
                    booked.find((s) => s.id === sid) ??
                    existingLines.find((s) => s.id === sid) ??
                    (await linesFor(store, [sid]))[0],
                ),
              );
              const subtotal = lines.reduce((s, l) => s + l.price, 0);
              let type = data.discountType,
                value = Number(data.discountValue),
                offerName = "";
              if (data.offerId) {
                const offer = await db
                  .prepare("SELECT * FROM offers WHERE id=? AND active=1")
                  .get(data.offerId);
                if (!offer) fail("العرض غير متاح");
                type = offer.type;
                value = offer.value;
                offerName = offer.name;
              }
              if (
                !["fixed", "percent"].includes(type) ||
                !Number.isFinite(value) ||
                value < 0 ||
                value > (type === "percent" ? 100 : subtotal / 100)
              )
                fail("قيمة الخصم غير صالحة");
              const discount = Math.min(
                subtotal,
                type === "percent"
                  ? Math.round((subtotal * value) / 100)
                  : Math.round(value * 100),
              );
              await db
                .prepare(
                  "UPDATE invoices SET lines=?,discount_type=?,discount_value=?,offer_name=?,subtotal=?,discount=?,total=? WHERE id=?",
                )
                .run(
                  JSON.stringify(lines),
                  type,
                  value,
                  offerName,
                  subtotal,
                  discount,
                  subtotal - discount,
                  inv.id,
                );
              return json(
                decode(
                  await db
                    .prepare("SELECT * FROM invoices WHERE id=?")
                    .get(inv.id),
                ),
              );
            }
            const issue = p.match(
              /^\/api\/admin\/invoices\/([a-f0-9]+)\/issue$/,
            );
            if (issue && method === "POST") {
              const inv = await db
                .prepare("SELECT * FROM invoices WHERE id=?")
                .get(issue[1]);
              if (!inv) fail("الفاتورة غير موجودة", 404);
              await db
                .prepare(
                  "UPDATE invoices SET status='issued',issued_at=COALESCE(issued_at,?) WHERE id=?",
                )
                .run(new Date().toISOString(), inv.id);
              await db
                .prepare(
                  "UPDATE bookings SET status='completed' WHERE id=? AND status!='cancelled'",
                )
                .run(inv.booking_id);
              if (
                whatsappConfigured() &&
                (
                  await db
                    .prepare("SELECT consent FROM bookings WHERE id=?")
                    .get(inv.booking_id)
                )?.consent
              )
                await db
                  .prepare(
                    "INSERT INTO messages(id,invoice_id,status) VALUES (?,?,'pending') ON CONFLICT(invoice_id) DO NOTHING",
                  )
                  .run(id(), inv.id);
              return json({
                ok: true,
                queued: !!(await db
                  .prepare("SELECT 1 FROM messages WHERE invoice_id=?")
                  .get(inv.id)),
                invoice: decode(
                  await db
                    .prepare("SELECT * FROM invoices WHERE id=?")
                    .get(inv.id),
                ),
              });
            }
            const retry = p.match(
              /^\/api\/admin\/invoices\/([a-f0-9]+)\/retry$/,
            );
            if (retry && method === "POST") {
              if (!whatsappConfigured()) fail("ربط واتساب غير مكتمل");
              const msg = await db
                .prepare("SELECT * FROM messages WHERE invoice_id=?")
                .get(retry[1]);
              if (!msg || msg.status !== "failed")
                fail("لا توجد رسالة فاشلة لإعادة المحاولة");
              await db
                .prepare(
                  "UPDATE messages SET status='pending',attempts=0,next_try=0,error=NULL WHERE id=?",
                )
                .run(msg.id);
              return json({ ok: true });
            }
          }
          fail("الطلب غير موجود", 404);
        },
        { write: !["GET", "HEAD"].includes(method) },
      );
      return send(result.data, result.status);
    } catch (e) {
      if (!e.status)
        console.error("API failure:", e.code ?? "database operation failed");
      return send(
        { error: e.status ? e.message : "حدث خطأ في الخادم، حاول مجددًا" },
        e.status ?? 500,
      );
    }
  };
}
// Templates must be approved as utility templates in WhatsApp Manager before enabling.
export async function deliverMessages(store, fetcher = fetch) {
  if (!whatsappConfigured()) return;
  const { db } = store;
  const messages = await db
    .prepare(
      "SELECT m.*,i.name,i.phone,i.number,i.total,i.token FROM messages m JOIN invoices i ON i.id=m.invoice_id WHERE m.status='pending' AND m.next_try<=? LIMIT 10",
    )
    .all(Date.now());
  for (const m of messages) {
    if (
      (
        await db
          .prepare(
            "UPDATE messages SET status='sending',attempts=attempts+1 WHERE id=? AND status='pending'",
          )
          .run(m.id)
      ).changes !== 1
    )
      continue;
    try {
      const response = await fetcher(
        `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: m.phone,
            type: "template",
            template: {
              name: process.env.WHATSAPP_TEMPLATE_NAME,
              language: {
                code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "ar",
              },
              components: [
                {
                  type: "body",
                  parameters: [
                    m.name,
                    String(m.number),
                    (m.total / 100).toFixed(2),
                    `${process.env.PUBLIC_URL.replace(/\/$/, "")}/invoice/${m.token}`,
                  ].map((text) => ({ type: "text", text })),
                },
              ],
            },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.messages?.[0]?.id)
        throw new Error(
          `رفض مزود واتساب الطلب (${response.status}، رمز ${result.error?.code ?? "unknown"})`,
        );
      await db
        .prepare(
          "UPDATE messages SET status='accepted',provider_id=?,error=NULL WHERE id=?",
        )
        .run(result.messages[0].id, m.id);
    } catch (e) {
      const terminal = true;
      await db
        .prepare("UPDATE messages SET status=?,next_try=?,error=? WHERE id=?")
        .run(
          terminal ? "failed" : "pending",
          Date.now() + 60000 * (m.attempts + 1),
          e.name === "TimeoutError"
            ? "انتهت مهلة الاتصال؛ تحقق من سجل المزود قبل إعادة الإرسال"
            : e.message.startsWith("رفض مزود")
              ? e.message
              : "تعذر الاتصال بمزود واتساب",
          m.id,
        );
    }
  }
}
