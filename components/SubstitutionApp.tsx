"use client";

import { useCallback, useEffect, useState } from "react";
import { ClassSelector } from "@/components/ClassSelector";
import { DAY_PANEL_ID, DaySelector, dayTabId } from "@/components/DaySelector";
import { DaySummary } from "@/components/DaySummary";
import { Header, type HeaderStatus } from "@/components/Header";
import { LoadingState } from "@/components/LoadingState";
import { NoticesCard } from "@/components/NoticesCard";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { RefreshButton } from "@/components/RefreshButton";
import { RefreshStatus } from "@/components/RefreshStatus";
import { SubstitutionCard } from "@/components/SubstitutionCard";
import { NotificationSettings } from "@/components/NotificationSettings";
import { Onboarding } from "@/components/Onboarding";
import { TeacherHint } from "@/components/TeacherFilter";
import { SettingsSheet, type SettingsFocus } from "@/components/SettingsSheet";
import { useSeenBaseline } from "@/hooks/useNewEntries";
import { useNow } from "@/hooks/useNow";
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
import { formatAge, formatPlanDateLabel, formatTimestamp, isPastDate } from "@/lib/format";
import { entryKey, findNewKeys } from "@/lib/seen";
import { buildShareText } from "@/lib/share";
import { pickDefaultDate } from "@/lib/time";
import type { SubstitutionPayload } from "@/lib/types";

type SubstitutionAppProps = {
  initialData: SubstitutionPayload | null;
  /** Day to show first, e.g. when opened from a notification. */
  initialDay?: string | null;
};

/** "?day=2026-10-09" in a URL opened from a notification. */
function dayFromUrl(url: string) {
  const day = new URL(url, "http://localhost").searchParams.get("day");
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

const cardClassName =
  "rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]";

function EmptyDay({
  selectedClass,
  dayLabel,
  filtered,
}: {
  selectedClass: string;
  dayLabel: string;
  /** Only the student's own courses are shown. */
  filtered: boolean;
}) {
  return (
    <div className={cardClassName}>
      <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
        Keine Vertretungen
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {dayLabel} sind {filtered ? `für deine Kurse in der ${selectedClass}` : `für die ${selectedClass}`}{" "}
        keine Änderungen eingetragen.
      </p>
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
  const [myStoredTeachers] = useStoredList(`kag:teachers:${myClass ?? ""}`);
  const myTeachers = myClass && isCourseClass(myClass) ? myStoredTeachers : [];
  const [showOtherCourses, setShowOtherCourses] = useState(false);
  const now = useNow();
  const seenBaseline = useSeenBaseline(data);
  const [settings] = useSettings();
  const push = usePushNotifications({
    schoolClass: myClass ?? null,
    teachers: myTeachers,
    notifyGroups: settings.notifyGroups,
    eveningSummary: settings.eveningSummary,
  });
  const onboarding = useOnboarding();
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

  const [chosenDate, setChosenDate] = useState<string | null>(initialDay);

  // A notification tapped while the app is open: show its day. Opening the
  // app also clears the number on its icon.
  useEffect(() => {
    const clearBadge = () => {
      if (document.visibilityState === "visible") {
        navigator.clearAppBadge?.().catch(() => undefined);
      }
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      const day = data?.type === "open-url" && data.url ? dayFromUrl(data.url) : null;
      if (day) {
        setChosenDate(day);
      }
    };
    clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", clearBadge);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  const days = data?.days ?? [];
  // Keep the user's choice while it is still part of the plan.
  const selectedDate = days.some((day) => day.date === chosenDate)
    ? chosenDate
    : pickDefaultDate(
        days.map((day) => day.date),
        now,
        settings.nextDayFromHour,
      );
  const selectedDay = days.find((day) => day.date === selectedDate) ?? null;
  const latestDate = days.at(-1)?.date ?? null;
  const planIsPast = latestDate !== null && isPastDate(latestDate, now);

  let headerStatus: HeaderStatus = "current";
  if (isBusy) {
    headerStatus = "updating";
  } else if (connectionError) {
    headerStatus = "offline";
  } else if (!data || data.stale || fromDevice || planIsPast) {
    headerStatus = "outdated";
  } else if (data.error) {
    headerStatus = "incomplete";
  }

  const dateLabel = selectedDay
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
  // Added or changed since the user last opened the app.
  const newKeys = settings.showNewBadges
    ? findNewKeys(seenBaseline, visibleEntries)
    : new Set<string>();
  const otherCourseCount =
    classEntries.filter(onSelectedDay).length - ownEntries.filter(onSelectedDay).length;
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
  const emptyDayLabel = selectedDay
    ? `Am ${selectedDay.dayLabel ?? formatPlanDateLabel(selectedDay.date, null)}`
    : "Heute";

  return (
    <>
      <PwaRegistrar />
      <PullToRefresh onRefresh={forceRefresh}>
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
          <Header
            selectedClass={selectedClass}
            dateLabel={dateLabel}
            weekLabel={selectedDay?.weekLabel ?? null}
            dateIsPast={selectedDate !== null && isPastDate(selectedDate, now)}
            sourceUpdatedLabel={formatTimestamp(data?.sourceUpdatedAt ?? null, now)}
            fetchedLabel={
              data?.lastUpdated ? formatAge(data.lastUpdated, now) : "noch nie"
            }
            status={headerStatus}
            onOpenSettings={() => openSettings()}
          />

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
                  Nur angesehen. Deine Klasse bleibt die{" "}
                  <span className="font-semibold text-foreground">{myClass}</span>, auch für
                  Benachrichtigungen.
                </p>
                <button
                  type="button"
                  onClick={() => chooseClass(myClass)}
                  className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-strong"
                >
                  Zur {myClass}
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

          {days.length > 1 && selectedDate ? (
            <DaySelector
              days={days}
              selectedDate={selectedDate}
              onChange={setChosenDate}
              counts={countsByDate}
              now={now}
            />
          ) : null}

          <NoticesCard notices={visibleNotices} />

          <section
            className="space-y-4"
            aria-live="polite"
            {...(days.length > 1 && selectedDate
              ? { id: DAY_PANEL_ID, role: "tabpanel", "aria-labelledby": dayTabId(selectedDate) }
              : {})}
          >
            {!data && isBusy ? <LoadingState /> : null}

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

            {data && selectedClass ? (
              <DaySummary
                entries={visibleEntries}
                newCount={newKeys.size}
                otherCourses={otherCourseCount}
                showingOtherCourses={showOtherCourses}
                onToggleOtherCourses={() => setShowOtherCourses((value) => !value)}
                getShareText={() =>
                  buildShareText({
                    schoolClass: selectedClass,
                    dayLabel: selectedDay ? dateLabel : "aktueller Plan",
                    entries: visibleEntries,
                    ownCoursesOnly: teachers.length > 0 && !showOtherCourses,
                    sourceUpdated: data.sourceUpdatedAt
                      ? formatTimestamp(data.sourceUpdatedAt, now)
                      : null,
                  })
                }
              />
            ) : null}

            {data && selectedClass ? (
              visibleEntries.length > 0 ? (
                visibleEntries.map((entry) => (
                  <SubstitutionCard
                    key={entry.id}
                    entry={entry}
                    isNew={newKeys.has(entryKey(entry))}
                    showClassName={formatClassName(entry.className) !== selectedClass}
                  />
                ))
              ) : (
                <EmptyDay
                  selectedClass={selectedClass}
                  dayLabel={emptyDayLabel}
                  filtered={teachers.length > 0 && !showOtherCourses}
                />
              )
            ) : null}
          </section>

        </main>
      </PullToRefresh>

      <RefreshButton onRefresh={() => void forceRefresh()} refreshing={isBusy} />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        focus={settingsFocus}
        courseFilter={
          usesCourseFilter && selectedClass
            ? {
                schoolClass: selectedClass,
                selected: storedTeachers,
                suggestions: teacherSuggestions,
                onChange: (value) => {
                  setShowOtherCourses(false);
                  setTeachers(value);
                },
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
          push={push}
          onFinish={onboarding.finish}
        />
      ) : null}
    </>
  );
}
