import { formatShortDate } from "@/lib/format";
import { freeUntil, type HolidayBreak } from "@/lib/holidays";

type HolidayCardProps = {
  holiday: HolidayBreak;
  /** YYYY-MM-DD */
  today: string | null;
  /** The first day of the plan after the holidays, once the school has it online. */
  newPlanDate: string | null;
  /** Whether a plan from before the holidays exists to look at. */
  hasOldPlan: boolean;
  onShowNewPlan: () => void;
  onShowOldPlan: () => void;
};

function texts(holiday: HolidayBreak, today: string | null) {
  if (holiday.kind === "holidays") {
    return {
      title: `Schöne ${holiday.name}!`,
      text: holiday.from === holiday.to ? "Heute ist frei." : `Frei bis ${formatShortDate(freeUntil(holiday, today))}`,
    };
  }
  const onHoliday = today !== null && today >= holiday.from && today <= holiday.to;
  return {
    title: onHoliday ? "Schönen Feiertag!" : "Schönes langes Wochenende!",
    text: onHoliday
      ? `Heute ist ${holiday.name}, schulfrei.`
      : `Am ${formatShortDate(holiday.from)} ist ${holiday.name}, schulfrei.`,
  };
}

/**
 * In the holidays, instead of a plan: also once the plan after them is
 * online, which is then one tap away (as is the last one before them).
 */
export function HolidayCard({ holiday, today, newPlanDate, hasOldPlan, onShowNewPlan, onShowOldPlan }: HolidayCardProps) {
  const { title, text } = texts(holiday, today);
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
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {text}{" "}
        {newPlanDate
          ? `Der Plan für ${formatShortDate(newPlanDate)} ist schon online.`
          : `Der Plan für ${formatShortDate(holiday.backOn)} erscheint hier, sobald die Schule ihn hochlädt.`}
      </p>
      {newPlanDate ? (
        <button
          type="button"
          onClick={onShowNewPlan}
          className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98]"
        >
          Plan für {formatShortDate(newPlanDate)} ansehen
        </button>
      ) : null}
      {hasOldPlan ? (
        <button
          type="button"
          onClick={onShowOldPlan}
          className={`${newPlanDate ? "mx-auto mt-3 block" : "mt-4"} text-sm font-semibold text-accent-strong underline underline-offset-2`}
        >
          Letzten Plan ansehen
        </button>
      ) : null}
    </section>
  );
}
