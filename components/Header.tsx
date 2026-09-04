type HeaderProps = {
  selectedClass: string;
  dateLabel: string;
  lastUpdatedLabel: string;
};

export function Header({
  selectedClass,
  dateLabel,
  lastUpdatedLabel,
}: HeaderProps) {
  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(244,239,229,0.84))] p-5 shadow-[0_24px_60px_rgba(18,41,39,0.10)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(31,107,103,0.16),transparent_65%)]" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-accent-strong/70">
              KAG Vertretungsplan
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {selectedClass || "Klasse waehlen"}
            </h1>
          </div>
          <div className="rounded-full border border-accent/10 bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-strong">
            Live
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.4rem] border border-line bg-white/70 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Heute
            </p>
            <p className="mt-1 text-base font-medium text-foreground">
              {dateLabel}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Letzte Aktualisierung
            </p>
            <p className="mt-1 text-base font-medium text-foreground">
              {lastUpdatedLabel}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
