import { formatShortDate } from "@/lib/format";
import type { HolidayBreak } from "@/lib/holidays";

type HolidayCardProps = {
  holiday: HolidayBreak;
  /** Whether a plan from before the holidays exists to look at. */
  hasOldPlan: boolean;
  onShowOldPlan: () => void;
};

/** In the holidays, instead of an old plan that looks out of date. */
export function HolidayCard({ holiday, hasOldPlan, onShowOldPlan }: HolidayCardProps) {
  return (
    <section
      aria-labelledby="holiday-title"
      className="rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]"
    >
      <span
        aria-hidden
        className="mx-auto flex size-14 items-center justify-center rounded-[1.2rem] bg-accent-soft text-accent-strong"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
      <h2 id="holiday-title" className="mt-4 text-lg font-semibold tracking-[-0.03em] text-foreground">
        Schöne {holiday.name}!
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {holiday.from === holiday.to ? "Heute ist frei." : `Frei bis ${formatShortDate(holiday.to)}.`} Der Plan
        für {formatShortDate(holiday.backOn)} erscheint hier, sobald die Schule ihn hochlädt.
      </p>
      {hasOldPlan ? (
        <button
          type="button"
          onClick={onShowOldPlan}
          className="mt-4 text-sm font-semibold text-accent-strong underline underline-offset-2"
        >
          Letzten Plan ansehen
        </button>
      ) : null}
    </section>
  );
}
