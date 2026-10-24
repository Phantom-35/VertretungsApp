import { useState, useSyncExternalStore } from "react";
import { PinIcon, roomChipClassName } from "@/components/RoomText";
import { openRoomPlan } from "@/hooks/useRoomPlan";
import { useSettings } from "@/hooks/useSettings";

const noSubscribe = () => () => undefined;

/**
 * Asks once whether room numbers should open the room plan, and after a
 * "yes" shows how: the pin on the room numbers. Later in the settings.
 */
export function RoomPlanOffer({ exampleRoom }: { exampleRoom: string | null }) {
  const [settings, updateSettings] = useSettings();
  // Only the device knows the answer: never in the server-rendered page.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [confirming, setConfirming] = useState(false);

  if (!mounted || (settings.roomPlan !== null && !confirming)) {
    return null;
  }

  const example = exampleRoom ?? "114";
  const chip = (
    <span className={`${roomChipClassName} mx-0.5 align-middle text-xs`}>
      {example}
      <PinIcon className="size-3" />
    </span>
  );

  return (
    // Beside the plan, not part of it: an aside, not a section of the page.
    <aside
      aria-labelledby="room-plan-offer-title"
      className="rounded-[1.5rem] border border-accent/15 bg-accent-soft/60 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
            <path d="M9 4v13.5M15 6.5V20" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          {confirming ? (
            <>
              <h2 id="room-plan-offer-title" className="text-sm font-semibold text-foreground">
                Raumplan ist an
              </h2>
              <p className="mt-0.5 text-sm leading-6 text-muted">
                Tipp in einer Vertretung auf die Raumnummer mit dem Pin-Zeichen, z. B. {chip} – dann siehst du, wo der Raum
                ist.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openRoomPlan(example)}
                  className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition active:scale-95"
                >
                  Ausprobieren
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-accent-strong transition active:scale-95"
                >
                  Alles klar
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="room-plan-offer-title" className="text-sm font-semibold text-foreground">
                Neu: Raumplan
              </h2>
              <p className="mt-0.5 text-sm leading-6 text-muted">
                Soll die App dir zeigen, wo ein Raum ist? Dann tippst du in einer Vertretung auf die Raumnummer, z. B.{" "}
                {chip}, und siehst den Raum auf dem Plan der Schule.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(true);
                    updateSettings({ roomPlan: true });
                  }}
                  className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition active:scale-95"
                >
                  Ja, gerne
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ roomPlan: false })}
                  className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-accent-strong transition active:scale-95"
                >
                  Nein, danke
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">Später änderbar in den Einstellungen unter „Anzeige“.</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
