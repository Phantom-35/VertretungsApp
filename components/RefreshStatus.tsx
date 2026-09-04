type RefreshStatusProps = {
  sourceUpdatedLabel: string | null;
  stale: boolean;
  error: string | null;
  notices: string[];
};

export function RefreshStatus({
  sourceUpdatedLabel,
  stale,
  error,
  notices,
}: RefreshStatusProps) {
  return (
    <section className="space-y-3">
      {error ? (
        <div className="rounded-[1.4rem] border border-warn/15 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
          {stale
            ? `Vertretungsplan momentan nicht erreichbar. Zuletzt erfolgreich aktualisiert: ${sourceUpdatedLabel ?? "unbekannt"}.`
            : "Vertretungsplan momentan nicht erreichbar."}
        </div>
      ) : null}

      {sourceUpdatedLabel ? (
        <div className="rounded-[1.4rem] border border-line bg-white/72 px-4 py-3 text-sm text-muted">
          Quelle aktualisiert:{" "}
          <span className="font-semibold text-foreground">
            {sourceUpdatedLabel}
          </span>
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div className="rounded-[1.5rem] border border-line bg-white/72 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Hinweise zum Tag
          </p>
          <div className="mt-3 space-y-2">
            {notices.map((notice) => (
              <p key={notice} className="text-sm leading-6 text-foreground">
                {notice}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
