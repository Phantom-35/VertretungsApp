type RefreshStatusProps = {
  /** The app's own server was not reachable. */
  connectionError: string | null;
  /** The connection works, but the school's website is down (see useSubstitutionData). */
  schoolDown?: boolean;
  /** The server answered with the last known plan because the school site is down. */
  stale: boolean;
  /** Error reported by the server for a partial result. */
  error: string | null;
  lastSuccessLabel: string;
  /** Original plan on the school website, for checking by hand. */
  sourceUrl: string | undefined;
  onRetry: () => void;
};

export function RefreshStatus({
  connectionError,
  schoolDown = false,
  stale,
  error,
  lastSuccessLabel,
  sourceUrl,
  onRetry,
}: RefreshStatusProps) {
  let title: string | null = null;
  let message: string | null = null;

  if (connectionError && !schoolDown) {
    title = connectionError;
    message = `Du siehst den Plan, der zuletzt geladen wurde (${lastSuccessLabel}).`;
  } else if (schoolDown || stale) {
    title = (schoolDown ? connectionError : null) ?? "Die Seite der Schule ist gerade nicht erreichbar.";
    message = `Du siehst den Plan, der zuletzt geladen wurde (${lastSuccessLabel}). Sobald es wieder geht, aktualisiert sich die App von selbst.`;
  } else if (error) {
    // The technical details ("Seite 3 …") are for /api/health; students need
    // to know what it means for them.
    title = error;
    message = "Es können Einträge fehlen. Im Zweifel den Original-Plan der Schule ansehen.";
  }

  if (!title) {
    return null;
  }

  return (
    <section
      role="status"
      className="flex items-start gap-3 rounded-[1.4rem] border border-warn/15 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {message ? <p>{message}</p> : null}
        {/* Without a connection, or with the school's site down, its page does not open either. */}
        {sourceUrl && !connectionError && !stale ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-semibold underline underline-offset-2"
          >
            Original-Plan der Schule öffnen
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="tap-target shrink-0 rounded-full border border-warn/20 bg-surface/60 px-3 py-1 text-xs font-semibold"
      >
        Neu laden
      </button>
    </section>
  );
}
