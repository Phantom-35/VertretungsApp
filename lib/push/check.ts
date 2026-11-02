import { reportDeliveryProblem, tellMaintainer, type TellMaintainer } from "@/lib/alert";
import { diffPlan, type PlanState } from "@/lib/push/diff";
import {
  buildNotification,
  buildSummary,
  changesFor,
  isMorningSummaryTime,
  isQuietTime,
  isSummaryTime,
  morningSummaryDate,
  reachedTimes,
  summaryDate,
  type PushPayload,
} from "@/lib/push/message";
import {
  DEFAULT_EVENING_SUMMARY_TIME,
  DEFAULT_MORNING_SUMMARY_TIME,
  EVENING_SUMMARY_TIMES,
  MORNING_SUMMARY_TIMES,
  parseSummaryTime,
} from "@/lib/notify";
import type { SendPush } from "@/lib/push/sender";
import type { PushStore, Subscriber } from "@/lib/push/store";
import { sendReminders, watchPlanSize } from "@/lib/push/watch";
import { SCHOOL_PLAN_FALLBACK_BASE_URL } from "@/lib/school";
import { schoolToday } from "@/lib/time";
import type { SubstitutionPayload } from "@/lib/types";

const LOCK_NAME = "check";
const LOCK_SECONDS = 120;
// Push services answer quickly; enough in parallel to stay well within the
// function time limit with many devices.
const PARALLEL_SENDS = 20;

export type CheckResult =
  | { status: "quiet" }
  | { status: "busy" }
  | { status: "incomplete"; reason: string }
  | { status: "initialized"; entries: number; summaries: number }
  | {
      status: "checked";
      added: number;
      removed: number;
      /** Registered devices; only when they were loaded anyway (changes or a summary). */
      devices?: number;
      /** Devices looked at in this run (none without changes or summary). */
      subscribers: number;
      notified: number;
      failed: number;
      expired: number;
      /** Evening or morning summaries sent in this run. */
      summaries: number;
    };

type CheckOptions = {
  store: PushStore;
  send: SendPush;
  loadPlan: () => Promise<SubstitutionPayload>;
  now?: number;
  /** Messages to the maintainer (see lib/push/watch.ts). */
  tell?: TellMaintainer;
};

/**
 * Bookkeeping key per summary time: the day that summary was last sent for.
 * The only times of earlier versions keep their keys, so that no summary
 * comes twice on the day of an update.
 */
function summaryMeta(kind: "evening" | "morning", time: string) {
  if (kind === "evening" && time === "19:00") {
    return "summary-day";
  }
  if (kind === "morning" && time === "06:00") {
    return "morning-summary-day";
  }
  return `${kind}-summary-day@${time}`;
}

type SummaryRun = { meta: string; day: string; wanted: (subscriber: Subscriber) => boolean };

/**
 * The summaries whose time has come: in the evening for tomorrow, in the
 * morning for today; one per time subscribers can choose.
 */
function summaryRuns(plan: SubstitutionPayload, now: number): SummaryRun[] {
  const planDates = plan.days?.map((day) => day.date) ?? [];
  if (isSummaryTime(now)) {
    const day = summaryDate(planDates, now);
    return day
      ? reachedTimes(EVENING_SUMMARY_TIMES, now).map((time) => ({
          meta: summaryMeta("evening", time),
          day,
          wanted: (subscriber) =>
            subscriber.eveningSummary === true &&
            parseSummaryTime(subscriber.eveningSummaryTime, EVENING_SUMMARY_TIMES, DEFAULT_EVENING_SUMMARY_TIME) === time,
        }))
      : [];
  }
  if (isMorningSummaryTime(now)) {
    const day = morningSummaryDate(planDates, now);
    return day
      ? reachedTimes(MORNING_SUMMARY_TIMES, now).map((time) => ({
          meta: summaryMeta("morning", time),
          day,
          wanted: (subscriber) =>
            subscriber.morningSummary === true &&
            parseSummaryTime(subscriber.morningSummaryTime, MORNING_SUMMARY_TIMES, DEFAULT_MORNING_SUMMARY_TIME) === time,
        }))
      : [];
  }
  return [];
}

/** The same keys in any order: a plan uploaded in another order is not a change. */
function sameList(left: readonly string[], right: readonly string[]) {
  const known = new Set(left);
  return left.length === right.length && known.size === new Set(right).size && right.every((key) => known.has(key));
}

/** The same entries, also the same ones missing for the moment (the time of the check aside). */
function sameState(left: PlanState, right: PlanState) {
  return (
    sameList(left.keys, right.keys) &&
    sameList(left.missing, right.missing) &&
    left.source === right.source &&
    JSON.stringify(left.vanishedSince ?? {}) === JSON.stringify(right.vanishedSince ?? {})
  );
}

/** Bookkeeping key: when the scheduler last called the check (see /api/health). */
export const LAST_CHECK_META = "last-check";

/**
 * Compares the current plan with the last known one and notifies every
 * subscriber about the changes that concern them; in the evening it also
 * sends the summaries of the next school day. Meant to run every few
 * minutes; runs that overlap are skipped. In the morning it sends the
 * summaries of the day.
 */
export async function runPushCheck({
  store,
  send,
  loadPlan,
  now = Date.now(),
  tell = tellMaintainer,
}: CheckOptions): Promise<CheckResult> {
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
    // Only for the maintainer: must never cost anyone a notification.
    await sendReminders(store, now, tell).catch(() => undefined);

    const plan = await loadPlan();
    // An incomplete plan (school website down, upload in progress, unreadable
    // page) would look like withdrawn changes: compare complete plans only.
    if (!plan.success || plan.stale || plan.error) {
      return { status: "incomplete", reason: plan.error ?? "Plan nicht verfügbar" };
    }
    await watchPlanSize(store, { entries: plan.entries, dates: plan.days?.map((day) => day.date) ?? [] }, now, tell).catch(
      () => undefined,
    );

    const previous = await store.getPlanState();
    const source = plan.sourceUrl?.startsWith(SCHOOL_PLAN_FALLBACK_BASE_URL) ? ("fallback" as const) : undefined;
    // The plan now comes from the other website: its entries look different
    // (e.g. without teachers), so the new state is taken over silently, as on
    // the very first check, instead of reporting every entry as changed.
    const switched = previous !== null && previous.source !== source;
    const diff = diffPlan(
      switched ? null : previous,
      plan.entries,
      schoolToday(now),
      new Date(now),
      plan.days?.map((day) => day.date),
    );
    if (source) {
      diff.state.source = source;
    }
    // Saved before sending: a failed run must not notify twice. Unchanged
    // (most checks), nothing needs writing: the next check compares with the
    // same state either way.
    if (!previous || !sameState(previous, diff.state)) {
      await store.savePlanState(diff.state);
    }

    const hasChanges = !diff.initial && diff.added.length + diff.removed.length > 0;
    const dueSummaries: SummaryRun[] = [];
    for (const summary of summaryRuns(plan, now)) {
      // Entries of its day missing since this check may be an upload in
      // progress: the summary waits for the next check instead of leaving
      // them out (nothing would correct it later).
      const waits = diff.state.missing.some((key) => key.startsWith(`${summary.day}|`));
      // Once per day and time; recorded before sending, like the plan state.
      if (!waits && (await store.getMeta(summary.meta)) !== summary.day) {
        await store.setMeta(summary.meta, summary.day);
        dueSummaries.push(summary);
      }
    }

    const needsSubscribers = hasChanges || dueSummaries.length > 0;
    const subscribers = needsSubscribers ? await store.listSubscribers() : [];
    const stats = { notified: 0, failed: 0, expired: 0, summaries: 0 };

    const deliver = async (subscriber: Subscriber, payload: PushPayload) => {
      const result = await send(subscriber.subscription, payload);
      if (result === "gone") {
        stats.expired += 1;
        // Not worth stopping the run for: the next send finds it gone again.
        await store.deleteSubscriber(subscriber.id).catch(() => undefined);
      } else if (result === "failed") {
        stats.failed += 1;
      }
      return result;
    };

    const notify = async (subscriber: Subscriber) => {
      // At most one: the evening and morning summaries never run together.
      const summary = dueSummaries.find((run) => run.wanted(subscriber)) ?? null;
      const getsSummary = summary !== null;
      // The summary sent with them shows its day's changes already; a
      // withdrawn change is not in it, so that one is still sent.
      const changes = (hasChanges ? changesFor(diff, subscriber, now) : []).filter(
        (change) => !getsSummary || change.kind === "removed" || change.entry.date !== summary.day,
      );
      if (changes.length > 0) {
        const result = await deliver(subscriber, buildNotification(subscriber.schoolClass, changes, now));
        if (result === "gone") {
          return;
        }
        if (result === "sent") {
          stats.notified += 1;
        }
      }
      // Also after a failed change: the summary is sent only once per day.
      if (getsSummary) {
        if ((await deliver(subscriber, buildSummary(subscriber, plan.entries, summary.day, now))) === "sent") {
          stats.summaries += 1;
        }
      }
    };

    // One device's error must not cost the others their notification: the
    // plan state is already saved, so a retry would not send it again.
    const notifySafely = (subscriber: Subscriber) =>
      notify(subscriber).catch(() => {
        stats.failed += 1;
      });

    for (let index = 0; index < subscribers.length; index += PARALLEL_SENDS) {
      await Promise.all(subscribers.slice(index, index + PARALLEL_SENDS).map(notifySafely));
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
      // Counted from the list already loaded: no extra Redis command on the
      // many checks without anything to send.
      ...(needsSubscribers ? { devices: subscribers.length - stats.expired } : {}),
      subscribers: subscribers.length,
      ...stats,
    };
  } finally {
    await store.releaseLock(LOCK_NAME);
  }
}
