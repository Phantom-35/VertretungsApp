import { ShareButton } from "@/components/ShareButton";
import { kindStyles } from "@/components/SubstitutionCard";
import { cancelledFirstLessons, summarizeEntries } from "@/lib/entries";
import type { SubstitutionEntry } from "@/lib/types";

type DaySummaryProps = {
  entries: SubstitutionEntry[];
  /** Entries added or changed since the user last opened the app. */
  newCount: number;
  /** Changes of other courses, filtered out by the teacher filter. */
  otherCourses: number;
  /** Whether those are currently shown anyway. */
  showingOtherCourses: boolean;
  onToggleOtherCourses: () => void;
  getShareText: () => string;
  /** Upper school: courses differ per student, so no "first lessons cancelled". */
  courses?: boolean;
};

/** "4 Änderungen" with one chip per kind, e.g. "1 Ausfall". */
export function DaySummary({
  entries,
  newCount,
  otherCourses,
  showingOtherCourses,
  onToggleOtherCourses,
  getShareText,
  courses = false,
}: DaySummaryProps) {
  const items = summarizeEntries(entries);
  // The question of the morning: do the first lessons take place?
  const firstCancelled = courses ? null : cancelledFirstLessons(entries);
  // Without changes, the card below offers sharing instead.
  const empty = entries.length === 0;
  if (empty && newCount === 0 && otherCourses === 0) {
    return null;
  }

  return (
    <div className="space-y-2 px-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {entries.length > 0 ? (
            <span className="text-sm font-semibold text-foreground">
              {entries.length === 1 ? "1 Änderung" : `${entries.length} Änderungen`}
            </span>
          ) : null}
          {newCount > 0 ? (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
              {newCount} neu
            </span>
          ) : null}
          {firstCancelled !== null ? (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindStyles.cancelled}`}>
              {firstCancelled === 1 ? "1. Std. fällt aus" : `1.–${firstCancelled}. Std. fallen aus`}
            </span>
          ) : null}
          {items.map((item) => (
            <span
              key={item.kind}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindStyles[item.kind]}`}
            >
              {item.label}
            </span>
          ))}
        </div>
        {!empty ? <ShareButton getText={getShareText} /> : null}
      </div>
      {otherCourses > 0 ? (
        <p className="text-sm text-muted">
          {otherCourses === 1 ? "1 Änderung" : `${otherCourses} Änderungen`} aus anderen Kursen{" "}
          {otherCourses === 1 ? (showingOtherCourses ? "wird" : "ist") : showingOtherCourses ? "werden" : "sind"}{" "}
          {showingOtherCourses ? "mit angezeigt. " : "ausgeblendet. "}
          <button
            type="button"
            onClick={onToggleOtherCourses}
            className="tap-target font-semibold text-accent-strong underline underline-offset-2"
          >
            {showingOtherCourses ? "Ausblenden" : "Anzeigen"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
