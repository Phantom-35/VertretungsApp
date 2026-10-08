type RefreshStatusProps = {
  /** The app's own server was not reachable. */
  connectionError: string | null;
  /** The server answered with the last known plan because the school site is down. */
  stale: boolean;
  /** Error reported by the server for a partial result. */
  error: string | null;
  warnings: string[];
  lastSuccessLabel: string;
  onRetry: () => void;
};

export function RefreshStatus({
  connectionError,
  stale,
  error,
  warnings,
  lastSuccessLabel,
  onRetry,
}: RefreshStatusProps) {
  let title: string | null = null;
  let message: string | null = null;

  if (connectionError) {
    title = connectionError;
    message = `Angezeigt wird der zuletzt geladene Stand (${lastSuccessLabel}).`;
  } else if (stale) {
    title = "Die Webseite der Schule antwortet gerade nicht.";
    message = `Angezeigt wird der Stand von ${lastSuccessLabel}.`;
  } else if (error) {
    title = error;
    message = warnings.length > 0 ? warnings.join(" ") : null;
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
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-full border border-warn/20 bg-white/60 px-3 py-1 text-xs font-semibold"
      >
        Erneut
      </button>
    </section>
  );
}
