import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpLeft,
  ArrowLeft,
  Scissors,
  CalendarDays,
  Clock,
  MapPin,
  Check,
  CheckCheck,
  Menu,
  X,
  ChevronLeft,
  Plus,
  Minus,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Phone,
  Printer,
} from "lucide-react";
import {
  api,
  money,
  dateLabel,
  timeLabel,
  today,
  type Service,
  type Settings,
  type Invoice,
} from "./lib";
import Admin from "./Admin";
import { Brand, Modal } from "./components";
import "@fontsource-variable/noto-sans-arabic";
import "@fontsource-variable/dm-sans";
import "./style.css";

const serviceIcons = [Scissors, User, Sparkles, ShieldCheck, Star, Sparkles];
function BookingForm({
  services,
  initial,
  onClose,
}: {
  services: Service[];
  initial: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initial),
    [step, setStep] = useState(0),
    [date, setDate] = useState(today()),
    [time, setTime] = useState(""),
    [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]),
    [loadingSlots, setLoadingSlots] = useState(false),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null);
  const chosen = services.filter((s) => selected.includes(s.id)),
    total = chosen.reduce((a, s) => a + s.price, 0),
    duration = chosen.reduce((a, s) => a + s.duration, 0);
  useEffect(() => {
    if (step !== 1 || !selected.length) return;
    let alive = true;
    setTime("");
    setSlots([]);
    setError("");
    setLoadingSlots(true);
    api("/slots?date=" + date + "&services=" + selected.join(","))
      .then((r) => {
        if (alive) setSlots(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoadingSlots(false);
      });
    return () => {
      alive = false;
    };
  }, [step, date, selected.join(",")]);
  const toggle = (id: string) =>
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/bookings", "POST", {
        name,
        phone,
        date,
        time,
        serviceIds: selected,
        consent,
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={result ? "حجزك صار مؤكّد!" : "موعدك للأناقة"}
      onClose={onClose}
    >
      {result ? (
        <div className="booking-success">
          <div className="success-icon">
            <CheckCheck size={35} />
          </div>
          <h3>ننتظرك يا {result.name.split(" ")[0]} ✨</h3>
          <p>تم حفظ حجزك بنجاح. احتفظ بتفاصيل الموعد.</p>
          <div className="confirmation">
            <div>
              <CalendarDays size={19} />
              {dateLabel(result.date)}
            </div>
            <div>
              <Clock size={19} />
              {timeLabel(result.time)} · {duration} دقيقة
            </div>
            <div>
              <Scissors size={19} />
              {chosen.map((s) => s.name).join("، ")}
            </div>
            <strong>{money(total)} ر.س</strong>
            <small>رقم الحجز: {result.id.slice(0, 8).toUpperCase()}</small>
          </div>
          <button className="btn primary full" onClick={onClose}>
            تم، نشوفكم على خير
            <Check size={18} />
          </button>
        </div>
      ) : (
        <>
          <p className="muted modal-intro">
            قَصّة جديدة، مزاج جديد. خلّ الباقي علينا.
          </p>
          <div className="booking-steps">
            {["الخدمات", "الموعد", "بياناتك"].map((s, i) => (
              <span key={s} className={step >= i ? "current" : ""}>
                <b>{step > i ? <Check size={13} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
          <form onSubmit={submit}>
            {step === 0 ? (
              <div className="booking-services">
                {services.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={
                      "book-service " +
                      (selected.includes(s.id) ? "selected" : "")
                    }
                    onClick={() => toggle(s.id)}
                  >
                    <span className="selection-box">
                      {selected.includes(s.id) && <Check size={14} />}
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.duration} دقيقة</small>
                    </span>
                    <b>
                      {money(s.price)} <small>ر.س</small>
                    </b>
                  </button>
                ))}
              </div>
            ) : step === 1 ? (
              <>
                <label className="field">
                  يوم الزيارة
                  <input
                    aria-label="تاريخ الموعد"
                    type="date"
                    min={today()}
                    max={new Date(Date.now() + 60 * 86400000)
                      .toISOString()
                      .slice(0, 10)}
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="field">
                  الأوقات المتاحة <small>بتوقيت السعودية</small>
                </label>
                {loadingSlots ? (
                  <p className="empty">نبحث عن موعدك المناسب…</p>
                ) : (
                  <div className="time-slots">
                    {slots.map((s) => (
                      <button
                        type="button"
                        key={s.time}
                        disabled={!s.available}
                        className={time === s.time ? "chosen" : ""}
                        onClick={() => setTime(s.time)}
                      >
                        {timeLabel(s.time)}
                      </button>
                    ))}
                  </div>
                )}
                {!loadingSlots && !slots.some((s) => s.available) && (
                  <p className="empty">
                    المواعيد مكتملة لهذا اليوم، جرّب يومًا آخر.
                  </p>
                )}
              </>
            ) : (
              <div className="customer-fields">
                <label className="field">
                  اسمك الكريم
                  <input
                    autoComplete="name"
                    placeholder="مثلًا: محمد عبدالله"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                  />
                </label>
                <label className="field">
                  رقم الجوال
                  <input
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="05xxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </label>
                <div className="booking-review">
                  <CalendarDays size={18} />
                  <span>
                    {dateLabel(date)} · {timeLabel(time)}
                  </span>
                  <button type="button" onClick={() => setStep(1)}>
                    تعديل
                  </button>
                </div>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    required
                  />
                  <span>
                    أوافق على حفظ بياناتي لإدارة الحجز واستلام فاتورة هذه
                    الزيارة عبر واتساب عند توفر الربط.
                  </span>
                </label>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="booking-total">
              <span>
                {chosen.length} خدمات · {duration} دقيقة
              </span>
              <b>
                {money(total)} <small>ر.س</small>
              </b>
            </div>
            <div className="form-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setError("");
                    setStep(step - 1);
                  }}
                >
                  رجوع
                </button>
              )}
              {step < 2 ? (
                <button
                  type="button"
                  className="btn primary grow"
                  disabled={
                    !selected.length || (step === 1 && (!time || loadingSlots))
                  }
                  onClick={() => {
                    setError("");
                    setStep(step + 1);
                  }}
                >
                  التالي
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <button
                  className="btn primary grow"
                  disabled={busy || !consent}
                >
                  {busy ? "جارٍ تأكيد الحجز…" : "تأكيد الحجز"}
                  <Check size={18} />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
function PublicSite() {
  const [data, setData] = useState<{
      services: Service[];
      settings: Settings;
    } | null>(null),
    [error, setError] = useState(""),
    [booking, setBooking] = useState<string[] | null>(null),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    api("/public")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const open = (ids: string[] = []) => {
    setBooking(ids);
    setMobile(false);
  };
  return (
    <>
      <div className="announcement">
        <span className="tiny-line" />
        أهلًا بك في شنب، للأناقة عنوان
        <span className="tiny-line" />
      </div>
      <header className="site-header">
        <div className="container nav">
          <Brand />
          <nav className={mobile ? "mobile-open" : ""}>
            <a href="#home" onClick={() => setMobile(false)}>
              الرئيسية
            </a>
            <a href="#services" onClick={() => setMobile(false)}>
              خدماتنا
            </a>
            <a href="#experience" onClick={() => setMobile(false)}>
              عن شنب
            </a>
            <a href="#location" onClick={() => setMobile(false)}>
              موقعنا
            </a>
          </nav>
          <div className="nav-actions">
            <button className="btn primary" onClick={() => open()}>
              احجز موعدك
              <ArrowUpLeft size={18} />
            </button>
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="القائمة"
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main>
        <section className="hero container" id="home">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              لأن إطلالتك تستاهل
            </div>
            <h1>
              أكثر من حلاقة.
              <br />
              هذي <em>بصمتك.</em>
            </h1>
            <p>
              قَصّة تضبط مزاجك، وتفاصيل تكمّل أناقتك.
              <br />
              في شنب، نعتني بكل تفصيلة لتطلع بأفضل نسخة منك.
            </p>
            <div className="hero-buttons">
              <button className="btn primary large" onClick={() => open()}>
                احجز جلستك
                <ArrowUpLeft size={21} />
              </button>
              <a href="#services" className="text-link">
                اكتشف خدماتنا
                <ArrowLeft size={18} />
              </a>
            </div>
            <div className="hero-proof">
              <div className="proof-icon">
                <Scissors size={21} />
              </div>
              <div>
                <strong>حِرفة في اليد. أناقة في التفاصيل.</strong>
                <small>عناية شخصية، ووقت مخصص لك.</small>
              </div>
            </div>
            <div className="hero-bottom">
              <span>SHANAB BARBERSHOP</span>
              <span>
                EST. FOR YOUR STYLE <span className="mini-star">✦</span>
              </span>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-photo" />
            <div className="photo-grain" />
            <span className="photo-label">THE ART OF GROOMING</span>
            <div className="photo-corner">
              <img src="/logo-brand.png" alt="رمز شنب" />
            </div>
            <div className="floating-card">
              <div className="floating-icon">
                <Scissors size={23} />
              </div>
              <div>
                <small>مساحتك الخاصة للأناقة</small>
                <b>تعال على راحتك، واطلع على ذوقك.</b>
              </div>
              <span>✦</span>
            </div>
          </div>
        </section>
        <div className="values-strip">
          <div className="container">
            {[
              ["عناية تليق فيك", ShieldCheck],
              ["تفاصيل تصنع الفرق", Scissors],
              ["وقتك له قيمة", Clock],
              ["إطلالة على ذوقك", Sparkles],
            ].map(([label, Icon]: any) => (
              <div key={label}>
                <Icon size={20} />
                <span>{label}</span>
                <span className="diamond">✦</span>
              </div>
            ))}
          </div>
        </div>
        <section className="services-section container section" id="services">
          <div className="section-heading">
            <div>
              <span className="eyebrow">قائمة العناية</span>
              <h2>
                اختَر خدمتك.
                <br className="mobile-only" /> وخلّ اللمسة علينا<span>.</span>
              </h2>
            </div>
            <p>
              من الترتيب السريع إلى العناية المتكاملة،
              <br />
              كل خدمة بتفاصيلها، وكل تفصيلة تهمّنا.
            </p>
          </div>
          {error ? (
            <div className="error">
              {error}
              <button onClick={() => location.reload()}>إعادة المحاولة</button>
            </div>
          ) : !data ? (
            <div className="loading">جارٍ تحميل الخدمات…</div>
          ) : !data.services.length ? (
            <p className="empty">نجهّز لكم قائمة الخدمات، ترقّبونا.</p>
          ) : (
            <div className="service-grid">
              {data.services.map((s, i) => {
                const Icon = serviceIcons[i % serviceIcons.length];
                return (
                  <button
                    className={
                      "service-card " + (s.id === "combo" ? "featured" : "")
                    }
                    key={s.id}
                    onClick={() => open([s.id])}
                  >
                    {s.id === "combo" && (
                      <span className="popular">
                        عناية متكاملة
                        <Sparkles size={12} />
                      </span>
                    )}
                    <div className="service-top">
                      <div className="service-icon">
                        <Icon size={25} strokeWidth={1.4} />
                      </div>
                      <span className="service-number">0{i + 1}</span>
                    </div>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <div className="service-bottom">
                      <b>
                        {money(s.price)} <small>ر.س</small>
                      </b>
                      <span>
                        <Clock size={13} />
                        {s.duration} دقيقة
                      </span>
                      <div className="service-arrow">
                        <ArrowUpLeft size={18} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p className="services-note">
            <CalendarDays size={15} />
            اختر أكثر من خدمة عند الحجز، ونسّق جلستك على راحتك.
          </p>
        </section>
        <section className="experience-section" id="experience">
          <div className="container experience">
            <div className="experience-mark">
              <img src="/logo-brand.png" alt="شنب للحلاقة الرجالية" />
              <span>حلاقة بحِرفة، وأناقة بشخصية.</span>
            </div>
            <div className="experience-copy">
              <span className="eyebrow gold">الحكاية في التفاصيل</span>
              <h2>
                لأن الحلاقة مو بس قَصّة.
                <br />
                هي وقتك لنفسك.
              </h2>
              <p>
                نؤمن أن الأناقة تبدأ من الاهتمام. من أول ما تجلس على الكرسي إلى
                آخر لمسة، نسمع لك، نفهم ذوقك، ونعطي كل تفصيلة حقّها.
              </p>
              <div className="experience-features">
                <span>
                  <Check size={16} />
                  أدوات نظيفة وعناية مدروسة
                </span>
                <span>
                  <Check size={16} />
                  خدمات تناسب أسلوبك
                </span>
              </div>
              <button className="text-link gold" onClick={() => open()}>
                خذ لك وقت، واحجز موعدك
                <ArrowLeft size={19} />
              </button>
            </div>
          </div>
        </section>
        <section className="container visit section" id="location">
          <div>
            <span className="eyebrow">حياك في شنب</span>
            <h2>
              خطوتك الجاية؟
              <br />
              خلّها عندنا<span>.</span>
            </h2>
            <p className="muted">
              موعد مرتب، استقبال يليق فيك، وإطلالة تفتح النفس.
            </p>
            <div className="visit-details">
              <div>
                <span className="detail-icon">
                  <Clock size={21} />
                </span>
                <div>
                  <b>أوقات العمل</b>
                  <p>
                    {data
                      ? timeLabel(data.settings.open) +
                        " — " +
                        timeLabel(data.settings.close)
                      : "جارٍ التحميل"}
                  </p>
                  <small>يوميًا · بتوقيت السعودية</small>
                </div>
              </div>
              <div>
                <span className="detail-icon">
                  <MapPin size={21} />
                </span>
                <div>
                  <b>تلقانا على خرائط Google</b>
                  <p>افتح الموقع واترك الطريق علينا.</p>
                </div>
              </div>
            </div>
            <button className="btn primary large" onClick={() => open()}>
              ننتظرك، احجز الآن
              <ArrowUpLeft size={20} />
            </button>
          </div>
          <div className="location-card">
            <div className="map-pattern">
              <div className="map-road road-one" />
              <div className="map-road road-two" />
              <div className="map-road road-three" />
              <div className="map-pin">
                <MapPin size={30} />
              </div>
              <span className="map-shop">شنب</span>
              <div className="map-circle" />
            </div>
            <div className="location-card-bottom">
              <div>
                <b>شنب للحلاقة الرجالية</b>
                <small>مكانك للأناقة والعناية</small>
              </div>
              <a
                className="btn primary"
                href={
                  data?.settings.map_url ||
                  "https://maps.app.goo.gl/h8DGk2gT85depDNs5"
                }
                target="_blank"
                rel="noreferrer"
              >
                الاتجاهات
                <ArrowUpLeft size={17} />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <div className="container footer-top">
          <Brand light />
          <span>تفاصيل صغيرة. فرق كبير.</span>
          <a href="/admin">
            دخول الإدارة
            <ArrowUpLeft size={14} />
          </a>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} شنب. جميع الحقوق محفوظة.</span>
          <span>
            صُنع للاهتمام بتفاصيلك <span className="gold">✦</span>
          </span>
        </div>
      </footer>
      {booking && data && (
        <BookingForm
          services={data.services}
          initial={booking}
          onClose={() => setBooking(null)}
        />
      )}
    </>
  );
}
function PublicInvoice() {
  const [inv, setInv] = useState<(Invoice & { settings: Settings }) | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    api("/invoice/" + location.pathname.split("/").pop())
      .then(setInv)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="invoice-page">
      <Brand />
      {error ? (
        <p className="error">{error}</p>
      ) : !inv ? (
        <p>جارٍ تحميل الفاتورة…</p>
      ) : (
        <article className="receipt">
          <div className="receipt-top">
            <img src="/logo-brand.png" alt="شنب" />
            <h1>{inv.settings.business_name} للحلاقة الرجالية</h1>
            <p>فاتورة خدمات · #{inv.number}</p>
            <span>
              {new Date(inv.issued_at || inv.created).toLocaleDateString(
                "ar-SA",
                {
                  calendar: "gregory",
                  timeZone: "Asia/Riyadh",
                },
              )}
            </span>
          </div>
          <div className="receipt-customer">
            العميل<strong>{inv.name}</strong>
          </div>
          <div className="receipt-lines">
            {inv.lines.map((l) => (
              <div key={l.id}>
                <span>{l.name}</span>
                <b>{money(l.price)} ر.س</b>
              </div>
            ))}
          </div>
          <div className="receipt-lines">
            <div>
              <span>المجموع الفرعي</span>
              <span>{money(inv.subtotal)} ر.س</span>
            </div>
            {inv.discount > 0 && (
              <div className="discount">
                <span>{inv.offer_name || "الخصم"}</span>
                <span>−{money(inv.discount)} ر.س</span>
              </div>
            )}
          </div>
          <div className="receipt-total">
            <b>الإجمالي</b>
            <strong>
              {money(inv.total)} <small>ر.س</small>
            </strong>
          </div>
          <p className="receipt-thanks">
            شكرًا لزيارتك، ننتظرك بإطلالة جديدة ✦
          </p>
          <button
            className="btn primary full no-print"
            onClick={() => window.print()}
          >
            <Printer size={18} />
            طباعة أو حفظ PDF
          </button>
        </article>
      )}
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    {location.pathname.startsWith("/admin") ? (
      <Admin />
    ) : location.pathname.startsWith("/invoice/") ? (
      <PublicInvoice />
    ) : (
      <PublicSite />
    )}
  </React.StrictMode>,
);
