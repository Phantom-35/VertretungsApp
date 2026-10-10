import { SettingsButton, ThemeToggle } from "@/components/ThemeSettings";

export type HeaderStatus = "current" | "updating" | "offline" | "outdated" | "incomplete" | "holiday" | "public-holiday";

type HeaderProps = {
  selectedClass: string | null | undefined;
  dateLabel: string;
  /** "Woche A"; kept on one line. */
  weekLabel: string | null;
  dateIsPast: boolean;
  sourceUpdatedLabel: string;
  fetchedLabel: string;
  status: HeaderStatus;
  onOpenSettings: () => void;
};

const statusBadges: Record<HeaderStatus, { label: string; className: string }> = {
  current: {
    label: "Aktuell",
    className: "border-accent/10 bg-accent-soft text-accent-strong",
  },
  updating: {
    label: "Aktualisiere…",
    className: "border-accent/10 bg-accent-soft text-accent-strong animate-pulse",
  },
  offline: {
    label: "Offline",
    className: "border-warn/15 bg-warn-soft text-warn",
  },
  outdated: {
    label: "Veraltet",
    className: "border-warn/15 bg-warn-soft text-warn",
  },
  holiday: {
    label: "Ferien",
    className: "border-accent/10 bg-accent-soft text-accent-strong",
  },
  "public-holiday": {
    label: "Feiertag",
    className: "border-accent/10 bg-accent-soft text-accent-strong",
  },
  incomplete: {
    label: "Unvollständig",
    className: "border-warn/15 bg-warn-soft text-warn",
  },
};

/** "08.10., 15:34 Uhr" (another day) rather than "15:34 Uhr" (today). */
const isDate = (label: string) => label.includes(".,");

export function Header({
  selectedClass,
  dateLabel,
  weekLabel,
  dateIsPast,
  sourceUpdatedLabel,
  fetchedLabel,
  status,
  onOpenSettings,
}: HeaderProps) {
  const badge = statusBadges[status];

  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-edge bg-[linear-gradient(145deg,var(--header-from),var(--header-to))] px-5 py-4 shadow-[0_24px_60px_rgba(18,41,39,0.10)]">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(31,107,103,0.16),transparent_65%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-accent-strong/85">
            KAG Vertretungsplan
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <SettingsButton onClick={onOpenSettings} />
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-4">
          <h1 className="min-h-10 text-[2.5rem] font-semibold leading-none tracking-[-0.05em] text-foreground">
            {selectedClass === undefined ? "" : (selectedClass ?? "Klasse wählen")}
          </h1>
          <div
            className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${badge.className}`}
          >
            {badge.label}
          </div>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <p
            className={`text-base font-semibold ${dateIsPast ? "text-warn" : "text-foreground"}`}
          >
            <span className="sr-only">Plan für </span>
            {dateLabel}
            {weekLabel ? (
              <>
                {" "}
                <span className="whitespace-nowrap font-medium text-muted">· {weekLabel}</span>
              </>
            ) : null}
          </p>
          {/* When the school last changed the plan, and when the app last
              checked it. Wraps between the two parts, never inside one. */}
          <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted">
            <span className="whitespace-nowrap">
              {sourceUpdatedLabel === "unbekannt" ? (
                "Plan der Schule"
              ) : (
                <>
                  Plan {isDate(sourceUpdatedLabel) ? "vom" : "von"}{" "}
                  <span className="font-medium text-foreground/80">{sourceUpdatedLabel}</span>
                </>
              )}
            </span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">
              {fetchedLabel === "noch nie" ? (
                "noch nicht geprüft"
              ) : (
                <>
                  geprüft{fetchedLabel.endsWith("Uhr") ? (isDate(fetchedLabel) ? " am" : " um") : ""}{" "}
                  <span className="font-medium text-foreground/80">{fetchedLabel}</span>
                </>
              )}
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
