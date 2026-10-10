import { createECDH, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { runPushCheck } from "@/lib/push/check";
import type { PushPayload } from "@/lib/push/message";
import { createSender, isAllowedEndpoint, subscriberId, type SendResult } from "@/lib/push/sender";
import { prepareTest, sendTest, subscribe, type PushService } from "@/lib/push/service";
import { MemoryStore, type PushSubscriptionData } from "@/lib/push/store";
import { parseSubscribeRequest, parseSubscription } from "@/lib/push/validate";
import { NOTIFY_GROUPS } from "@/lib/notify";
import type { SubstitutionEntry, SubstitutionPayload } from "@/lib/types";
import { startFakePushService } from "./fake-push-service";

// http_ece has no types; it is web-push's own encryption library.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as {
  decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer;
};

const P256DH = "B".repeat(87);
const AUTH = "A".repeat(22);
const subscription = (name: string): PushSubscriptionData => ({
  endpoint: `https://web.push.apple.com/${name}`,
  keys: { p256dh: P256DH, auth: AUTH },
});

const entry = (overrides: Partial<SubstitutionEntry>): SubstitutionEntry => ({
  id: "x",
  className: "05A",
  lesson: "3",
  type: "Entfall",
  substitute: "",
  teacher: "ABC",
  room: "101",
  subject: "",
  text: "",
  date: "2026-10-09",
  page: 1,
  ...overrides,
});

const plan = (entries: SubstitutionEntry[], overrides: Partial<SubstitutionPayload> = {}) =>
  ({ success: true, stale: false, error: null, entries, ...overrides }) as SubstitutionPayload;

// Thursday 08.10.2026, 10:00 in Germany.
const NOW = Date.parse("2026-10-08T10:00:00+02:00");

function fakeSender(results: Record<string, SendResult> = {}) {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const send = vi.fn(async (sub: PushSubscriptionData, payload: PushPayload) => {
    sent.push({ endpoint: sub.endpoint, payload });
    return results[sub.endpoint] ?? "sent";
  });
  return { sent, send };
}

async function addSubscriber(store: MemoryStore, name: string, schoolClass: string, teachers: string[] = []) {
  const sub = subscription(name);
  await store.saveSubscriber({
    id: subscriberId(sub.endpoint),
    subscription: sub,
    schoolClass,
    teachers,
    createdAt: "",
    updatedAt: "",
  });
  return sub;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("runPushCheck", () => {
  it("does nothing at night and leaves the changes for the morning", async () => {
    const store = new MemoryStore();
    const loadPlan = vi.fn();
    const { send } = fakeSender();
    const result = await runPushCheck({ store, send, loadPlan, now: Date.parse("2026-10-08T23:00:00+02:00") });
    expect(result).toEqual({ status: "quiet" });
    expect(loadPlan).not.toHaveBeenCalled();
  });

  it("notifies exactly the subscribers a change concerns, once", async () => {
    const store = new MemoryStore();
    const fiveA = await addSubscriber(store, "five-a", "5A");
    await addSubscriber(store, "seven-b", "7B");
    const q1Own = await addSubscriber(store, "q1-ruk", "Q1", ["RUK"]);
    await addSubscriber(store, "q1-ker", "Q1", ["KER"]);
    const { sent, send } = fakeSender();

    const morning = [entry({ lesson: "1" })];
    expect(await runPushCheck({ store, send, loadPlan: async () => plan(morning), now: NOW })).toMatchObject({
      status: "initialized",
    });
    expect(sent).toHaveLength(0);

    // At noon the school uploads again with two more changes.
    const noon = [
      ...morning,
      entry({ lesson: "5", type: "Vertretung", substitute: "DEF" }),
      entry({ className: "Q1", lesson: "2", type: "EVA", teacher: "RUK", room: "" }),
    ];
    const result = await runPushCheck({ store, send, loadPlan: async () => plan(noon), now: NOW + 3 * 3600_000 });
    expect(result).toMatchObject({ status: "checked", added: 2, removed: 0, notified: 2, failed: 0, devices: 4 });
    expect(sent.map((item) => item.endpoint).sort()).toEqual([fiveA.endpoint, q1Own.endpoint].sort());
    expect(sent.find((item) => item.endpoint === fiveA.endpoint)!.payload).toMatchObject({
      title: "5A · Morgen 5. Std.",
      body: "Vertretung · ABC → DEF · Raum 101",
    });

    // The same plan again: nothing new.
    sent.length = 0;
    await runPushCheck({ store, send, loadPlan: async () => plan(noon), now: NOW + 4 * 3600_000 });
    expect(sent).toHaveLength(0);
  });

  it("reports a withdrawn change after it is missing twice", async () => {
    const store = new MemoryStore();
    await addSubscriber(store, "five-a", "5A");
    const { sent, send } = fakeSender();
    const cancelled = entry({ lesson: "4" });
    await runPushCheck({ store, send, loadPlan: async () => plan([cancelled]), now: NOW });
    await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW + 600_000 });
    expect(sent).toHaveLength(0);
    await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW + 1_200_000 });
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.body).toBe("Gilt nicht mehr: Entfall · ABC · Raum 101");
  });

  it("does not compare an incomplete plan", async () => {
    const store = new MemoryStore();
    await addSubscriber(store, "five-a", "5A");
    const { sent, send } = fakeSender();
    await runPushCheck({ store, send, loadPlan: async () => plan([entry({})]), now: NOW });
    const before = await store.getPlanState();

    for (const broken of [
      plan([], { stale: true, error: "Schulseite nicht erreichbar" }),
      plan([], { error: "Ein Teil der Seiten konnte nicht geladen werden." }),
      plan([], { success: false, error: "down" }),
    ]) {
      expect(await runPushCheck({ store, send, loadPlan: async () => broken, now: NOW })).toMatchObject({
        status: "incomplete",
      });
    }
    expect(await store.getPlanState()).toEqual(before);
    expect(sent).toHaveLength(0);
  });

  it("forgets devices whose subscription has expired", async () => {
    const store = new MemoryStore();
    const gone = await addSubscriber(store, "gone", "5A");
    await addSubscriber(store, "ok", "5A");
    const { send } = fakeSender({ [gone.endpoint]: "gone" });
    await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW });
    const result = await runPushCheck({ store, send, loadPlan: async () => plan([entry({})]), now: NOW });
    expect(result).toMatchObject({ notified: 1, expired: 1 });
    expect(await store.countSubscribers()).toBe(1);
  });

  it("records every call and warns when nothing could be delivered", async () => {
    const webhook: string[] = [];
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://ntfy.sh/kag-test");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      webhook.push(String(init.body));
      return new Response(null, { status: 200 });
    });
    try {
      const store = new MemoryStore();
      const broken = await addSubscriber(store, "broken", "5A");
      const { send } = fakeSender({ [broken.endpoint]: "failed" });
      await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW });
      expect(await store.getMeta("last-check")).toBe(new Date(NOW).toISOString());

      const result = await runPushCheck({ store, send, loadPlan: async () => plan([entry({})]), now: NOW + 600_000 });
      expect(result).toMatchObject({ notified: 0, failed: 1 });
      expect(webhook).toHaveLength(1);
      expect(webhook[0]).toMatch(/an kein Gerät zugestellt/);
      expect(await store.getMeta("last-check")).toBe(new Date(NOW + 600_000).toISOString());
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("skips a run while another one is busy", async () => {
    const store = new MemoryStore();
    await store.acquireLock("check", 60);
    const { send } = fakeSender();
    expect(await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW })).toEqual({
      status: "busy",
    });
  });

  it("releases the lock when loading the plan fails", async () => {
    const store = new MemoryStore();
    const { send } = fakeSender();
    await expect(
      runPushCheck({ store, send, loadPlan: async () => Promise.reject(new Error("boom")), now: NOW }),
    ).rejects.toThrow("boom");
    expect(await store.acquireLock("check", 60)).toBe(true);
  });
});

describe("evening summary in the check", () => {
  const EVENING = Date.parse("2026-10-08T19:05:00+02:00"); // Thursday
  const withDays = (entries: SubstitutionEntry[], days: string[]) =>
    ({ ...plan(entries), days: days.map((date) => ({ date, dayLabel: null, weekLabel: null })) }) as SubstitutionPayload;

  it("sends one summary per evening to those who want it", async () => {
    const store = new MemoryStore();
    const wants = await addSubscriber(store, "wants", "5A");
    await store.saveSubscriber({ ...(await store.getSubscriber(subscriberId(wants.endpoint)))!, eveningSummary: true });
    await addSubscriber(store, "not", "5A");
    const { sent, send } = fakeSender();
    const loadPlan = async () => withDays([entry({ lesson: "1" })], ["2026-10-08", "2026-10-09"]);

    // Too early: no summary.
    await runPushCheck({ store, send, loadPlan, now: Date.parse("2026-10-08T18:50:00+02:00") });
    expect(sent).toHaveLength(0);

    expect(await runPushCheck({ store, send, loadPlan, now: EVENING })).toMatchObject({ summaries: 1, notified: 0 });
    expect(sent.map((item) => item.endpoint)).toEqual([wants.endpoint]);
    expect(sent[0].payload.title).toBe("5A · Morgen: 1 Änderung");

    // Later the same evening: not again.
    await runPushCheck({ store, send, loadPlan, now: EVENING + 30 * 60_000 });
    expect(sent).toHaveLength(1);
  });

  it("waits while tomorrow's plan is not published", async () => {
    const store = new MemoryStore();
    const sub = await addSubscriber(store, "wants", "5A");
    await store.saveSubscriber({ ...(await store.getSubscriber(subscriberId(sub.endpoint)))!, eveningSummary: true });
    const { sent, send } = fakeSender();
    await runPushCheck({ store, send, loadPlan: async () => withDays([], ["2026-10-08"]), now: EVENING });
    expect(sent).toHaveLength(0);
    // Uploaded at 19:40: the summary still comes.
    await runPushCheck({ store, send, loadPlan: async () => withDays([], ["2026-10-08", "2026-10-09"]), now: EVENING + 35 * 60_000 });
    expect(sent.map((item) => item.payload.body)).toEqual(["Keine Änderungen eingetragen."]);
  });

  it("does not send summaries at night", async () => {
    const store = new MemoryStore();
    const { sent, send } = fakeSender();
    const result = await runPushCheck({
      store,
      send,
      loadPlan: async () => withDays([], ["2026-10-08", "2026-10-09"]),
      now: Date.parse("2026-10-08T21:30:00+02:00"),
    });
    expect(result).toEqual({ status: "quiet" });
    expect(sent).toHaveLength(0);
  });
});

describe("morning summary in the check", () => {
  // Friday 09.10.2026.
  const MORNING = Date.parse("2026-10-09T06:05:00+02:00");
  const withDays = (entries: SubstitutionEntry[], days: string[]) =>
    ({ ...plan(entries), days: days.map((date) => ({ date, dayLabel: null, weekLabel: null })) }) as SubstitutionPayload;
  const wantsMorning = async (store: MemoryStore, name: string) => {
    const sub = await addSubscriber(store, name, "5A");
    await store.saveSubscriber({ ...(await store.getSubscriber(subscriberId(sub.endpoint)))!, morningSummary: true });
    return sub;
  };

  it("sends one summary of the day per morning to those who want it", async () => {
    const store = new MemoryStore();
    const wants = await wantsMorning(store, "wants");
    await addSubscriber(store, "not", "5A");
    const { sent, send } = fakeSender();
    const loadPlan = async () => withDays([entry({ lesson: "1" })], ["2026-10-09", "2026-10-12"]);

    expect(await runPushCheck({ store, send, loadPlan, now: MORNING })).toMatchObject({ summaries: 1 });
    expect(sent.map((item) => item.endpoint)).toEqual([wants.endpoint]);
    expect(sent[0].payload).toMatchObject({ title: "5A · Heute: 1 Änderung", url: "/?day=2026-10-09" });

    // Later the same morning: not again.
    await runPushCheck({ store, send, loadPlan, now: MORNING + 60 * 60_000 });
    expect(sent).toHaveLength(1);
  });

  it("only comes on school days in the morning", async () => {
    const store = new MemoryStore();
    await wantsMorning(store, "wants");
    const { sent, send } = fakeSender();
    // After 8 h: too late.
    await runPushCheck({ store, send, loadPlan: async () => withDays([], ["2026-10-09"]), now: Date.parse("2026-10-09T08:05:00+02:00") });
    // Saturday, or a day without a plan (holidays).
    await runPushCheck({ store, send, loadPlan: async () => withDays([], ["2026-10-10"]), now: Date.parse("2026-10-10T06:05:00+02:00") });
    await runPushCheck({ store, send, loadPlan: async () => withDays([], ["2026-10-16"]), now: Date.parse("2026-10-13T06:05:00+02:00") });
    expect(sent).toHaveLength(0);
  });

  it("covers the day's changes found in the same check", async () => {
    const store = new MemoryStore();
    const wants = await wantsMorning(store, "wants");
    const other = await addSubscriber(store, "other", "5A");
    const { sent, send } = fakeSender();
    const days = ["2026-10-09", "2026-10-12"];
    // Known since the evening before.
    await runPushCheck({ store, send, loadPlan: async () => withDays([], days), now: Date.parse("2026-10-08T20:30:00+02:00") });

    const changed = [entry({ lesson: "1" }), entry({ lesson: "2", date: "2026-10-12" })];
    await runPushCheck({ store, send, loadPlan: async () => withDays(changed, days), now: MORNING });
    const titles = (endpoint: string) => sent.filter((item) => item.endpoint === endpoint).map((item) => item.payload.title);
    // Today's change is in the summary; Monday's comes as a notification.
    expect(titles(wants.endpoint)).toEqual(["5A · Mo., 12.10. 2. Std.", "5A · Heute: 1 Änderung"]);
    expect(titles(other.endpoint)).toEqual(["5A: 2 Änderungen"]);
  });
});

describe("withdrawn changes on a summary day", () => {
  it("are still sent to those who get the summary", async () => {
    const store = new MemoryStore();
    const sub = await addSubscriber(store, "wants", "5A");
    await store.saveSubscriber({ ...(await store.getSubscriber(subscriberId(sub.endpoint)))!, eveningSummary: true });
    const { sent, send } = fakeSender();
    const days = ["2026-10-08", "2026-10-09"];
    const withDays = (entries: SubstitutionEntry[]) =>
      ({ ...plan(entries), days: days.map((date) => ({ date, dayLabel: null, weekLabel: null })) }) as SubstitutionPayload;
    const cancelled = entry({ lesson: "2" });
    await runPushCheck({ store, send, loadPlan: async () => withDays([cancelled]), now: Date.parse("2026-10-08T18:30:00+02:00") });
    await runPushCheck({ store, send, loadPlan: async () => withDays([]), now: Date.parse("2026-10-08T18:40:00+02:00") });
    await runPushCheck({ store, send, loadPlan: async () => withDays([]), now: Date.parse("2026-10-08T19:05:00+02:00") });
    expect(sent.map((item) => item.payload.body)).toEqual([
      "Gilt nicht mehr: Entfall · ABC · Raum 101",
      "Keine Änderungen eingetragen.",
    ]);
  });
});

describe("subscriptions", () => {
  const service = (send: PushService["send"]) => ({ store: new MemoryStore(), send, publicKey: "k" });

  it("confirms a new device once and keeps its settings up to date", async () => {
    const { sent, send } = fakeSender();
    const push = service(send);
    const request = { subscription: subscription("phone"), schoolClass: "5A", teachers: [], notifyGroups: [...NOTIFY_GROUPS], eveningSummary: false, morningSummary: false };
    expect(await subscribe(push, request)).toEqual({ ok: true, created: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toBe("Benachrichtigungen sind an");

    expect(await subscribe(push, { ...request, schoolClass: "Q1", teachers: ["RUK"] })).toEqual({
      ok: true,
      created: false,
    });
    expect(sent).toHaveLength(1);
    const stored = await push.store.getSubscriber(subscriberId(request.subscription.endpoint));
    expect(stored).toMatchObject({ schoolClass: "Q1", teachers: ["RUK"] });
  });

  it("refuses a device whose push subscription does not work", async () => {
    const { send } = fakeSender({ [subscription("dead").endpoint]: "gone" });
    const push = service(send);
    const result = await subscribe(push, { subscription: subscription("dead"), schoolClass: "5A", teachers: [], notifyGroups: [...NOTIFY_GROUPS], eveningSummary: false, morningSummary: false });
    expect(result).toMatchObject({ ok: false, status: 410 });
    expect(await push.store.countSubscribers()).toBe(0);
  });

  it("does not store a device the confirmation could not reach", async () => {
    const { send } = fakeSender({ [subscription("flaky").endpoint]: "failed" });
    const push = service(send);
    const result = await subscribe(push, { subscription: subscription("flaky"), schoolClass: "5A", teachers: [], notifyGroups: [...NOTIFY_GROUPS], eveningSummary: false, morningSummary: false });
    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(await push.store.countSubscribers()).toBe(0);
  });

  it("limits test notifications to one per minute", async () => {
    const { sent, send } = fakeSender();
    const push = service(send);
    const sub = subscription("phone");
    await subscribe(push, { subscription: sub, schoolClass: "5A", teachers: [], notifyGroups: [...NOTIFY_GROUPS], eveningSummary: false, morningSummary: false });
    expect(await sendTest(push, sub.endpoint, NOW)).toBe("sent");
    expect(await sendTest(push, sub.endpoint, NOW + 30_000)).toBe("too-soon");
    expect(await sendTest(push, sub.endpoint, NOW + 61_000)).toBe("sent");
    expect(await sendTest(push, subscription("other").endpoint, NOW)).toBe("unknown");
    expect(sent.at(-1)!.payload.title).toBe("Testnachricht");
  });

  it("can send the test notification later, e.g. after the app was closed", async () => {
    const { sent, send } = fakeSender();
    const push = service(send);
    const sub = subscription("phone");
    await subscribe(push, { subscription: sub, schoolClass: "5A", teachers: [], notifyGroups: [...NOTIFY_GROUPS], eveningSummary: false, morningSummary: false });
    const before = sent.length;
    const prepared = await prepareTest(push, sub.endpoint, NOW);
    expect(prepared.result).toBe("scheduled");
    // Counted at once, sent only when asked.
    expect((await prepareTest(push, sub.endpoint, NOW + 1_000)).result).toBe("too-soon");
    expect(sent).toHaveLength(before);
    expect(prepared.result === "scheduled" && (await prepared.deliver())).toBe("sent");
    expect(sent).toHaveLength(before + 1);
  });
});

describe("request validation", () => {
  it("only accepts endpoints of real push services", () => {
    expect(isAllowedEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isAllowedEndpoint("http://web.push.apple.com/abc")).toBe(false);
    expect(isAllowedEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedEndpoint("https://evil.example/push.apple.com")).toBe(false);
    expect(isAllowedEndpoint("https://push.apple.com.evil.example/x")).toBe(false);
  });

  it("checks the keys and normalises class and teachers", () => {
    expect(parseSubscription({ endpoint: "https://web.push.apple.com/x", keys: { p256dh: "x", auth: AUTH } })).toBeNull();
    expect(
      parseSubscribeRequest({
        subscription: subscription("phone"),
        schoolClass: "q1",
        teachers: ["ruk", "RUK", "k1", 5, "ker"],
      }),
    ).toEqual({
      subscription: subscription("phone"),
      schoolClass: "Q1",
      teachers: ["RUK", "KER"],
      notifyGroups: [...NOTIFY_GROUPS],
      eveningSummary: false,
      morningSummary: false,
    });
    expect(
      parseSubscribeRequest({
        subscription: subscription("phone"),
        schoolClass: "5A",
        notifyGroups: ["room", "cancelled", "bogus", "room"],
        eveningSummary: true,
        morningSummary: true,
      }),
    ).toMatchObject({ notifyGroups: ["cancelled", "room"], eveningSummary: true, morningSummary: true });
    expect(parseSubscribeRequest({ subscription: subscription("phone"), schoolClass: "11Z" })).toBe(
      "Unbekannte Klasse.",
    );
    expect(parseSubscribeRequest(null)).toBe("Ungültige Anfrage.");
  });
});

describe("web push delivery", () => {
  beforeEach(() => {
    vi.stubEnv("PUSH_ALLOW_ANY_ENDPOINT", "1");
    // The fake push service uses a self-signed certificate.
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
  });

  function deviceSubscription(endpoint: string) {
    // What a browser generates when subscribing.
    const device = createECDH("prime256v1");
    device.generateKeys();
    const authSecret = randomBytes(16);
    return {
      device,
      authSecret,
      subscription: {
        endpoint,
        keys: { p256dh: device.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") },
      },
    };
  }

  it("sends an encrypted notification the device can decrypt", async () => {
    const service = await startFakePushService(201);
    const { device, authSecret, subscription: sub } = deviceSubscription(`${service.url}/push/abc`);
    const vapid = { ...webpush.generateVAPIDKeys(), subject: "https://kag.example" };
    const payload = { title: "5A · Morgen 3. Std.", body: "Entfall · ABC", url: "/?day=2026-10-09" };

    try {
      expect(await createSender(vapid)(sub, payload)).toBe("sent");
    } finally {
      await service.close();
    }

    const [{ path, headers, body }] = service.received;
    expect(path).toBe("/push/abc");
    expect(headers["content-encoding"]).toBe("aes128gcm");
    expect(headers.ttl).toBe(String(12 * 60 * 60));
    expect(headers.urgency).toBe("high");
    expect(headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    const decrypted = ece.decrypt(body, { version: "aes128gcm", privateKey: device, authSecret });
    expect(JSON.parse(decrypted.toString("utf8"))).toEqual(payload);
  });

  it("reports expired subscriptions", async () => {
    const service = await startFakePushService(410);
    const { subscription: sub } = deviceSubscription(`${service.url}/push/old`);
    try {
      const send = createSender({ ...webpush.generateVAPIDKeys(), subject: "https://kag.example" });
      expect(await send(sub, { title: "t", body: "b", url: "/" })).toBe("gone");
    } finally {
      await service.close();
    }
  });

  it("explains why a notification was refused", async () => {
    const service = await startFakePushService(403, JSON.stringify({ reason: "BadJwtToken" }));
    const { subscription: sub } = deviceSubscription(`${service.url}/push/x`);
    const reasons: string[] = [];
    try {
      const send = createSender({ ...webpush.generateVAPIDKeys(), subject: "https://kag.example" });
      expect(await send(sub, { title: "t", body: "b", url: "/" }, (reason) => reasons.push(reason))).toBe("failed");
    } finally {
      await service.close();
    }
    expect(reasons[0]).toMatch(/BadJwtToken \(403\)$/);
  });

  it("forgets devices Apple does not know", async () => {
    const service = await startFakePushService(400, JSON.stringify({ reason: "BadDeviceToken" }));
    const { subscription: sub } = deviceSubscription(`${service.url}/push/x`);
    try {
      const send = createSender({ ...webpush.generateVAPIDKeys(), subject: "https://kag.example" });
      expect(await send(sub, { title: "t", body: "b", url: "/" })).toBe("gone");
    } finally {
      await service.close();
    }
  });

  it("reports an unusable private key instead of failing silently", async () => {
    const service = await startFakePushService(201);
    const { subscription: sub } = deviceSubscription(`${service.url}/push/x`);
    const reasons: string[] = [];
    try {
      const keys = webpush.generateVAPIDKeys();
      const send = createSender({ ...keys, privateKey: keys.privateKey.slice(0, 20), subject: "https://kag.example" });
      expect(await send(sub, { title: "t", body: "b", url: "/" }, (reason) => reasons.push(reason))).toBe("failed");
    } finally {
      await service.close();
    }
    expect(reasons[0]).toMatch(/private key/i);
    expect(service.received).toHaveLength(0);
  });

  it("refuses to send anywhere but a push service", async () => {
    vi.stubEnv("PUSH_ALLOW_ANY_ENDPOINT", "");
    const send = createSender({ ...webpush.generateVAPIDKeys(), subject: "https://kag.example" });
    const { subscription: sub } = deviceSubscription("https://127.0.0.1:1/internal");
    expect(await send(sub, { title: "t", body: "b", url: "/" })).toBe("gone");
  });
});
