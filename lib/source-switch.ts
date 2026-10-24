import { maintainerWebhook, send } from "@/lib/alert";
import { getPushStore } from "@/lib/push/store";

export type PlanSource = "primary" | "fallback";

/** In Redis, so that every server instance knows which one was reported last. */
const SOURCE_META = "plan-source";
const LOCK_NAME = "plan-source";
const LOCK_SECONDS = 30;

/**
 * What this instance last knew, and when. Trusted only for a while: another
 * instance may have reported a switch back in the meantime.
 */
const MEMORY_MS = 10 * 60_000;
type Known = { source: PlanSource; at: number };
const globalSource = globalThis as typeof globalThis & { __planSource?: Known };

const remembered = () => {
  const known = globalSource.__planSource;
  return known && Date.now() - known.at < MEMORY_MS ? known.source : null;
};
const remember = (source: PlanSource) => {
  globalSource.__planSource = { source, at: Date.now() };
};

const MESSAGES: Record<PlanSource, (reason: string | null) => { title: string; text: string }> = {
  fallback: (reason) => ({
    title: "⚠️ monitor2020 ist ausgefallen",
    text: [
      `monitor2020.meckenheim-kag.com liefert den Plan nicht${reason ? ` (${reason})` : ""}.`,
      "Die App nimmt jetzt vertretung.meckenheim-kag.com; die Nutzer merken davon nichts.",
      "Sobald monitor2020 wieder antwortet, wechselt sie von selbst zurück.",
    ].join("\n"),
  }),
  primary: () => ({
    title: "✅ monitor2020 ist wieder da",
    text: "Die App nimmt wieder monitor2020.meckenheim-kag.com.",
  }),
};

/**
 * Tells the maintainer (only them, see maintainerWebhook) when the plan
 * comes from the other website than before: once when monitor2020 fails and
 * the second copy steps in, once when monitor2020 is back. Checked in memory
 * first, so Redis is only asked when this instance sees a switch (or starts).
 * Never throws: the plan matters more than the message.
 */
export async function reportPlanSource(source: PlanSource, reason: string | null = null) {
  if (remembered() === source) {
    return "unchanged" as const;
  }
  try {
    const store = getPushStore();
    if (!store) {
      // Without Redis (local runs): only this instance's memory. Starting on
      // monitor2020 is the normal case and not worth a message.
      const previous = globalSource.__planSource?.source ?? "primary";
      remember(source);
      return previous === source ? ("unchanged" as const) : notify(source, reason);
    }
    const reported = ((await store.getMeta(SOURCE_META)) as PlanSource | null) ?? "primary";
    if (reported === source) {
      remember(source);
      return "unchanged" as const;
    }
    // Several instances may notice at once: one of them reports it.
    if (!(await store.acquireLock(LOCK_NAME, LOCK_SECONDS))) {
      return "busy" as const;
    }
    try {
      const result = await notify(source, reason);
      // Recorded only once told (or nobody to tell): a failed message is
      // tried again with the next fetch instead of being lost.
      if (result !== "failed") {
        await store.setMeta(SOURCE_META, source);
        remember(source);
      }
      return result;
    } finally {
      await store.releaseLock(LOCK_NAME);
    }
  } catch (error) {
    console.warn("[substitution] Quellenwechsel konnte nicht vermerkt werden:", error);
    return "failed" as const;
  }
}

async function notify(source: PlanSource, reason: string | null) {
  console.warn(`[substitution] Plan kommt jetzt von ${source === "primary" ? "monitor2020" : "der Ersatzseite"}.`);
  const url = maintainerWebhook();
  if (!url) {
    return "disabled" as const;
  }
  const { title, text } = MESSAGES[source](reason);
  try {
    await send(url, text, title);
    return "sent" as const;
  } catch (error) {
    console.warn("[substitution] Nachricht zum Quellenwechsel nicht gesendet:", error);
    return "failed" as const;
  }
}
