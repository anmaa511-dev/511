import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Scissors,
  Receipt,
  Tag,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  ArrowUpLeft,
  Search,
  Check,
  MessageCircle,
  Printer,
  RefreshCw,
  ChevronLeft,
  Menu,
  X,
  Save,
  Clock,
  User,
  Wallet,
  ArrowDown,
  ArrowUp,
  AlertCircle,
} from "lucide-react";
import {
  api,
  money,
  dateLabel,
  timeLabel,
  today,
  shareInvoice,
  type Service,
  type Settings,
  type Booking,
  type Invoice,
  type Offer,
} from "./lib";
import { Brand, Modal } from "./components";

type Dashboard = {
  bookings: Booking[];
  invoices: Invoice[];
  services: Service[];
  offers: Offer[];
  settings: Settings;
  whatsappConfigured: boolean;
};
const tabs = [
  ["overview", "نظرة عامة", LayoutDashboard],
  ["bookings", "المواعيد", CalendarDays],
  ["services", "الخدمات والأسعار", Scissors],
  ["invoices", "الفواتير", Receipt],
  ["offers", "العروض والخصومات", Tag],
  ["settings", "إعدادات المحل", SettingsIcon],
] as const;
const statusNames: Record<string, string> = {
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغى",
  draft: "مسودة",
  issued: "مصدرة",
};
const msgNames: Record<string, string> = {
  pending: "بانتظار الإرسال",
  sending: "جارٍ الإرسال",
  accepted: "قبلها مزود واتساب",
  failed: "تعذر الإرسال",
};
function Login({ onLogin }: { onLogin: () => void }) {
  const [setup, setSetup] = useState(false),
    [password, setPassword] = useState(""),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/auth/status")
      .then((r) => setSetup(r.setupRequired))
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (setup) await api("/auth/setup", "POST", { key, password });
      await api("/auth/login", "POST", { password });
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <Brand light />
        <span>مساحتك لإدارة التفاصيل.</span>
      </div>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">أهلًا بصاحب المكان</span>
        <h1>{setup ? "إعداد حساب الإدارة" : "حيّاك في لوحة الإدارة"}</h1>
        <p className="muted">
          {setup
            ? "أنشئ كلمة مرورك لتبدأ إدارة المواعيد والخدمات."
            : "كل المواعيد، الخدمات والفواتير في مكان واحد."}
        </p>
        {setup && (
          <>
            <div className="info-box">
              رمز التهيئة محفوظ على الخادم في{" "}
              <code dir="ltr">data/setup-key.txt</code>. يحمي إنشاء حساب المالك
              لأول مرة.
            </div>
            <label className="field">
              رمز التهيئة
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
          </>
        )}
        <label className="field">
          {setup ? "كلمة المرور الجديدة" : "كلمة المرور"}
          <input
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={setup ? 10 : undefined}
            maxLength={200}
            required
            placeholder={setup ? "١٠ أحرف على الأقل" : "أدخل كلمة المرور"}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="btn primary full" disabled={busy}>
          {busy
            ? "لحظة…"
            : setup
              ? "إنشاء الحساب والدخول"
              : "دخول لوحة الإدارة"}
          <ArrowUpLeft size={18} />
        </button>
        <a href="/" className="back-home">
          العودة لموقع شنب
          <ChevronLeft size={15} />
        </a>
      </form>
    </div>
  );
}
function InvoiceEditor({
  initial,
  dashboard,
  onClose,
  onChange,
  notify,
}: {
  initial: Invoice;
  dashboard: Dashboard;
  onClose: () => void;
  onChange: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [inv, setInv] = useState(initial),
    [ids, setIds] = useState(initial.lines.map((l) => l.id)),
    [type, setType] = useState(initial.discount_type),
    [value, setValue] = useState(String(initial.discount_value)),
    [offer, setOffer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const catalog = [
    ...dashboard.services.filter(
      (s) => s.active || initial.lines.some((l) => l.id === s.id),
    ),
    ...initial.lines
      .filter((l) => !dashboard.services.some((s) => s.id === l.id))
      .map((l) => ({ ...l, description: "", active: 0, position: 0 })),
  ];
  const selectedOffer = dashboard.offers.find((o) => o.id === offer),
    subtotal = catalog
      .filter((s) => ids.includes(s.id))
      .reduce(
        (a, s) =>
          a + (initial.lines.find((l) => l.id === s.id)?.price ?? s.price),
        0,
      ),
    discountType = selectedOffer?.type ?? type,
    discountValue = selectedOffer?.value ?? Number(value),
    discount = Math.min(
      subtotal,
      discountType === "percent"
        ? Math.round((subtotal * discountValue) / 100)
        : Math.round(discountValue * 100),
    );
  async function save(issue = false) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<Invoice>("/admin/invoices/" + inv.id, "PUT", {
        serviceIds: ids,
        discountType: type,
        discountValue: Number(value),
        offerId: offer,
      });
      setInv(updated);
      if (issue) {
        const r = await api("/admin/invoices/" + inv.id + "/issue", "POST", {});
        setInv(r.invoice);
        notify(
          r.queued
            ? "تم إصدار الفاتورة وإضافتها لطابور واتساب"
            : "تم إصدار الفاتورة، جاهزة للطباعة والمشاركة",
        );
      } else notify("تم حفظ مسودة الفاتورة");
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title={"فاتورة #" + inv.number} onClose={onClose}>
      <div className="invoice-editor">
        <div className="invoice-customer">
          <div className="customer-avatar">
            <User size={22} />
          </div>
          <div>
            <b>{inv.name}</b>
            <small dir="ltr">+{inv.phone}</small>
          </div>
          <span className={"status " + inv.status}>
            {statusNames[inv.status]}
          </span>
        </div>
        {inv.status === "draft" ? (
          <>
            <h3 className="minor-title">خدمات العميل</h3>
            <div className="invoice-services">
              {catalog.map((s) => (
                <label
                  className={ids.includes(s.id) ? "checked" : ""}
                  key={s.id}
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(s.id)}
                    onChange={() =>
                      setIds(
                        ids.includes(s.id)
                          ? ids.filter((i) => i !== s.id)
                          : [...ids, s.id],
                      )
                    }
                  />
                  <span>
                    {s.name}
                    {!s.active && <small> (خدمة مؤرشفة)</small>}
                  </span>
                  <b>
                    {money(
                      initial.lines.find((l) => l.id === s.id)?.price ??
                        s.price,
                    )}{" "}
                    ر.س
                  </b>
                </label>
              ))}
            </div>
            <div className="discount-panel">
              <h3>
                <Tag size={17} />
                الخصومات والعروض
              </h3>
              <label className="field">
                عرض محفوظ
                <select
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                >
                  <option value="">خصم يدوي / بدون عرض</option>
                  {dashboard.offers
                    .filter((o) => o.active)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {o.value}
                        {o.type === "percent" ? "٪" : " ر.س"}
                      </option>
                    ))}
                </select>
              </label>
              {!offer && (
                <div className="field-row">
                  <label className="field">
                    نوع الخصم
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="fixed">مبلغ ثابت (ر.س)</option>
                      <option value="percent">نسبة مئوية (٪)</option>
                    </select>
                  </label>
                  <label className="field">
                    قيمة الخصم
                    <input
                      type="number"
                      min="0"
                      max={type === "percent" ? 100 : subtotal / 100}
                      step="0.01"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="invoice-summary">
              <div>
                <span>المجموع الفرعي</span>
                <b>{money(subtotal)} ر.س</b>
              </div>
              <div className="discount">
                <span>
                  الخصم {selectedOffer ? "· " + selectedOffer.name : ""}
                </span>
                <b>−{money(discount || 0)} ر.س</b>
              </div>
              <div className="total">
                <strong>الإجمالي</strong>
                <strong>
                  {money(Math.max(0, subtotal - (discount || 0)))}{" "}
                  <small>ر.س</small>
                </strong>
              </div>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="info-box">
              تُحفظ الفاتورة نهائيًا عند إصدارها.{" "}
              {dashboard.whatsappConfigured
                ? "ستُرسل تلقائيًا عبر واتساب."
                : "يمكنك مشاركتها يدويًا عبر واتساب بعد الإصدار."}
            </div>
            <div className="form-actions">
              <button
                className="btn secondary"
                disabled={busy || !ids.length}
                onClick={() => save()}
              >
                حفظ مسودة
              </button>
              <button
                className="btn primary grow"
                disabled={busy || !ids.length}
                onClick={() => save(true)}
              >
                {busy ? "جارٍ الحفظ…" : "إصدار الفاتورة"}
                <Check size={17} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="receipt-lines">
              {inv.lines.map((l) => (
                <div key={l.id}>
                  <span>{l.name}</span>
                  <b>{money(l.price)} ر.س</b>
                </div>
              ))}
              <div className="discount">
                <span>{inv.offer_name || "الخصم"}</span>
                <b>−{money(inv.discount)} ر.س</b>
              </div>
            </div>
            <div className="receipt-total">
              <b>الإجمالي</b>
              <strong>{money(inv.total)} ر.س</strong>
            </div>
            <div className="info-box">
              تم حفظ الفاتورة نهائيًا. المشاركة اليدوية تفتح واتساب، وتؤكد
              الإرسال بنفسك.
            </div>
            <div className="form-actions">
              <a
                className="btn secondary"
                href={"/invoice/" + inv.token}
                target="_blank"
                rel="noreferrer"
              >
                <Printer size={17} />
                عرض وطباعة
              </a>
              <button
                className="btn whatsapp grow"
                onClick={() => shareInvoice(inv)}
              >
                <MessageCircle size={18} />
                مشاركة واتساب
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function ServiceForm({
  service,
  count,
  onSave,
  onClose,
}: {
  service: Service | null;
  count: number;
  onSave: (d: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(service?.name ?? ""),
    [description, setDescription] = useState(service?.description ?? ""),
    [price, setPrice] = useState(String((service?.price ?? 0) / 100)),
    [duration, setDuration] = useState(String(service?.duration ?? 30)),
    [active, setActive] = useState(service?.active !== 0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={service ? "تعديل الخدمة" : "خدمة جديدة"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave({
              id: service?.id,
              name,
              description,
              price: Number(price),
              duration: Number(duration),
              position: service?.position ?? count,
              active,
            });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          اسم الخدمة
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلًا: حلاقة شعر"
          />
        </label>
        <label className="field">
          وصف قصير
          <input
            required
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف يظهر للعميل في قائمة الخدمات"
          />
        </label>
        <div className="field-row">
          <label className="field">
            السعر (ر.س)
            <input
              type="number"
              min="0"
              max="100000"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="field">
            المدة (دقيقة)
            <input
              type="number"
              min="5"
              max="240"
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          إظهار الخدمة للعملاء وإتاحتها للحجز
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy} className="btn primary full">
          {busy ? "جارٍ الحفظ…" : "حفظ الخدمة"}
          <Save size={17} />
        </button>
      </form>
    </Modal>
  );
}
function OfferForm({
  offer,
  onSave,
  onClose,
}: {
  offer: Offer | null;
  onSave: (d: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(offer?.name ?? ""),
    [type, setType] = useState(offer?.type ?? "percent"),
    [value, setValue] = useState(String(offer?.value ?? 10)),
    [active, setActive] = useState(offer?.active !== 0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={offer ? "تعديل العرض" : "عرض جديد"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave({
              id: offer?.id,
              name,
              type,
              value: Number(value),
              active,
            });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          اسم العرض
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلًا: خصم العملاء الدائمين"
          />
        </label>
        <div className="field-row">
          <label className="field">
            نوع العرض
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percent">نسبة مئوية</option>
              <option value="fixed">مبلغ ثابت</option>
            </select>
          </label>
          <label className="field">
            القيمة
            <input
              required
              type="number"
              min="0"
              max={type === "percent" ? 100 : 10000}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          عرض نشط ومتاح للاستخدام في الفواتير
        </label>
        <p className="info-box">
          تختار العرض المناسب عند تعديل فاتورة العميل. لا يتم تطبيقه تلقائيًا
          على الحجوزات.
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary full" disabled={busy}>
          حفظ العرض
          <Check size={18} />
        </button>
      </form>
    </Modal>
  );
}
function SettingsForm({
  settings,
  connected,
  onSave,
}: {
  settings: Settings;
  connected: boolean;
  onSave: (d: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState(settings),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function field(k: keyof Settings, v: string) {
    setForm({ ...form, [k]: v });
  }
  return (
    <div className="settings-grid">
      <form
        className="panel settings-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(form);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>معلومات المحل</h3>
        <label className="field">
          اسم المحل
          <input
            required
            value={form.business_name}
            onChange={(e) => field("business_name", e.target.value)}
          />
        </label>
        <label className="field">
          رقم واتساب المحل (اختياري)
          <input
            dir="ltr"
            type="tel"
            placeholder="05xxxxxxxx"
            value={form.business_phone}
            onChange={(e) => field("business_phone", e.target.value)}
          />
        </label>
        <div className="field-row">
          <label className="field">
            بداية العمل
            <input
              required
              type="time"
              value={form.open}
              onChange={(e) => field("open", e.target.value)}
            />
          </label>
          <label className="field">
            نهاية العمل
            <input
              required
              type="time"
              value={form.close}
              onChange={(e) => field("close", e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          رابط خرائط Google
          <input
            dir="ltr"
            type="url"
            required
            value={form.map_url}
            onChange={(e) => field("map_url", e.target.value)}
          />
        </label>
        <p className="muted">
          الحجز لكرسي واحد، بتوقيت السعودية. المواعيد القائمة تبقى محفوظة عند
          تعديل الساعات.
        </p>
        {error && <p className="error">{error}</p>}
        <button disabled={busy} className="btn primary">
          حفظ الإعدادات
          <Save size={17} />
        </button>
      </form>
      <div className="panel connection-panel">
        <div className="connection-icon">
          <MessageCircle size={28} />
        </div>
        <h3>فواتيرك على واتساب</h3>
        <span className={"status " + (connected ? "confirmed" : "draft")}>
          {connected ? "الربط مهيأ" : "غير مرتبط حاليًا"}
        </span>
        <p>
          {connected
            ? "تُضاف الفاتورة إلى طابور الإرسال عند إصدارها. قبول المزود للرسالة لا يؤكد وصولها."
            : "المشاركة اليدوية متاحة. للإرسال التلقائي، يلزم حساب WhatsApp Business Platform وقالب فاتورة معتمد وربط بياناته بالخادم."}
        </p>
        <div className="connection-check">
          <Check size={16} />
          الفواتير محفوظة ويمكن طباعتها دائمًا
        </div>
        <div className="connection-check">
          <Check size={16} />
          رقم المحل وحده لا يفعّل الإرسال التلقائي
        </div>
      </div>
    </div>
  );
}
export default function Admin() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [logged, setLogged] = useState<boolean | null>(null),
    [tab, setTab] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [date, setDate] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [service, setService] = useState<Service | null | undefined>(undefined),
    [offer, setOffer] = useState<Offer | null | undefined>(undefined),
    [invoice, setInvoice] = useState<Invoice | null>(null),
    [sidebar, setSidebar] = useState(false),
    [actionBusy, setActionBusy] = useState(false),
    [cancel, setCancel] = useState<Booking | null>(null);
  async function load() {
    const r = await api<Dashboard>("/admin/dashboard");
    setDashboard(r);
    setLogged(true);
  }
  useEffect(() => {
    load().catch((e) => {
      setLogged(false);
      if (e.message !== "سجّل دخولك للمتابعة") setError(e.message);
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  async function mutate(path: string, data: unknown, method = "POST") {
    await api(path, method, data);
    await load();
    setToast("تم حفظ التغييرات");
  }
  async function openInvoice(b: Booking) {
    if (actionBusy) return;
    setActionBusy(true);
    setError("");
    try {
      setInvoice(await api("/admin/invoices", "POST", { bookingId: b.id }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }
  async function moveService(s: Service, dir: number) {
    if (!dashboard) return;
    const index = dashboard.services.findIndex((x) => x.id === s.id),
      other = dashboard.services[index + dir];
    if (!other) return;
    setActionBusy(true);
    try {
      const ids = dashboard.services.map((x) => x.id);
      [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
      await api("/admin/services/reorder", "POST", { ids });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }
  if (logged === null)
    return (
      <div className="page-loading">
        <img src="/logo.svg" alt="شنب" />
        <p>نرتّب لك التفاصيل…</p>
      </div>
    );
  if (!logged)
    return <Login onLogin={() => load().catch((e) => setError(e.message))} />;
  if (!dashboard) return null;
  const daily = dashboard.bookings.filter((b) => b.date === today()),
    issued = dashboard.invoices.filter((i) => i.status === "issued"),
    revenue = issued
      .filter(
        (i) =>
          new Date(Date.parse(i.issued_at || i.created) + 3 * 3600000)
            .toISOString()
            .slice(0, 10) === today(),
      )
      .reduce((a, i) => a + i.total, 0),
    current = tabs.find((t) => t[0] === tab)!;
  const bookings = dashboard.bookings.filter(
    (b) =>
      (!search || [b.name, b.phone, b.id].some((v) => v.includes(search))) &&
      (filter === "all" || b.status === filter) &&
      (!date || b.date === date),
  );
  const list = dashboard.invoices.filter(
    (i) =>
      !search ||
      [i.name, i.phone, String(i.number)].some((v) => v.includes(search)),
  );
  function bookingTable(items: Booking[]) {
    return !items.length ? (
      <div className="empty">
        <CalendarDays size={29} />
        <h3>ما فيه مواعيد هنا إلى الآن</h3>
        <p>بتظهر حجوزات عملائك بمجرد تأكيدها من الموقع.</p>
      </div>
    ) : (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>العميل</th>
              <th>الخدمات</th>
              <th>الموعد</th>
              <th>الحالة</th>
              <th>الإجمالي</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="table-customer">
                    <span>{b.name.slice(0, 1)}</span>
                    <div>
                      <b>{b.name}</b>
                      <small dir="ltr">+{b.phone}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="table-services">
                    {b.lines.map((s) => s.name).join(" + ")}
                  </span>
                </td>
                <td>
                  <b>{timeLabel(b.time)}</b>
                  <small>{dateLabel(b.date)}</small>
                </td>
                <td>
                  <span className={"status " + b.status}>
                    {statusNames[b.status]}
                  </span>
                </td>
                <td className="nowrap">
                  {money(b.lines.reduce((a, l) => a + l.price, 0))} ر.س
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      disabled={actionBusy || b.status === "cancelled"}
                      className="table-action"
                      onClick={() => openInvoice(b)}
                    >
                      الفاتورة
                      <ChevronLeft size={14} />
                    </button>
                    {b.status === "confirmed" && (
                      <button
                        className="cancel-action"
                        onClick={() => setCancel(b)}
                      >
                        إلغاء
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="admin-shell">
      <aside className={"admin-sidebar " + (sidebar ? "open" : "")}>
        <div className="sidebar-brand">
          <Brand light />
          <span>لوحة الإدارة</span>
        </div>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setSearch("");
                setFilter("all");
                setSidebar(false);
                setError("");
              }}
            >
              <Icon size={19} />
              {label}
              {id === "bookings" &&
                daily.filter((b) => b.status === "confirmed").length > 0 && (
                  <span className="nav-count">
                    {daily.filter((b) => b.status === "confirmed").length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            <ArrowUpLeft size={17} />
            عرض الموقع
          </a>
          <button
            onClick={async () => {
              try {
                await api("/auth/logout", "POST", {});
                setLogged(false);
                setDashboard(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
            تسجيل الخروج
          </button>
          <span>SHANAB · THE ART OF GROOMING</span>
        </div>
      </aside>
      {sidebar && (
        <div className="sidebar-shade" onClick={() => setSidebar(false)} />
      )}
      <div className="admin-content">
        <header className="admin-header">
          <div>
            <button
              className="icon-btn mobile-menu"
              onClick={() => setSidebar(!sidebar)}
              aria-label="قائمة الإدارة"
            >
              <Menu />
            </button>
            <span>
              مساحة الإدارة
              <ChevronLeft size={14} />
              <b>{current[1]}</b>
            </span>
          </div>
          <div>
            <span className="admin-online">
              <i />
              المحل
            </span>
            <span className="owner-avatar">ش</span>
          </div>
        </header>
        <main className="admin-main">
          <div className="admin-page-heading">
            <div>
              <span className="eyebrow">{dateLabel(today())}</span>
              <h1>
                {tab === "overview" ? "يوم جديد، إطلالات جديدة" : current[1]}
                <span>.</span>
              </h1>
              <p>
                {tab === "overview"
                  ? "أهلًا بك، هذه تفاصيل شنب اليوم."
                  : tab === "services"
                    ? "خدماتك وأسعارك، بالطريقة التي تناسبك."
                    : tab === "bookings"
                      ? "كل المواعيد مرتبة، وكل عميل له وقته."
                      : tab === "invoices"
                        ? "كل زيارة بتفاصيلها، وكل فاتورة محفوظة."
                        : tab === "offers"
                          ? "لمسة تقدير لعملائك، تختارها لكل فاتورة."
                          : "التفاصيل الأساسية لمكانك."}
              </p>
            </div>
            {tab === "services" ? (
              <button className="btn primary" onClick={() => setService(null)}>
                <Plus size={18} />
                إضافة خدمة
              </button>
            ) : tab === "offers" ? (
              <button className="btn primary" onClick={() => setOffer(null)}>
                <Plus size={18} />
                إضافة عرض
              </button>
            ) : (
              <button
                className="btn secondary"
                onClick={() => load().catch((e) => setError(e.message))}
              >
                <RefreshCw size={15} />
                تحديث
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {tab === "overview" && (
            <>
              <div className="stats-grid">
                {[
                  [
                    "مواعيد اليوم",
                    String(
                      daily.filter((b) => b.status !== "cancelled").length,
                    ),
                    "زيارة مرتبة لهذا اليوم",
                    CalendarDays,
                  ],
                  [
                    "فواتير اليوم",
                    money(revenue) + " ر.س",
                    "إجمالي الفواتير المصدرة اليوم",
                    Wallet,
                  ],
                  [
                    "بانتظار الزيارة",
                    String(
                      daily.filter((b) => b.status === "confirmed").length,
                    ),
                    "ننتظرهم بإطلالة جديدة",
                    Clock,
                  ],
                  [
                    "الخدمات المتاحة",
                    String(dashboard.services.filter((s) => s.active).length),
                    "خدمة على قائمة العناية",
                    Scissors,
                  ],
                ].map(([label, value, caption, Icon]: any) => (
                  <div className="stat-card" key={label}>
                    <div>
                      <span>{label}</span>
                      <Icon size={19} />
                    </div>
                    <strong>{value}</strong>
                    <small>{caption}</small>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      مواعيد اليوم
                      <span className="count-pill">{daily.length}</span>
                    </h2>
                    <p>جلسات اليوم، من أول قَصّة إلى آخر لمسة.</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => setTab("bookings")}
                  >
                    كل المواعيد
                    <ArrowUpLeft size={17} />
                  </button>
                </div>
                {bookingTable(
                  daily.sort((a, b) => a.time.localeCompare(b.time)),
                )}
              </div>
              <div className="admin-bottom-grid">
                <div className="quick-card">
                  <span className="eyebrow">قائمتك، على ذوقك</span>
                  <h3>
                    تعديل بسيط.
                    <br />
                    تجربة أجمل.
                  </h3>
                  <p>رتّب الخدمات وحدّث أسعارك في أي وقت.</p>
                  <button
                    className="text-link"
                    onClick={() => setTab("services")}
                  >
                    إدارة الخدمات
                    <ArrowUpLeft size={18} />
                  </button>
                  <Scissors
                    className="quick-decoration"
                    size={105}
                    strokeWidth={0.7}
                  />
                </div>
                <div className="panel whatsapp-overview">
                  <div className="connection-icon">
                    <MessageCircle size={26} />
                  </div>
                  <h3>الفاتورة؟ توصل بكل سهولة.</h3>
                  <p>
                    {dashboard.whatsappConfigured
                      ? "ربط واتساب مهيأ. راقب حالة الطلب من صفحة الفواتير."
                      : "شارك فاتورة عميلك يدويًا، وفعّل الإرسال التلقائي عند ربط واتساب للأعمال."}
                  </p>
                  <button
                    className="text-link"
                    onClick={() => setTab("settings")}
                  >
                    إعدادات الربط
                    <ArrowUpLeft size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
          {tab === "bookings" && (
            <div className="panel">
              <div className="table-toolbar">
                <label className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="بحث في المواعيد"
                    placeholder="ابحث باسم العميل أو الجوال…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <input
                  aria-label="تصفية بالتاريخ"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <select
                  aria-label="حالة الحجز"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">كل الحالات</option>
                  <option value="confirmed">مؤكد</option>
                  <option value="completed">مكتمل</option>
                  <option value="cancelled">ملغى</option>
                </select>
                {date && (
                  <button
                    className="icon-btn"
                    aria-label="مسح التاريخ"
                    onClick={() => setDate("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {bookingTable(bookings)}
            </div>
          )}
          {tab === "services" && (
            <>
              <div className="info-box">
                <Scissors size={18} />
                الأسعار والحجوزات الجديدة تتحدث مباشرة. الفواتير والخدمات
                المحجوزة سابقًا تحتفظ بأسعارها.
              </div>
              <div className="admin-services">
                {dashboard.services.map((s, i) => (
                  <div
                    className={
                      "admin-service-card panel " +
                      (!s.active ? "inactive" : "")
                    }
                    key={s.id}
                  >
                    <div className="admin-service-top">
                      <div className="service-icon">
                        <Scissors size={24} />
                      </div>
                      <span
                        className={
                          "status " + (s.active ? "confirmed" : "draft")
                        }
                      >
                        {s.active ? "ظاهرة للعملاء" : "مخفية"}
                      </span>
                    </div>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <div className="service-info">
                      <strong>
                        {money(s.price)} <small>ر.س</small>
                      </strong>
                      <span>
                        <Clock size={14} />
                        {s.duration} دقيقة
                      </span>
                    </div>
                    <div className="service-card-actions">
                      <button onClick={() => setService(s)}>
                        تعديل الخدمة
                        <ChevronLeft size={15} />
                      </button>
                      <div>
                        <button
                          disabled={i === 0 || actionBusy}
                          aria-label={"تقديم " + s.name}
                          onClick={() => moveService(s, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          disabled={
                            i === dashboard.services.length - 1 || actionBusy
                          }
                          aria-label={"تأخير " + s.name}
                          onClick={() => moveService(s, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "invoices" && (
            <div className="panel">
              <div className="table-toolbar">
                <label className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="بحث في الفواتير"
                    placeholder="اسم العميل، الجوال أو رقم الفاتورة…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <span className="muted">{list.length} فاتورة</span>
              </div>
              {!list.length ? (
                <div className="empty">
                  <Receipt size={30} />
                  <h3>فاتورتك الأولى تبدأ من الموعد</h3>
                  <p>افتح حجز العميل واختر «الفاتورة» لإضافة الخدمات والخصم.</p>
                  <button
                    className="btn secondary"
                    onClick={() => setTab("bookings")}
                  >
                    انتقل للمواعيد
                    <ArrowUpLeft size={16} />
                  </button>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>الفاتورة</th>
                        <th>العميل</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                        <th>واتساب</th>
                        <th>الإجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <b>#{i.number}</b>
                            <small>
                              {new Date(i.created).toLocaleDateString("ar-SA", {
                                calendar: "gregory",
                                timeZone: "Asia/Riyadh",
                              })}
                            </small>
                          </td>
                          <td>
                            <b>{i.name}</b>
                            <small dir="ltr">+{i.phone}</small>
                          </td>
                          <td className="nowrap">{money(i.total)} ر.س</td>
                          <td>
                            <span className={"status " + i.status}>
                              {statusNames[i.status]}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                "message-state " +
                                (i.message_status === "failed"
                                  ? "text-error"
                                  : "")
                              }
                              title={i.message_error}
                            >
                              {i.message_status
                                ? msgNames[i.message_status]
                                : i.status === "issued"
                                  ? "مشاركة يدوية"
                                  : "—"}
                            </span>
                            {i.message_status === "failed" && (
                              <button
                                className="table-action"
                                onClick={() =>
                                  mutate(
                                    "/admin/invoices/" + i.id + "/retry",
                                    {},
                                  ).catch((e) => setError(e.message))
                                }
                              >
                                إعادة المحاولة
                              </button>
                            )}
                          </td>
                          <td>
                            <button
                              className="table-action"
                              onClick={() => setInvoice(i)}
                            >
                              {i.status === "draft" ? "تعديل" : "عرض الفاتورة"}
                              <ChevronLeft size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === "offers" && (
            <div className="offers-grid">
              {dashboard.offers.map((o) => (
                <div key={o.id} className="offer-card panel">
                  <div>
                    <Tag size={23} />
                    <span
                      className={"status " + (o.active ? "confirmed" : "draft")}
                    >
                      {o.active ? "نشط" : "متوقف"}
                    </span>
                  </div>
                  <strong>
                    {o.value}
                    <small>{o.type === "percent" ? "٪" : " ر.س"}</small>
                  </strong>
                  <h3>{o.name}</h3>
                  <p>يُختار عند تجهيز فاتورة العميل</p>
                  <button className="text-link" onClick={() => setOffer(o)}>
                    تعديل العرض
                    <ArrowUpLeft size={17} />
                  </button>
                </div>
              ))}
              {!dashboard.offers.length && (
                <div className="panel empty">
                  <Tag size={30} />
                  <h3>عرض صغير، تقدير كبير</h3>
                  <p>أضف عروضك المحفوظة لتختارها عند إصدار الفواتير.</p>
                  <button
                    className="btn primary"
                    onClick={() => setOffer(null)}
                  >
                    <Plus size={17} />
                    أضف أول عرض
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === "settings" && (
            <SettingsForm
              settings={dashboard.settings}
              connected={dashboard.whatsappConfigured}
              onSave={(d) => mutate("/admin/settings", d)}
            />
          )}
          <div className="admin-foot">
            شنب للحلاقة الرجالية <span>كل التفاصيل تحت يدك ✦</span>
          </div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {service !== undefined && (
        <ServiceForm
          service={service}
          count={dashboard.services.length}
          onSave={(d) => mutate("/admin/services", d)}
          onClose={() => setService(undefined)}
        />
      )}{" "}
      {offer !== undefined && (
        <OfferForm
          offer={offer}
          onSave={(d) => mutate("/admin/offers", d)}
          onClose={() => setOffer(undefined)}
        />
      )}{" "}
      {invoice && (
        <InvoiceEditor
          initial={invoice}
          dashboard={dashboard}
          onClose={() => setInvoice(null)}
          onChange={load}
          notify={setToast}
        />
      )}{" "}
      {cancel && (
        <Modal title="إلغاء الموعد؟" onClose={() => setCancel(null)}>
          <p>
            سيُلغى موعد {cancel.name} في {dateLabel(cancel.date)} الساعة{" "}
            {timeLabel(cancel.time)}، ويُتاح الوقت للحجز من جديد.
          </p>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setCancel(null)}>
              احتفظ بالموعد
            </button>
            <button
              className="btn danger"
              disabled={actionBusy}
              onClick={async () => {
                setActionBusy(true);
                try {
                  await mutate(
                    "/admin/bookings/" + cancel.id,
                    { status: "cancelled" },
                    "PATCH",
                  );
                  setCancel(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setActionBusy(false);
                }
              }}
            >
              تأكيد الإلغاء
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
