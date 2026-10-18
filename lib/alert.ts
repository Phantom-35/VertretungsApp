/**
 * Optional alert to the maintainer when the plan cannot be read correctly,
 * typically because the school's Untis export changed. Set ALERT_WEBHOOK_URL
 * to e.g. an ntfy.sh topic (push to the phone, no account needed), a Discord
 * or a Slack webhook.
 */

/**
 * The maintainer's own channel for messages meant for them alone (help
 * messages, the switch to the school's second website): FEEDBACK_WEBHOOK_URL,
 * otherwise the one for warnings. Server only, never sent to a browser.
 */
export function maintainerWebhook() {
  return process.env.FEEDBACK_WEBHOOK_URL?.trim() || process.env.ALERT_WEBHOOK_URL?.trim() || null;
}

/** The same problem is reported again after this long at the earliest. */
const REPEAT_AFTER_MS = 6 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const TITLE = "KAG Vertretungsplan";

type AlertState = { signature: string | null; sentAt: number };

const globalAlert = globalThis as typeof globalThis & { __substitutionAlert?: AlertState };
const state =
  globalAlert.__substitutionAlert ??
  (globalAlert.__substitutionAlert = { signature: null, sentAt: 0 });

/**
 * Posts a message to the maintainer's webhook. Also used for the messages
 * from the "Hilfe & Kontakt" page (app/api/feedback). Throws on failure.
 */
export async function send(url: string, message: string, title = TITLE) {
  const target = new URL(url);
  const isNtfy = /(^|\.)ntfy\./i.test(target.hostname);
  if (isNtfy && title !== TITLE) {
    // Headers only carry Latin-1: other titles (umlauts, emoji) go in the address.
    target.searchParams.set("title", title);
  }
  const response = await fetch(target, {
    method: "POST",
    headers: isNtfy
      ? { "content-type": "text/plain; charset=utf-8", ...(title === TITLE ? { title: TITLE } : {}) }
      : { "content-type": "application/json" },
    // Slack reads "text", Discord "content". Text from the plan (or written
    // by a user) must not trigger mentions such as @everyone on Discord.
    body: isNtfy
      ? message
      : JSON.stringify({
          text: title === TITLE ? message : `${title}\n${message}`,
          content: title === TITLE ? message : `${title}\n${message}`,
          allowed_mentions: { parse: [] },
        }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

/**
 * Reports the self-check's findings once, again after some hours if they
 * persist, and once more when they are gone. Never throws.
 */
export async function reportPlanProblems(problems: string[], now = Date.now()) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    return "disabled" as const;
  }

  // Page numbers shift between uploads; they do not make a new problem.
  const signature =
    problems.length > 0
      ? Array.from(new Set(problems.map((problem) => problem.replace(/^Seite \d+: /, ""))))
          .sort()
          .join("\n")
      : null;

  if (signature === null && state.signature === null) {
    return "skipped" as const;
  }
  if (signature !== null && signature === state.signature && now - state.sentAt < REPEAT_AFTER_MS) {
    return "skipped" as const;
  }

  const message =
    signature === null
      ? `${TITLE}: Der Plan wird wieder vollständig gelesen.`
      : `${TITLE}: Der Plan wird möglicherweise unvollständig angezeigt.\n${problems.join("\n")}`;

  const previous = { ...state };
  // Claimed before sending, so that parallel refreshes do not send twice.
  state.signature = signature;
  state.sentAt = now;
  try {
    await send(url, message);
    return "sent" as const;
  } catch (error) {
    Object.assign(state, previous);
    console.warn("[substitution] Warnung konnte nicht gesendet werden:", error);
    return "failed" as const;
  }
}

const deliveryState: AlertState = { signature: null, sentAt: 0 };

/**
 * Reports when no device got its notification in a check (e.g. wrong VAPID
 * keys or the push services down), at most every few hours. Never throws.
 */
export async function reportDeliveryProblem(failed: number, now = Date.now()) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url || now - deliveryState.sentAt < REPEAT_AFTER_MS) {
    return url ? ("skipped" as const) : ("disabled" as const);
  }
  deliveryState.sentAt = now;
  try {
    await send(
      url,
      `${TITLE}: ${failed === 1 ? "Eine Benachrichtigung konnte" : `${failed} Benachrichtigungen konnten`} an kein Gerät zugestellt werden. Bitte VAPID-Schlüssel und Vercel-Logs prüfen.`,
    );
    return "sent" as const;
  } catch (error) {
    deliveryState.sentAt = 0;
    console.warn("[push] Warnung konnte nicht gesendet werden:", error);
    return "failed" as const;
  }
}
