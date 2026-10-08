import { formatShortDate, isPastDate, relativeDayLabel } from "@/lib/format";
import type { PlanDay } from "@/lib/types";

type DaySelectorProps = {
  days: PlanDay[];
  selectedDate: string;
  onChange: (date: string) => void;
  /** Number of changes for the selected class per date; omitted without a class. */
  counts: Map<string, number> | null;
  now: number | null;
};

export function DaySelector({ days, selectedDate, onChange, counts, now }: DaySelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Tag auswählen"
      // Many days (e.g. before holidays) scroll sideways instead of squeezing.
      className="grid auto-cols-[minmax(6.25rem,1fr)] grid-flow-col gap-2 overflow-x-auto rounded-[1.5rem] border border-line bg-card p-1.5 shadow-[0_12px_30px_rgba(18,41,39,0.06)]"
    >
      {days.map((day) => {
        const selected = day.date === selectedDate;
        const past = isPastDate(day.date, now);
        const count = counts?.get(day.date) ?? null;
        const relative = relativeDayLabel(day.date, now);

        return (
          <button
            key={day.date}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(day.date)}
            className={`relative rounded-[1.1rem] px-2 py-2.5 text-center transition ${
              selected
                ? "bg-accent text-white shadow-[0_8px_20px_rgba(31,107,103,0.25)]"
                : past
                  ? "text-muted/70"
                  : "text-foreground"
            }`}
          >
            <span className="block text-sm font-semibold">
              {relative ?? day.dayLabel ?? formatShortDate(day.date)}
            </span>
            <span className={`block text-xs ${selected ? "text-white/80" : "text-muted"}`}>
              {formatShortDate(day.date)}
            </span>
            {count !== null ? (
              <span
                aria-label={`${count} Änderungen`}
                className={`absolute right-1.5 top-1.5 min-w-5 rounded-full px-1.5 text-[0.68rem] font-bold leading-5 ${
                  count === 0
                    ? selected
                      ? "bg-white/20 text-white/80"
                      : "bg-stone-100 text-muted"
                    : selected
                      ? "bg-white text-accent-strong"
                      : "bg-warn-soft text-warn"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
