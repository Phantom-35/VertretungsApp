import { useState } from "react";
import { FadingStatus } from "@/components/FadingStatus";
import { InstallGuide } from "@/components/InstallGuide";
import type { PushControls } from "@/hooks/usePushNotifications";
import { useSettings } from "@/hooks/useSettings";
import { currentBrowser, isStandalone } from "@/lib/device";

/** Where to allow notifications again, for the device at hand. */
function allowAgainHint() {
  const { platform } = currentBrowser();
  if (platform === "ios") {
    return "iPhone: Einstellungen → Mitteilungen → Vertretungsplan";
  }
  if (platform === "android") {
    return isStandalone()
      ? "Android: lange auf das App-Symbol tippen → App-Info → Benachrichtigungen"
      : "Android: Schloss-Symbol neben der Adresse → Berechtigungen → Benachrichtigungen";
  }
  return "Computer: Schloss-Symbol neben der Adresse → Benachrichtigungen erlauben";
}

type NotificationSettingsProps = {
  push: PushControls;
  /** The student's own class: notifications are about it. */
  schoolClass: string | null | undefined;
  /** Upper school course filter of that class; empty means all courses. */
  teachers: readonly string[];
  /** Opens the settings at the notifications or at the daily overviews. */
  onOpenSettings: (focus: "notifications" | "summaries") => void;
};

const buttonClass =
  "tap-target shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-60";

/** Push notifications for the student's own class, part of the class card. */
export function NotificationSettings({ push, schoolClass, teachers, onOpenSettings }: NotificationSettingsProps) {
  const { status, busy, message, enable } = push;
  const [showInstall, setShowInstall] = useState(false);
  // Just switched on here: the daily overviews are offered once (they are
  // off by default and otherwise only found in the settings).
  const [justEnabled, setJustEnabled] = useState(false);
  const [settings] = useSettings();

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
      // Short, the steps only on request: shown on every visit in Safari.
      description = "Gibt es in der App auf dem Home-Bildschirm.";
      actions = (
        <button
          type="button"
          onClick={() => setShowInstall((value) => !value)}
          aria-expanded={showInstall}
          aria-controls="install-guide"
          className={`${buttonClass} border border-line bg-surface text-accent-strong`}
        >
          {showInstall ? "Schließen" : "Wie?"}
        </button>
      );
      break;
    case "unsupported":
      description = "Dieser Browser kann keine Benachrichtigungen empfangen.";
      break;
    case "denied":
      description =
        `Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen des Geräts (${allowAgainHint()}).`;
      break;
    case "on":
      description = "";
      break;
    case "off":
      description = audience
        ? `Eine Nachricht aufs Handy, sobald sich der Plan für ${audience} ändert, auch wenn die App geschlossen ist.`
        : "Lege zuerst in den Einstellungen deine Klasse fest.";
      actions = (
        <button
          type="button"
          onClick={() => {
            setJustEnabled(true);
            void enable();
          }}
          disabled={busy || !audience}
          className={`${buttonClass} bg-accent text-white`}
        >
          Einschalten
        </button>
      );
      break;
  }

  // Switched on: one small line; test and switching off are in the settings.
  if (status === "on") {
    return (
      <div role="group" aria-label="Benachrichtigungen" className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => onOpenSettings("notifications")}
          className="tap-target flex w-full items-center gap-2 text-left text-sm text-muted"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-accent-strong"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span className="min-w-0 flex-1">
            Benachrichtigungen an für {audience ?? "deine Klasse"}
          </span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <FadingStatus message={message} className="pt-2" />
        {justEnabled && !settings.eveningSummary && !settings.morningSummary ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-accent-soft/60 px-3 py-2">
            <p className="min-w-0 text-sm leading-5 text-foreground">
              Auch eine tägliche Übersicht, morgens oder abends?
            </p>
            <button
              type="button"
              onClick={() => onOpenSettings("summaries")}
              className={`${buttonClass} border border-line bg-surface text-accent-strong`}
            >
              Einstellen
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div role="group" aria-labelledby="notifications-heading" className="mt-3 border-t border-line pt-3">
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
      {status === "install" && showInstall ? (
        <div id="install-guide" className="mt-3 rounded-2xl border border-line bg-surface p-3">
          <InstallGuide />
        </div>
      ) : null}
      <FadingStatus message={message} className="pt-2" />
    </div>
  );
}

/**
 * Notifications in the settings: their state, a test notification and
 * switching them on or off (the main page only shows a short line).
 */
export function NotificationControls({
  push,
  schoolClass,
  teachers,
}: Pick<NotificationSettingsProps, "push" | "schoolClass" | "teachers">) {
  const { status, busy, message, enable, disable, sendTest } = push;
  if (status === "checking" || status === "unavailable") {
    return null;
  }
  const audience = schoolClass
    ? `${schoolClass}${teachers.length > 0 ? ` (${teachers.join(", ")})` : ""}`
    : null;

  let text: string;
  let actions: React.ReactNode = null;
  switch (status) {
    case "on":
      text = `An für ${audience ?? "deine Klasse"}.`;
      actions = (
        <>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={busy}
            className={`${buttonClass} border border-line bg-surface text-accent-strong`}
          >
            Testnachricht
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
      text = audience ? `Aus. Einschalten für ${audience}?` : "Lege zuerst deine Klasse fest.";
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
    case "install":
      text = "Gibt es in der App auf dem Home-Bildschirm (siehe „Als App installieren“ unten).";
      break;
    case "denied":
      text =
        `Blockiert. Erlaube sie in den Einstellungen des Geräts (${allowAgainHint()}).`;
      break;
    default:
      text = "Dieser Browser kann keine Benachrichtigungen empfangen.";
  }

  return (
    <div role="group" aria-label="Benachrichtigungen ein und aus" className="rounded-2xl border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-[10rem] flex-1 text-sm leading-5 text-foreground">{text}</p>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <FadingStatus message={message} className="pt-2" />
    </div>
  );
}
