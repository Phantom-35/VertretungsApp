import { SettingsButton, ThemeToggle } from "@/components/ThemeSettings";

export type HeaderStatus = "current" | "updating" | "offline" | "disrupted" | "outdated" | "incomplete" | "holiday" | "public-holiday" | "waiting";

type HeaderProps = {
  selectedClass: string | null | undefined;
  dateLabel: string;
  /** "Woche A"; kept on one line. */
  weekLabel: string | null;
  dateIsPast: boolean;
  sourceUpdatedLabel: string;
  fetchedLabel: string;
  /** The last check is long ago although the connection works. */
  checkStale?: boolean;
  status: HeaderStatus;
  onOpenSettings: () => void;
};

/**
 * When the plan was last checked: "gerade eben geprüft", "vor 5 Min.
 * geprüft", "geprüft um 15:34 Uhr". In the warning colour when that is long
 * ago although the connection works (something may be stuck).
 */
export function CheckedLabel({ label, stale = false }: { label: string; stale?: boolean }) {
  const value = <span className={`font-medium ${stale ? "text-warn" : "text-foreground/80"}`}>{label}</span>;
  if (label === "noch nie") {
    return <>noch nicht geprüft</>;
  }
  return (
    <span className={stale ? "text-warn" : undefined}>
      {label.endsWith("Uhr") ? (
        <>
          geprüft {label.includes(".,") ? "am" : "um"} {value}
        </>
      ) : (
        <>{value} geprüft</>
      )}
    </span>
  );
}

export const statusBadges: Record<HeaderStatus, { label: string; className: string }> = {
  current: {
    label: "Aktuell",
    className: "border-accent/10 bg-accent-soft text-accent-strong",
  },
  updating: {
    label: "Lädt …",
    className: "border-accent/10 bg-accent-soft text-accent-strong motion-safe:animate-pulse",
  },
  offline: {
    label: "Offline",
    className: "border-warn/15 bg-warn-soft text-warn",
  },
  // The school's website is down, the device itself is online.
  disrupted: {
    label: "Störung",
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
  // The school has not published the next day yet (e.g. at the weekend).
  waiting: {
    label: "Letzter Plan",
    className: "border-line bg-surface-muted text-foreground/80",
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
  checkStale = false,
  status,
  onOpenSettings,
}: HeaderProps) {
  const badge = statusBadges[status];

  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-edge bg-[linear-gradient(145deg,var(--header-from),var(--header-to))] px-5 py-4 shadow-[0_24px_60px_rgba(18,41,39,0.10)]">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(31,107,103,0.16),transparent_65%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          {/* Smaller on narrow screens: "VERTRETUNGSPLAN" cannot wrap and would push
              the buttons (settings!) off the screen, e.g. with large text. */}
          <p className="min-w-0 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-accent-strong/85 [overflow-wrap:anywhere] min-[360px]:text-[0.72rem] min-[360px]:tracking-[0.28em]">
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
              <CheckedLabel label={fetchedLabel} stale={checkStale} />
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
