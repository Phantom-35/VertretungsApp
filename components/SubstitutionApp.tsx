"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from "react";
import { BottomNav } from "@/components/BottomNav";
import { ClassSelector } from "@/components/ClassSelector";
import { Header } from "@/components/Header";
import { LoadingState } from "@/components/LoadingState";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { RefreshStatus } from "@/components/RefreshStatus";
import { SubstitutionCard } from "@/components/SubstitutionCard";
import type { SubstitutionPayload } from "@/lib/types";

const CLASS_STORAGE_KEY = "kag:selected-class";
const DATA_STORAGE_KEY = "kag:substitution-cache";
const REFRESH_INTERVAL_MS = 600_000;
const SCHOOL_CLASSES = [
  ...[5, 6, 7, 8, 9, 10].flatMap((grade) =>
    ["A", "B", "C", "D"].map((suffix) => `${grade}${suffix}`),
  ),
  "EF",
  "Q1",
  "Q2",
];

type SubstitutionAppProps = {
  initialData: SubstitutionPayload;
};

function formatDateLabel(date: string | null) {
  if (!date) {
    return "Datum wird geladen";
  }

  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatDateTimeLabel(value: string | null) {
  if (!value) {
    return "Noch nicht aktualisiert";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function readStoredPayload() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DATA_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SubstitutionPayload;
  } catch {
    return null;
  }
}

function normalizeSelectedClass(value: string) {
  const normalized = value.trim().toUpperCase().replace(/^0+(\d)/, "$1");
  return SCHOOL_CLASSES.includes(normalized) ? normalized : null;
}

function entryAppliesToClass(entryClassName: string, selectedClass: string) {
  const sourceClass = entryClassName.replace(/\s+/g, "").toUpperCase();
  const schoolClass = selectedClass.toUpperCase();

  if (sourceClass === schoolClass) {
    return true;
  }

  const selectedMatch = schoolClass.match(/^(\d{1,2})([A-D])$/);
  const sourceMatch = sourceClass.match(/^0?(\d{1,2})([A-D]+)$/);

  return Boolean(
    selectedMatch &&
      sourceMatch &&
      selectedMatch[1] === sourceMatch[1] &&
      sourceMatch[2].includes(selectedMatch[2]),
  );
}

export function SubstitutionApp({ initialData }: SubstitutionAppProps) {
  const [data, setData] = useState<SubstitutionPayload>(initialData);
  const [preferredClass, setPreferredClass] = useState(SCHOOL_CLASSES[0]);
  const [hasRestoredPreferences, setHasRestoredPreferences] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialData.success);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const storedPayload = readStoredPayload();
    const storedClass = window.localStorage.getItem(CLASS_STORAGE_KEY) ?? "";
    const timerId = window.setTimeout(() => {
      if (storedPayload?.success) {
        startTransition(() =>
          setData((currentData) =>
            !currentData.lastUpdated ||
            (storedPayload.lastUpdated ?? "") >
              (currentData.lastUpdated ?? "")
              ? storedPayload
              : currentData,
          ),
        );
      }

      const normalizedClass = normalizeSelectedClass(storedClass);
      if (normalizedClass) {
        setPreferredClass(normalizedClass);
      }
      setHasRestoredPreferences(true);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (!hasRestoredPreferences || !preferredClass) {
      return;
    }

    window.localStorage.setItem(CLASS_STORAGE_KEY, preferredClass);
  }, [hasRestoredPreferences, preferredClass]);

  const refreshData = useCallback(async (force = false) => {
    if (force) {
      setIsRefreshing(true);
    } else if (!data.success) {
      setIsLoading(true);
    }

    try {
      const response = await fetch(
        force ? "/api/substitution?force=1" : "/api/substitution",
        { cache: "no-store" },
      );
      const payload = (await response.json()) as SubstitutionPayload;

      if (payload.success) {
        startTransition(() => setData(payload));
        window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(payload));
      } else if (payload.stale && payload.entries.length > 0) {
        startTransition(() => setData(payload));
      }
    } catch {
      const storedPayload = readStoredPayload();
      if (storedPayload?.success) {
        startTransition(() =>
          setData({
            ...storedPayload,
            stale: true,
            error: "Vertretungsplan momentan nicht erreichbar.",
          }),
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [data.success]);

  useEffect(() => {
    const kickoffId = window.setTimeout(() => {
      void refreshData(false);
    }, 0);

    const intervalId = window.setInterval(() => {
      void refreshData(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearTimeout(kickoffId);
      window.clearInterval(intervalId);
    };
  }, [refreshData]);

  const selectedClass = preferredClass;

  const entries = selectedClass
    ? data.entries.filter((entry) =>
        entryAppliesToClass(entry.className, selectedClass),
      )
    : [];

  return (
    <>
      <PwaRegistrar />
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
        <Header
          selectedClass={selectedClass}
          dateLabel={formatDateLabel(data.date)}
          lastUpdatedLabel={formatDateTimeLabel(data.lastUpdated)}
        />

        <ClassSelector
          classes={SCHOOL_CLASSES}
          selectedClass={selectedClass}
          onChange={setPreferredClass}
        />

        <RefreshStatus
          sourceUpdatedLabel={formatDateTimeLabel(
            data.sourceUpdatedAt ?? data.lastSuccessfulUpdate,
          )}
          stale={data.stale}
          error={data.error}
          notices={data.notices}
        />

        <section className="space-y-4">
          {isLoading ? <LoadingState /> : null}

          {!isLoading && entries.length > 0
            ? entries.map((entry) => (
                <SubstitutionCard key={entry.id} entry={entry} />
              ))
            : null}

          {!isLoading && data.success && selectedClass && entries.length === 0 ? (
            <div className="rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]">
              <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                Keine Vertretungen
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Heute sind für deine Klasse keine Änderungen eingetragen.
              </p>
            </div>
          ) : null}

          {!isLoading && !data.success ? (
            <div className="rounded-[1.75rem] border border-warn/15 bg-warn-soft p-6 text-center">
              <p className="text-lg font-semibold text-warn">
                Vertretungsplan momentan nicht erreichbar.
              </p>
              <p className="mt-2 text-sm leading-6 text-warn">
                Bitte versuche es in ein paar Minuten erneut.
              </p>
            </div>
          ) : null}
        </section>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(247,245,239,0),rgba(247,245,239,0.94)_70%)]" />
      <div className="fixed inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
        <BottomNav
          onRefresh={() => void refreshData(true)}
          refreshing={isRefreshing}
        />
      </div>
    </>
  );
}
