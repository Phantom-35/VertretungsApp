"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ClassSelector } from "@/components/ClassSelector";
import { DAY_PANEL_ID, DaySelector, dayTabId } from "@/components/DaySelector";
import { DaySummary } from "@/components/DaySummary";
import { Header, type HeaderStatus } from "@/components/Header";
import { HolidayCard } from "@/components/HolidayCard";
import { LoadingState } from "@/components/LoadingState";
import { NoticesCard } from "@/components/NoticesCard";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { RefreshStatus } from "@/components/RefreshStatus";
import { ShareButton } from "@/components/ShareButton";
import { SubstitutionCard } from "@/components/SubstitutionCard";
import { InstallReminder } from "@/components/InstallReminder";
import { NotificationSettings } from "@/components/NotificationSettings";
import { Onboarding } from "@/components/Onboarding";
import { TeacherHint } from "@/components/TeacherFilter";
import { SettingsSheet, type SettingsFocus } from "@/components/SettingsSheet";
import { acknowledgeNewEntry, useAcknowledgedEntries, useSeenBaseline } from "@/hooks/useNewEntries";
import { useNow, useOpened } from "@/hooks/useNow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useMyClass, useViewedClass } from "@/hooks/useSelectedClass";
import { useSettings } from "@/hooks/useSettings";
import { useStoredList } from "@/hooks/useStoredList";
import { useSubstitutionData } from "@/hooks/useSubstitutionData";
import {
  SCHOOL_CLASSES,
  compareEntries,
  entryAppliesToClass,
  entryMatchesTeachers,
  formatClassName,
  isCourseClass,
  normalizeTeacher,
} from "@/lib/entries";
import { formatAge, formatPlanDateLabel, formatShortDate, formatTimestamp, isPastDate } from "@/lib/format";
import { holidayBreak } from "@/lib/holidays";
import { entryKey, findNewKeys } from "@/lib/seen";
import { buildShareText } from "@/lib/share";
import { pickDefaultDate, schoolToday } from "@/lib/time";
import type { SubstitutionPayload } from "@/lib/types";

type SubstitutionAppProps = {
  initialData: SubstitutionPayload | null;
  /** Day to show first, e.g. when opened from a notification. */
  initialDay?: string | null;
};

const noSubscribe = () => () => undefined;
const dayInAddress = () => dayFromUrl(window.location.href);

/** "?day=2026-10-09" in a URL opened from a notification. */
function dayFromUrl(url: string) {
  const day = new URL(url, "http://localhost").searchParams.get("day");
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** From this many changes on a day, the cards are shown smaller. */
const COMPACT_FROM = 6;

const cardClassName =
  "rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]";

function EmptyDay({
  selectedClass,
  dayLabel,
  filtered,
  getShareText,
}: {
  selectedClass: string;
  dayLabel: string;
  /** Only the student's own courses are shown. */
  filtered: boolean;
  getShareText: () => string;
}) {
  return (
    <div className={cardClassName}>
      <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
        Keine Änderungen
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {dayLabel} sind {filtered ? `für deine Kurse in der ${selectedClass}` : `für die ${selectedClass}`}{" "}
        keine Änderungen eingetragen.
      </p>
      <div className="mt-4 flex justify-center">
        <ShareButton getText={getShareText} size="large" />
      </div>
    </div>
  );
}

export function SubstitutionApp({ initialData, initialDay = null }: SubstitutionAppProps) {
  const { data, fromDevice, status, connectionError, refresh } =
    useSubstitutionData(initialData);
  // The student's own class (opens with it, notifications are about it) and
  // another class only looked at until the app is closed.
  const [myClass, setMyClass] = useMyClass();
  const [viewedClass, setViewedClass] = useViewedClass();
  const selectedClass = viewedClass ?? myClass;
  const courseFilterKey = `kag:teachers:${selectedClass ?? ""}`;
  const [storedTeachers, setTeachers] = useStoredList(courseFilterKey);
  const [myStoredTeachers, setMyTeachers] = useStoredList(`kag:teachers:${myClass ?? ""}`);
  const myTeachers = myClass && isCourseClass(myClass) ? myStoredTeachers : [];
  const [showOtherCourses, setShowOtherCourses] = useState(false);
  const now = useNow();
  const seenBaseline = useSeenBaseline(data);
  const acknowledgedNew = useAcknowledgedEntries();
  const [settings] = useSettings();
  const push = usePushNotifications({
    schoolClass: myClass ?? null,
    teachers: myTeachers,
    notifyGroups: settings.notifyGroups,
    eveningSummary: settings.eveningSummary,
    morningSummary: settings.morningSummary,
  });
  const onboarding = useOnboarding();
  // The sections glide in when the app opens, not when one appears later.
  const [opening, setOpening] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setOpening(false), 1_200);
    return () => window.clearTimeout(timer);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>(null);
  const openSettings = (focus: SettingsFocus = null) => {
    setSettingsFocus(focus);
    setSettingsOpen(true);
  };

  const usesCourseFilter = Boolean(selectedClass && isCourseClass(selectedClass));
  const teachers = usesCourseFilter ? storedTeachers : [];

  const chooseClass = (value: string) => {
    setShowOtherCourses(false);
    if (!myClass) {
      // Nothing chosen as own class yet: the first class picked becomes it.
      setMyClass(value);
      setViewedClass(null);
    } else {
      setViewedClass(value === myClass ? null : value);
    }
  };
  const chooseMyClass = (value: string) => {
    setShowOtherCourses(false);
    setMyClass(value);
    setViewedClass(null);
  };

  const forceRefresh = useCallback(() => refresh(true), [refresh]);
  const isBusy = status !== "idle";

  // A day tapped by the user (or in a notification while the app is open),
  // with the school day it was chosen on: the next day it no longer applies.
  const [chosen, setChosen] = useState<{ date: string; on: string } | null>(null);
  const opened = useOpened();
  const openedDay = opened !== null ? schoolToday(opened.last) : null;
  // A choice belongs to the opening it was made in (also past midnight while
  // the app stays on screen).
  const openedDayRef = useRef(openedDay);
  useEffect(() => {
    openedDayRef.current = openedDay;
  }, [openedDay]);
  const chooseDate = useCallback(
    (date: string) => setChosen({ date, on: openedDayRef.current ?? schoolToday(Date.now()) }),
    [],
  );
  const chosenDate = chosen && (openedDay === null || chosen.on === openedDay) ? chosen.date : null;
  // A page served from the service worker cache was rendered without
  // "?day=" (e.g. opened from a notification): the address still has it.
  // Like a choice, it only applies on the day the app was opened with it.
  const addressDay = useSyncExternalStore(noSubscribe, dayInAddress, () => null);
  const linkDayApplies = opened === null || schoolToday(opened.first) === openedDay;
  // After hydration the address is the truth: a cached page may carry the
  // day it was rendered for.
  const linkDay = opened === null ? initialDay : addressDay;
  const requestedDate = chosenDate ?? (linkDayApplies ? linkDay : null);

  // A notification tapped while the app is open: show its day. Opening the
  // app also clears the number on its icon.
  useEffect(() => {
    const clearBadge = () => {
      if (document.visibilityState === "visible") {
        navigator.clearAppBadge?.().catch(() => undefined);
        // The count the service worker adds new changes to (see sw.js).
        window.caches?.delete("kag-badge").catch(() => undefined);
      }
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      const day = data?.type === "open-url" && data.url ? dayFromUrl(data.url) : null;
      if (day) {
        chooseDate(day);
      }
    };
    clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", clearBadge);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [chooseDate]);

  const days = data?.days ?? [];
  // Keep the user's choice while it is still part of the plan.
  const selectedDate = days.some((day) => day.date === requestedDate)
    ? requestedDate
    : pickDefaultDate(
        days.map((day) => day.date),
        // Decided when the app is opened, not on every tick: at 16:00 the
        // view does not jump to tomorrow while the user is reading.
        opened?.last ?? now,
        settings.nextDayFromHour,
      );
  const selectedDay = days.find((day) => day.date === selectedDate) ?? null;
  const latestDate = days.at(-1)?.date ?? null;
  const planIsPast = latestDate !== null && isPastDate(latestDate, now);

  // School holidays or a public holiday (NRW) without a plan for the days
  // ahead yet: a friendly card instead of an old plan that looks out of date.
  const today = now !== null ? schoolToday(now) : null;
  const holiday = today !== null ? holidayBreak(today) : null;
  const planAhead = today !== null && days.some((day) => day.date >= today);
  const [showOldPlan, setShowOldPlan] = useState(false);
  const holidayMode = Boolean(holiday && !planAhead && !showOldPlan);

  let headerStatus: HeaderStatus = "current";
  if (isBusy) {
    headerStatus = "updating";
  } else if (connectionError) {
    headerStatus = "offline";
  } else if (holiday && !planAhead) {
    headerStatus = holiday.kind === "holidays" ? "holiday" : "public-holiday";
  } else if (!data || data.stale || fromDevice) {
    headerStatus = "outdated";
  } else if (planIsPast) {
    // Up to date, but only past days: the next plan is not online yet.
    headerStatus = "waiting";
  } else if (data.error) {
    headerStatus = "incomplete";
  }

  const dateLabel = holidayMode && holiday
    ? holiday.from === holiday.to || holiday.kind === "public-holiday"
      ? holiday.name
      : `${holiday.name} bis ${formatShortDate(holiday.to)}`
    : selectedDay
    ? formatPlanDateLabel(selectedDay.date, now)
    : isBusy
      ? "Wird geladen …"
      : "–";

  const classEntries =
    data && selectedClass
      ? data.entries
          .filter((entry) => entryAppliesToClass(entry.className, selectedClass))
          .sort(compareEntries)
      : [];
  // Upper school: only the courses of the student's teachers, unless asked.
  const ownEntries = classEntries.filter((entry) => entryMatchesTeachers(entry, teachers));
  const shownEntries = showOtherCourses ? classEntries : ownEntries;
  // Entries without a readable date are shown (and counted) on every day.
  const isOnDay = (entry: { date: string }, date: string | null) =>
    !date || !entry.date || entry.date === date;
  const onSelectedDay = (entry: { date: string }) => isOnDay(entry, selectedDate);
  const countsByDate = selectedClass
    ? new Map(
        days.map((day) => [
          day.date,
          shownEntries.filter((entry) => isOnDay(entry, day.date)).length,
        ]),
      )
    : null;
  const visibleEntries = shownEntries.filter(onSelectedDay);
  const compactCards = visibleEntries.length >= COMPACT_FROM;
  // Cards keyed by their content, not by the plan's page numbers (which shift
  // with every upload): a badge keeps its state across refreshes, and an
  // edited entry is a new card with a fresh badge.
  const keyCounts = new Map<string, number>();
  const cardKeys = visibleEntries.map((entry) => {
    const key = entryKey(entry);
    const count = keyCounts.get(key) ?? 0;
    keyCounts.set(key, count + 1);
    return count === 0 ? key : `${key}#${count}`;
  });
  // Added or changed since the user last opened the app.
  // Badges seen long enough on screen are gone (and no longer counted).
  const newKeys = settings.showNewBadges
    ? findNewKeys(seenBaseline, visibleEntries, acknowledgedNew)
    : new Set<string>();
  const otherCourseCount =
    classEntries.filter(onSelectedDay).length - ownEntries.filter(onSelectedDay).length;
  // Teachers of the own class in the plan, for choosing courses in the introduction.
  const myTeacherSuggestions = Array.from(
    new Set(
      (data?.entries ?? [])
        .filter((entry) => myClass && entryAppliesToClass(entry.className, myClass))
        .map((entry) => normalizeTeacher(entry.teacher))
        .filter((teacher): teacher is string => teacher !== null),
    ),
  );
  const teacherSuggestions = Array.from(
    new Set(
      classEntries
        .map((entry) => normalizeTeacher(entry.teacher))
        .filter((teacher): teacher is string => teacher !== null),
    ),
  );
  const visibleNotices = Array.from(
    new Set(
      (data?.notices ?? [])
        .filter((notice) => !selectedDate || !notice.date || notice.date === selectedDate)
        .map((notice) => notice.text),
    ),
  );
  // The day's changes as text for messengers (also "no changes").
  const getShareText = () =>
    buildShareText({
      schoolClass: selectedClass ?? "",
      dayLabel: selectedDay ? dateLabel : "aktueller Plan",
      entries: visibleEntries,
      ownCoursesOnly: teachers.length > 0 && !showOtherCourses,
      sourceUpdated: data?.sourceUpdatedAt ? formatTimestamp(data.sourceUpdatedAt, now) : null,
      appUrl: `${window.location.origin}/`,
    });
  const emptyDayLabel = selectedDay
    ? `Am ${selectedDay.dayLabel ?? formatPlanDateLabel(selectedDay.date, null)}`
    : "Heute";

  return (
    <>
      <PwaRegistrar />
      <PullToRefresh onRefresh={forceRefresh}>
        <main
          className={`${opening ? "app-enter " : ""}mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5`}
        >
          <Header
            selectedClass={selectedClass}
            dateLabel={dateLabel}
            weekLabel={holidayMode ? null : (selectedDay?.weekLabel ?? null)}
            dateIsPast={!holidayMode && selectedDate !== null && isPastDate(selectedDate, now)}
            sourceUpdatedLabel={formatTimestamp(data?.sourceUpdatedAt ?? null, now)}
            fetchedLabel={
              data?.lastUpdated ? formatAge(data.lastUpdated, now) : "noch nie"
            }
            status={headerStatus}
            onOpenSettings={() => openSettings()}
          />

          {/* Not during the introduction, which has its own install step. */}
          {onboarding.done ? <InstallReminder /> : null}

          <ClassSelector
            classes={SCHOOL_CLASSES}
            selectedClass={selectedClass}
            onChange={chooseClass}
            viewingOther={Boolean(viewedClass && myClass && viewedClass !== myClass)}
          >
            {usesCourseFilter && selectedClass ? (
              <TeacherHint
                schoolClass={selectedClass}
                selected={storedTeachers}
                onOpenSettings={() => openSettings("teachers")}
              />
            ) : null}
            {viewedClass && myClass && viewedClass !== myClass ? (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="min-w-0 text-sm leading-5 text-muted">
                  Nur angesehen. Beim nächsten Öffnen und für Benachrichtigungen gilt weiter die{" "}
                  <span className="font-semibold text-foreground">{myClass}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => chooseClass(myClass)}
                  className="tap-target shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-strong"
                >
                  Zurück zur {myClass}
                </button>
              </div>
            ) : null}
            <NotificationSettings push={push} schoolClass={myClass} teachers={myTeachers} />
          </ClassSelector>

          {data ? (
            <RefreshStatus
              connectionError={connectionError}
              stale={data.stale}
              error={data.error}
              warnings={data.warnings}
              lastSuccessLabel={formatAge(
                data.lastSuccessfulUpdate ?? data.lastUpdated,
                now,
              )}
              sourceUrl={data.sourceUrl}
              onRetry={() => void forceRefresh()}
            />
          ) : null}

          {headerStatus === "waiting" ? (
            <p className="rounded-[1.4rem] border border-line bg-card px-4 py-3 text-sm leading-6 text-muted">
              Der nächste Plan ist noch nicht online. Bis die Schule ihn hochlädt, siehst du hier
              den letzten Plan.
            </p>
          ) : null}

          {!holidayMode && days.length > 1 && selectedDate ? (
            <DaySelector
              days={days}
              selectedDate={selectedDate}
              onChange={chooseDate}
              counts={countsByDate}
              now={now}
            />
          ) : null}

          {!holidayMode ? <NoticesCard notices={visibleNotices} /> : null}

          {/* Read out after switching day or class: a short summary, not the whole list. */}
          <p role="status" className="sr-only">
            {!holidayMode && data && selectedClass && selectedDay
              ? `${selectedClass}, ${dateLabel}: ${
                  visibleEntries.length === 0
                    ? "keine Änderungen"
                    : visibleEntries.length === 1
                      ? "1 Änderung"
                      : `${visibleEntries.length} Änderungen`
                }`
              : ""}
          </p>

          <section
            className="space-y-4"
            {...(days.length > 1 && selectedDate
              ? { id: DAY_PANEL_ID, role: "tabpanel", "aria-labelledby": dayTabId(selectedDate) }
              : {})}
          >
            {!data && isBusy ? <LoadingState /> : null}

            {holidayMode && holiday && selectedClass !== null ? (
              <HolidayCard holiday={holiday} today={today} hasOldPlan={days.length > 0} onShowOldPlan={() => setShowOldPlan(true)} />
            ) : null}

            {!data && !isBusy ? (
              <div className="rounded-[1.75rem] border border-warn/15 bg-warn-soft p-6 text-center">
                <p className="text-lg font-semibold text-warn">
                  Vertretungsplan momentan nicht erreichbar.
                </p>
                <p className="mt-2 text-sm leading-6 text-warn">
                  {connectionError ?? "Bitte versuche es in ein paar Minuten erneut."}
                </p>
                <button
                  type="button"
                  onClick={() => void forceRefresh()}
                  className="mt-4 rounded-full bg-warn px-5 py-2 text-sm font-semibold text-on-warn"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : null}

            {data && selectedClass === null ? (
              <div className={cardClassName}>
                <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                  Wähle deine Klasse
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Dann siehst du hier nur die Vertretungen, die dich betreffen.
                  Die Auswahl wird auf diesem Gerät gespeichert.
                </p>
              </div>
            ) : null}

            {!holidayMode && data && selectedClass ? (
              <DaySummary
                entries={visibleEntries}
                newCount={newKeys.size}
                otherCourses={otherCourseCount}
                showingOtherCourses={showOtherCourses}
                onToggleOtherCourses={() => setShowOtherCourses((value) => !value)}
                getShareText={getShareText}
              />
            ) : null}

            {!holidayMode && data && selectedClass ? (
              visibleEntries.length > 0 ? (
                // Many changes (e.g. the upper school): smaller cards, closer together.
                <div className={compactCards ? "space-y-2.5" : "space-y-4"}>
                  {visibleEntries.map((entry, index) => (
                    <SubstitutionCard
                      key={cardKeys[index]}
                      entry={entry}
                      isNew={newKeys.has(entryKey(entry))}
                      onNewSeen={() => acknowledgeNewEntry(entryKey(entry))}
                      showClassName={formatClassName(entry.className) !== selectedClass}
                      compact={compactCards}
                    />
                  ))}
                </div>
              ) : (
                <EmptyDay
                  selectedClass={selectedClass}
                  dayLabel={emptyDayLabel}
                  filtered={teachers.length > 0 && !showOtherCourses}
                  getShareText={getShareText}
                />
              )
            ) : null}
          </section>

        </main>
      </PullToRefresh>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        focus={settingsFocus}
        courseFilter={
          // The upper-school class on screen; otherwise the own one, whose
          // courses the notifications are about.
          usesCourseFilter && selectedClass
            ? {
                schoolClass: selectedClass,
                own: selectedClass === myClass,
                selected: storedTeachers,
                suggestions: teacherSuggestions,
                onChange: (value) => {
                  setShowOtherCourses(false);
                  setTeachers(value);
                },
              }
            : myClass && isCourseClass(myClass)
              ? {
                  schoolClass: myClass,
                  own: true,
                  selected: myStoredTeachers,
                  suggestions: myTeacherSuggestions,
                  onChange: setMyTeachers,
                }
              : null
        }
        sourceUrl={data?.sourceUrl}
        myClass={myClass ?? null}
        onChooseMyClass={chooseMyClass}
        onShowIntroduction={() => {
          setSettingsOpen(false);
          onboarding.restart();
        }}
      />
      {!onboarding.done ? (
        <Onboarding
          myClass={myClass ?? null}
          onChooseClass={chooseMyClass}
          courseTeachers={myStoredTeachers}
          courseSuggestions={myTeacherSuggestions}
          onChangeCourseTeachers={(value) => {
            setShowOtherCourses(false);
            setMyTeachers(value);
          }}
          push={push}
          onFinish={onboarding.finish}
        />
      ) : null}
    </>
  );
}
