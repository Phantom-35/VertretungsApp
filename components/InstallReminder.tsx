import { useState, useSyncExternalStore } from "react";
import { InstallGuide } from "@/components/InstallGuide";
import { isStandalone } from "@/lib/device";

/** Openings of the app in the browser (one per visit, not per reload). */
const VISITS_KEY = "kag:browser-visits";
/** How many reminders were shown so far. */
const SHOWN_KEY = "kag:install-reminders";
const COUNTED_SESSION_KEY = "kag:visit-counted";
const SHOWING_SESSION_KEY = "kag:install-reminder";

/** The reminder comes on these visits, once each, never in the installed app. */
const REMIND_ON_VISITS = [3, 10];

let decision: boolean | null = null;
const listeners = new Set<() => void>();

/** Counts this visit and decides once per page load whether to remind. */
function decide() {
  if (decision !== null) {
    return decision;
  }
  decision = false;
  if (isStandalone()) {
    return decision;
  }
  try {
    let visits = Number(localStorage.getItem(VISITS_KEY)) || 0;
    if (!sessionStorage.getItem(COUNTED_SESSION_KEY)) {
      visits += 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      sessionStorage.setItem(COUNTED_SESSION_KEY, "1");
    }
    const shown = Number(localStorage.getItem(SHOWN_KEY)) || 0;
    const due = shown < REMIND_ON_VISITS.length && visits >= REMIND_ON_VISITS[shown];
    if (due) {
      localStorage.setItem(SHOWN_KEY, String(shown + 1));
      sessionStorage.setItem(SHOWING_SESSION_KEY, "1");
    }
    // Stays during this visit (also after a reload) until it is closed.
    decision = sessionStorage.getItem(SHOWING_SESSION_KEY) === "1";
  } catch {
    // Without storage there is no counting: no reminder.
  }
  return decision;
}

function dismiss() {
  decision = false;
  try {
    sessionStorage.removeItem(SHOWING_SESSION_KEY);
  } catch {
    // Nothing stored.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A gentle reminder to install the app, for people who use it in the
 * browser: on the 3rd and the 10th visit, small and easy to close.
 */
export function InstallReminder() {
  const visible = useSyncExternalStore(subscribe, decide, () => false);
  const [open, setOpen] = useState(false);

  if (!visible) {
    return null;
  }

  return (
    <section
      aria-labelledby="install-reminder-title"
      className="rounded-[1.5rem] border border-accent/15 bg-accent-soft/60 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="2" width="12" height="20" rx="3" />
            <path d="M12 7v7M9 11l3 3 3-3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="install-reminder-title" className="text-sm font-semibold text-foreground">
            Als App installieren?
          </h2>
          <p className="mt-0.5 text-sm leading-5 text-muted">
            Ohne App Store, in einer Minute: startet schneller und kann dir Mitteilungen schicken.
          </p>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition active:scale-95"
            >
              Zeigen
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Erinnerung schließen"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {open ? (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
          <InstallGuide />
        </div>
      ) : null}
    </section>
  );
}
