import { expect, test, type Page } from "@playwright/test";
import { SCHOOL_CLASSES, entryAppliesToClass } from "@/lib/entries";
import { entryKey } from "@/lib/seen";
import type { SubstitutionPayload } from "@/lib/types";

// The saved plan covers Thu 08.10. and Fri 09.10.2026; "today" is the Thursday.
const TODAY = new Date("2026-10-08T08:00:00+02:00");

let plan: SubstitutionPayload;

test.beforeAll(async ({ request }) => {
  plan = await (await request.get("/api/substitution")).json();
  expect(plan.success).toBe(true);
  expect(plan.days.map((day) => day.date)).toEqual(["2026-10-08", "2026-10-09"]);
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
});

async function chooseClass(page: Page, schoolClass: string) {
  await page.locator("#class-selector").selectOption(schoolClass);
  await expect(page.locator("h1")).toHaveText(schoolClass);
}

test("shows exactly the changes of every class on every day", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  for (const schoolClass of SCHOOL_CLASSES) {
    await chooseClass(page, schoolClass);
    for (const [index, day] of plan.days.entries()) {
      const tab = page.getByRole("tab").nth(index);
      await tab.click();
      const expected = plan.entries.filter(
        (entry) => entry.date === day.date && entryAppliesToClass(entry.className, schoolClass),
      ).length;
      await expect(page.locator("article"), `${schoolClass} ${day.date}`).toHaveCount(expected);
      await expect(tab).toContainText(String(expected));
      if (expected === 0) {
        await expect(page.getByText("Keine Vertretungen")).toBeVisible();
      }
    }
  }
  expect(errors).toEqual([]);
});

test("remembers the class and offers recent classes", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  await chooseClass(page, "7B");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("7B");

  await page.getByRole("button", { name: "5A", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("5A");
  await page.getByRole("button", { name: "7B aus der Liste entfernen" }).click();
  await expect(page.getByRole("button", { name: "7B", exact: true })).toHaveCount(0);
});

test("filters the upper school by the student's teachers", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "Q1");
  const all = await page.locator("article").count();

  await page.getByRole("button", { name: /Meine Lehrkräfte/ }).click();
  await page.locator("#teacher-input").fill("k1");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("Bitte ein Kürzel")).toBeVisible();
  await page.locator("#teacher-input").fill("ruk");
  await page.getByRole("button", { name: "Hinzufügen" }).click();

  const own = plan.entries.filter(
    (entry) =>
      entry.date === "2026-10-08" &&
      entryAppliesToClass(entry.className, "Q1") &&
      (entry.teacher === "RUK" || (!entry.teacher && entry.text.includes("RUK"))),
  ).length;
  expect(own).toBeGreaterThan(0);
  await expect(page.locator("article")).toHaveCount(own);
  await expect(page.getByText(/anderer Kurse\s+ausgeblendet/)).toBeVisible();

  await page.getByRole("button", { name: "Anzeigen" }).click();
  await expect(page.locator("article")).toHaveCount(all);
  await page.getByRole("button", { name: "Ausblenden" }).click();
  await expect(page.locator("article")).toHaveCount(own);

  await page.reload();
  await expect(page.locator("article")).toHaveCount(own);
  await chooseClass(page, "Q2");
  await expect(page.getByRole("button", { name: /Meine Lehrkräfte/ })).toContainText("Alle Kurse der Q2");
  await chooseClass(page, "9A");
  await expect(page.getByRole("button", { name: /Meine Lehrkräfte/ })).toHaveCount(0);
});

test("marks changes that are new since the last visit", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  // First visit: nothing counts as new.
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(0);

  // Pretend two of today's changes for 5A were not there last time.
  const fiveA = plan.entries.filter(
    (entry) => entry.date === "2026-10-08" && entryAppliesToClass(entry.className, "5A"),
  );
  const unseen = fiveA.slice(0, 2).map(entryKey);
  await page.evaluate((keys) => {
    const seen = JSON.parse(localStorage.getItem("kag:seen-entries") ?? "[]") as string[];
    localStorage.setItem("kag:seen-entries", JSON.stringify(seen.filter((key) => !keys.includes(key))));
  }, unseen);

  await page.reload();
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(unseen.length);
  await expect(page.getByText(`${unseen.length} neu`)).toBeVisible();
});

test("switches between light and dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Dunkles Design" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(18, 25, 27)");

  // The choice survives a reload and is applied before the page is shown.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#12191b");

  await page.getByRole("button", { name: "Helles Design" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  // "Automatisch" (in the settings) follows the system setting.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("dialog").getByText("Automatisch", { exact: true }).click();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("reports a healthy plan", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, problems: [] });
});

test("starts offline from the cache", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await chooseClass(page, "5A");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("KAG Vertretungsplan")).toBeVisible();
  await chooseClass(page, "7B");
  await expect(page.locator("article").first()).toBeVisible();
});

test("shares the day's changes", async ({ page, context }) => {
  // Phones: the system share menu receives the text.
  await page.addInitScript(() => {
    (window as unknown as { shared: ShareData[] }).shared = [];
    navigator.share = async (data?: ShareData) => {
      (window as unknown as { shared: ShareData[] }).shared.push(data ?? {});
    };
  });
  await page.goto("/");
  await chooseClass(page, "5A");
  await page.getByRole("button", { name: "Teilen" }).click();
  const shared = await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared);
  expect(shared).toHaveLength(1);
  const lines = shared[0].text!.split("\n");
  const fiveA = plan.entries.filter(
    (entry) => entry.date === "2026-10-08" && entryAppliesToClass(entry.className, "5A"),
  );
  expect(lines[0]).toBe("Vertretungsplan 5A – Heute, Donnerstag, 08.10.");
  expect(lines.filter((line) => line.startsWith("• "))).toHaveLength(fiveA.length);
  expect(lines.at(-1)).toMatch(/^Stand: /);

  // Without a share menu (desktop): copied to the clipboard instead.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const desktop = await context.newPage();
  await desktop.clock.setFixedTime(TODAY);
  await desktop.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
  });
  await desktop.goto("/");
  await desktop.getByRole("tab").nth(1).click();
  await desktop.getByRole("button", { name: "Teilen" }).click();
  await expect(desktop.getByText("Kopiert")).toBeVisible();
  const copied = await desktop.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Vertretungsplan 5A – Morgen, Freitag, 09\.10\.\n/);
  expect(copied).toContain("http://localhost:3124");
});

test("settings: next day hour and new badges", async ({ page }) => {
  // Thursday 15:30: before the default switch at 16:00 today is shown.
  await page.clock.setFixedTime(new Date("2026-10-08T15:30:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  await dialog.getByText("15 Uhr", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");

  // Kept after a reload; "Nie" stays on today.
  await page.reload();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await dialog.getByText("Nie", { exact: true }).click();
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");

  // "Neu" badges can be switched off.
  const unseen = plan.entries
    .filter((entry) => entry.date === "2026-10-08" && entryAppliesToClass(entry.className, "5A"))
    .slice(0, 1)
    .map(entryKey);
  await page.evaluate((keys) => {
    const seen = JSON.parse(localStorage.getItem("kag:seen-entries") ?? "[]") as string[];
    localStorage.setItem("kag:seen-entries", JSON.stringify(seen.filter((key) => !keys.includes(key))));
  }, unseen);
  await page.reload();
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const badgeSwitch = dialog.getByRole("switch", { name: "Neue Änderungen markieren" });
  await expect(badgeSwitch).toBeChecked();
  await dialog.getByText("Neue Änderungen markieren").click();
  await expect(badgeSwitch).not.toBeChecked();
  // A tap next to the sheet closes it.
  await page.mouse.click(200, 30);
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(0);
});
