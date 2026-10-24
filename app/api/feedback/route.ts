import { maintainerWebhook, send } from "@/lib/alert";
import { MAX_TEXT_BYTES, feedbackText, feedbackTitle, parseFeedback } from "@/lib/feedback";
import { getPushStore } from "@/lib/push/store";
import { json, readJson } from "@/lib/push/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Per address at most this many messages in the window, per server instance. */
const PER_ADDRESS = 3;
const PER_ADDRESS_WINDOW_MS = 10 * 60_000;
/** All together at most this many per hour and instance (against floods). */
const PER_HOUR = 30;
const HOUR_MS = 60 * 60_000;

/**
 * Kept in memory only (never in Redis or a log), and only as long as the
 * window lasts: enough to slow down a flood without storing who wrote.
 */
type Limits = { byAddress: Map<string, number[]>; all: number[] };
const globalLimits = globalThis as typeof globalThis & { __feedbackLimits?: Limits };
const limits: Limits = globalLimits.__feedbackLimits ?? (globalLimits.__feedbackLimits = { byAddress: new Map(), all: [] });

function allowed(address: string, now: number) {
  limits.all = limits.all.filter((time) => now - time < HOUR_MS);
  for (const [key, times] of limits.byAddress) {
    const recent = times.filter((time) => now - time < PER_ADDRESS_WINDOW_MS);
    if (recent.length > 0) {
      limits.byAddress.set(key, recent);
    } else {
      limits.byAddress.delete(key);
    }
  }
  const mine = limits.byAddress.get(address) ?? [];
  if (mine.length >= PER_ADDRESS || limits.all.length >= PER_HOUR) {
    return false;
  }
  limits.byAddress.set(address, [...mine, now]);
  limits.all.push(now);
  return true;
}

/** Only from the app's own pages: other websites cannot send in a user's name. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * A message from "Hilfe & Kontakt", passed on to the maintainer's webhook
 * (FEEDBACK_WEBHOOK_URL, e.g. a secret ntfy topic; otherwise the one for
 * warnings). The address stays on the server; nothing is stored.
 */
export async function POST(request: Request) {
  const url = maintainerWebhook();
  if (!url) {
    return json({ error: "Direktes Senden ist gerade nicht eingerichtet." }, 503);
  }
  if (!sameOrigin(request)) {
    return json({ error: "Nicht erlaubt." }, 403);
  }
  const body = await readJson(request);
  // A field people never see: filled in, it was a bot. It gets no hint.
  if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
    return json({ ok: true });
  }
  const feedback = parseFeedback(body);
  if (!feedback) {
    return json({ error: "Bitte schreib kurz, worum es geht." }, 400);
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowed(address, Date.now())) {
    return json({ error: "Gerade kamen zu viele Nachrichten. Versuch es später noch einmal oder per E-Mail." }, 429);
  }
  // All server instances together: the limit above is per instance only.
  try {
    const total = await getPushStore()?.countUp("feedback", HOUR_MS / 1000);
    if (total !== undefined && total > PER_HOUR) {
      return json({ error: "Gerade kamen zu viele Nachrichten. Versuch es später noch einmal oder per E-Mail." }, 429);
    }
  } catch {
    // Without the database the per-instance limit still applies.
  }
  try {
    await send(url, feedbackText(feedback, MAX_TEXT_BYTES), feedbackTitle(feedback));
  } catch (error) {
    console.warn("[feedback] Nachricht konnte nicht weitergeleitet werden:", error);
    return json({ error: "Senden hat nicht geklappt. Versuch es später noch einmal oder per E-Mail." }, 502);
  }
  return json({ ok: true });
}
