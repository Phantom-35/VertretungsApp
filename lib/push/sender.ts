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
  // Pasted values often carry a stray space or line break.
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
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
export type SendPush = (
  subscription: PushSubscriptionData,
  payload: PushPayload,
  /** Why sending failed, e.g. "Apple: BadJwtToken (403)". */
  onFailure?: (reason: string) => void,
) => Promise<SendResult>;

/** Apple's reasons for a device that no longer exists. */
const GONE_REASONS = new Set(["BadDeviceToken", "Unregistered", "ExpiredToken"]);

function failureReason(error: unknown) {
  const { statusCode, body, endpoint, message } = error as {
    statusCode?: number;
    body?: string;
    endpoint?: string;
    message?: string;
  };
  if (!statusCode) {
    // Thrown before anything was sent, e.g. an invalid VAPID key.
    return message ?? String(error);
  }
  let reason = "";
  try {
    reason = (JSON.parse(body ?? "") as { reason?: string }).reason ?? "";
  } catch {
    reason = (body ?? "").slice(0, 120);
  }
  const service = endpoint ? new URL(endpoint).hostname.split(".").slice(-2, -1)[0] : "Push-Dienst";
  return `${service === "apple" ? "Apple" : service}: ${reason || "Fehler"} (${statusCode})`;
}

export function createSender(vapid: VapidConfig): SendPush {
  return async (subscription, payload, onFailure) => {
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
      const reason = failureReason(error);
      // The subscription expired, the app was removed or the device is unknown: forget it.
      if (status === 404 || status === 410 || [...GONE_REASONS].some((item) => reason.includes(item))) {
        return "gone";
      }
      console.warn("[push] Senden fehlgeschlagen:", reason);
      onFailure?.(reason);
      return "failed";
    }
  };
}
