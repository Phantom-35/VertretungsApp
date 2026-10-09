import type { ReactNode } from "react";

type ClassSelectorProps = {
  classes: string[];
  selectedClass: string | null | undefined;
  onChange: (value: string) => void;
  /** Other classes picked before (e.g. siblings), for switching with one tap. */
  recentClasses: readonly string[];
  onForget: (value: string) => void;
  children?: ReactNode;
};

export function ClassSelector({
  classes,
  selectedClass,
  onChange,
  recentClasses,
  onForget,
  children,
}: ClassSelectorProps) {
  return (
    <section className="rounded-[1.75rem] border border-line bg-card p-4 shadow-[0_18px_45px_rgba(18,41,39,0.08)] backdrop-blur">
      <label
        htmlFor="class-selector"
        className="text-xs font-semibold uppercase tracking-[0.22em] text-muted"
      >
        Meine Klasse
      </label>
      <div className="relative mt-3">
        <select
          id="class-selector"
          value={selectedClass ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-[1.15rem] border border-line bg-surface px-4 py-4 pr-12 text-lg font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-accent/35 focus:ring-4 focus:ring-accent/10 dark:shadow-none"
        >
          {!selectedClass ? (
            <option value="" disabled>
              Klasse auswählen …
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

      {recentClasses.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Zuletzt:</span>
          {recentClasses.map((className) => (
            <span
              key={className}
              className="flex items-center rounded-full border border-line bg-surface text-sm font-semibold text-foreground"
            >
              <button
                type="button"
                onClick={() => onChange(className)}
                className="py-2 pl-3 pr-1"
              >
                {className}
              </button>
              <button
                type="button"
                onClick={() => onForget(className)}
                aria-label={`${className} aus der Liste entfernen`}
                className="py-2 pl-1 pr-3 text-muted"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {children}
    </section>
  );
}
