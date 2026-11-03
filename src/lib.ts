export type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  position: number;
  active: number;
};
export type Line = {
  id: string;
  name: string;
  price: number;
  duration: number;
};
export type Settings = {
  business_name: string;
  open: string;
  close: string;
  map_url: string;
  business_phone: string;
};
export type Booking = {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  duration: number;
  lines: Line[];
  status: string;
  created: string;
};
export type Invoice = {
  id: string;
  number: number;
  booking_id: string;
  name: string;
  phone: string;
  lines: Line[];
  discount_type: string;
  discount_value: number;
  offer_name: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  token: string;
  created: string;
  issued_at?: string;
  message_status?: string;
  message_error?: string;
};
export type Offer = {
  id: string;
  name: string;
  type: string;
  value: number;
  active: number;
};
export const money = (v: number) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(v / 100);
export const dateLabel = (v: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    calendar: "gregory",
    timeZone: "Asia/Riyadh",
  }).format(new Date(v + "T12:00:00+03:00"));
export const timeLabel = (v: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date("2026-01-01T" + v + ":00+03:00"));
export const today = () =>
  new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "تعذر إكمال الطلب");
  return result;
}
export function shareInvoice(inv: Invoice) {
  const text = `مرحبًا ${inv.name}، شكرًا لزيارتك شنب.\nفاتورتك رقم #${inv.number}\nالإجمالي: ${money(inv.total)} ر.س\n${location.origin}/invoice/${inv.token}`;
  window.open(
    "https://wa.me/" + inv.phone + "?text=" + encodeURIComponent(text),
    "_blank",
    "noopener,noreferrer",
  );
}
