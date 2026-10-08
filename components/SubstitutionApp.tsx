"use client";

import { useCallback } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ClassSelector } from "@/components/ClassSelector";
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
import {
  formatAge,
  formatPlanDate,
  formatPlanDateLabel,
  formatTimestamp,
  isPastDate,
  relativeDayLabel,
} from "@/lib/format";
import type { SubstitutionPayload } from "@/lib/types";

type SubstitutionAppProps = {
  initialData: SubstitutionPayload | null;
};

const cardClassName =
  "rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]";

function EmptyDay({ selectedClass }: { selectedClass: string }) {
  return (
    <div className={cardClassName}>
      <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
        Keine Vertretungen
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Für die {selectedClass} sind keine Änderungen eingetragen.
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

  const dates = data?.dates ?? [];
  const isMultiDay = dates.length > 1;
  const latestDate = dates.at(-1) ?? null;
  const planIsPast = latestDate !== null && isPastDate(latestDate, now);

  let headerStatus: HeaderStatus = "current";
  if (isBusy) {
    headerStatus = "updating";
  } else if (connectionError) {
    headerStatus = "offline";
  } else if (!data || data.stale || fromDevice || planIsPast) {
    headerStatus = "outdated";
  }

  const dateLabel =
    dates.length === 0
      ? isBusy
        ? "Wird geladen …"
        : "–"
      : isMultiDay
        ? dates
            .map((date) => relativeDayLabel(date, now) ?? formatPlanDate(date))
            .join(" · ")
        : formatPlanDateLabel(dates[0], now);

  const visibleEntries =
    data && selectedClass
      ? data.entries
          .filter((entry) => entryAppliesToClass(entry.className, selectedClass))
          .sort(compareEntries)
      : [];

  const groupDates = Array.from(
    new Set([...dates, ...visibleEntries.map((entry) => entry.date)]),
  );
  if (groupDates.length === 0) {
    groupDates.push("");
  }

  const getDayHeading = (date: string | null) =>
    isMultiDay && date ? formatPlanDateLabel(date, now) : null;

  return (
    <>
      <PwaRegistrar />
      <PullToRefresh onRefresh={forceRefresh}>
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
          <Header
            selectedClass={selectedClass}
            dateLabel={dateLabel}
            dateIsPast={planIsPast}
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
              onRetry={() => void forceRefresh()}
            />
          ) : null}

          {data ? (
            <NoticesCard notices={data.notices} getDateLabel={getDayHeading} />
          ) : null}

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

            {data && selectedClass
              ? groupDates.map((date) => {
                  const entries = visibleEntries.filter((entry) => entry.date === date);
                  const heading = getDayHeading(date);

                  return (
                    <div key={date} className="space-y-3">
                      {heading ? (
                        <h2 className="px-1 pt-1 text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                          {heading}
                        </h2>
                      ) : null}
                      {entries.length > 0 ? (
                        entries.map((entry) => (
                          <SubstitutionCard
                            key={entry.id}
                            entry={entry}
                            showClassName={
                              formatClassName(entry.className) !== selectedClass
                            }
                          />
                        ))
                      ) : (
                        <EmptyDay selectedClass={selectedClass} />
                      )}
                    </div>
                  );
                })
              : null}
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
