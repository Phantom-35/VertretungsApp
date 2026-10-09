import { diffPlan } from "@/lib/push/diff";
import { buildNotification, changesFor, isQuietTime } from "@/lib/push/message";
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
  | { status: "initialized"; entries: number }
  | {
      status: "checked";
      added: number;
      removed: number;
      subscribers: number;
      notified: number;
      failed: number;
      expired: number;
    };

type CheckOptions = {
  store: PushStore;
  send: SendPush;
  loadPlan: () => Promise<SubstitutionPayload>;
  now?: number;
};

/**
 * Compares the current plan with the last known one and notifies every
 * subscriber about the changes that concern them. Meant to run every few
 * minutes; runs that overlap are skipped.
 */
export async function runPushCheck({ store, send, loadPlan, now = Date.now() }: CheckOptions): Promise<CheckResult> {
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
    if (diff.initial) {
      return { status: "initialized", entries: diff.state.keys.length };
    }

    const subscribers =
      diff.added.length + diff.removed.length > 0 ? await store.listSubscribers() : [];
    let notified = 0;
    let failed = 0;
    let expired = 0;

    const notify = async (subscriber: Subscriber) => {
      const changes = changesFor(diff, subscriber, now);
      if (changes.length === 0) {
        return;
      }
      const result = await send(
        subscriber.subscription,
        buildNotification(subscriber.schoolClass, changes, now),
      );
      if (result === "sent") {
        notified += 1;
      } else if (result === "gone") {
        expired += 1;
        await store.deleteSubscriber(subscriber.id);
      } else {
        failed += 1;
      }
    };

    for (let index = 0; index < subscribers.length; index += PARALLEL_SENDS) {
      await Promise.all(subscribers.slice(index, index + PARALLEL_SENDS).map(notify));
    }

    return {
      status: "checked",
      added: diff.added.length,
      removed: diff.removed.length,
      subscribers: subscribers.length,
      notified,
      failed,
      expired,
    };
  } finally {
    await store.releaseLock(LOCK_NAME);
  }
}
