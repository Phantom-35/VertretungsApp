import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { AppQrCode, ShareSteps } from "@/components/AppQrCode";
import { FeedbackForm } from "@/components/FeedbackForm";
import { InstallGuide } from "@/components/InstallGuide";
import { NotificationControls } from "@/components/NotificationSettings";
import { Segmented } from "@/components/Segmented";
import { SummarySwitches } from "@/components/SummarySwitches";
import { Switch } from "@/components/Switch";
import { TeacherChooser } from "@/components/TeacherFilter";
import { ThemeChoice } from "@/components/ThemeSettings";
import { openRoomPlan } from "@/hooks/useRoomPlan";
import { NEXT_DAY_HOURS, useSettings, type TextSize } from "@/hooks/useSettings";
import { isStandalone } from "@/lib/device";
import { SCHOOL_CLASSES } from "@/lib/entries";
import { NOTIFY_GROUP_LABELS, NOTIFY_GROUPS } from "@/lib/notify";
import { resetDevice } from "@/lib/reset";
import { lockPageScroll } from "@/lib/scroll-lock";

export type SettingsFocus = "teachers" | "summaries" | "notifications" | "share" | null;

type CourseFilter = {
  schoolClass: string;
  /** The student's own class (notifications follow it), not one only looked at. */
  own: boolean;
  selected: readonly string[];
  suggestions: string[];
  onChange: (teachers: string[]) => void;
};

type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Section to scroll to when the sheet opens. */
  focus?: SettingsFocus;
  /** Switching notifications on/off and testing them. */
  notifications: ComponentProps<typeof NotificationControls>;
  /** Upper school only: the course filter by teachers. */
  courseFilter: CourseFilter | null;
  /** Original plan on the school website. */
  sourceUrl: string | undefined;
  /** The student's own class: the app opens with it, notifications are about it. */
  myClass: string | null;
  onChooseMyClass: (value: string) => void;
  onShowIntroduction: () => void;
  /** State of the plan for messages from "Hilfe & Kontakt". */
  planInfo: string;
};

const nextDayOptions = NEXT_DAY_HOURS.map((hour) => ({
  value: hour,
  label: hour === 0 ? "Immer" : hour === 24 ? "Nie" : `${hour} Uhr`,
}));

const textSizeOptions: { value: TextSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Groß" },
];

/** The app version (package.json, raised with every change) and the deployed commit. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? null;
const BUILD = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

/** Support website with the legal pages; the addresses can be changed on Vercel. */
const SUPPORT_URL = "https://support-vertretung-kag.vercel.app";
const LEGAL_LINKS = [
  { label: "Impressum", url: process.env.NEXT_PUBLIC_IMPRESSUM_URL?.trim() || `${SUPPORT_URL}/impressum` },
  { label: "Datenschutz", url: process.env.NEXT_PUBLIC_DATENSCHUTZ_URL?.trim() || `${SUPPORT_URL}/datenschutz` },
];

/** The iOS curve (see --ease-ios in app/globals.css) and the durations used with it. */
const EASE_IOS = "cubic-bezier(0.32, 0.72, 0, 1)";
const PAGE_MS = 360;
const CLOSE_MS = 260;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Dragged this far down (px) or flicked this fast (px/ms), the sheet closes. */
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.5;
const SLIDE_MS = 180;

function Setting({ id, title, description, children }: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2.5 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The pages of the sheet: the overview and a few subpages, to keep each one short. */
type Page = "main" | "notifications" | "display" | "teachers" | "install" | "share" | "help" | "about";

const PAGE_TITLES: Record<Exclude<Page, "main">, string> = {
  notifications: "Benachrichtigungen",
  display: "Anzeige",
  teachers: "Meine Lehrkräfte",
  install: "Als App installieren",
  share: "App weitergeben",
  help: "Hilfe & Kontakt",
  about: "Über die App",
};

/** The page a section to open the sheet at belongs to. */
function pageFor(focus: SettingsFocus): Page {
  if (focus === "notifications" || focus === "summaries") {
    return "notifications";
  }
  if (focus === "share") {
    return "share";
  }
  return focus === "teachers" ? "teachers" : "main";
}

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "size-[1.1rem]",
} as const;

const ICONS: Record<string, ReactNode> = {
  notifications: (
    <svg {...iconProps}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  display: (
    <svg {...iconProps}>
      <path d="M4 7V5h11v2M9.5 5v14M7 19h5M14 13v-1h6v1M17 12v7M15.5 19h3" />
    </svg>
  ),
  teachers: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a6.5 6.5 0 0 1 3 6" />
    </svg>
  ),
  install: (
    <svg {...iconProps}>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  ),
  share: (
    <svg {...iconProps}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
    </svg>
  ),
  help: (
    <svg {...iconProps}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.4M12 16.5h.01" />
    </svg>
  ),
  about: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
};

const chevron = (
  <svg {...iconProps} className="size-4 shrink-0 text-muted">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const rowClass =
  "press-highlight flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40";

/** A row in the overview that opens a subpage (or another page of the app). */
function NavRow({ icon, title, value, ...rest }: {
  icon: ReactNode;
  title: string;
  /** Short state on the right, e.g. "An". */
  value?: string;
} & ({ onClick: () => void; page: Page; href?: never } | { href: string; onClick?: never; page?: never })) {
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</span>
      {value ? <span className="shrink-0 text-sm text-muted">{value}</span> : null}
      {chevron}
    </>
  );
  return rest.href ? (
    <Link href={rest.href} className={rowClass}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={rest.onClick} data-settings-row={rest.page} className={rowClass}>
      {content}
    </button>
  );
}

/** Short state of notifications for the overview. */
const notificationStates: Partial<Record<string, string>> = {
  on: "An",
  off: "Aus",
  denied: "Blockiert",
  install: "Nur in der App",
  unsupported: "Nicht möglich",
};

/** A separate card further down the sheet. */
function Card({ id, title, description, tone = "normal", children }: {
  id?: string;
  title: string;
  description?: string;
  tone?: "normal" | "warn";
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`mt-3 scroll-mt-24 space-y-3 rounded-[1.4rem] border p-4 ${
        tone === "warn" ? "border-warn/20 bg-warn-soft/50" : "border-line bg-card"
      }`}
    >
      <div>
        <h3 className={`text-sm font-semibold ${tone === "warn" ? "text-warn" : "text-foreground"}`}>{title}</h3>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const noSubscribe = () => () => undefined;

/** Settings as a sheet from the bottom of the screen. */
export function SettingsSheet({
  open,
  onClose,
  focus = null,
  notifications,
  courseFilter,
  sourceUrl,
  myClass,
  onChooseMyClass,
  onShowIntroduction,
  planInfo,
}: SettingsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Latest onClose without re-attaching the swipe listeners on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const [settings, updateSettings] = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const installed = useSyncExternalStore(noSubscribe, isStandalone, () => true);
  // The page the user went to; until then the one the sheet was opened at.
  const [chosenPage, setChosenPage] = useState<Page | null>(null);
  const wantedPage = chosenPage ?? pageFor(focus);
  // Without an upper-school class there are no teachers to choose.
  const page = wantedPage === "teachers" && !courseFilter ? "main" : wantedPage;

  // Which way the last page change went (for the slide), and the sheet's
  // height before it, so that it grows or shrinks smoothly instead of jumping.
  const [direction, setDirection] = useState<"forward" | "back" | null>(null);
  const heightBefore = useRef<number | null>(null);
  /** Set when the app itself closes the dialog (see its "close" event). */
  const closedByApp = useRef(false);
  /** Stops a slide-out that is still running (its end would close the sheet). */
  const cancelClosing = useRef<(() => void) | null>(null);

  // Every opening starts at the overview (or the section asked for), also
  // when it is opened again while still sliding away. Adjusted while
  // rendering, as React recommends for state that follows a prop.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChosenPage(null);
      setDirection(null);
      setConfirmReset(false);
    }
  }

  /** Shows another page from its top, with the keyboard focus on it. */
  const goTo = (next: Page) => {
    const from = page;
    heightBefore.current = dialogRef.current?.offsetHeight ?? null;
    setDirection(next === "main" ? "back" : "forward");
    setChosenPage(next);
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      dialog.scrollTop = 0;
      const target =
        next === "main"
          ? dialog.querySelector<HTMLElement>(`[data-settings-row="${from}"]`)
          : dialog.querySelector<HTMLElement>("[data-settings-back]");
      target?.focus();
    });
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const from = heightBefore.current;
    heightBefore.current = null;
    if (!dialog || from === null || prefersReducedMotion()) {
      return;
    }
    const to = dialog.offsetHeight;
    if (Math.abs(to - from) > 1) {
      dialog.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: PAGE_MS, easing: EASE_IOS });
    }
  }, [page]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && dialog.dataset.closing !== undefined) {
      // Opened again while still sliding away: it simply stays, and the
      // pending end of that slide must not close it later.
      cancelClosing.current?.();
      delete dialog.dataset.closing;
      dialog.inert = false;
      dialog.removeAttribute("aria-hidden");
    }
    if (open && !dialog.open) {
      dialog.style.transform = "";
      dialog.style.transition = "";
      dialog.showModal();
      if (focus === "teachers" || focus === "summaries" || focus === "notifications") {
        document.getElementById(`settings-${focus}`)?.scrollIntoView({ block: "start" });
      } else {
        dialog.scrollTop = 0;
      }
    } else if (!open && dialog.open) {
      // Swiped away, or without motion: already out of sight. Otherwise it
      // slides down first (see .settings-sheet[data-closing]).
      if (dialog.style.transform === "translateY(100%)" || prefersReducedMotion()) {
        closedByApp.current = true;
        dialog.close();
        return;
      }
      dialog.dataset.closing = "";
      // Out of reach at once: no taps (or screen reader) on what is leaving.
      dialog.inert = true;
      dialog.setAttribute("aria-hidden", "true");
      const finish = () => {
        cancelClosing.current?.();
        if (dialog.dataset.closing === undefined) {
          return;
        }
        delete dialog.dataset.closing;
        dialog.inert = false;
        dialog.removeAttribute("aria-hidden");
        // Already closed some other way (e.g. a second Escape): no close
        // event will come to reset the flag.
        if (dialog.open) {
          closedByApp.current = true;
          dialog.close();
        }
      };
      // Only the sheet's own slide: the page inside has animations as well,
      // and their end bubbles up to here.
      const onAnimationEnd = (event: AnimationEvent) => {
        if (event.target === dialog && !event.pseudoElement) {
          finish();
        }
      };
      dialog.addEventListener("animationend", onAnimationEnd);
      // In case the animation does not run (e.g. a hidden tab).
      const fallback = window.setTimeout(finish, CLOSE_MS + 100);
      // Not undone by a later render (e.g. the focus being reset as it
      // closes), only by opening again or the end of the slide.
      cancelClosing.current = () => {
        cancelClosing.current = null;
        window.clearTimeout(fallback);
        dialog.removeEventListener("animationend", onAnimationEnd);
      };
    }
    // Only opening and closing: the focus is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => (open ? lockPageScroll() : undefined), [open]);

  // Swipe down to close, like a native sheet. Native listeners, because the
  // page must not scroll or bounce while the sheet follows the finger.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    let startY: number | null = null;
    let lastY = 0;
    let startTime = 0;
    let offset = 0;

    const onStart = (event: TouchEvent) => {
      lastY = event.touches[0]?.clientY ?? 0;
      // When the content is scrolled to the top, or on the header.
      const onHeader = (event.target as Element | null)?.closest?.("[data-sheet-header]") != null;
      startY = (dialog.scrollTop <= 0 || onHeader) && event.touches.length === 1 ? lastY : null;
      startTime = event.timeStamp;
      offset = 0;
    };
    const onMove = (event: TouchEvent) => {
      const y = event.touches[0].clientY;
      const movingUp = y < lastY;
      lastY = y;
      if (startY === null) {
        // Scrolling inside the sheet: never let it carry over to the page.
        const atBottom = dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 1;
        if (event.cancelable && (dialog.scrollHeight <= dialog.clientHeight || (atBottom && movingUp))) {
          event.preventDefault();
        }
        return;
      }
      const delta = y - startY;
      if (delta <= 0 && offset === 0) {
        // Scrolling the content up: not a swipe.
        startY = null;
        if (event.cancelable && dialog.scrollHeight <= dialog.clientHeight) {
          event.preventDefault();
        }
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      offset = Math.max(0, delta);
      dialog.style.transition = "none";
      dialog.style.transform = `translateY(${offset}px)`;
    };
    const onEnd = (event: TouchEvent) => {
      if (startY === null || offset === 0) {
        startY = null;
        return;
      }
      const velocity = offset / Math.max(1, event.timeStamp - startTime);
      dialog.style.transition = `transform ${SLIDE_MS}ms ease-out`;
      if (offset > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        dialog.style.transform = "translateY(100%)";
        window.setTimeout(() => onCloseRef.current(), SLIDE_MS);
      } else {
        dialog.style.transform = "";
      }
      startY = null;
      offset = 0;
    };

    dialog.addEventListener("touchstart", onStart, { passive: true });
    dialog.addEventListener("touchmove", onMove, { passive: false });
    dialog.addEventListener("touchend", onEnd);
    dialog.addEventListener("touchcancel", onEnd);
    return () => {
      dialog.removeEventListener("touchstart", onStart);
      dialog.removeEventListener("touchmove", onMove);
      dialog.removeEventListener("touchend", onEnd);
      dialog.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      // Stays "Einstellungen" on every page.
      aria-label="Einstellungen"
      onClose={() => {
        // The "close" event comes a moment later; if the app closed it, the
        // app knows already (and the sheet may be open again by now).
        if (closedByApp.current) {
          closedByApp.current = false;
          return;
        }
        onClose();
      }}
      // Escape: closed by the app, so that it slides away like on "Fertig".
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A tap on the dimmed area closes the sheet.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="settings-sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-[1.75rem] border border-b-0 border-line bg-background p-0 text-foreground shadow-[0_-18px_45px_rgba(18,41,39,0.18)] backdrop:bg-black/40 wide:inset-0 wide:m-auto wide:h-fit wide:max-w-lg wide:rounded-[1.75rem] wide:border-b wide:shadow-[0_24px_60px_rgba(18,41,39,0.25)]"
    >
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/* Stays visible while scrolling; swiping it down always closes the sheet. */}
        <div data-sheet-header className="sticky top-0 z-10 -mx-5 mb-1 bg-background px-5 pb-3 pt-3">
          {/* The handle belongs to the sheet on phones, not to the dialog on large screens. */}
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line wide:hidden" />
          <div className="flex items-center justify-between gap-3">
            {page === "main" ? (
              <h2 className="text-xl font-semibold tracking-[-0.03em]">Einstellungen</h2>
            ) : (
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  data-settings-back
                  onClick={() => goTo("main")}
                  aria-label="Zurück zu den Einstellungen"
                  className="tap-target -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-accent-strong"
                >
                  <svg {...iconProps} className="size-5">
                    <path d="m15 6-6 6 6 6" />
                  </svg>
                </button>
                <h2 className="truncate text-xl font-semibold tracking-[-0.03em]">{PAGE_TITLES[page]}</h2>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white"
            >
              Fertig
            </button>
          </div>
        </div>

        {/* New for every page, so that its slide-in runs again. */}
        <div key={page} className={direction ? `settings-page-${direction}` : undefined}>
        {page === "main" ? (
          <>
            <Setting
              title="Meine Klasse"
            description="Mit ihr öffnet die App, und für sie kommen Benachrichtigungen. Andere Klassen kannst du auf der Startseite nur ansehen."
          >
            <div className="relative">
              <label htmlFor="my-class" className="sr-only">
                Meine Klasse
              </label>
              <select
                id="my-class"
                value={myClass ?? ""}
                onChange={(event) => onChooseMyClass(event.target.value)}
                className="w-full appearance-none rounded-2xl border border-line bg-card px-4 py-3 pr-11 text-base font-semibold text-foreground outline-none focus:border-accent/35 focus:ring-4 focus:ring-accent/10"
              >
                {!myClass ? (
                  <option value="" disabled>
                    Klasse auswählen …
                  </option>
                ) : null}
                {SCHOOL_CLASSES.map((schoolClass) => (
                  <option key={schoolClass} value={schoolClass}>
                    {schoolClass}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 8 5 5 5-5" />
              </svg>
            </div>
          </Setting>
            {courseFilter ? (
              <div className="-mt-1 mb-4 overflow-hidden rounded-2xl border border-line bg-card">
                <NavRow
                  icon={ICONS.teachers}
                  title={courseFilter.own ? `Meine Lehrkräfte (${courseFilter.schoolClass})` : `Lehrkräfte der ${courseFilter.schoolClass}`}
                  value={courseFilter.selected.length > 0 ? String(courseFilter.selected.length) : "Alle"}
                  page="teachers"
                  onClick={() => goTo("teachers")}
                />
              </div>
            ) : null}
            <nav aria-label="Weitere Einstellungen" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              <NavRow
                icon={ICONS.notifications}
                title="Benachrichtigungen"
                value={notificationStates[notifications.push.status]}
                page="notifications"
                onClick={() => goTo("notifications")}
              />
              <NavRow icon={ICONS.display} title="Anzeige" page="display" onClick={() => goTo("display")} />
              {!installed ? (
                <NavRow icon={ICONS.install} title="Als App installieren" page="install" onClick={() => goTo("install")} />
              ) : null}
              <NavRow icon={ICONS.share} title="App weitergeben (QR-Code)" page="share" onClick={() => goTo("share")} />
              <NavRow icon={ICONS.help} title="Hilfe & Kontakt" page="help" onClick={() => goTo("help")} />
              <NavRow icon={ICONS.about} title="Über die App" page="about" onClick={() => goTo("about")} />
            </nav>
            {APP_VERSION ? (
              <p className="pt-4 text-center text-xs text-muted">
                Version {APP_VERSION}
                {BUILD ? <span className="text-muted/70"> · {BUILD}</span> : null}
              </p>
            ) : null}
          </>
        ) : null}

        {page === "notifications" ? (
          <>
            {/* Nothing to switch while unknown, or when the server has no notifications set up. */}
            {notifications.push.status !== "checking" && notifications.push.status !== "unavailable" ? (
              <Setting
                id="settings-notifications"
                title="Ein und aus"
                description="Eine Nachricht aufs Handy, sobald sich der Plan für deine Klasse ändert, auch wenn die App geschlossen ist."
              >
                <NotificationControls {...notifications} />
              </Setting>
            ) : null}
            {notifications.push.status === "unavailable" ? (
              <p className="text-sm leading-6 text-muted">Benachrichtigungen gibt es gerade nicht.</p>
            ) : null}
            {/* What to be told about only matters where they can be on. */}
            {notifications.push.status === "on" || notifications.push.status === "off" ? (
            <>
            <Setting title="Worüber" description="Bei welchen Änderungen du eine Nachricht bekommst.">
              <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                {NOTIFY_GROUPS.map((group) => (
                  <Switch
                    key={group}
                    label={NOTIFY_GROUP_LABELS[group]}
                    checked={settings.notifyGroups.includes(group)}
                    onChange={(on) =>
                      updateSettings({
                        notifyGroups: NOTIFY_GROUPS.filter((item) =>
                          item === group ? on : settings.notifyGroups.includes(item),
                        ),
                      })
                    }
                  />
                ))}
              </div>
              {settings.notifyGroups.length === 0 ? (
                <p role="status" className="text-xs font-semibold leading-5 text-warn">
                  Alles aus: Zu Änderungen kommt keine Nachricht mehr, nur noch die Überblicke, falls eingeschaltet.
                </p>
              ) : null}
            </Setting>
            <Setting title="Tägliche Überblicke" description="Eine Nachricht mit allen Änderungen des Tages, zur Uhrzeit deiner Wahl.">
              <SummarySwitches id="settings-summaries" name="settings" />
            </Setting>
            </>
            ) : null}
          </>
        ) : null}

        {page === "display" ? (
          <>
            <Setting title="Darstellung" description="„Automatisch“ richtet sich nach der Einstellung des Geräts.">
              <ThemeChoice />
            </Setting>
            <Setting title="Textgröße" description="Größere Schrift in der ganzen App.">
              <Segmented
                name="text-size"
                label="Textgröße"
                options={textSizeOptions}
                value={settings.textSize}
                onChange={(textSize) => updateSettings({ textSize })}
              />
            </Setting>
            <Setting
              title="Ab wann den nächsten Schultag zeigen?"
              description="Öffnest du die App nach dieser Uhrzeit, siehst du gleich den Plan für den nächsten Schultag. „Immer“: immer den nächsten Schultag, „Nie“: immer heute."
            >
              <Segmented
                name="next-day"
                label="Nächsten Tag anzeigen ab"
                options={nextDayOptions}
                value={settings.nextDayFromHour}
                onChange={(nextDayFromHour) => updateSettings({ nextDayFromHour })}
              />
            </Setting>
            <Setting
              title="„Neu“-Markierungen"
              description="Hebt Änderungen hervor, die seit dem letzten Öffnen dazugekommen sind."
            >
              <div className="rounded-2xl border border-line bg-card">
                <Switch
                  label="Neue Änderungen markieren"
                  checked={settings.showNewBadges}
                  onChange={(showNewBadges) => updateSettings({ showNewBadges })}
                />
              </div>
            </Setting>
            <Setting
              title="Raumplan"
              description="In jeder Vertretung steht neben dem Raum „Wo ist das?“. Ein Tipp darauf zeigt dir den Raum auf dem Plan der Schule."
            >
              <div className="rounded-2xl border border-line bg-card">
                <Switch
                  label="Räume auf dem Plan zeigen"
                  checked={settings.roomPlanButton}
                  onChange={(roomPlanButton) => updateSettings({ roomPlanButton })}
                />
                {settings.roomPlanButton ? (
                  <button
                    type="button"
                    onClick={() => openRoomPlan([], { search: true })}
                    className="press-highlight flex w-full items-center justify-between gap-3 border-t border-line px-4 py-3 text-left text-sm font-medium text-accent-strong"
                  >
                    Raumplan ansehen
                    <svg {...iconProps} className="size-4 shrink-0">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </Setting>
          </>
        ) : null}

        {page === "teachers" && courseFilter ? (
          <div id="settings-teachers" className="scroll-mt-24 space-y-3">
            <p className="text-xs leading-5 text-muted">
              {courseFilter.own
                ? `Oberstufe (${courseFilter.schoolClass}): Wähle die Lehrkräfte deiner Kurse. Dann siehst du nur deren Änderungen und bekommst nur dafür Benachrichtigungen. Einträge ohne Lehrkraft werden immer angezeigt.`
                : `Nur angesehen: Filtert die Anzeige der ${courseFilter.schoolClass}, z. B. für Geschwister. Deine Benachrichtigungen bleiben bei deiner Klasse.`}
            </p>
            <TeacherChooser
              key={courseFilter.schoolClass}
              schoolClass={courseFilter.schoolClass}
              selected={courseFilter.selected}
              suggestions={courseFilter.suggestions}
              onChange={courseFilter.onChange}
            />
          </div>
        ) : null}

        {page === "install" ? (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-muted">
              Ohne App Store, direkt aus dem Browser. Als App startet der Plan schneller,
              funktioniert offline und kann Benachrichtigungen schicken.
            </p>
            <InstallGuide />
          </div>
        ) : null}

        {page === "share" ? (
          <div className="pt-1">
            <p className="mb-5 text-center text-sm leading-6 text-muted">
              Zeig den Code deinen Freunden: Kamera drauf, Klasse wählen, fertig.
            </p>
            <AppQrCode printHref="/teilen" />
            <ShareSteps />
          </div>
        ) : null}

        {page === "help" ? (
          <FeedbackForm
            audience={
              notifications.schoolClass
                ? `${notifications.schoolClass}${notifications.teachers.length > 0 ? ` (${notifications.teachers.join(", ")})` : ""}`
                : null
            }
            pushStatus={notifications.push.status}
            planInfo={planInfo}
            supportUrl={SUPPORT_URL}
          />
        ) : null}

        {page === "about" ? (
          <>
            <div className="space-y-3">
              <p className="text-xs leading-5 text-muted">
                Die Daten stammen vom Vertretungsplan der Schule. Deine Einstellungen werden nur auf
                diesem Gerät gespeichert. Gezählt werden nur anonyme Aufrufe, ohne Cookies.
              </p>
              <button
                type="button"
                onClick={onShowIntroduction}
                className="block text-sm font-semibold text-accent-strong underline underline-offset-2"
              >
                Einführung nochmal ansehen
              </button>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-semibold text-accent-strong underline underline-offset-2"
                >
                  Original-Plan der Schule öffnen
                </a>
              ) : null}
              <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs">
                {LEGAL_LINKS.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-muted underline underline-offset-2"
                  >
                    {link.label}
                  </a>
                ))}
              </p>
            </div>
            {APP_VERSION ? (
              <p className="pt-4 text-center text-xs text-muted">
                Version {APP_VERSION}
                {BUILD ? <span className="text-muted/70"> · {BUILD}</span> : null}
              </p>
            ) : null}
            <Card
              title="Zurücksetzen"
              tone="warn"
              description="Löscht auf diesem Gerät Klasse, Lehrkräfte und Einstellungen und schaltet Benachrichtigungen aus."
            >
              {confirmReset ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-warn">Wirklich alles zurücksetzen?</span>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => {
                      setResetting(true);
                      void resetDevice();
                    }}
                    className="rounded-full bg-warn px-4 py-1.5 text-sm font-semibold text-on-warn disabled:opacity-60"
                  >
                    Zurücksetzen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="rounded-full border border-warn/30 bg-surface px-4 py-1.5 text-sm font-semibold text-warn"
                >
                  App zurücksetzen …
                </button>
              )}
            </Card>
          </>
        ) : null}
        </div>
      </div>
    </dialog>
  );
}
