import { useEffect, useRef, type ReactNode } from "react";
import { Segmented } from "@/components/Segmented";
import { ThemeChoice } from "@/components/ThemeSettings";
import { NEXT_DAY_HOURS, useSettings } from "@/hooks/useSettings";

type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Original plan on the school website. */
  sourceUrl: string | undefined;
};

const nextDayOptions = NEXT_DAY_HOURS.map((hour) => ({
  value: hour,
  label: hour === 24 ? "Nie" : `${hour} Uhr`,
}));

function Setting({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Settings as a sheet from the bottom of the screen. */
export function SettingsSheet({ open, onClose, sourceUrl }: SettingsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settings, updateSettings] = useSettings();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      onClose={onClose}
      // A tap on the dimmed area closes the sheet.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="settings-sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] border border-b-0 border-line bg-background p-0 text-foreground shadow-[0_-18px_45px_rgba(18,41,39,0.18)] backdrop:bg-black/40"
    >
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="settings-title" className="text-xl font-semibold tracking-[-0.03em]">
            Einstellungen
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white"
          >
            Fertig
          </button>
        </div>

        <Setting title="Darstellung" description="„Automatisch“ richtet sich nach der Einstellung des Geräts.">
          <ThemeChoice />
        </Setting>

        <Setting
          title="Nächsten Tag anzeigen ab"
          description="Ab dieser Uhrzeit zeigt die App beim Öffnen den nächsten Schultag statt heute."
        >
          <Segmented
            name="next-day"
            label="Nächsten Tag anzeigen ab"
            options={nextDayOptions}
            value={settings.nextDayFromHour}
            onChange={(nextDayFromHour) => updateSettings({ nextDayFromHour })}
          />
        </Setting>

        <Setting
          title="„Neu“-Markierungen"
          description="Hebt Änderungen hervor, die seit dem letzten Öffnen dazugekommen sind."
        >
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
            <span className="text-sm font-medium">Neue Änderungen markieren</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.showNewBadges}
              onChange={(event) => updateSettings({ showNewBadges: event.target.checked })}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative h-7 w-12 shrink-0 rounded-full bg-surface-muted transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
            />
          </label>
        </Setting>

        <Setting title="Über die App">
          <p className="text-xs leading-5 text-muted">
            Die Daten stammen vom Vertretungsplan der Schule. Deine Einstellungen werden nur auf
            diesem Gerät gespeichert.
          </p>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-accent-strong underline underline-offset-2"
            >
              Original-Plan der Schule öffnen
            </a>
          ) : null}
        </Setting>
      </div>
    </dialog>
  );
}
