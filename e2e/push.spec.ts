import { createECDH, randomBytes, type ECDH } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { startFakePushService, type ReceivedPush } from "../tests/fake-push-service";
import { CRON_SECRET, FIXTURE_URL } from "./constants";

// web-push's own encryption library, used here to read pushes like a phone.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as {
  decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer;
};

type Device = {
  ecdh: ECDH;
  authSecret: Buffer;
  subscription: { endpoint: string; expirationTime: null; keys: { p256dh: string; auth: string } };
};

/** Keys and endpoint like a browser's push subscription. */
function createDevice(endpoint: string): Device {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const authSecret = randomBytes(16);
  return {
    ecdh,
    authSecret,
    subscription: {
      endpoint,
      expirationTime: null,
      keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") },
    },
  };
}

function read(device: Device, push: ReceivedPush) {
  const text = ece.decrypt(push.body, {
    version: "aes128gcm",
    privateKey: device.ecdh,
    authSecret: device.authSecret,
  });
  return JSON.parse(text.toString("utf8")) as { title: string; body: string; url: string };
}

/**
 * Headless Chromium cannot reach a real push service, so the browser's
 * PushManager hands out the test device's subscription instead. Everything
 * else (app, server, encryption, delivery) is real.
 */
async function useDevice(context: BrowserContext, device: Device) {
  await context.grantPermissions(["notifications"]);
  await context.addInitScript((subscription) => {
    const KEY = "e2e:push-subscribed";
    const make = () => ({
      endpoint: subscription.endpoint,
      expirationTime: null,
      options: {},
      toJSON: () => subscription,
      getKey: () => null,
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    });
    PushManager.prototype.subscribe = async function () {
      localStorage.setItem(KEY, "1");
      return make() as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      return (localStorage.getItem(KEY) ? make() : null) as unknown as PushSubscription;
    };
  }, device.subscription);
}

async function check(request: APIRequestContext) {
  const response = await request.get("/api/push/check", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

/** Makes the fixture server serve a changed plan, as after a new upload. */
async function changePlan(request: APIRequestContext, page: number, find: string, replace: string) {
  const response = await request.post(`${FIXTURE_URL}/__override`, { data: { page, find, replace } });
  expect(response.status()).toBe(204);
}

const row = (className: string, lesson: string, type: string, substitute: string) =>
  `<td class="list" align="center">${className}</td><td class="list" align="center">${lesson}</td>` +
  `<td class="list" align="center">${type}</td><td class="list" align="center">${substitute}</td>`;

async function waitForPushes(received: ReceivedPush[], path: string, count: number) {
  await expect.poll(() => received.filter((push) => push.path === path).length).toBe(count);
  return received.filter((push) => push.path === path);
}

async function chooseClass(page: Page, schoolClass: string) {
  await page.locator("#class-selector").selectOption(schoolClass);
  await expect(page.locator("h1")).toHaveText(schoolClass);
}

test.afterEach(async ({ request }) => {
  await request.post(`${FIXTURE_URL}/__reset`);
});

test("notifies the right devices about changes, also a second upload", async ({ page, context, request }) => {
  const service = await startFakePushService();
  try {
    const phone = createDevice(`${service.url}/phone`);
    const other = createDevice(`${service.url}/other-7b`);
    await useDevice(context, phone);

    await page.goto("/");
    await chooseClass(page, "5A");
    const settings = page.getByRole("group", { name: "Benachrichtigungen" });
    await settings.getByRole("button", { name: "Einschalten" }).click();
    await expect(settings).toContainText("An: Du bekommst eine Mitteilung, wenn sich der Plan für 5A ändert.");

    // A confirmation reaches the device right away.
    const [welcome] = await waitForPushes(service.received, "/phone", 1);
    expect(read(phone, welcome).title).toBe("Benachrichtigungen sind an");

    // A second device, for 7B.
    const response = await request.post("/api/push/subscribe", {
      data: { subscription: other.subscription, schoolClass: "7B", teachers: [] },
    });
    expect(response.status()).toBe(200);
    await waitForPushes(service.received, "/other-7b", 1);

    // The first check only records the plan.
    expect(await check(request)).toMatchObject({ status: "initialized" });

    // The school changes a lesson of 5A/5B for tomorrow.
    await changePlan(
      request,
      4,
      row("05AB", "3 - 4", "Statt-Vertretung", "SKA"),
      row("05AB", "3 - 4", "Entfall", "---"),
    );
    expect(await check(request)).toMatchObject({ status: "checked", added: 1, removed: 1, notified: 1 });
    const [, change] = await waitForPushes(service.received, "/phone", 2);
    expect(read(phone, change)).toEqual({
      title: "5A · Morgen 3.–4. Std.",
      body: "Jetzt: Entfall · 5AB · SVA · Raum 004 (vorher Statt-Vertretung)",
      url: "/?day=2026-10-09",
      badgeCount: 1,
    });
    // Nothing for 7B, and nothing twice.
    expect(await check(request)).toMatchObject({ status: "checked", added: 0, notified: 0 });
    expect(service.received.filter((push) => push.path === "/other-7b")).toHaveLength(1);

    // Switching the class in the app moves the notifications along.
    const synced = page.waitForResponse(
      (response) => response.url().endsWith("/api/push/subscribe") && response.status() === 200,
    );
    await chooseClass(page, "7B");
    await synced;
    await expect(settings).toContainText("für 7B ändert");
    await changePlan(
      request,
      4,
      row("07B", "5 - 6", "Statt-Vertretung", "HSR"),
      row("07B", "5 - 6", "Vertretung", "KER"),
    );
    expect(await check(request)).toMatchObject({ status: "checked", notified: 2 });
    const [, , moved] = await waitForPushes(service.received, "/phone", 3);
    expect(read(phone, moved).title).toBe("7B · Morgen 5.–6. Std.");

    // Test button.
    await settings.getByRole("button", { name: "Test" }).click();
    await expect(settings).toContainText("Testnachricht gesendet.");
    const [, , , testPush] = await waitForPushes(service.received, "/phone", 4);
    expect(read(phone, testPush).title).toBe("Testnachricht");

    // Switched off: no more notifications.
    await settings.getByRole("button", { name: "Ausschalten" }).click();
    await expect(settings.getByRole("button", { name: "Einschalten" })).toBeVisible();
    await changePlan(
      request,
      4,
      row("07B", "5 - 6", "Vertretung", "KER"),
      row("07B", "5 - 6", "Entfall", "---"),
    );
    expect(await check(request)).toMatchObject({ status: "checked", notified: 1 });
    await page.waitForTimeout(500);
    expect(service.received.filter((push) => push.path === "/phone")).toHaveLength(4);
  } finally {
    await service.close();
  }
});

test("shows a pushed message as a notification", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  const cdp = await context.newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const active = registrations.find((registration) => !registration.isDeleted);
      if (active) {
        resolve(active.registrationId);
      }
    });
  });
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await cdp.send("ServiceWorker.enable");

  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify({
      title: "5A · Morgen 3.–4. Std.",
      body: "Entfall · SVA · Raum 004",
      url: "/?day=2026-10-09",
      badgeCount: 1,
    }),
  });

  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await (await navigator.serviceWorker.ready).getNotifications()).map((notification) => ({
          title: notification.title,
          body: notification.body,
          url: (notification.data as { url: string }).url,
        })),
      ),
    )
    .toEqual([{ title: "5A · Morgen 3.–4. Std.", body: "Entfall · SVA · Raum 004", url: "/?day=2026-10-09" }]);
});

test("opens the day a notification is about", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-08T08:00:00+02:00"));
  await page.goto("/?day=2026-10-09");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Morgen");
});

test("explains on an iPhone that the app must be on the home screen", async ({ browser }) => {
  const iphone = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const page = await iphone.newPage();
  await page.goto("/");
  await page.locator("#class-selector").selectOption("5A");
  await expect(page.locator("main").getByText(/„Zum Home-Bildschirm“ wählen/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Einschalten" })).toHaveCount(0);
  await iphone.close();
});

test("explains how to allow blocked notifications", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "denied" });
  });
  await page.goto("/");
  await page.locator("#class-selector").selectOption("5A");
  await expect(page.getByText(/Benachrichtigungen sind blockiert/)).toBeVisible();
});
