import { SettingsButton, ThemeToggle } from "@/components/ThemeSettings";

export type HeaderStatus = "current" | "updating" | "offline" | "outdated" | "incomplete";

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
  incomplete: {
    label: "Unvollständig",
    className: "border-warn/15 bg-warn-soft text-warn",
  },
};

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
    <header className="relative overflow-hidden rounded-[2rem] border border-edge bg-[linear-gradient(145deg,var(--header-from),var(--header-to))] p-5 shadow-[0_24px_60px_rgba(18,41,39,0.10)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(31,107,103,0.16),transparent_65%)]" />
      <div className="relative space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-accent-strong/70">
              KAG Vertretungsplan
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <SettingsButton onClick={onOpenSettings} />
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4">
            <h1 className="min-h-9 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {selectedClass === undefined ? "" : (selectedClass ?? "Klasse wählen")}
            </h1>
            <div
              className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${badge.className}`}
            >
              {badge.label}
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.4rem] border border-line bg-surface/70 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Plan für
            </p>
            <p
              className={`mt-1 text-base font-medium ${dateIsPast ? "text-warn" : "text-foreground"}`}
            >
              {dateLabel}
              {weekLabel ? (
                <>
                  {" "}
                  <span className="whitespace-nowrap">· {weekLabel}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Stand Schule
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {sourceUpdatedLabel}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Abgerufen
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {fetchedLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
