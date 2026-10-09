import { normalizeSelectedClass, normalizeTeacher } from "@/lib/entries";
import { isAllowedEndpoint } from "@/lib/push/sender";
import type { PushSubscriptionData } from "@/lib/push/store";

/** Teachers per subscriber; more than any student has courses. */
const MAX_TEACHERS = 20;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A browser PushSubscription (as JSON) pointing to a known push service. */
export function parseSubscription(value: unknown): PushSubscriptionData | null {
  if (!isRecord(value) || !isRecord(value.keys)) {
    return null;
  }
  const { endpoint } = value;
  const { p256dh, auth } = value.keys;
  if (
    typeof endpoint !== "string" ||
    endpoint.length > 1024 ||
    !isAllowedEndpoint(endpoint) ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    // P-256 public key (65 bytes) and 16-byte auth secret, base64url.
    p256dh.length < 80 ||
    p256dh.length > 100 ||
    auth.length < 16 ||
    auth.length > 32 ||
    !BASE64URL.test(p256dh) ||
    !BASE64URL.test(auth)
  ) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

export type SubscribeRequest = {
  subscription: PushSubscriptionData;
  schoolClass: string;
  teachers: string[];
};

export function parseSubscribeRequest(value: unknown): SubscribeRequest | string {
  if (!isRecord(value)) {
    return "Ungültige Anfrage.";
  }
  const subscription = parseSubscription(value.subscription);
  if (!subscription) {
    return "Ungültige Push-Anmeldung.";
  }
  const schoolClass =
    typeof value.schoolClass === "string" ? normalizeSelectedClass(value.schoolClass) : null;
  if (!schoolClass) {
    return "Unbekannte Klasse.";
  }
  const rawTeachers = Array.isArray(value.teachers) ? value.teachers : [];
  const teachers = Array.from(
    new Set(
      rawTeachers
        .map((teacher) => (typeof teacher === "string" ? normalizeTeacher(teacher) : null))
        .filter((teacher): teacher is string => teacher !== null),
    ),
  ).slice(0, MAX_TEACHERS);
  return { subscription, schoolClass, teachers };
}

/** `{ endpoint }` of an existing subscription. */
export function parseEndpoint(value: unknown) {
  return isRecord(value) && typeof value.endpoint === "string" && value.endpoint.length <= 1024
    ? value.endpoint
    : null;
}
