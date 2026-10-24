import type { ReactNode } from "react";

type ClassSelectorProps = {
  classes: string[];
  selectedClass: string | null | undefined;
  onChange: (value: string) => void;
  /** Another class than the student's own is only being looked at. */
  viewingOther?: boolean;
  children?: ReactNode;
};

export function ClassSelector({
  classes,
  selectedClass,
  onChange,
  viewingOther = false,
  children,
}: ClassSelectorProps) {
  return (
    <section className="rounded-[1.75rem] border border-line bg-card p-4 shadow-[0_18px_45px_rgba(18,41,39,0.08)]">
      <div className="flex items-center gap-3">
        <label
          htmlFor="class-selector"
          className="w-[5.5rem] shrink-0 text-xs font-semibold uppercase leading-4 tracking-[0.18em] text-muted"
        >
          {viewingOther ? "Andere Klasse" : "Meine Klasse"}
        </label>
        <div className="relative min-w-0 flex-1">
          <select
            id="class-selector"
            value={selectedClass ?? ""}
            onChange={(event) => onChange(event.target.value)}
            className="w-full appearance-none rounded-[1.15rem] border border-line bg-surface px-4 py-3 pr-12 text-lg font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-accent/35 focus:ring-4 focus:ring-accent/10 dark:shadow-none"
          >
            {!selectedClass ? (
              <option value="" disabled>
                Klasse wählen …
              </option>
            ) : null}
            {classes.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 8 5 5 5-5" />
          </svg>
        </div>
      </div>

      {children}
    </section>
  );
}

/**
 * Another class than the own one is only being looked at: one small line,
 * and the way back. The own class stays for the next opening and the
 * notifications.
 */
export function ViewingOtherNote({ myClass, onBack, className = "" }: { myClass: string; onBack: () => void; className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl bg-surface-muted py-1.5 pl-3 pr-1.5 motion-safe:animate-[fade-in_240ms_ease-out] ${className}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-4 shrink-0 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <p className="min-w-0 flex-1 text-xs leading-4 text-muted">
        <span className="font-semibold text-foreground">Nur angesehen</span> · deine Klasse: {myClass}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="tap-target shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-accent-strong transition active:scale-95"
      >
        Zurück<span className="sr-only"> zur {myClass}</span>
      </button>
    </div>
  );
}
