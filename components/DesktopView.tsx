"use client";

import type { ReactNode } from "react";
import { DaySummary } from "@/components/DaySummary";
import { FadingStatus } from "@/components/FadingStatus";
import { CheckedLabel, statusBadges, type HeaderStatus } from "@/components/Header";
import { HolidayCard } from "@/components/HolidayCard";
import { InstallReminder } from "@/components/InstallReminder";
import { LoadingState } from "@/components/LoadingState";
import { NoticesCard } from "@/components/NoticesCard";
import { RefreshStatus } from "@/components/RefreshStatus";
import type { SettingsFocus } from "@/components/SettingsSheet";
import { ShareButton } from "@/components/ShareButton";
import { SubstitutionCard } from "@/components/SubstitutionCard";
import { SettingsButton, ThemeToggle } from "@/components/ThemeSettings";
import type { PushControls } from "@/hooks/usePushNotifications";
import { formatClassName, isCourseClass } from "@/lib/entries";
import {
  formatAge,
  formatPlanDate,
  formatPlanDateLabel,
  formatShortDate,
  formatTimestamp,
  formatWeekday,
  isPastDate,
  relativeDayLabel,
} from "@/lib/format";
import type { HolidayBreak } from "@/lib/holidays";
import { entryKey } from "@/lib/seen";
import { buildShareText, classLink } from "@/lib/share";
import type { PlanDay, SubstitutionEntry, SubstitutionPayload } from "@/lib/types";

/** From this many changes on a day, the cards are shown smaller (as on phones). */
const COMPACT_FROM = 6;

const cardClassName =
  "rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]";

/** Day columns: at least this wide (several fit next to each other), at most as wide as cards look good. */
const COLUMN_MIN_REM = 19;
const COLUMN_MAX_REM = 32;
const COLUMN_GAP_REM = 1.5;

/** Width of `count` day columns at their widest. */
const boardWidth = (count: number) =>
  `${count * COLUMN_MAX_REM + (count - 1) * COLUMN_GAP_REM}rem`;

const smallButtonClass =
  "shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-strong transition hover:border-accent/30 disabled:opacity-60";

export type DesktopViewProps = {
  data: SubstitutionPayload | null;
  now: number | null;
  isBusy: boolean;
  connectionError: string | null;
  schoolDown: boolean;
  /** The last check is long ago although the connection works. */
  checkStale: boolean;
  status: HeaderStatus;
  /** Plays the opening animation (the same as on phones). */
  opening: boolean;
  /** Not during the introduction, which has its own install step (as on phones). */
  showInstallReminder: boolean;
  /** The one-time question about the room plan, if due. */
  roomPlanOffer: ReactNode;
  onRefresh: () => void;
  onOpenSettings: (focus?: SettingsFocus) => void;
  selectedClass: string | null | undefined;
  myClass: string | null | undefined;
  /** Another class than the student's own is only being looked at. */
  viewingOther: boolean;
  onChooseClass: (value: string) => void;
  classes: string[];
  /** Upper school: the courses (teachers) chosen for the class on screen. */
  courseFilter: { selected: readonly string[]; active: boolean } | null;
  showOtherCourses: boolean;
  onToggleOtherCourses: () => void;
  /** All entries of the class, those of the own courses, and those shown. */
  classEntries: SubstitutionEntry[];
  ownEntries: SubstitutionEntry[];
  shownEntries: SubstitutionEntry[];
  push: PushControls;
  /** Whose changes notifications are about: own class and courses. */
  notificationAudience: string | null;
  /** All days to show, including a day not published yet. */
  days: PlanDay[];
  pendingDate: string | null;
  /** The day that matters most now (today, or the next day after school). */
  focusDate: string | null;
  holiday: HolidayBreak | null;
  holidayMode: boolean;
  today: string | null;
  newPlanDate: string | null;
  hasOldPlan: boolean;
  onShowNewPlan: () => void;
  onShowOldPlan: () => void;
  /** Only past days in the plan: the next one is not online yet. */
  waiting: boolean;
  /** Entries marked "Neu" among the given ones. */
  findNew: (entries: SubstitutionEntry[]) => Set<string>;
  onNewSeen: (key: string) => void;
};

/**
 * The view for large screens (computer, tablet in landscape): a bar across
 * the top, below it all days of the plan side by side. Phones never see it
 * (see hooks/useWideScreen.ts); their view is unchanged.
 */
export function DesktopView(props: DesktopViewProps) {
  const { data, now, isBusy, selectedClass, holidayMode, holiday } = props;

  let content: React.ReactNode;
  // The bar is as wide as the day columns below it (at least a sensible width).
  let width = "64rem";
  if (!data && (isBusy || now === null)) {
    content = (
      <div className="mx-auto w-full max-w-xl">
        <LoadingState />
      </div>
    );
  } else if (!data) {
    content = (
      <div className="mx-auto w-full max-w-xl rounded-[1.75rem] border border-warn/15 bg-warn-soft p-6 text-center">
        <p className="text-lg font-semibold text-warn">Vertretungsplan momentan nicht erreichbar.</p>
        <p className="mt-2 text-sm leading-6 text-warn">
          {props.connectionError ?? "Bitte versuche es in ein paar Minuten erneut."}
        </p>
        <button
          type="button"
          onClick={props.onRefresh}
          className="mt-4 rounded-full bg-warn px-5 py-2 text-sm font-semibold text-on-warn"
        >
          Erneut versuchen
        </button>
      </div>
    );
  } else if (holidayMode && holiday && selectedClass !== null) {
    content = (
      <div className="mx-auto w-full max-w-xl">
        <HolidayCard
          holiday={holiday}
          today={props.today}
          newPlanDate={props.newPlanDate}
          // All days stand side by side here: one button for the plan is enough.
          hasOldPlan={props.hasOldPlan && props.newPlanDate === null}
          onShowNewPlan={props.onShowNewPlan}
          onShowOldPlan={props.onShowOldPlan}
        />
      </div>
    );
  } else if (!selectedClass) {
    content = (
      <div className={`mx-auto w-full max-w-xl ${cardClassName}`}>
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">Wähle deine Klasse</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Oben bei „Klasse“. Dann siehst du hier nur die Vertretungen, die dich betreffen. Die
          Auswahl wird auf diesem Gerät gespeichert.
        </p>
      </div>
    );
  } else {
    content = <DayBoard {...props} data={data} selectedClass={selectedClass} />;
    width = `max(64rem, ${boardWidth(props.days.length)})`;
  }

  return (
    <div
      className={`${props.opening ? "app-enter " : ""}mx-auto flex min-h-dvh w-full flex-col gap-5 px-8 pb-12`}
      style={{ maxWidth: `calc(${width} + 4rem)` }}
    >
      <TopBar {...props} />

      <main className="flex flex-col gap-5">
        {data ? (
          <RefreshStatus
            connectionError={props.connectionError}
            schoolDown={props.schoolDown}
            stale={data.stale}
            error={data.error}
            lastSuccessLabel={formatAge(data.lastSuccessfulUpdate ?? data.lastUpdated, now)}
            sourceUrl={data.sourceUrl}
            onRetry={props.onRefresh}
          />
        ) : null}
        {props.showInstallReminder ? <InstallReminder /> : null}
        {props.roomPlanOffer}
        {props.waiting ? (
          <p className="rounded-[1.4rem] border border-line bg-card px-5 py-3 text-sm leading-6 text-muted">
            Der nächste Plan ist noch nicht online. Bis die Schule ihn hochlädt, siehst du hier den
            letzten Plan.
          </p>
        ) : null}

        {/* Read out after switching class: a short summary, not the whole board. */}
        <p role="status" className="sr-only">
          {data && selectedClass && !holidayMode
            ? `${selectedClass}: ${props.shownEntries.length === 1 ? "1 Änderung" : `${props.shownEntries.length} Änderungen`} im Plan`
            : ""}
        </p>

        {content}
      </main>
    </div>
  );
}

/** "KAG Vertretungsplan · 9B", class, state of the plan and the buttons. */
function TopBar(props: DesktopViewProps) {
  const { data, now, selectedClass, status, viewingOther, courseFilter } = props;
  const badge = statusBadges[status];
  const sourceUpdated = formatTimestamp(data?.sourceUpdatedAt ?? null, now);
  const fetched = data?.lastUpdated ? formatAge(data.lastUpdated, now) : "noch nie";
  const extras = (
    <>
      <DesktopNotifications
        push={props.push}
        audience={props.notificationAudience}
        onOpenSettings={props.onOpenSettings}
      />
      {courseFilter && selectedClass ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">
            Meine Lehrkräfte:{" "}
            <span className="font-medium text-foreground">
              {courseFilter.selected.length > 0
                ? [...courseFilter.selected].sort((left, right) => left.localeCompare(right, "de-DE")).join(", ")
                : `Alle Kurse der ${selectedClass}`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => props.onOpenSettings("teachers")}
            aria-haspopup="dialog"
            className={smallButtonClass}
          >
            {courseFilter.selected.length > 0 ? "Ändern" : "Festlegen"}
          </button>
        </div>
      ) : null}
      {viewingOther && props.myClass ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">
            Nur angesehen. Beim nächsten Öffnen und für Benachrichtigungen gilt weiter die{" "}
            <span className="font-semibold text-foreground">{props.myClass}</span>.
          </p>
          <button type="button" onClick={() => props.onChooseClass(props.myClass!)} className={smallButtonClass}>
            Zurück zur {props.myClass}
          </button>
        </div>
      ) : null}
    </>
  );
  const hasExtras =
    Boolean(courseFilter && selectedClass) ||
    (viewingOther && Boolean(props.myClass)) ||
    !["checking", "unavailable", "unsupported"].includes(props.push.status);

  return (
    // Stays at the top while scrolling through long days.
    <header className="sticky top-0 z-20 -mx-8 bg-background/85 px-8 pb-1 pt-5 backdrop-blur-md">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-edge bg-[linear-gradient(145deg,var(--header-from),var(--header-to))] shadow-[0_18px_45px_rgba(18,41,39,0.08)]">
        <div className="absolute inset-y-0 left-0 w-96 bg-[radial-gradient(circle_at_top_left,rgba(31,107,103,0.16),transparent_70%)]" />
        <div className="relative flex items-center gap-x-5 px-6 py-4">
          <div className="flex min-w-0 shrink-0 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- the app's own generated icon */}
            <img
              src="/icon/192"
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-[0.9rem] shadow-[0_10px_24px_rgba(18,41,39,0.16)]"
            />
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-accent-strong/85">
                KAG Vertretungsplan
              </p>
              <h1 className="min-h-9 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-foreground">
                {selectedClass === undefined ? "" : (selectedClass ?? "Klasse wählen")}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 border-l border-line pl-5">
            <label
              htmlFor="desktop-class-selector"
              className="text-xs font-semibold uppercase leading-4 tracking-[0.18em] text-muted"
            >
              {viewingOther ? "Andere Klasse" : "Klasse"}
            </label>
            <div className="relative">
              <select
                id="desktop-class-selector"
                value={selectedClass ?? ""}
                onChange={(event) => props.onChooseClass(event.target.value)}
                className="w-36 cursor-pointer appearance-none rounded-[1rem] border border-line bg-surface px-4 py-2.5 pr-10 text-base font-semibold text-foreground outline-none transition hover:border-accent/30 focus:border-accent/35 focus:ring-4 focus:ring-accent/10"
              >
                {!selectedClass ? (
                  <option value="" disabled>
                    Wählen …
                  </option>
                ) : null}
                {props.classes.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 8 5 5 5-5" />
              </svg>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-5">
            <div className="min-w-0 text-right">
              <span className={`inline-block rounded-full border px-3 py-0.5 text-sm font-semibold ${badge.className}`}>
                {badge.label}
              </span>
              {/* Wraps between the two parts, never inside one (as on phones). */}
              <p className="mt-1 flex flex-wrap justify-end gap-x-1.5 text-xs text-muted">
                <span className="whitespace-nowrap">
                  {sourceUpdated === "unbekannt" ? (
                    "Plan der Schule"
                  ) : (
                    <>
                      Plan {sourceUpdated.includes(".,") ? "vom" : "von"}{" "}
                      <span className="font-medium text-foreground/80">{sourceUpdated}</span>
                    </>
                  )}
                </span>
                <span aria-hidden>·</span>
                <span className="whitespace-nowrap">
                  <CheckedLabel label={fetched} stale={props.checkStale} />
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={props.onRefresh}
                disabled={props.isBusy}
                aria-label="Plan neu laden"
                title="Plan neu laden"
                className="flex size-9 items-center justify-center rounded-full border border-line bg-surface/70 text-foreground transition hover:border-accent/30 disabled:opacity-60"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className={`size-[1.15rem] ${props.isBusy ? "motion-safe:animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
                </svg>
              </button>
              <ThemeToggle />
              <SettingsButton onClick={() => props.onOpenSettings()} />
            </div>
          </div>
        </div>

        {hasExtras ? (
          <div className="relative flex flex-wrap items-center gap-x-10 gap-y-2 border-t border-line px-6 py-3">
            {extras}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** One short line about notifications for the own class; details in the settings. */
function DesktopNotifications({
  push,
  audience,
  onOpenSettings,
}: {
  push: PushControls;
  audience: string | null;
  onOpenSettings: (focus?: SettingsFocus) => void;
}) {
  const { status, busy, message, enable } = push;
  if (status === "checking" || status === "unavailable" || status === "unsupported") {
    return null;
  }

  let text: React.ReactNode;
  let action: React.ReactNode;
  switch (status) {
    case "on":
      text = <>Benachrichtigungen an für {audience ?? "deine Klasse"}</>;
      action = (
        <button type="button" onClick={() => onOpenSettings("notifications")} aria-haspopup="dialog" className={smallButtonClass}>
          Einstellungen
        </button>
      );
      break;
    case "off":
      text = audience
        ? <>Benachrichtigungen für {audience}: aus</>
        : "Benachrichtigungen: lege zuerst deine Klasse fest";
      action = (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy || !audience}
          className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
        >
          Einschalten
        </button>
      );
      break;
    case "install":
      text = "Benachrichtigungen gibt es in der App auf dem Home-Bildschirm";
      action = (
        <button type="button" onClick={() => onOpenSettings("notifications")} aria-haspopup="dialog" className={smallButtonClass}>
          Wie?
        </button>
      );
      break;
    case "denied":
      text = "Benachrichtigungen sind im Browser blockiert";
      action = (
        <button type="button" onClick={() => onOpenSettings("notifications")} aria-haspopup="dialog" className={smallButtonClass}>
          Mehr
        </button>
      );
      break;
  }

  return (
    <div role="group" aria-label="Benachrichtigungen" className="flex items-center gap-3">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`size-4 shrink-0 ${status === "on" ? "text-accent-strong" : "text-muted"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <p className="text-sm text-muted">{text}</p>
      {action}
      <FadingStatus message={message} className="text-sm" />
    </div>
  );
}

/** All days of the plan side by side, each with its notices and changes. */
function DayBoard(props: DesktopViewProps & { data: SubstitutionPayload; selectedClass: string }) {
  const { days } = props;
  if (days.length === 0) {
    return (
      <div className={`mx-auto w-full max-w-xl ${cardClassName}`}>
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">Kein Plan online</p>
        <p className="mt-2 text-sm leading-6 text-muted">Die Schule hat gerade keinen Plan hochgeladen.</p>
      </div>
    );
  }

  return (
    // As many columns side by side as fit; a column wraps below on narrow windows.
    <div
      className="mx-auto grid w-full items-start"
      style={{
        maxWidth: boardWidth(days.length),
        gap: `${COLUMN_GAP_REM}rem`,
        gridTemplateColumns: `repeat(auto-fit, minmax(${COLUMN_MIN_REM}rem, 1fr))`,
      }}
    >
      {days.map((day) => (
        <DayColumn key={day.date} {...props} day={day} />
      ))}
    </div>
  );
}

function DayColumn({
  day,
  data,
  now,
  selectedClass,
  focusDate,
  pendingDate,
  classEntries,
  ownEntries,
  shownEntries,
  courseFilter,
  showOtherCourses,
  onToggleOtherCourses,
  findNew,
  onNewSeen,
  push,
  viewingOther,
}: DesktopViewProps & { day: PlanDay; data: SubstitutionPayload; selectedClass: string }) {
  const { date } = day;
  // Entries without a readable date are shown on every day (as on phones).
  const isOnDay = (entry: { date: string }) => !entry.date || entry.date === date;
  const entries = shownEntries.filter(isOnDay);
  const otherCourses = classEntries.filter(isOnDay).length - ownEntries.filter(isOnDay).length;
  const newKeys = findNew(entries);
  const notices = Array.from(
    new Set(data.notices.filter((notice) => !notice.date || notice.date === date).map((notice) => notice.text)),
  );
  const pending = date === pendingDate;
  const focused = date === focusDate;
  const past = isPastDate(date, now);
  const relative = relativeDayLabel(date, now);
  const headingId = `desktop-day-${date}`;
  const getShareText = () =>
    buildShareText({
      schoolClass: selectedClass,
      dayLabel: formatPlanDateLabel(date, now),
      entries,
      ownCoursesOnly: Boolean(courseFilter?.active) && !showOtherCourses,
      viewingOther,
      sourceUpdated: data.sourceUpdatedAt ? formatTimestamp(data.sourceUpdatedAt, now) : null,
      appUrl: classLink(window.location.origin, selectedClass),
      notices,
    });
  // Cards keyed by their content (see the phone view).
  const keyCounts = new Map<string, number>();
  const cardKeys = entries.map((entry) => {
    const key = entryKey(entry);
    const count = keyCounts.get(key) ?? 0;
    keyCounts.set(key, count + 1);
    return count === 0 ? key : `${key}#${count}`;
  });
  const compact = entries.length >= COMPACT_FROM;

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div
        className={`flex items-end justify-between gap-3 rounded-[1.4rem] border px-5 py-4 ${
          focused
            ? "border-accent/20 bg-accent text-white shadow-[0_14px_32px_rgba(31,107,103,0.28)]"
            : "border-line bg-card text-foreground shadow-[0_12px_30px_rgba(18,41,39,0.05)]"
        }`}
      >
        <h2 id={headingId} className="min-w-0">
          <span
            className={`block text-xs font-semibold uppercase tracking-[0.22em] ${
              focused ? "text-white/85" : past ? "text-warn" : "text-accent-strong"
            }`}
          >
            {relative ?? formatWeekday(date)}
            {past ? " · vergangen" : ""}
          </span>
          <span className="mt-1 block text-xl font-semibold tracking-[-0.03em]">{formatPlanDate(date)}</span>
        </h2>
        {day.weekLabel ? (
          <span className={`shrink-0 pb-0.5 text-sm font-medium ${focused ? "text-white/85" : "text-muted"}`}>
            {day.weekLabel}
          </span>
        ) : null}
      </div>

      {pending ? (
        <div className={cardClassName}>
          <p className="text-base font-semibold text-foreground">Noch nicht online</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Die Schule hat den Plan für {formatShortDate(date)} noch nicht hochgeladen. Er erscheint
            hier automatisch
            {push.status === "on" ? " – bei Änderungen bekommst du eine Benachrichtigung." : "."}
          </p>
        </div>
      ) : (
        <>
          <NoticesCard notices={notices} />
          <DaySummary
            entries={entries}
            newCount={newKeys.size}
            otherCourses={otherCourses}
            showingOtherCourses={showOtherCourses}
            onToggleOtherCourses={onToggleOtherCourses}
            getShareText={getShareText}
            courses={isCourseClass(selectedClass)}
          />
          {entries.length > 0 ? (
            <div className={compact ? "space-y-2.5" : "space-y-3"}>
              {entries.map((entry, index) => (
                <SubstitutionCard
                  key={cardKeys[index]}
                  entry={entry}
                  isNew={newKeys.has(entryKey(entry))}
                  onNewSeen={() => onNewSeen(entryKey(entry))}
                  showClassName={formatClassName(entry.className) !== selectedClass}
                  compact={compact}
                />
              ))}
            </div>
          ) : (
            <div className={cardClassName}>
              <p className="text-base font-semibold text-foreground">Keine Änderungen</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {courseFilter?.active && !showOtherCourses ? "Für deine Kurse alles" : "Alles"} nach Stundenplan.
              </p>
              <div className="mt-4 flex justify-center">
                <ShareButton getText={getShareText} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
