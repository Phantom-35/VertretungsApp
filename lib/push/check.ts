import { reportDeliveryProblem } from "@/lib/alert";
import { diffPlan } from "@/lib/push/diff";
import {
  buildNotification,
  buildSummary,
  changesFor,
  isQuietTime,
  isSummaryTime,
  summaryDate,
  type PushPayload,
} from "@/lib/push/message";
import type { SendPush } from "@/lib/push/sender";
import type { PushStore, Subscriber } from "@/lib/push/store";
import { schoolToday } from "@/lib/time";
import type { SubstitutionPayload } from "@/lib/types";

const LOCK_NAME = "check";
const LOCK_SECONDS = 120;
const PARALLEL_SENDS = 5;

export type CheckResult =
  | { status: "quiet" }
  | { status: "busy" }
  | { status: "incomplete"; reason: string }
  | { status: "initialized"; entries: number; summaries: number }
  | {
      status: "checked";
      added: number;
      removed: number;
      /** Registered devices. */
      devices: number;
      /** Devices looked at in this run (none without changes or summary). */
      subscribers: number;
      notified: number;
      failed: number;
      expired: number;
      /** Evening summaries sent in this run. */
      summaries: number;
    };

type CheckOptions = {
  store: PushStore;
  send: SendPush;
  loadPlan: () => Promise<SubstitutionPayload>;
  now?: number;
};

/** Bookkeeping key: the day the last evening summary was about. */
const SUMMARY_META = "summary-day";
/** Bookkeeping key: when the scheduler last called the check (see /api/health). */
export const LAST_CHECK_META = "last-check";

/**
 * Compares the current plan with the last known one and notifies every
 * subscriber about the changes that concern them; in the evening it also
 * sends the summaries of the next school day. Meant to run every few
 * minutes; runs that overlap are skipped.
 */
export async function runPushCheck({ store, send, loadPlan, now = Date.now() }: CheckOptions): Promise<CheckResult> {
  // Also at night: shows that the scheduler still runs.
  await store.setMeta(LAST_CHECK_META, new Date(now).toISOString());
  if (isQuietTime(now)) {
    // Nothing is recorded, so the first check in the morning reports it all.
    return { status: "quiet" };
  }
  if (!(await store.acquireLock(LOCK_NAME, LOCK_SECONDS))) {
    return { status: "busy" };
  }

  try {
    const plan = await loadPlan();
    // An incomplete plan (school website down, upload in progress, unreadable
    // page) would look like withdrawn changes: compare complete plans only.
    if (!plan.success || plan.stale || plan.error) {
      return { status: "incomplete", reason: plan.error ?? "Plan nicht verfügbar" };
    }

    const diff = diffPlan(await store.getPlanState(), plan.entries, schoolToday(now), new Date(now));
    // Saved before sending: a failed run must not notify twice.
    await store.savePlanState(diff.state);

    const hasChanges = !diff.initial && diff.added.length + diff.removed.length > 0;
    const day = isSummaryTime(now) ? summaryDate(plan.days.map((planDay) => planDay.date), now) : null;
    // Once per day; recorded before sending, like the plan state.
    const summaryDue = day !== null && (await store.getMeta(SUMMARY_META)) !== day;
    if (summaryDue) {
      await store.setMeta(SUMMARY_META, day);
    }

    const subscribers = hasChanges || summaryDue ? await store.listSubscribers() : [];
    const stats = { notified: 0, failed: 0, expired: 0, summaries: 0 };

    const deliver = async (subscriber: Subscriber, payload: PushPayload) => {
      const result = await send(subscriber.subscription, payload);
      if (result === "gone") {
        stats.expired += 1;
        await store.deleteSubscriber(subscriber.id);
      } else if (result === "failed") {
        stats.failed += 1;
      }
      return result === "sent";
    };

    const notify = async (subscriber: Subscriber) => {
      const changes = hasChanges ? changesFor(diff, subscriber, now) : [];
      if (changes.length > 0) {
        if (!(await deliver(subscriber, buildNotification(subscriber.schoolClass, changes, now)))) {
          return;
        }
        stats.notified += 1;
      }
      if (summaryDue && subscriber.eveningSummary) {
        if (await deliver(subscriber, buildSummary(subscriber, plan.entries, day, now))) {
          stats.summaries += 1;
        }
      }
    };

    for (let index = 0; index < subscribers.length; index += PARALLEL_SENDS) {
      await Promise.all(subscribers.slice(index, index + PARALLEL_SENDS).map(notify));
    }
    // Something to send, but nothing arrived anywhere: worth a warning.
    if (stats.failed > 0 && stats.notified + stats.summaries === 0) {
      await reportDeliveryProblem(stats.failed, now);
    }

    if (diff.initial) {
      return { status: "initialized", entries: diff.state.keys.length, summaries: stats.summaries };
    }
    return {
      status: "checked",
      added: diff.added.length,
      removed: diff.removed.length,
      devices: await store.countSubscribers(),
      subscribers: subscribers.length,
      ...stats,
    };
  } finally {
    await store.releaseLock(LOCK_NAME);
  }
}
