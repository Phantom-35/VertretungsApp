"use client";

import { useCallback, useState } from "react";
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
import { TeacherFilter } from "@/components/TeacherFilter";
import { ThemeChoice } from "@/components/ThemeSettings";
import { useSeenBaseline } from "@/hooks/useNewEntries";
import { useNow } from "@/hooks/useNow";
import { useSelectedClass } from "@/hooks/useSelectedClass";
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
};

/** How many other classes are kept for switching with one tap. */
const MAX_RECENT_CLASSES = 4;

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

export function SubstitutionApp({ initialData }: SubstitutionAppProps) {
  const { data, fromDevice, status, connectionError, refresh } =
    useSubstitutionData(initialData);
  const [selectedClass, setSelectedClass] = useSelectedClass();
  const [recentClasses, setRecentClasses] = useStoredList("kag:recent-classes");
  const courseFilterKey = `kag:teachers:${selectedClass ?? ""}`;
  const [storedTeachers, setTeachers] = useStoredList(courseFilterKey);
  const [showOtherCourses, setShowOtherCourses] = useState(false);
  const now = useNow();
  const seenBaseline = useSeenBaseline(data);

  const usesCourseFilter = Boolean(selectedClass && isCourseClass(selectedClass));
  const teachers = usesCourseFilter ? storedTeachers : [];

  const chooseClass = (value: string) => {
    // Remember the class that is being left, e.g. to switch back to a sibling's.
    if (selectedClass && selectedClass !== value) {
      setRecentClasses(
        [selectedClass, ...recentClasses.filter((item) => item !== selectedClass && item !== value)]
          .slice(0, MAX_RECENT_CLASSES),
      );
    }
    setShowOtherCourses(false);
    setSelectedClass(value);
  };
  const otherRecentClasses = recentClasses.filter((item) => item !== selectedClass);

  const forceRefresh = useCallback(() => refresh(true), [refresh]);
  const isBusy = status !== "idle";

  const [chosenDate, setChosenDate] = useState<string | null>(null);

  const days = data?.days ?? [];
  // Keep the user's choice while it is still part of the plan.
  const selectedDate = days.some((day) => day.date === chosenDate)
    ? chosenDate
    : pickDefaultDate(
        days.map((day) => day.date),
        now,
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
  const newKeys = findNewKeys(seenBaseline, visibleEntries);
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
          />

          <ClassSelector
            classes={SCHOOL_CLASSES}
            selectedClass={selectedClass}
            onChange={chooseClass}
            recentClasses={otherRecentClasses}
            onForget={(value) =>
              setRecentClasses(recentClasses.filter((item) => item !== value))
            }
          >
            {usesCourseFilter && selectedClass ? (
              <TeacherFilter
                key={selectedClass}
                schoolClass={selectedClass}
                selected={storedTeachers}
                suggestions={teacherSuggestions}
                onChange={(value) => {
                  setShowOtherCourses(false);
                  setTeachers(value);
                }}
              />
            ) : null}
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
                shareTitle={`Vertretungsplan ${selectedClass}`}
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

          <footer className="mt-4 border-t border-line pt-4">
            <ThemeChoice />
          </footer>
        </main>
      </PullToRefresh>

      <RefreshButton onRefresh={() => void forceRefresh()} refreshing={isBusy} />
    </>
  );
}
