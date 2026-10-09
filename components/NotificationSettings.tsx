import { usePushNotifications } from "@/hooks/usePushNotifications";

type NotificationSettingsProps = {
  schoolClass: string | null | undefined;
  /** Upper school course filter; empty means all courses. */
  teachers: readonly string[];
};

const buttonClass =
  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-60";

/** Push notifications for the selected class, part of the class card. */
export function NotificationSettings({ schoolClass, teachers }: NotificationSettingsProps) {
  const { status, busy, message, enable, disable, sendTest } = usePushNotifications({
    schoolClass: schoolClass ?? null,
    teachers,
  });

  if (status === "checking" || status === "unavailable") {
    return null;
  }

  const audience = schoolClass
    ? `${schoolClass}${teachers.length > 0 ? ` (${teachers.join(", ")})` : ""}`
    : null;

  let description: string;
  let actions: React.ReactNode = null;

  switch (status) {
    case "install":
      description =
        "Auf dem iPhone und iPad gehen Benachrichtigungen nur in der App auf dem Home-Bildschirm: unten auf „Teilen“ tippen, „Zum Home-Bildschirm“ wählen und die App von dort öffnen.";
      break;
    case "unsupported":
      description = "Dieser Browser kann keine Benachrichtigungen empfangen.";
      break;
    case "denied":
      description =
        "Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen des Geräts (iPhone: Einstellungen → Mitteilungen → Vertretungsplan).";
      break;
    case "on":
      description = `An: Du bekommst eine Mitteilung, wenn sich der Plan für ${audience ?? "deine Klasse"} ändert.`;
      actions = (
        <>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={busy}
            className={`${buttonClass} border border-line bg-surface text-accent-strong`}
          >
            Test
          </button>
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className={`${buttonClass} border border-line bg-surface text-foreground`}
          >
            Ausschalten
          </button>
        </>
      );
      break;
    case "off":
      description = audience
        ? `Mitteilung aufs Handy, sobald sich der Plan für ${audience} ändert, auch wenn die App geschlossen ist.`
        : "Wähle zuerst deine Klasse.";
      actions = (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy || !audience}
          className={`${buttonClass} bg-accent text-white`}
        >
          Einschalten
        </button>
      );
      break;
  }

  return (
    <div role="group" aria-labelledby="notifications-heading" className="mt-4 border-t border-line pt-3">
      {/* With large text the buttons move below instead of overlapping the label. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[12rem] flex-1">
          <p
            id="notifications-heading"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-muted"
          >
            Benachrichtigungen
          </p>
          <p className="mt-1 text-sm leading-5 text-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-col items-end gap-2">{actions}</div> : null}
      </div>
      <p role="status" className="mt-2 text-xs text-muted empty:hidden">
        {message}
      </p>
    </div>
  );
}
