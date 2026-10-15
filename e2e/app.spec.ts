import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { SCHOOL_CLASSES, entryAppliesToClass } from "@/lib/entries";
import { entryKey } from "@/lib/seen";
import type { SubstitutionPayload } from "@/lib/types";
import { APP_PORT } from "./constants";

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
  await expect(page.locator("header")).toContainText(/geprüft (gerade eben|vor \d+ Min\.)/);

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
  // Christi Himmelfahrt 2027 (Thursday); the saved plan is from 08./09.10.2026.
  await page.clock.setFixedTime(new Date("2027-05-06T09:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");
  const header = page.locator("header");
  await expect(header).toContainText("Christi Himmelfahrt");
  await expect(header).toContainText("Feiertag");
  const card = page.getByRole("region", { name: "Schönen Feiertag!" });
  await expect(card).toContainText("Heute ist Christi Himmelfahrt, schulfrei.");
  await expect(card).toContainText("Der Plan für Fr., 07.05. erscheint hier");
});

test("links the legal pages and offers a QR code to pass the app on", async ({ page }) => {
  await page.goto("/");
  await chooseClass(page, "5A");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.getByRole("link", { name: "Impressum" })).toHaveAttribute(
    "href",
    "https://support-vertretung-kag.vercel.app/impressum",
  );
  await expect(dialog.getByRole("link", { name: "Datenschutz" })).toHaveAttribute(
    "href",
    "https://support-vertretung-kag.vercel.app/datenschutz",
  );
  await expect(dialog.getByRole("button", { name: "Feedback senden oder Fehler melden" })).toBeVisible();
  await page.getByRole("link", { name: "QR-Code zeigen" }).click();
  await expect(page).toHaveURL(/\/teilen$/);
  const origin = new URL(page.url()).origin;
  await expect(page.getByRole("img", { name: `QR-Code für ${origin}/` })).toBeVisible();
  await expect(page.getByText(origin.replace(/^https?:\/\//, ""), { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aushang drucken" })).toBeVisible();

  await page.getByRole("link", { name: "← Zurück zur App" }).click();
  await expect(page.locator("header")).toContainText("5A");
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
    await page.getByRole("button", { name: "Einstellungen" }).click();
    const card = page.getByRole("dialog", { name: "Einstellungen" }).locator("section", { hasText: "Als App installieren" });
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
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const card = page.getByRole("dialog", { name: "Einstellungen" }).locator("section", { hasText: "Als App installieren" });
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
  await expect(page.getByText(/Nur angesehen\..*gilt weiter die 5A/)).toBeVisible();
  // Kept while the app stays open.
  await page.reload();
  await expect(page.locator("h1")).toHaveText("7B");

  // Back with one tap; no list of recent classes.
  await page.getByRole("button", { name: "Zurück zur 5A" }).click();
  await expect(page.locator("h1")).toHaveText("5A");
  await expect(page.getByText("Nur angesehen.")).toHaveCount(0);
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

    // Only once.
    await page.reload();
    await expect(page.locator("h1")).toHaveText("Q1");
    await expect(page.getByRole("heading", { name: "Willkommen!" })).toHaveCount(0);

    // Can be watched again from the settings; Escape skips it.
    await page.getByRole("button", { name: "Einstellungen" }).click();
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
  await expect(teachers).toContainText("Oberstufe: Meine Lehrkräfte (Q1)");

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
  await expect(dialog.locator("#settings-teachers")).toContainText("Meine Lehrkräfte (Q1)");
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
  // Whoever gets the message can find the app.
  expect(lines.at(-1)).toBe(`📲 Ganzer Plan: ${new URL(page.url()).origin}/`);
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
  // Only the app's own address, so whoever gets it can find the app.
  expect(copied.match(/https?:\/\/\S+/g)).toEqual([`${new URL(desktop.url()).origin}/`]);
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

test("settings: swipe down closes the sheet without refreshing", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-08T08:00:00+02:00"));
  await page.goto("/");
  await chooseClass(page, "5A");

  // "Immer" shows the next school day right away.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
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

  // It opens normally again.
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await settled(dialog);
  expect((await dialog.boundingBox())!.y).toBeCloseTo(box.y, 0);
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
  await chooseClass(page, "Q1");
  await page.getByRole("button", { name: "Festlegen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.locator("#settings-teachers")).toBeInViewport();
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
