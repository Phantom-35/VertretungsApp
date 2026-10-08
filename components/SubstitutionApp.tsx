"use client";

import { useCallback, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ClassSelector } from "@/components/ClassSelector";
import { DaySelector } from "@/components/DaySelector";
import { Header, type HeaderStatus } from "@/components/Header";
import { LoadingState } from "@/components/LoadingState";
import { NoticesCard } from "@/components/NoticesCard";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { RefreshStatus } from "@/components/RefreshStatus";
import { SubstitutionCard } from "@/components/SubstitutionCard";
import { useNow } from "@/hooks/useNow";
import { useSelectedClass } from "@/hooks/useSelectedClass";
import { useSubstitutionData } from "@/hooks/useSubstitutionData";
import {
  SCHOOL_CLASSES,
  compareEntries,
  entryAppliesToClass,
  formatClassName,
} from "@/lib/entries";
import { formatAge, formatPlanDateLabel, formatTimestamp, isPastDate } from "@/lib/format";
import { schoolToday } from "@/lib/time";
import type { PlanDay, SubstitutionPayload } from "@/lib/types";

type SubstitutionAppProps = {
  initialData: SubstitutionPayload | null;
};

const cardClassName =
  "rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]";

/** Today if the plan has it, otherwise the next upcoming day, otherwise the latest. */
function pickDefaultDay(days: PlanDay[], now: number | null) {
  if (days.length === 0) {
    return null;
  }
  if (now === null) {
    return days[0].date;
  }

  const today = schoolToday(now);
  return (days.find((day) => day.date >= today) ?? days[days.length - 1]).date;
}

function EmptyDay({ selectedClass, dayLabel }: { selectedClass: string; dayLabel: string }) {
  return (
    <div className={cardClassName}>
      <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
        Keine Vertretungen
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {dayLabel} sind für die {selectedClass} keine Änderungen eingetragen.
      </p>
    </div>
  );
}

export function SubstitutionApp({ initialData }: SubstitutionAppProps) {
  const { data, fromDevice, status, connectionError, refresh } =
    useSubstitutionData(initialData);
  const [selectedClass, setSelectedClass] = useSelectedClass();
  const now = useNow();

  const forceRefresh = useCallback(() => refresh(true), [refresh]);
  const isBusy = status !== "idle";

  const [chosenDate, setChosenDate] = useState<string | null>(null);

  const days = data?.days ?? [];
  // Keep the user's choice while it is still part of the plan.
  const selectedDate = days.some((day) => day.date === chosenDate)
    ? chosenDate
    : pickDefaultDay(days, now);
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
    ? [formatPlanDateLabel(selectedDay.date, now), selectedDay.weekLabel]
        .filter(Boolean)
        .join(" · ")
    : isBusy
      ? "Wird geladen …"
      : "–";

  const classEntries =
    data && selectedClass
      ? data.entries
          .filter((entry) => entryAppliesToClass(entry.className, selectedClass))
          .sort(compareEntries)
      : [];
  const countsByDate = selectedClass
    ? new Map(
        days.map((day) => [
          day.date,
          classEntries.filter((entry) => entry.date === day.date).length,
        ]),
      )
    : null;
  // Entries without a readable date are shown on every day.
  const visibleEntries = classEntries.filter(
    (entry) => !selectedDate || !entry.date || entry.date === selectedDate,
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
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
          <Header
            selectedClass={selectedClass}
            dateLabel={dateLabel}
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
            onChange={setSelectedClass}
          />

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

          <section className="space-y-4" aria-live="polite">
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
                  className="mt-4 rounded-full bg-warn px-5 py-2 text-sm font-semibold text-white"
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
              visibleEntries.length > 0 ? (
                visibleEntries.map((entry) => (
                  <SubstitutionCard
                    key={entry.id}
                    entry={entry}
                    showClassName={formatClassName(entry.className) !== selectedClass}
                  />
                ))
              ) : (
                <EmptyDay selectedClass={selectedClass} dayLabel={emptyDayLabel} />
              )
            ) : null}
          </section>
        </main>
      </PullToRefresh>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(247,245,239,0),rgba(247,245,239,0.94)_70%)]" />
      <div className="fixed inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
        <BottomNav onRefresh={() => void forceRefresh()} refreshing={isBusy} />
      </div>
    </>
  );
}
