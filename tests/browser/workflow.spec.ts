import { test, expect } from "@playwright/test";
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
test("mobile booking → owner invoice with discount → customer receipt", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "أكثر من حلاقة. هذي بصمتك." }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "احجز جلستك" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: /قص شعر/ }).click();
  await modal.getByRole("button", { name: "التالي" }).click();
  await page.getByLabel("تاريخ الموعد").fill(tomorrow);
  await modal.getByRole("button", { name: "١٠:٠٠ ص", exact: true }).click();
  await modal.getByRole("button", { name: "التالي" }).click();
  await modal.getByLabel("اسمك الكريم").fill("محمد اختبار");
  await modal.getByLabel("رقم الجوال").fill("0501234567");
  await modal.getByRole("checkbox").check();
  await modal.getByRole("button", { name: "تأكيد الحجز" }).click();
  await expect(
    page.getByRole("heading", { name: "حجزك صار مؤكّد!" }),
  ).toBeVisible();
  await page.goto("/admin");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("browser-test-password-5391");
  await page.getByRole("button", { name: "دخول لوحة الإدارة" }).click();
  await expect(
    page.getByRole("heading", { name: "يوم جديد، إطلالات جديدة." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "المواعيد", exact: true }).click();
  await expect(page.getByText("محمد اختبار", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "الفاتورة", exact: true }).click();
  await page.getByRole("dialog").getByLabel("تهذيب اللحية").check();
  await page.getByLabel("نوع الخصم").selectOption("percent");
  await page.getByLabel("قيمة الخصم").fill("10");
  await page.screenshot({
    path: "test-results/invoice-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "إصدار الفاتورة" }).click();
  await expect(
    page.getByRole("dialog").getByText("مصدرة", { exact: true }),
  ).toBeVisible();
  const href = await page
    .getByRole("link", { name: "عرض وطباعة" })
    .getAttribute("href");
  expect(href).toMatch(/^\/invoice\/[a-f0-9]+$/);
  await page.goto(href!);
  await expect(page.getByText("محمد اختبار", { exact: true })).toBeVisible();
  await expect(page.locator(".receipt-total")).toContainText("٥٤");
  await expect(
    page.getByRole("button", { name: "طباعة أو حفظ PDF" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("owner can add and reorder services, create an offer, and update opening hours", async ({
  page,
}) => {
  await page.goto("/admin");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("browser-test-password-5391");
  await page.getByRole("button", { name: "دخول لوحة الإدارة" }).click();
  await page
    .getByRole("button", { name: "الخدمات والأسعار", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة خدمة" }).click();
  await page.getByLabel("اسم الخدمة", { exact: true }).fill("ترتيب سريع");
  await page.getByLabel("وصف قصير").fill("تفاصيل مرتبة في وقت قصير");
  await page.getByLabel("السعر (ر.س)").fill("15");
  await page.getByLabel("المدة (دقيقة)").fill("15");
  await page.getByRole("button", { name: "حفظ الخدمة" }).click();
  await expect(page.getByRole("heading", { name: "ترتيب سريع" })).toBeVisible();
  await page.getByRole("button", { name: "تقديم ترتيب سريع" }).click();
  await page
    .getByRole("button", { name: "العروض والخصومات", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة عرض" }).click();
  await page.getByLabel("اسم العرض").fill("عرض الوفاء");
  await page.getByLabel("القيمة", { exact: true }).fill("15");
  await page.getByRole("button", { name: "حفظ العرض" }).click();
  await expect(page.getByRole("heading", { name: "عرض الوفاء" })).toBeVisible();
  await page
    .getByRole("button", { name: "إعدادات المحل", exact: true })
    .click();
  await page.getByLabel("بداية العمل").fill("09:00");
  await page.getByRole("button", { name: "حفظ الإعدادات" }).click();
  await expect(page.getByRole("status")).toContainText("تم حفظ");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ترتيب سريع" })).toBeVisible();
  await expect(page.locator(".visit-details")).toContainText("٩:٠٠ ص");
});
