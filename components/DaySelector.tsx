import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatDayMonth, formatShortDate, formatWeekday, isPastDate, relativeDayLabel } from "@/lib/format";
import type { PlanDay } from "@/lib/types";

/** Id of the element showing the selected day's entries. */
export const DAY_PANEL_ID = "day-panel";

export function dayTabId(date: string) {
  return `day-tab-${date}`;
}

type DaySelectorProps = {
  days: PlanDay[];
  selectedDate: string;
  onChange: (date: string) => void;
  /** Number of changes for the selected class per date; omitted without a class. */
  counts: Map<string, number> | null;
  now: number | null;
};

export function DaySelector({ days, selectedDate, onChange, counts, now }: DaySelectorProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // With many days the selected one can be outside the visible strip; scroll
  // only the strip (not the page) to bring it into view.
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    if (tabRect.left < listRect.left || tabRect.right > listRect.right) {
      list.scrollBy({
        left: tabRect.left - listRect.left - (listRect.width - tabRect.width) / 2,
        behavior: "smooth",
      });
    }
  }, [selectedDate, days.length]);

  // Arrow keys move between days, as expected from tabs.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = days.findIndex((day) => day.date === selectedDate);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const target =
      event.key === "Home"
        ? days[0]
        : event.key === "End"
          ? days.at(-1)
          : step
            ? days[index + step]
            : undefined;
    if (!target) {
      return;
    }
    event.preventDefault();
    onChange(target.date);
    document.getElementById(dayTabId(target.date))?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Tag auswählen"
      onKeyDown={onKeyDown}
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
            id={dayTabId(day.date)}
            aria-selected={selected}
            aria-controls={DAY_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(day.date)}
            className={`relative rounded-[1.1rem] px-2 py-2.5 text-center transition ${
              selected
                ? "bg-accent text-white shadow-[0_8px_20px_rgba(31,107,103,0.25)]"
                : past
                  ? "text-muted"
                  : "text-foreground"
            }`}
          >
            <span className="block text-sm font-semibold">
              {relative ?? day.dayLabel ?? formatWeekday(day.date)}
            </span>
            <span className={`block text-xs ${selected ? "text-white/80" : "text-muted"}`}>
              {/* "vorbei": a past day is not mistaken for the coming one. */}
              {/* The weekday is on the line above; short enough for narrow tabs. */}
              {past && !relative ? `vorbei, ${formatDayMonth(day.date)}` : formatShortDate(day.date)}
            </span>
            {count !== null ? (
              <span
                aria-hidden
                className={`absolute right-1.5 top-1.5 min-w-5 rounded-full px-1.5 text-[0.68rem] font-bold leading-5 ${
                  count === 0
                    ? selected
                      ? "bg-white/20 text-white/80"
                      : "bg-surface-muted text-muted"
                    : selected
                      ? "bg-white text-accent"
                      : "bg-foreground/10 text-foreground/80"
                }`}
              >
                {count}
              </span>
            ) : null}
            {count !== null ? (
              <span className="sr-only">, {count === 1 ? "1 Änderung" : `${count} Änderungen`}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
