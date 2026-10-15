import { createSender, getVapidConfig, subscriberId, type SendPush } from "@/lib/push/sender";
import { getPushStore, type PushStore } from "@/lib/push/store";
import type { SubscribeRequest } from "@/lib/push/validate";

/** Protects the free Redis tier from being filled by scripts. */
const MAX_SUBSCRIBERS = 5_000;
/** Test notifications at most this often per device. */
const TEST_INTERVAL_MS = 60_000;

export type PushService = { store: PushStore; send: SendPush; publicKey: string };

/** Null when notifications are not configured (no Redis or no VAPID keys). */
export function getPushService(): PushService | null {
  const store = getPushStore();
  const vapid = getVapidConfig();
  return store && vapid ? { store, send: createSender(vapid), publicKey: vapid.publicKey } : null;
}

export type SubscribeResult = { ok: true; created: boolean } | { ok: false; status: number; error: string };

/** Registers a device or updates its class and teachers. */
export async function subscribe(
  { store, send }: PushService,
  request: SubscribeRequest,
  now = Date.now(),
): Promise<SubscribeResult> {
  const id = subscriberId(request.subscription.endpoint);
  const existing = await store.getSubscriber(id);
  if (!existing && (await store.countSubscribers()) >= MAX_SUBSCRIBERS) {
    return { ok: false, status: 503, error: "Zu viele Anmeldungen." };
  }

  if (!existing) {
    // Confirms that notifications reach the device. Only devices that can be
    // reached are stored, so made-up registrations cannot pile up.
    let reason = "";
    const result = await send(
      request.subscription,
      {
        title: "Benachrichtigungen sind an",
        body: `Du bekommst eine Mitteilung, sobald sich der Plan für die ${request.schoolClass} ändert.`,
        url: "/",
        tag: "kag-welcome",
      },
      (failure) => {
        reason = failure;
      },
    );
    if (result === "gone") {
      return { ok: false, status: 410, error: "Die Push-Anmeldung ist ungültig." };
    }
    if (result === "failed") {
      return {
        ok: false,
        status: 502,
        error: `Die Bestätigung konnte nicht zugestellt werden. Bitte gleich noch einmal versuchen.${
          reason ? ` (${reason})` : ""
        }`,
      };
    }
  }

  const timestamp = new Date(now).toISOString();
  await store.saveSubscriber({
    ...existing,
    id,
    subscription: request.subscription,
    schoolClass: request.schoolClass,
    teachers: request.teachers,
    notifyGroups: request.notifyGroups,
    eveningSummary: request.eveningSummary,
    morningSummary: request.morningSummary,
    eveningSummaryTime: request.eveningSummaryTime,
    morningSummaryTime: request.morningSummaryTime,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
  return { ok: true, created: !existing };
}

export async function unsubscribe({ store }: PushService, endpoint: string) {
  await store.deleteSubscriber(subscriberId(endpoint));
}

/** Moves a device's settings to its renewed push subscription. */
export async function resubscribe(
  service: PushService,
  oldEndpoint: string,
  request: Pick<SubscribeRequest, "subscription">,
) {
  const old = await service.store.getSubscriber(subscriberId(oldEndpoint));
  if (!old) {
    return { ok: false as const, status: 404, error: "Unbekannte Anmeldung." };
  }
  await service.store.deleteSubscriber(old.id);
  const id = subscriberId(request.subscription.endpoint);
  await service.store.saveSubscriber({
    ...old,
    id,
    subscription: request.subscription,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true as const };
}

export type TestResult = "sent" | "unknown" | "too-soon" | "gone" | "failed";

export type PreparedTest =
  | { result: "unknown" | "too-soon" }
  | { result: "scheduled"; deliver: () => Promise<TestResult> };

/**
 * Checks whether this device may get a test notification now; `deliver`
 * sends it. Split so the route can send it a few seconds later, after the
 * app was closed.
 */
export async function prepareTest({ store, send }: PushService, endpoint: string, now = Date.now()): Promise<PreparedTest> {
  const subscriber = await store.getSubscriber(subscriberId(endpoint));
  if (!subscriber) {
    return { result: "unknown" };
  }
  if (subscriber.lastTestAt && now - subscriber.lastTestAt < TEST_INTERVAL_MS) {
    return { result: "too-soon" };
  }
  await store.saveSubscriber({ ...subscriber, lastTestAt: now });
  const deliver = async () => {
    const result = await send(subscriber.subscription, {
      title: "Testnachricht",
      body: `So sehen Mitteilungen für die ${subscriber.schoolClass} aus.`,
      url: "/",
      tag: "kag-test",
    });
    if (result === "gone") {
      await store.deleteSubscriber(subscriber.id);
    }
    return result;
  };
  return { result: "scheduled", deliver };
}

/** Sends a test notification right away. */
export async function sendTest(service: PushService, endpoint: string, now = Date.now()): Promise<TestResult> {
  const prepared = await prepareTest(service, endpoint, now);
  return prepared.result === "scheduled" ? prepared.deliver() : prepared.result;
}
