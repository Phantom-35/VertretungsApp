import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { SCHOOL_CLASSES, entryAppliesToClass } from "@/lib/entries";
import { entryKey } from "@/lib/seen";
import type { SubstitutionPayload } from "@/lib/types";
import { APP_PORT, FIXTURE_URL } from "./constants";

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

/** Waits until the settings sheet has finished sliding in. */
async function settled(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.getAnimations().length)).toBe(0);
}

/** Opens the settings, and in them one of their pages ("Anzeige", "Über die App" …). */
async function openSettings(page: Page, section?: string) {
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  if (section) {
    await dialog.getByRole("button", { name: new RegExp(`^${section}`) }).click();
    await expect(dialog.getByRole("heading", { name: section })).toBeVisible();
  }
  return dialog;
}

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
        await expect(page.getByText("Keine Änderungen", { exact: true })).toBeVisible();
      }
    }
  }
  expect(errors).toEqual([]);
});

test("compact cards on busy days, a short status line and neutral day counts", async ({ page }) => {
  await page.goto("/");
  // Few changes: the normal cards.
  await chooseClass(page, "5A");
  const padding = () => page.locator("article").first().evaluate((card) => getComputedStyle(card).paddingTop);
  expect(await padding()).toBe("16px");
  // Many changes (Q1 on Thursday): smaller cards.
  await chooseClass(page, "Q1");
  expect(await page.locator("article").count()).toBeGreaterThanOrEqual(6);
  expect(await padding()).toBe("12px");

  // When the school changed the plan and when the app checked it.
  await expect(page.locator("header")).toContainText("Plan von 15:34 Uhr");
  await expect(page.locator("header")).toContainText(/(gerade eben|vor \d+ Min\.) geprüft/);

  // The count on the other day's tab is neutral, not orange like a warning.
  const otherCount = page.getByRole("tab", { selected: false }).locator("span.absolute");
  expect(await otherCount.evaluate((badge) => badge.className)).not.toContain("warn");
});

test("shows the NRW holidays instead of an old plan", async ({ page }) => {
  // Tuesday in the autumn holidays 2026; the saved plan is from 08./09.10.
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  const header = page.locator("header");
  await expect(header).toContainText("Herbstferien bis Sa., 31.10.");
  await expect(header).toContainText("Ferien");
  await expect(header).not.toContainText("Veraltet");
  const card = page.getByRole("region", { name: "Schöne Herbstferien!" });
  await expect(card).toContainText("Frei bis Sa., 31.10. Der Plan für Mo., 02.11. erscheint hier");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(0);

  // The last plan can still be looked at.
  await card.getByRole("button", { name: "Letzten Plan ansehen" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator("article").first()).toBeVisible();

  // Sunday after the holidays (they end on Saturday): no day that is over.
  await page.clock.setFixedTime(new Date("2026-11-01T19:00:00+02:00"));
  await page.reload();
  await expect(header).toContainText("Herbstferien bis So., 01.11.");
  await expect(card).toContainText("Frei bis So., 01.11. Der Plan für Mo., 02.11. erscheint hier");
});

test("keeps the holidays in front when the plan after them is already online", async ({ browser }) => {
  // Without the service worker, so that the plan goes through page.route:
  // the saved plan's Friday (09.10.) becomes the Monday after the holidays.
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("kag:onboarded", "1"));
  const page = await context.newPage();
  const moveFriday = async (route: Route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll("2026-10-09", "2026-11-02") });
  };
  await page.route((url) => url.pathname === "/", moveFriday);
  await page.route((url) => url.pathname === "/api/substitution", moveFriday);
  // The first free day (Saturday): in the morning still the plan, as on an
  // ordinary Saturday; the holidays from 10:00 on.
  await page.clock.setFixedTime(new Date("2026-10-17T09:30:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  const header = page.locator("header");
  const card = page.getByRole("region", { name: "Schöne Herbstferien!" });
  await expect(page.getByRole("tab", { selected: true })).toContainText("02.11.");
  await expect(card).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-10-17T10:00:00+02:00"));
  await page.reload();
  await expect(card).toBeVisible();

  // Tuesday in the autumn holidays 2026.
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00+02:00"));
  await page.reload();
  await expect(header).toContainText("Herbstferien bis Sa., 31.10.");
  await expect(header).toContainText("Ferien");
  await expect(card).toContainText("Frei bis Sa., 31.10. Der Plan für Mo., 02.11. ist schon online.");
  await expect(page.getByRole("tab")).toHaveCount(0);

  // The new plan, one tap away; the header then tells its day.
  await card.getByRole("button", { name: "Plan für Mo., 02.11. ansehen" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toContainText("02.11.");
  await expect(header).not.toContainText("Herbstferien");
  await expect(page.locator("article").first()).toBeVisible();

  // Opened again: the holidays first, and the last plan before them.
  await page.reload();
  await card.getByRole("button", { name: "Letzten Plan ansehen" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toContainText("08.10.");
  await expect(page.getByRole("tab")).toHaveCount(2);

  // A notification for the new plan opens it directly.
  await page.goto("/?day=2026-11-02");
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toContainText("02.11.");

  // The last free day: in the morning still the holidays, from 16:00 (as on
  // an ordinary weekend) the plan for the first day back.
  await page.clock.setFixedTime(new Date("2026-11-01T11:00:00+01:00"));
  await page.goto("/");
  await expect(card).toContainText("Frei bis So., 01.11. Der Plan für Mo., 02.11. ist schon online.");
  await page.clock.setFixedTime(new Date("2026-11-01T16:30:00+01:00"));
  await page.reload();
  await expect(page.getByRole("tab", { selected: true })).toContainText("02.11.");
  await expect(card).toHaveCount(0);
  await expect(header).not.toContainText("Herbstferien");

  // On a large screen all days stand side by side: one button is enough.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00+02:00"));
  await page.reload();
  await expect(card.getByRole("button")).toHaveCount(1);
  await card.getByRole("button", { name: "Plan für Mo., 02.11. ansehen" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator("main section h2")).toHaveCount(2);
  await context.close();
});

for (const [name, answer] of [
  ["switched off on the server", { enabled: false }],
  ["not reachable", null],
] as const) {
  test(`works without notifications (${name})`, async ({ page }) => {
    // Many never switch them on; the app must not depend on them.
    await page.route("**/api/push/config", (route) =>
      answer ? route.fulfill({ json: answer }) : route.abort(),
    );
    await page.goto("/");
    await chooseClass(page, "5A");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");
    await expect(page.locator("article").first()).toBeVisible();
    await page.getByRole("tab").nth(1).click();
    await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");
    const dialog = await openSettings(page, "Benachrichtigungen");
    await dialog.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
    await dialog.getByRole("button", { name: /^Anzeige/ }).click();
    await expect(dialog.getByRole("heading", { name: "Anzeige" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // The introduction can be finished too.
    await page.evaluate(() => localStorage.removeItem("kag:onboarded"));
    await page.reload();
    const intro = page.getByRole("dialog");
    await intro.getByRole("button", { name: "Los geht’s" }).click();
    // The class is chosen already: class, then installing.
    await intro.getByRole("button", { name: "Weiter" }).click();
    await intro.getByRole("button", { name: "Erst mal ohne Installieren weiter" }).click();
    // The notifications step: skipped without them, or (status unknown yet)
    // left with "Weiter" or "Später".
    const done = intro.getByRole("button", { name: "Fertig" });
    const onward = intro.getByRole("button", { name: /^(Weiter|Später)$/ });
    await expect(onward.or(done)).toBeVisible();
    if (await onward.isVisible()) await onward.click();
    await done.click();
    await expect(intro).toBeHidden();
    await expect(page.locator("article").first()).toBeVisible();
  });
}

test("tells a school website that is down apart from being offline", async ({ page, context }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  // The large view has a button to reload the plan.
  await page.setViewportSize({ width: 1440, height: 900 });
  const header = page.locator("body");
  // The school's pages are gone (as in the holidays): the server answers without a plan.
  await page.route("**/api/substitution*", (route) =>
    route.fulfill({
      status: 503,
      json: { success: false, error: "Die erste Vertretungsplan-Seite konnte nicht geladen werden." },
    }),
  );
  await page.getByRole("button", { name: "Plan neu laden" }).click();
  await expect(page.getByText("Störung", { exact: true })).toBeVisible();
  await expect(page.getByText("Offline", { exact: true })).toHaveCount(0);
  await expect(header).toContainText("Die Seite der Schule ist gerade nicht erreichbar.");
  await expect(header).not.toContainText("Vertretungsplan-Seite konnte nicht geladen werden");
  // The plan stays on screen.
  await expect(page.locator("article").first()).toBeVisible();

  // The app's own server answers with an error page: a disruption as well.
  await page.unroute("**/api/substitution*");
  await page.route("**/api/substitution*", (route) =>
    route.fulfill({ status: 504, contentType: "text/html", body: "<h1>Gateway Timeout</h1>" }),
  );
  await page.getByRole("button", { name: "Plan neu laden" }).click();
  await expect(header).toContainText("Der Plan ist gerade nicht abrufbar.", { timeout: 15_000 });
  await expect(page.getByText("Störung", { exact: true })).toBeVisible();

  // No internet on the device: that is "Offline".
  await page.unroute("**/api/substitution*");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Plan neu laden" }).click();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(header).toContainText("Keine Verbindung. Ist das Internet an?");
  await context.setOffline(false);
});

test("does not announce a day after the holidays as not online yet", async ({ browser }) => {
  // The saved plan moved to the last week before the autumn holidays.
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("kag:onboarded", "1"));
  const page = await context.newPage();
  const moveWeek = async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll("2026-10-08", "2026-10-15").replaceAll("2026-10-09", "2026-10-16");
    await route.fulfill({ response, body });
  };
  await page.route((url) => url.pathname === "/" || url.pathname === "/api/substitution", moveWeek);
  // Friday evening, the last school day: Monday is two weeks away.
  await page.clock.setFixedTime(new Date("2026-10-16T18:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByText("noch nicht da")).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toContainText("16.10.");
  await context.close();
});

test("says that no plan is online when the plan has no day at all", async ({ page }) => {
  // Weeks later (the saved copy is old, so the app asks again) the school's
  // export has no readable day.
  await page.clock.setFixedTime(new Date("2026-11-03T09:00:00+01:00"));
  await page.route("**/api/substitution*", async (route) => {
    const response = await route.fetch();
    const body = { ...(await response.json()), days: [], entries: [], notices: [] };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await chooseClass(page, "5A");
  await expect(page.getByText("Kein Plan online")).toBeVisible();
  await expect(page.getByText(/keine Änderungen eingetragen/)).toHaveCount(0);
});

test("says when the next plan is not online yet, and marks past days", async ({ page }) => {
  // Saturday after the saved plan (08./09.10.), no holidays.
  await page.clock.setFixedTime(new Date("2026-10-10T11:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  // Monday is shown as not online yet, as on Friday evening.
  await expect(page.getByRole("tab", { selected: true })).toContainText("noch nicht da");
  await expect(page.getByText("Plan für Montag noch nicht online")).toBeVisible();
  // A past day is not mistaken for the coming one.
  await expect(page.getByRole("tab").nth(0)).toContainText("vorbei, 08.10.");
  await expect(page.getByRole("tab").nth(1)).toContainText("Gestern");
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("header")).toContainText("Letzter Plan");
});

test("keeps the day across midnight and starts the next day fresh", async ({ page }) => {
  // Friday night with the app open: Monday (not online yet) is shown.
  await page.clock.install({ time: new Date("2026-10-09T23:58:00+02:00") });
  await page.goto("/");
  await chooseClass(page, "5A");
  const selected = page.getByRole("tab", { selected: true });
  await expect(selected).toContainText("noch nicht da");
  // Saturday 00:01: nothing jumps.
  await page.clock.runFor(3 * 60_000);
  await expect(selected).toContainText("noch nicht da");

  // Thursday 13:00, left on screen overnight (e.g. a tablet): on Friday
  // morning it shows Friday, not yesterday.
  await page.clock.setSystemTime(new Date("2026-10-08T13:00:00+02:00"));
  await page.reload();
  await expect(selected).toContainText("Heute");
  await page.clock.runFor(60_000);
  await page.clock.setSystemTime(new Date("2026-10-09T07:00:00+02:00"));
  await page.clock.runFor(60_000);
  await expect(selected).toContainText("Heute");
  await expect(selected).toContainText("09.10.");
});

test("does not show a day or status before it knows the time", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("Wird geladen");
  expect(html).not.toContain(">Aktuell<");
  expect(html).not.toContain('aria-selected="true"');
});

test("shows the next school day as not online yet, instead of no changes", async ({ page }) => {
  // Friday; the saved plan has Thursday and Friday, not yet Monday.
  await page.clock.setFixedTime(new Date("2026-10-09T10:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  const pending = page.getByRole("tab", { name: /Montag/ });
  await expect(pending).toContainText("noch nicht da");
  await pending.click();
  await expect(page.getByText("Plan für Montag noch nicht online")).toBeVisible();
  await expect(page.getByText("Die Schule hat den Plan für Mo., 12.10. noch nicht hochgeladen.", { exact: false })).toBeVisible();
  await expect(page.getByText("Keine Änderungen", { exact: true })).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(0);
  // After school the default is the next school day: here, the pending one.
  await page.clock.setFixedTime(new Date("2026-10-09T17:00:00+02:00"));
  await page.reload();
  await expect(page.getByRole("tab", { selected: true })).toContainText("noch nicht da");
});

test("shows a public holiday instead of an old plan", async ({ page }) => {
  // Christi Himmelfahrt 2027 (Thursday, from 10:00); the saved plan is from 08./09.10.2026.
  await page.clock.setFixedTime(new Date("2027-05-06T11:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  const header = page.locator("header");
  await expect(header).toContainText("Christi Himmelfahrt");
  await expect(header).toContainText("Feiertag");
  const card = page.getByRole("region", { name: "Schönen Feiertag!" });
  await expect(card).toContainText("Heute ist Christi Himmelfahrt, schulfrei.");
  await expect(card).toContainText("Der Plan für Fr., 07.05. erscheint hier");
});

test("a class only looked at is gone when the app is opened anew", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-08T08:00:00+02:00") });
  await page.goto("/");
  await chooseClass(page, "5A");
  // A sibling's class, looked at in the evening.
  await chooseClass(page, "7B");
  await expect(page.getByText("Nur angesehen", { exact: true })).toBeVisible();
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  // Away for a few minutes: still the sibling's class.
  await setVisibility("hidden");
  await page.clock.runFor(5 * 60_000);
  await setVisibility("visible");
  await expect(page.locator("h1")).toHaveText("7B");
  // Away for an hour (the app stayed alive in the background): the own class again.
  await setVisibility("hidden");
  await page.clock.runFor(60 * 60_000);
  await setVisibility("visible");
  await expect(page.locator("h1")).toHaveText("5A");
  await expect(page.getByText("Nur angesehen", { exact: true })).toHaveCount(0);
});

test("a shared link opens its class: looked at, or the own class for someone new", async ({ page, browser }) => {
  // Someone with an own class (e.g. parents): the linked class is only looked at.
  await page.goto("/");
  await chooseClass(page, "5A");
  await page.goto("/?klasse=7B");
  await expect(page.locator("h1")).toHaveText("7B");
  await expect(page.getByText("Nur angesehen", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // Someone new: it becomes the own class (the introduction shows it chosen).
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const newcomer = await context.newPage();
  await newcomer.goto(`${new URL(page.url()).origin}/?klasse=Q1`);
  const intro = newcomer.getByRole("dialog");
  await intro.getByRole("button", { name: "Los geht’s" }).click();
  await expect(intro.getByRole("radio", { name: "Q1" })).toHaveAttribute("aria-checked", "true");
  await context.close();
});

test("a day from a notification applies once, not to every reload", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  // Opened from a notification about tomorrow.
  await page.goto("/?day=2026-10-09");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");
  await expect(page).toHaveURL(/\/$/);
  // Later reloaded (e.g. for a new version): today again, as when opened normally.
  await page.reload();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");
});

test("links the legal pages and offers a QR code to pass the app on", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  const dialog = await openSettings(page, "Über die App");
  await expect(dialog.getByRole("link", { name: "Impressum" })).toHaveAttribute(
    "href",
    "https://support-vertretung-kag.vercel.app/impressum",
  );
  await expect(dialog.getByRole("link", { name: "Datenschutz" })).toHaveAttribute(
    "href",
    "https://support-vertretung-kag.vercel.app/datenschutz",
  );
  await dialog.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();

  // The code is a page of the settings: no page load, back to the settings.
  await dialog.getByRole("button", { name: "App weitergeben (QR-Code)" }).click();
  await expect(dialog.getByRole("heading", { name: "App weitergeben" })).toBeVisible();
  const origin = new URL(page.url()).origin;
  await expect(dialog.getByRole("img", { name: `QR-Code für ${origin}/` })).toBeVisible();
  await expect(dialog.getByText(origin.replace(/^https?:\/\//, ""), { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Link teilen" })).toBeVisible();
  await dialog.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
  await expect(dialog.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

  // Printing has its own page; back from it, the code in the settings again.
  await dialog.getByRole("button", { name: "App weitergeben (QR-Code)" }).click();
  await dialog.getByRole("link", { name: "Aushang drucken" }).click();
  await expect(page).toHaveURL(/\/teilen$/);
  await expect(page.getByRole("img", { name: `QR-Code für ${origin}/` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aushang drucken" })).toBeVisible();
  await page.getByRole("link", { name: "← Zurück" }).click();
  await expect(dialog.getByRole("heading", { name: "App weitergeben" })).toBeVisible();
  // The address is clean again, and the sheet stays open all the same.
  await expect(page).toHaveURL(new RegExp(`^${origin}/$`));
  await page.waitForTimeout(1000);
  await expect(dialog.getByRole("heading", { name: "App weitergeben" })).toBeVisible();
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("header")).toContainText("5A");
  // Opened again from the app: the overview, not the code; nor after a reload.
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await page.reload();
  await expect(page.locator("header")).toContainText("5A");
  await expect(dialog).toBeHidden();
});

test("offers no printing in the installed app on an iPhone, where it does nothing", async ({ browser }) => {
  const iphone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  await iphone.addInitScript(() => {
    localStorage.setItem("kag:onboarded", "1");
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  const page = await iphone.newPage();
  await page.clock.setFixedTime(TODAY);
  await page.goto("/?einstellungen=teilen");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.getByRole("heading", { name: "App weitergeben" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Link teilen" })).toBeVisible();
  await expect(dialog.getByText("Aushang drucken")).toHaveCount(0);
  await page.goto("/teilen");
  await expect(page.getByRole("button", { name: "Link teilen" })).toBeVisible();
  await expect(page.getByText("Aushang drucken")).toHaveCount(0);
  await iphone.close();
});

test("says when the room is not decided yet (??? in the plan)", async ({ browser }) => {
  // Without the service worker, so that the plan goes through page.route.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.clock.setFixedTime(TODAY);
  // The 5A's room 004 not decided yet.
  const openRoom = async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('"004"', '"???"').replaceAll('\\"004\\"', '\\"???\\"');
    await route.fulfill({ response, body });
  };
  await page.route((url) => url.pathname === "/", openRoom);
  await page.route((url) => url.pathname === "/api/substitution", openRoom);
  await page.goto("/");
  await chooseClass(page, "5A");
  const card = page.locator("article").filter({ hasText: "Raum noch offen" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("???")).toHaveCount(0);
  // Nothing to find on the plan yet.
  await expect(card.getByRole("button", { name: /auf dem Raumplan zeigen$/ })).toHaveCount(0);
  await context.close();
});

/** Opens the app as on the first start after the update: the note about the room plan not seen yet. */
async function openUnseen(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("kag:room-plan-intro"));
  await page.reload();
}

test("tells once about the room plan, over everything; the rooms are on it for everyone", async ({ page }) => {
  await openUnseen(page);
  const intro = page.getByRole("dialog", { name: "Raumplan", exact: true });
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("Neu");
  await expect(intro).toContainText("neben dem Raum der Knopf „Wo ist das?“");
  // Over the whole app, only a note: nothing to decide.
  expect(await intro.evaluate((dialog) => dialog.matches(":modal"))).toBe(true);
  await expect(intro.getByRole("button", { name: /Ja|Nein/ })).toHaveCount(0);
  // It can be tried at once.
  await intro.getByRole("button", { name: "Ausprobieren" }).click();
  await expect(intro).toBeHidden();
  const tryIt = page.getByRole("dialog", { name: "Raum 114" });
  await expect(tryIt.getByText("Kunst ·", { exact: true })).toBeVisible();
  // The clusters are named, the gardens marked.
  await expect(tryIt.getByText("Informatik · Kunst · Biologie")).toBeVisible();
  await expect(tryIt.getByText("Stufe 8")).toBeVisible();
  await expect(tryIt.getByText("Garten")).toHaveCount(2);
  await tryIt.getByRole("button", { name: "Fertig" }).click();
  await expect(tryIt).toBeHidden();

  await chooseClass(page, "5A");
  const roomButtons = page.getByRole("button", { name: /auf dem Raumplan zeigen$/ });
  // A button next to the room, saying what it does.
  const findRoom = page.getByRole("button", { name: /Raum 004 auf dem Raumplan zeigen$/ }).first();
  await expect(findRoom).toHaveText("Wo ist das? Raum 004 auf dem Raumplan zeigen");
  await findRoom.click();
  const sheet = page.getByRole("dialog", { name: "Raum 004" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Klassenraum der 5A (deine Klasse)")).toBeVisible();
  await expect(sheet.getByRole("img", { name: "Erdgeschoss, Raum 004 markiert" })).toBeVisible();
  // On another floor a hint says where the room is.
  await sheet.getByText("2. OG", { exact: true }).click();
  await expect(sheet.getByRole("img", { name: "2. Obergeschoss" })).toBeVisible();
  await expect(sheet.getByText("Raum 004 ist im Erdgeschoss.")).toBeVisible();
  // The old floor fades away and is gone afterwards; the marker glides along.
  await expect(sheet.locator(".floor-out-down, .floor-out-up")).toHaveCount(0);
  await expect(sheet.getByRole("radio", { name: "2. OG" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Two rooms in one entry: one button, both marked.
  await chooseClass(page, "9A");
  await page.getByRole("button", { name: /Räume 248 und 249 auf dem Raumplan zeigen$/ }).first().click();
  const both = page.getByRole("dialog", { name: "Räume 248 und 249" });
  await expect(both.getByRole("img", { name: "2. Obergeschoss, Räume 248 und 249 markiert" })).toBeVisible();
  await both.getByRole("button", { name: "Fertig" }).click();
  await expect(both).toBeHidden();
  // The gym is not on the plan: no button.
  await chooseClass(page, "5D");
  await expect(page.getByText("TU3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Raum TU3/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /Morgen/ }).click();
  await page.getByRole("button", { name: /Raum 041 auf dem Raumplan zeigen$/ }).click();
  await expect(page.getByRole("dialog", { name: "Raum 041" }).getByText("Klassenraum der 6A")).toBeVisible();
  await page.getByRole("dialog", { name: "Raum 041" }).getByRole("button", { name: "Fertig" }).click();

  // Told only once.
  await page.reload();
  await expect(page.locator("article").first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await chooseClass(page, "5A");
  await expect(roomButtons.first()).toBeVisible();

  // The whole plan from the settings, and the button switched off there.
  const dialog = await openSettings(page, "Anzeige");
  await dialog.getByRole("button", { name: "Raumplan ansehen" }).click();
  const plan = page.getByRole("dialog", { name: "Raumplan", exact: true });
  await expect(plan.getByRole("img", { name: "Erdgeschoss" })).toBeVisible();
  await plan.getByRole("button", { name: "Fertig" }).click();
  await expect(plan).toBeHidden();
  const roomSwitch = dialog.getByRole("switch", { name: "Räume auf dem Plan zeigen" });
  await expect(roomSwitch).toBeChecked();
  await dialog.getByText("Räume auf dem Plan zeigen").click();
  await expect(roomSwitch).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Raumplan ansehen" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
  await expect(roomButtons).toHaveCount(0);
  await page.reload();
  await expect(page.locator("article").first()).toBeVisible();
  await expect(roomButtons).toHaveCount(0);
});

test("the note about the room plan counts as seen however it is closed", async ({ page }) => {
  await openUnseen(page);
  const intro = page.getByRole("dialog", { name: "Raumplan", exact: true });
  await expect(intro).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(intro).toBeHidden();
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await expect(intro).toHaveCount(0);
  // Whoever said "no" to the earlier question gets the button all the same.
  await page.evaluate(() => localStorage.setItem("kag:settings", JSON.stringify({ roomPlan: false })));
  await page.reload();
  await chooseClass(page, "5A");
  await expect(page.getByRole("button", { name: /Raum 004 auf dem Raumplan zeigen$/ }).first()).toBeVisible();
});

test("help and contact: a message to click through, sent with the device details", async ({ page, request }) => {
  const received = async () =>
    (await (await request.get(`${FIXTURE_URL}/__feedback`)).json()) as { text: string }[];
  const before = (await received()).length;
  await page.goto("/");
  await chooseClass(page, "5A");
  const dialog = await openSettings(page, "Hilfe & Kontakt");
  // Writing without the form is always possible.
  await expect(dialog.getByRole("link", { name: "E-Mail an phandevstudios@gmx.de" })).toHaveAttribute(
    "href",
    /^mailto:phandevstudios@gmx\.de\?subject=/,
  );
  await expect(dialog.getByRole("link", { name: "Häufige Fragen ansehen" })).toHaveAttribute(
    "href",
    "https://support-vertretung-kag.vercel.app",
  );
  await expect(dialog.getByRole("button", { name: "Senden" })).toHaveCount(0);

  // An error: first what is wrong, then a few words.
  await dialog.locator("label").filter({ hasText: /Fehler melden/ }).click();
  await expect(dialog.getByRole("button", { name: "Senden" })).toHaveCount(0);
  await dialog.locator("label").filter({ hasText: "Benachrichtigungen kommen nicht" }).click();
  const send = dialog.getByRole("button", { name: "Senden" });
  await expect(send).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Kurz beschreiben" }).fill("Seit gestern kommt nichts mehr.");
  await dialog.getByRole("textbox", { name: /Deine E-Mail/ }).fill("kein-mail");
  await expect(dialog.getByText("Bitte prüf die Adresse.")).toBeVisible();
  await expect(send).toBeDisabled();
  await dialog.getByRole("textbox", { name: /Deine E-Mail/ }).fill("schueler@example.de");
  await expect(send).toBeEnabled();

  // Closed to look something up and opened again: nothing written is lost.
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
  await openSettings(page, "Hilfe & Kontakt");
  await expect(dialog.getByRole("textbox", { name: "Kurz beschreiben" })).toHaveValue("Seit gestern kommt nichts mehr.");
  await expect(dialog.getByRole("textbox", { name: /Deine E-Mail/ })).toHaveValue("schueler@example.de");
  await expect(send).toBeEnabled();

  // The details are shown before they are sent.
  await dialog.getByText("Diese Angaben ansehen").click();
  await expect(dialog.locator("dl")).toContainText("Klasse5A");
  await expect(dialog.locator("dl")).toContainText("Als Appnein, im Browser");
  await expect(dialog.getByRole("link", { name: "Per E-Mail senden" })).toHaveAttribute(
    "href",
    /^mailto:phandevstudios@gmx\.de\?subject=KAG%20Vertretungsplan%20%E2%80%93%20Fehler%3A%20Benachrichtigungen%20kommen%20nicht&body=Seit%20gestern/,
  );

  await send.click();
  await expect(dialog.getByRole("status")).toContainText("Danke! Deine Nachricht ist angekommen.");
  await expect(dialog.getByRole("button", { name: "Senden" })).toHaveCount(0);
  const messages = await received();
  expect(messages).toHaveLength(before + 1);
  const text = messages.at(-1)!.text;
  expect(text).toContain("🐞 Fehler: Benachrichtigungen kommen nicht\nSeit gestern kommt nichts mehr.");
  expect(text).toContain("Antwort an: schueler@example.de");
  expect(text).toContain("Klasse: 5A");
  expect(text).toContain("Benachrichtigungen: ");
  expect(text).toContain("Kennung: Mozilla/5.0");

  // A question without the details: only the words arrive.
  await dialog.locator("label").filter({ hasText: /Frage/ }).click();
  await dialog.getByRole("textbox", { name: "Kurz beschreiben" }).fill("Gibt es die App auch für Lehrer?");
  await dialog.getByRole("checkbox", { name: /Geräte-Angaben mitschicken/ }).uncheck();
  await dialog.getByRole("button", { name: "Senden" }).click();
  await expect(dialog.getByRole("status")).toContainText("Danke!");
  const question = (await received()).at(-1)!.text;
  expect(question).toBe("❓ Frage\nGibt es die App auch für Lehrer?");
});

test("keeps the settings button on screen with large text on a small phone", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kag:settings", JSON.stringify({ textSize: "large" })));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await chooseClass(page, "Q1");
  const gear = page.getByRole("button", { name: "Einstellungen" });
  await expect(gear).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // Short hint on self-study cards: one line, not three.
  await expect(page.getByText("Aufgaben selbst bearbeiten").first()).toBeVisible();
  // No choice in the settings is cut off ("16 Uh").
  await gear.click();
  await settled(page.getByRole("dialog"));
  const cutOff = await page.evaluate(() =>
    [...document.querySelectorAll("fieldset label")]
      .filter((label) => label.scrollWidth > label.clientWidth + 1)
      .map((label) => label.textContent),
  );
  expect(cutOff).toEqual([]);
});

test("shows the install steps of the browser in use", async ({ browser }) => {
  const cases = [
    {
      name: "Chrome on an iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
      expected: ["Anleitung für Chrome", "Oben in der Adressleiste auf", "Zum Home-Bildschirm"],
    },
    {
      name: "DuckDuckGo on an iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Ddg/18.0 Safari/604.1",
      expected: ["Anleitung für DuckDuckGo", "Zum Home-Bildschirm"],
    },
    {
      name: "Firefox on an iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
      expected: ["Das Menü", "Zum Home-Bildschirm"],
    },
    {
      name: "Instagram on an iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0 (iPhone15,2; iOS 18_0; de_DE)",
      expected: ["Aus dieser App heraus", "In Safari öffnen", "Link kopieren"],
    },
    {
      name: "Samsung Internet",
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      expected: ["Seite hinzufügen zu", "Startbildschirm"],
    },
    {
      name: "Firefox on Android",
      userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
      expected: ["Installieren", "Zum Startbildschirm hinzufügen"],
    },
  ];
  for (const { name, userAgent, expected } of cases) {
    const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/");
    const card = await openSettings(page, "Als App installieren");
    for (const text of expected) {
      await expect(card.getByText(text, { exact: false }).first(), `${name}: ${text}`).toBeVisible();
    }
    await context.close();
  }

  // A wrong guess (e.g. Brave, which looks like Safari) can be corrected.
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const card = await openSettings(page, "Als App installieren");
  await expect(card.getByText("Anleitung für Safari")).toBeVisible();
  await card.getByRole("button", { name: "Anderer Browser?" }).click();
  await card.getByLabel("Dein Browser").selectOption("firefox");
  await expect(card.getByText("Anleitung für Firefox")).toBeVisible();
  await expect(card.getByText("Das Menü")).toBeVisible();
  await context.close();
});

test("reminds gently to install the app on the 3rd and 10th visit", async ({ page }) => {
  const reminder = page.getByRole("region", { name: "Als App installieren?" });
  /** Opens the app anew, as a new visit (a reload is the same visit). */
  const visit = async (setVisits?: number) => {
    await page.evaluate((visits) => {
      if (visits !== undefined) {
        localStorage.setItem("kag:browser-visits", String(visits));
      }
      sessionStorage.clear();
    }, setVisits);
    await page.reload();
    await expect(page.locator("h1")).not.toHaveText("");
  };

  await page.goto("/");
  await chooseClass(page, "5A");
  await expect(reminder).toHaveCount(0); // 1st visit
  await visit(); // 2nd
  await expect(reminder).toHaveCount(0);
  await visit(); // 3rd
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Zeigen" }).click();
  await expect(reminder.getByText("Seite als App installieren", { exact: true })).toBeVisible();
  // Stays during this visit, also after a reload, until it is closed.
  await page.reload();
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Erinnerung schließen" }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(reminder).toHaveCount(0);

  await visit(); // 4th
  await expect(reminder).toHaveCount(0);
  await visit(9); // 10th: once more
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Erinnerung schließen" }).click();
  await visit(30); // never again
  await expect(reminder).toHaveCount(0);
});

test("opens with the own class; other classes are only looked at", async ({ page, context }) => {
  await page.goto("/");
  // The first class picked becomes the own class.
  await chooseClass(page, "5A");
  await expect(page.locator("main").getByText("Meine Klasse", { exact: true })).toBeVisible();
  await chooseClass(page, "7B");
  await expect(page.locator("main").getByText("Andere Klasse", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nur angesehen · deine Klasse: 5A/)).toBeVisible();
  // Notifications are about the own class: not offered while another is looked at.
  await expect(page.getByRole("group", { name: "Benachrichtigungen" })).toHaveCount(0);
  // Kept while the app stays open.
  await page.reload();
  await expect(page.locator("h1")).toHaveText("7B");

  // Back with one tap; no list of recent classes.
  await page.getByRole("button", { name: "Zurück zur 5A" }).click();
  await expect(page.locator("h1")).toHaveText("5A");
  await expect(page.getByRole("group", { name: "Benachrichtigungen" })).toBeVisible();
  await expect(page.getByText("Nur angesehen", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Zuletzt:")).toHaveCount(0);

  // Opened anew, the app shows the own class again.
  await chooseClass(page, "7B");
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.locator("h1")).toHaveText("5A");

  // The own class is changed in the settings.
  await reopened.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = reopened.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.getByLabel("Meine Klasse")).toHaveValue("5A");
  await dialog.getByLabel("Meine Klasse").selectOption("9C");
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(reopened.locator("h1")).toHaveText("9C");
  await expect(reopened.locator("main").getByText("Meine Klasse", { exact: true })).toBeVisible();
});

test.describe("first start", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("introduces the app once and sets the own class", async ({ page }) => {
    await page.goto("/");
    const intro = page.getByRole("dialog");
    await expect(intro.getByRole("heading", { name: "Willkommen!" })).toBeVisible();
    // In the browser it says right away that no app store is needed.
    await expect(intro.getByText("Kein App Store nötig")).toBeVisible();
    await intro.getByRole("button", { name: "Los geht’s" }).click();

    await expect(intro.getByRole("heading", { name: "Deine Klasse" })).toBeVisible();
    await expect(intro.getByRole("button", { name: "Weiter" })).toBeDisabled();
    await intro.getByRole("radio", { name: "Q1" }).click();
    await expect(intro.getByRole("radio", { name: "Q1" })).toHaveAttribute("aria-checked", "true");
    await intro.getByRole("button", { name: "Weiter" }).click();

    // Upper school: the courses, chosen by their teachers from the plan.
    await expect(intro.getByRole("heading", { name: "Deine Kurse" })).toBeVisible();
    await expect(intro.getByRole("button", { name: "Alle Kurse zeigen" })).toBeVisible();
    await intro.getByRole("button", { name: "RUK", exact: true }).click();
    await expect(intro.getByRole("button", { name: "RUK", exact: true })).toHaveAttribute("aria-pressed", "true");
    await intro.getByRole("button", { name: "Weiter" }).click();

    // In the browser: how to install it as an app. Here (a computer, which
    // shares its storage with the installed app) after choosing the class.
    await expect(intro.getByRole("heading", { name: "Als App installieren" })).toBeVisible();
    await expect(intro.getByText(/nicht im App Store oder bei Google Play/)).toBeVisible();
    // Steps for this browser (Chrome on a computer).
    await expect(intro.getByText("Seite als App installieren", { exact: true })).toBeVisible();
    await expect(intro.getByText(/Dort wählst du deine Klasse/)).toHaveCount(0);
    await expect(intro.getByText("Danach geht es in der installierten App mit dieser Einführung weiter.")).toBeVisible();
    await expect(intro.getByRole("button", { name: "Erst mal ohne Installieren weiter" })).toBeInViewport();
    await intro.getByRole("button", { name: "Erst mal ohne Installieren weiter" }).click();

    await expect(intro.getByRole("heading", { name: "Nichts mehr verpassen" })).toBeVisible();
    await expect(intro.getByRole("button", { name: "Benachrichtigungen einschalten" })).toBeVisible();
    await intro.getByRole("button", { name: "Später" }).click();

    await expect(intro.getByRole("heading", { name: "Gut zu wissen" })).toBeVisible();
    // No refresh button any more: the introduction explains swiping down.
    await expect(intro.getByText(/von oben nach unten wischen/)).toBeVisible();
    await intro.getByRole("button", { name: "Fertig" }).click();
    await expect(intro).toBeHidden();
    await expect(page.locator("h1")).toHaveText("Q1");
    await expect(page.locator("main").getByText("Meine Lehrkräfte", { exact: true }).locator("..")).toContainText(
      "RUK",
    );
    await expect(page.getByRole("button", { name: "Aktualisieren" })).toHaveCount(0);
    // The note about the room plan waits for the next opening: one thing at a time.
    const roomPlanIntro = page.getByRole("dialog", { name: "Raumplan", exact: true });
    await expect(roomPlanIntro).toHaveCount(0);

    // Only once.
    await page.reload();
    await expect(page.locator("h1")).toHaveText("Q1");
    await expect(page.getByRole("heading", { name: "Willkommen!" })).toHaveCount(0);
    await roomPlanIntro.getByRole("button", { name: "Alles klar" }).click();
    await expect(roomPlanIntro).toHaveCount(0);

    // Can be watched again from the settings; Escape skips it.
    await openSettings(page, "Über die App");
    await page.getByRole("button", { name: "Einführung nochmal ansehen" }).click();
    await expect(page.getByRole("heading", { name: "Willkommen!" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Willkommen!" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Willkommen!" })).toHaveCount(0);
  });

  test("can be skipped without choosing a class", async ({ page }) => {
    await page.goto("/");
    const intro = page.getByRole("dialog");
    await intro.getByRole("button", { name: "Los geht’s" }).click();
    await intro.getByRole("button", { name: "Später festlegen" }).click();
    await intro.getByRole("button", { name: "Erst mal ohne Installieren weiter" }).click();
    await expect(intro.getByText(/Lege zuerst deine Klasse fest/)).toBeVisible();
    await intro.getByRole("button", { name: "Weiter" }).click();
    await intro.getByRole("button", { name: "Fertig" }).click();
    await expect(page.locator("h1")).toHaveText("Klasse wählen");
    // The first class picked on the page becomes the own class.
    await chooseClass(page, "6D");
    await page.getByRole("button", { name: "Einstellungen" }).click();
    await expect(page.getByRole("dialog", { name: "Einstellungen" }).getByLabel("Meine Klasse")).toHaveValue("6D");
  });

  test("on an iPhone offers installing before the class", async ({ browser }) => {
    const iphone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await iphone.newPage();
    await page.clock.setFixedTime(TODAY);
    await page.goto("/");
    const intro = page.getByRole("dialog");
    await intro.getByRole("button", { name: "Los geht’s" }).click();
    // The installed app on an iPhone keeps its own storage: installing first,
    // so the class is chosen only once, in the app.
    await expect(intro.getByRole("heading", { name: "Als App installieren" })).toBeVisible();
    await expect(intro.getByText(/Dort wählst du deine Klasse/)).toBeVisible();
    // The way on stays in sight below the long Safari steps.
    const onward = intro.getByRole("button", { name: "Erst mal ohne Installieren weiter" });
    await expect(onward).toBeInViewport();
    // Escape does not end the introduction before the class is chosen.
    await page.keyboard.press("Escape");
    await expect(intro.getByRole("heading", { name: "Deine Klasse" })).toBeVisible();
    await iphone.close();
  });
});

test("filters the upper school by the student's teachers", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "Q1");
  const all = await page.locator("article").count();

  // The main page only shows the choice and links to the settings.
  await expect(page.locator("main").getByText("Alle Kurse der Q1")).toBeVisible();
  await expect(page.locator("main #teacher-input")).toHaveCount(0);
  await page.getByRole("button", { name: "Festlegen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  const teachers = dialog.locator("#settings-teachers");
  await expect(teachers).toBeInViewport();
  await expect(dialog.getByRole("heading", { name: "Meine Lehrkräfte" })).toBeVisible();
  await expect(teachers).toContainText("Oberstufe (Q1)");

  await teachers.locator("#teacher-input").fill("k1");
  await teachers.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(teachers.getByText("Bitte ein Kürzel")).toBeVisible();
  await teachers.locator("#teacher-input").fill("ruk");
  await teachers.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(teachers).toContainText("Gezeigt werden die Kurse von RUK.");
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();

  const own = plan.entries.filter(
    (entry) =>
      entry.date === "2026-10-08" &&
      entryAppliesToClass(entry.className, "Q1") &&
      (entry.teacher === "RUK" || (!entry.teacher && entry.text.includes("RUK"))),
  ).length;
  expect(own).toBeGreaterThan(0);
  await expect(page.locator("article")).toHaveCount(own);
  await expect(page.getByRole("button", { name: "Ändern" })).toBeVisible();
  await expect(page.getByText(/aus anderen Kursen\s+(ist|sind)\s+ausgeblendet/)).toBeVisible();

  await page.getByRole("button", { name: "Anzeigen" }).click();
  await expect(page.locator("article")).toHaveCount(all);
  await page.getByRole("button", { name: "Ausblenden" }).click();
  await expect(page.locator("article")).toHaveCount(own);

  await page.reload();
  await expect(page.locator("article")).toHaveCount(own);
  await chooseClass(page, "Q2");
  await expect(page.locator("main").getByText("Alle Kurse der Q2")).toBeVisible();
  await chooseClass(page, "9A");
  await expect(page.locator("main").getByText("Meine Lehrkräfte")).toHaveCount(0);
  // Not an upper-school class: the settings show the own class's courses,
  // which the notifications follow.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await dialog.getByRole("button", { name: /^Meine Lehrkräfte \(Q1\)/ }).click();
  await expect(dialog.locator("#settings-teachers")).toContainText("Oberstufe (Q1)");
});

test("marks changes that are new since the last visit", async ({ page }) => {
  // Tall enough that every badge is fully on screen (only then they fade).
  await page.setViewportSize({ width: 390, height: 2000 });
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

  // Once they have been on screen for a few seconds, they fade out softly,
  // and stay away for this visit.
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(0, { timeout: 12_000 });
  await expect(page.getByText(/\d neu$/)).toHaveCount(0);
  await page.getByRole("tab").nth(1).click();
  await page.getByRole("tab").nth(0).click();
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(0);
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

  // Even if the page is rebuilt and the attribute reset (as React does after a
  // hydration mismatch), the chosen theme comes back at once.
  await page.evaluate(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Helles Design" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  // "Automatisch" (in the settings) follows the system setting.
  await openSettings(page, "Anzeige");
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

test("opens at once from the cache, also on the day of a notification", async ({ page }) => {
  // A proxy in front of the app that can answer pages slowly, like a server
  // after a cold start (also for the service worker's own requests).
  let slow = false;
  const proxy = createServer((request, response) => {
    const forward = () => {
      const upstream = httpRequest(
        { host: "localhost", port: APP_PORT, path: request.url, method: request.method, headers: request.headers },
        (answer) => {
          response.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(response);
        },
      );
      upstream.on("error", () => response.destroy());
      request.pipe(upstream);
    };
    if (slow && (request.headers.accept ?? "").includes("text/html")) {
      setTimeout(forward, 5_000);
    } else {
      forward();
    }
  });
  await new Promise<void>((resolve) => proxy.listen(0, resolve));
  const origin = `http://localhost:${(proxy.address() as AddressInfo).port}`;
  try {
    await page.goto(`${origin}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await chooseClass(page, "5A");

    slow = true;
    const started = Date.now();
    await page.goto(`${origin}/?day=2026-10-09`);
    await expect(page.locator("h1")).toHaveText("5A");
    expect(Date.now() - started).toBeLessThan(2_500);
    // The day from the notification's address, although the cached page has none.
    await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");

    // Opened normally afterwards (home screen icon): the default day again,
    // not the notification's day from a page cached in the background.
    slow = false;
    // The service worker's background update (delayed by the slow proxy).
    await page.waitForTimeout(6_500);
    await page.goto(`${origin}/`);
    await expect(page.locator("h1")).toHaveText("5A");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");
    await page.reload();
    await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");
  } finally {
    proxy.closeAllConnections();
    proxy.close();
  }
});

test("shows a new version right after opening, or once the app is left", async ({ context }) => {
  // A proxy that can pretend a new deploy: its pages then carry another
  // deploy id (the service worker compares those).
  let version = 0;
  let pageDelay = 0;
  const proxy = createServer((request, response) => {
    const forward = () => {
      const upstream = httpRequest(
        {
          host: "localhost",
          port: APP_PORT,
          path: request.url,
          method: request.method,
          // Uncompressed, so the pages can be changed.
          headers: { ...request.headers, "accept-encoding": "identity" },
        },
        (answer) => {
          const isPage = (answer.headers["content-type"] ?? "").includes("text/html");
          if (!isPage || version === 0) {
            response.writeHead(answer.statusCode ?? 502, answer.headers);
            answer.pipe(response);
            return;
          }
          const chunks: Buffer[] = [];
          answer.on("data", (chunk: Buffer) => chunks.push(chunk));
          answer.on("end", () => {
            const html = Buffer.concat(chunks)
              .toString()
              .replace(/(name="kag-build" content=")/, `$1deploy-${version}-`);
            const headers = { ...answer.headers };
            delete headers["content-length"];
            delete headers["content-encoding"];
            response.writeHead(answer.statusCode ?? 502, headers);
            response.end(html);
          });
        },
      );
      upstream.on("error", () => response.destroy());
      request.pipe(upstream);
    };
    // The start page, also as fetched by the service worker (Accept: */*).
    if (pageDelay && new URL(request.url ?? "/", "http://x").pathname === "/") {
      setTimeout(forward, pageDelay);
    } else {
      forward();
    }
  });
  await new Promise<void>((resolve) => proxy.listen(0, resolve));
  const origin = `http://localhost:${(proxy.address() as AddressInfo).port}`;
  // False while the page is just reloading.
  const shows = (page: Page, deploy: number) =>
    page
      .evaluate(
        (marker) => document.querySelector('meta[name="kag-build"]')?.getAttribute("content")?.startsWith(marker),
        `deploy-${deploy}-`,
      )
      .catch(() => false);
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(TODAY);
    await page.goto(`${origin}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // No new version: no reload (a reload would drop the mark).
    await page.goto(`${origin}/`);
    await page.evaluate(() => {
      (window as unknown as { kagMark?: boolean }).kagMark = true;
    });
    await page.waitForTimeout(3_000);
    expect(await page.evaluate(() => (window as unknown as { kagMark?: boolean }).kagMark)).toBe(true);

    // A deploy; the app is opened and not touched: it reloads by itself.
    version = 1;
    await page.goto(`${origin}/`);
    expect(await shows(page, 1)).toBe(false); // the cached version first
    await expect.poll(() => shows(page, 1), { timeout: 10_000 }).toBe(true);

    // Another deploy while someone is using the app: no reload under the
    // finger, but once the app is left.
    const second = await context.newPage();
    await second.clock.setFixedTime(TODAY);
    version = 2;
    // The new version arrives a little later, after the first tap.
    pageDelay = 2_500;
    await second.goto(`${origin}/`);
    // Once the app is ready (the introduction opens), any tap counts as using it.
    await expect(second.getByRole("dialog")).toBeVisible();
    await second.mouse.click(5, 5);
    await second.waitForTimeout(3_000);
    expect(await shows(second, 2)).toBe(false);
    await second.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => shows(second, 2), { timeout: 10_000 }).toBe(true);
  } finally {
    proxy.closeAllConnections();
    proxy.close();
  }
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
  expect(lines.slice(0, 2)).toEqual([
    "📋 *Vertretungsplan 5A*",
    `Heute, Donnerstag, 08.10. · ${fiveA.length} Änderungen`,
  ]);
  // One block per change (with a symbol and the lesson in bold), separated by
  // blank lines.
  expect(shared[0].text!.split("\n\n")).toHaveLength(fiveA.length + 2);
  expect(lines.filter((line) => / \*[^*]+ Std\.\* · /.test(line))).toHaveLength(fiveA.length);
  expect(lines.at(-2)).toMatch(/^🕐 Stand der Schule: /);
  // Whoever gets the message finds the app, at this class.
  const origin = new URL(page.url()).origin;
  expect(lines.at(-1)).toBe(`📲 Ganzer Plan: ${origin}/?klasse=5A`);
  // Only the text: no separate title or link for the share menu to add.
  expect(shared[0].title).toBeUndefined();
  expect(shared[0].url).toBeUndefined();

  // A day without changes: one larger button in the card, saying so.
  await chooseClass(page, "9B");
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByText("Keine Änderungen", { exact: true })).toBeVisible();
  const share = page.getByRole("button", { name: "Teilen" });
  await expect(share).toHaveCount(1);
  await share.click();
  const empty = await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared.at(-1)!.text!);
  expect(empty).toMatch(/^📋 \*Vertretungsplan 9B\*\nMorgen, Freitag, 09\.10\.\n\n✅ Keine Änderungen, alles nach Stundenplan\./);

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
  expect(copied).toMatch(/^📋 \*Vertretungsplan 5A\*\nMorgen, Freitag, 09\.10\. · \d+ Änderung/);
  // Only the app's own address (at this class), so whoever gets it can find the plan.
  expect(copied.match(/https?:\/\/\S+/g)).toEqual([`${new URL(desktop.url()).origin}/?klasse=5A`]);
});

test("settings: an overview with a few pages, and the app version", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  const dialog = await openSettings(page);
  await expect(dialog.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(dialog.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  // Details only on their pages.
  await expect(dialog.getByRole("heading", { name: "Textgröße" })).toHaveCount(0);

  await dialog.getByRole("button", { name: /^Anzeige/ }).click();
  await expect(dialog.getByRole("heading", { name: "Anzeige" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Textgröße" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Zurück zu den Einstellungen" })).toBeFocused();

  // Back: the overview, with the focus on the row that led away.
  await dialog.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
  await expect(dialog.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Anzeige/ })).toBeFocused();

  // Closed on a page, it opens at the overview again.
  await dialog.getByRole("button", { name: /^Über die App/ }).click();
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
});

test("settings: next day hour and new badges", async ({ page }) => {
  // Thursday 15:30: before the default switch at 16:00 today is shown.
  await page.clock.setFixedTime(new Date("2026-10-08T15:30:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");

  const dialog = await openSettings(page, "Anzeige");
  await dialog.getByText("15 Uhr", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");

  // Kept after a reload; "Nie" stays on today.
  await page.reload();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");
  await openSettings(page, "Anzeige");
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
  await openSettings(page, "Anzeige");
  const badgeSwitch = dialog.getByRole("switch", { name: "Neue Änderungen markieren" });
  await expect(badgeSwitch).toBeChecked();
  await dialog.getByText("Neue Änderungen markieren").click();
  await expect(badgeSwitch).not.toBeChecked();
  // A tap next to the sheet closes it.
  await page.mouse.click(200, 30);
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(0);
});

test("a dot on another day's tab when something is new there", async ({ page }) => {
  // A class with changes tomorrow; one of them not seen yet.
  const schoolClass = SCHOOL_CLASSES.find((name) =>
    plan.entries.some((entry) => entry.date === "2026-10-09" && entryAppliesToClass(entry.className, name)),
  )!;
  await page.goto("/");
  await chooseClass(page, schoolClass);
  const tomorrow = page.getByRole("tab").nth(1);
  await expect(tomorrow).not.toContainText("neu");
  const unseen = plan.entries
    .filter((entry) => entry.date === "2026-10-09" && entryAppliesToClass(entry.className, schoolClass))
    .slice(0, 1)
    .map(entryKey);
  await page.evaluate((keys) => {
    const seen = JSON.parse(localStorage.getItem("kag:seen-entries") ?? "[]") as string[];
    localStorage.setItem("kag:seen-entries", JSON.stringify(seen.filter((key) => !keys.includes(key))));
  }, unseen);
  await page.reload();
  // Today is shown; tomorrow's tab carries the dot (read out as "neu").
  await expect(page.getByRole("tab", { selected: true })).toContainText("Heute");
  await expect(tomorrow).toContainText("neu");
  // Looked at, it goes there the "Neu" badge on the card instead.
  await tomorrow.click();
  await expect(page.getByText("Neu", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("tab").nth(1)).not.toContainText(", neu");
});

test("settings: swipe down closes the sheet without refreshing", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-08T08:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");

  // "Immer" shows the next school day right away.
  const dialog = await openSettings(page, "Anzeige");
  await dialog.getByText("Immer", { exact: true }).click();
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");

  const forced: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("force=1")) forced.push(request.url());
  });
  await settled(dialog);
  // Choosing "Immer" may have scrolled the sheet's content; swipes start at its top.
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  const cdp = await context.newCDPSession(page);
  const box = (await dialog.boundingBox())!;
  const x = box.x + box.width / 2;
  const swipe = async (from: number, to: number) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: from + ((to - from) * step) / 8 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };

  // A short pull springs back.
  await swipe(box.y + 30, box.y + 60);
  await page.waitForTimeout(300);
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.y).toBeCloseTo(box.y, 0);
  // A real swipe closes it.
  await swipe(box.y + 30, box.y + 330);
  await expect(dialog).toBeHidden();
  expect(forced).toEqual([]);

  // It opens normally again (at the overview, which is shorter): resting on
  // the bottom edge, not left pushed down by the swipe.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await settled(dialog);
  const reopened = (await dialog.boundingBox())!;
  expect(reopened.y + reopened.height).toBeCloseTo(box.y + box.height, 0);
  await context.close();
});

test("settings: page stays still, text size, install hint and reset", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-08T08:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "9A");
  await expect(page.locator("article")).toHaveCount(6);
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);

  // Without Playwright scrolling the button into view first.
  await page.getByRole("button", { name: "Einstellungen" }).dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.body.style.top)).toBe(`-${400}px`);

  // Wheel and touch scrolling over the sheet do not move the page behind it.
  await settled(dialog);
  const box = (await dialog.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.wheel(0, -600);
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + 300 }] });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: box.y + 300 - step * 40 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.body.style.position)).toBe("fixed");

  // Larger text, kept after a reload and applied before the first paint.
  await dialog.getByRole("button", { name: /^Anzeige/ }).click();
  await dialog.getByText("Groß", { exact: true }).click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("18px");
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await expect(dialog).toBeHidden();
  // The page is back where it was.
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("18px");
  // Also restored if the page is rebuilt.
  await page.evaluate(() => document.documentElement.removeAttribute("style"));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe("18px");

  // In the browser (not installed): how to install.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(dialog.getByText("Als App installieren", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /^Über die App/ }).click();
  await expect(dialog.getByRole("link", { name: "Original-Plan der Schule öffnen" })).toBeVisible();

  // Reset asks first, then forgets everything.
  await dialog.getByRole("button", { name: "App zurücksetzen …" }).click();
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("h1")).toHaveText("9A");
  await dialog.getByRole("button", { name: "App zurücksetzen …" }).click();
  await dialog.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
  // Like a first start: with the introduction.
  await expect(page.getByRole("heading", { name: "Willkommen!" })).toBeVisible();
  await expect(page.locator("h1")).toHaveText("Klasse wählen");
  // Choices are gone (the app stores a fresh offline copy right away).
  const kept = await page.evaluate(() => Object.keys(localStorage));
  for (const key of ["kag:selected-class", "kag:settings", "kag:theme", "kag:recent-classes", "kag:onboarded"]) {
    expect(kept).not.toContain(key);
  }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("16px");
  await context.close();
});

test("settings: the header can be swiped even when scrolled down", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  // Both daily overviews on: their times make the page long enough to scroll.
  await page.evaluate(() =>
    localStorage.setItem("kag:settings", JSON.stringify({ eveningSummary: true, morningSummary: true })),
  );
  await page.reload();
  await chooseClass(page, "Q1");
  const dialog = await openSettings(page, "Benachrichtigungen");
  await settled(dialog);
  await dialog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  // "Fertig" stays visible.
  await expect(dialog.getByRole("button", { name: "Fertig" })).toBeInViewport();

  await settled(dialog);
  const header = (await dialog.locator("[data-sheet-header]").boundingBox())!;
  const x = header.x + header.width / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: header.y + 10 }] });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: header.y + 10 + step * 40 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(dialog).toBeHidden();
  await context.close();
});

test("smooth scrolling: no blocking touch listener, pull to refresh still works", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await chooseClass(page, "9A");
  const cdp = await context.newCDPSession(page);

  // Touch listeners on the page must be passive, or every scroll step waits for JavaScript.
  const { result } = await cdp.send("Runtime.evaluate", { expression: "window" });
  const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId! });
  // Only touchstart/touchmove can hold up scrolling.
  const touch = listeners.filter((listener) => ["touchstart", "touchmove"].includes(listener.type));
  expect(touch.length).toBeGreaterThan(0);
  expect(touch.filter((listener) => !listener.passive)).toEqual([]);

  // Pulling down at the top refreshes from the school website.
  const forced = page.waitForRequest((request) => request.url().includes("force=1"));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 150 }] });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 150 + step * 30 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await forced;
  await context.close();
});

test("large screens: all days side by side, phones keep their view", async ({ page }) => {
  // Phones (also in landscape), a tablet held upright and a low window: the phone view.
  for (const [width, height] of [[390, 844], [932, 430], [820, 1180], [1366, 599]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#class-selector"), `${width}x${height}`).toBeVisible();
    await expect(page.locator("#desktop-class-selector"), `${width}x${height}`).toHaveCount(0);
  }

  // Computer: a bar at the top and every day of the plan as a column.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#class-selector")).toHaveCount(0);
  await page.locator("#desktop-class-selector").selectOption("5A");
  await expect(page.locator("h1")).toHaveText("5A");
  const today = page.getByRole("region", { name: /Heute.*Donnerstag, 08\.10\./ });
  const tomorrow = page.getByRole("region", { name: /Morgen.*Freitag, 09\.10\./ });
  // Measured once the opening animation has finished (it moves the columns).
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  const todayBox = (await today.boundingBox())!;
  const tomorrowBox = (await tomorrow.boundingBox())!;
  expect(tomorrowBox.x).toBeGreaterThan(todayBox.x + todayBox.width);
  expect(Math.abs(tomorrowBox.y - todayBox.y)).toBeLessThan(2);
  // Each column shows the changes of its own day, as the phone view does per day.
  for (const [region, date] of [[today, "2026-10-08"], [tomorrow, "2026-10-09"]] as const) {
    const expected = plan.entries.filter(
      (entry) => entry.date === date && entryAppliesToClass(entry.className, "5A"),
    ).length;
    await expect(region.locator("article")).toHaveCount(expected);
  }

  // Settings open as a dialog in the middle.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await settled(dialog);
  const sheet = (await dialog.boundingBox())!;
  expect(Math.abs(sheet.x + sheet.width / 2 - 720)).toBeLessThan(2);
  expect(900 - (sheet.y + sheet.height)).toBeGreaterThan(20);
  await dialog.getByRole("button", { name: "Fertig" }).click();

  // A narrower window switches to the phone view, with the class kept.
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.locator("#class-selector")).toHaveValue("5A");
  await expect(page.locator("#desktop-class-selector")).toHaveCount(0);
});

test("security policy: pages carry a nonce policy, and nothing in the app is blocked", async ({ page }) => {
  // Every blocked script, style, image or request is recorded.
  await page.addInitScript(() => {
    const blocked: string[] = [];
    (window as unknown as { __blocked: string[] }).__blocked = blocked;
    document.addEventListener("securitypolicyviolation", (event) =>
      blocked.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  const blocked = () => page.evaluate(() => (window as unknown as { __blocked: string[] }).__blocked);

  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"];
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).toContain("worker-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  // A new nonce for every page view.
  const again = (await page.request.get("/")).headers()["content-security-policy"];
  expect(again).not.toBe(policy);

  await chooseClass(page, "Q1");
  const dialog = await openSettings(page);
  for (const section of ["Benachrichtigungen", "Anzeige", "Meine Lehrkräfte", "Als App installieren", "Über die App"]) {
    await dialog.getByRole("button", { name: new RegExp(`^${section}`) }).click();
    await dialog.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
  }
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#desktop-class-selector")).toBeVisible();
  expect(await blocked()).toEqual([]);

  await page.goto("/teilen");
  await expect(page.getByRole("button", { name: "Aushang drucken" })).toBeVisible();
  expect(await blocked()).toEqual([]);

  // The introduction (also on a first start the theme script runs).
  await page.evaluate(() => localStorage.removeItem("kag:onboarded"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Willkommen!" })).toBeVisible();
  expect(await page.locator("html").getAttribute("data-theme")).toMatch(/^(light|dark)$/);
  expect(await blocked()).toEqual([]);

});

test("security policy: a script smuggled into the page does not run", async ({ browser }) => {
  // Without the service worker, so that the page goes through page.route.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  // As if an attacker got a script into the HTML: the real page and its real policy.
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("</body>", "<script>window.__injected = true;</script></body>");
    await route.fulfill({ response, body: html });
  });
  await page.addInitScript(() => {
    const blocked: string[] = [];
    (window as unknown as { __blocked: string[] }).__blocked = blocked;
    document.addEventListener("securitypolicyviolation", (event) => blocked.push(event.violatedDirective));
  });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __blocked: string[] }).__blocked))
    .toContainEqual(expect.stringMatching(/^script-src/));
  await context.close();
});

test("too old devices get a plain hint with the school's own plan", async ({ page }) => {
  // Current browsers: no hint.
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  // As in Safari before 16.4 / 16.0: a feature the app needs is missing.
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
  });
  await page.reload();
  const hint = page.getByRole("alertdialog", { name: "Dein Gerät ist zu alt für die App" });
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("iOS 16.4");
  await expect(hint.getByRole("link", { name: "Plan der Schule öffnen" })).toHaveAttribute(
    "href",
    "https://monitor2020.meckenheim-kag.com/schueler/subst_001.htm",
  );
  // In case a browser is wrongly taken for an old one: closed for good.
  await hint.getByRole("button", { name: "Trotzdem versuchen" }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
