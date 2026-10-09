import { createHash } from "node:crypto";
import webpush from "web-push";
import type { PushPayload } from "@/lib/push/message";
import type { PushSubscriptionData } from "@/lib/push/store";

/**
 * Push services of the browsers (Chrome/Android, Apple, Firefox, Edge). Other
 * endpoints are refused, so that the server cannot be made to send requests
 * to arbitrary addresses.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.apple.com",
  "push.services.mozilla.com",
  "notify.windows.com",
];

/** How long a push service keeps an undelivered notification (phone off). */
const TTL_SECONDS = 12 * 60 * 60;
const TIMEOUT_MS = 10_000;

export function isAllowedEndpoint(endpoint: string) {
  if (process.env.PUSH_ALLOW_ANY_ENDPOINT === "1") {
    // Local tests with a fake push service.
    return endpoint.startsWith("https://");
  }
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

export function subscriberId(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** VAPID keys identify this server to the push services (and Apple requires them). */
export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return null;
  }
  // Apple rejects subjects like "mailto:" with spaces or localhost URLs.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject =
    process.env.VAPID_SUBJECT?.trim() || (host ? `https://${host}` : "https://vercel.com");
  return { publicKey, privateKey, subject };
}

export type SendResult = "sent" | "gone" | "failed";
export type SendPush = (subscription: PushSubscriptionData, payload: PushPayload) => Promise<SendResult>;

export function createSender(vapid: VapidConfig): SendPush {
  return async (subscription, payload) => {
    if (!isAllowedEndpoint(subscription.endpoint)) {
      return "gone";
    }
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: vapid,
        TTL: TTL_SECONDS,
        urgency: "high",
        timeout: TIMEOUT_MS,
      });
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // The subscription expired or the app was removed: forget it.
      if (status === 404 || status === 410) {
        return "gone";
      }
      console.warn("[push] Senden fehlgeschlagen:", status ?? error);
      return "failed";
    }
  };
}
