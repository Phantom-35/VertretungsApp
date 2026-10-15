import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { InstallGuide } from "@/components/InstallGuide";
import { NotificationControls } from "@/components/NotificationSettings";
import { Segmented } from "@/components/Segmented";
import { SummarySwitches } from "@/components/SummarySwitches";
import { Switch } from "@/components/Switch";
import { TeacherChooser } from "@/components/TeacherFilter";
import { ThemeChoice } from "@/components/ThemeSettings";
import { NEXT_DAY_HOURS, useSettings, type TextSize } from "@/hooks/useSettings";
import { isStandalone } from "@/lib/device";
import { SCHOOL_CLASSES } from "@/lib/entries";
import { NOTIFY_GROUP_LABELS, NOTIFY_GROUPS } from "@/lib/notify";
import { resetDevice } from "@/lib/reset";

export type SettingsFocus = "teachers" | "summaries" | "notifications" | null;

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
};

const nextDayOptions = NEXT_DAY_HOURS.map((hour) => ({
  value: hour,
  label: hour === 0 ? "Immer" : hour === 24 ? "Nie" : `${hour} Uhr`,
}));

const textSizeOptions: { value: TextSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Groß" },
];

/** Short commit of the deployed version (set by Vercel). */
const VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

/** Support website with the legal pages; the addresses can be changed on Vercel. */
const SUPPORT_URL = "https://support-vertretung-kag.vercel.app";
const FEEDBACK_EMAIL = "phandevstudios@gmx.de";

/** An e-mail with the details that help to reproduce a problem. */
function sendFeedback(myClass: string | null) {
  const body = [
    "Was ist dir aufgefallen?",
    "",
    "",
    "---",
    `Klasse: ${myClass ?? "–"}`,
    `Als App installiert: ${isStandalone() ? "ja" : "nein"}`,
    `Version: ${VERSION ?? "–"}`,
    `Gerät: ${navigator.userAgent}`,
  ].join("\n");
  window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
    "Feedback KAG Vertretungsplan",
  )}&body=${encodeURIComponent(body)}`;
}
const LEGAL_LINKS = [
  { label: "Impressum", url: process.env.NEXT_PUBLIC_IMPRESSUM_URL?.trim() || `${SUPPORT_URL}/impressum` },
  { label: "Datenschutz", url: process.env.NEXT_PUBLIC_DATENSCHUTZ_URL?.trim() || `${SUPPORT_URL}/datenschutz` },
  { label: "Hilfe & Kontakt", url: SUPPORT_URL },
];

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

/** A labelled on/off switch row. */
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

/** Keeps the page behind the sheet from scrolling (also on iOS). */
function lockPageScroll() {
  const { body, documentElement } = document;
  const scrollY = window.scrollY;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    overflow: documentElement.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
  documentElement.style.overflow = "hidden";
  return () => {
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.width = previous.width;
    documentElement.style.overflow = previous.overflow;
    // At once, not with the page's smooth scrolling.
    window.scrollTo({ top: scrollY, behavior: "instant" });
  };
}

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
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
      dialog.close();
    }
  }, [open, focus]);

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
      aria-labelledby="settings-title"
      onClose={() => {
        setConfirmReset(false);
        onClose();
      }}
      // A tap on the dimmed area closes the sheet.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="settings-sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[1.75rem] border border-b-0 border-line bg-background p-0 text-foreground shadow-[0_-18px_45px_rgba(18,41,39,0.18)] backdrop:bg-black/40 wide:inset-0 wide:m-auto wide:h-fit wide:max-w-lg wide:rounded-[1.75rem] wide:border-b wide:shadow-[0_24px_60px_rgba(18,41,39,0.25)]"
    >
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/* Stays visible while scrolling; swiping it down always closes the sheet. */}
        <div data-sheet-header className="sticky top-0 z-10 -mx-5 mb-1 bg-background px-5 pb-3 pt-3">
          {/* The handle belongs to the sheet on phones, not to the dialog on large screens. */}
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line wide:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 id="settings-title" className="text-xl font-semibold tracking-[-0.03em]">
              Einstellungen
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white"
            >
              Fertig
            </button>
          </div>
        </div>

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
          id="settings-notifications"
          title="Benachrichtigungen"
          description="Eine Nachricht aufs Handy, sobald sich der Plan für deine Klasse ändert, auch wenn die App geschlossen ist. Darunter: worüber du eine Nachricht bekommst."
        >
          <NotificationControls {...notifications} />
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
          <SummarySwitches id="settings-summaries" />
        </Setting>

        {courseFilter ? (
          <Card
            id="settings-teachers"
            title={
              courseFilter.own
                ? `Oberstufe: Meine Lehrkräfte (${courseFilter.schoolClass})`
                : `Lehrkräfte für die ${courseFilter.schoolClass} (nur angesehen)`
            }
            description={
              courseFilter.own
                ? "Wähle die Lehrkräfte deiner Kurse. Dann siehst du nur deren Änderungen und bekommst nur dafür Benachrichtigungen. Einträge ohne Lehrkraft werden immer angezeigt."
                : "Filtert nur die Anzeige dieser Klasse, z. B. für Geschwister. Deine Benachrichtigungen bleiben bei deiner Klasse."
            }
          >
            <TeacherChooser
              key={courseFilter.schoolClass}
              schoolClass={courseFilter.schoolClass}
              selected={courseFilter.selected}
              suggestions={courseFilter.suggestions}
              onChange={courseFilter.onChange}
            />
          </Card>
        ) : null}

        {!installed ? (
          <Card
            title="Als App installieren"
            description="Ohne App Store, direkt aus dem Browser. Als App startet der Plan schneller, funktioniert offline und kann Benachrichtigungen schicken."
          >
            <InstallGuide />
          </Card>
        ) : null}

        <Card
          title="App weitergeben"
          description="Ein QR-Code zur App: zum Zeigen auf dem Handy oder als Aushang zum Ausdrucken."
        >
          <Link
            href="/teilen"
            className="inline-block rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-accent-strong"
          >
            QR-Code zeigen
          </Link>
        </Card>

        <Card title="Über die App">
          <p className="text-xs leading-5 text-muted">
            Die Daten stammen vom Vertretungsplan der Schule. Deine Einstellungen werden nur auf
            diesem Gerät gespeichert. Gezählt werden nur anonyme Aufrufe, ohne Cookies.{VERSION ? ` Version ${VERSION}.` : ""}
          </p>
          <button
            type="button"
            onClick={onShowIntroduction}
            className="block text-sm font-semibold text-accent-strong underline underline-offset-2"
          >
            Einführung nochmal ansehen
          </button>
          <button
            type="button"
            onClick={() => sendFeedback(myClass)}
            className="block text-sm font-semibold text-accent-strong underline underline-offset-2"
          >
            Feedback senden oder Fehler melden
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
        </Card>

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
      </div>
    </dialog>
  );
}
