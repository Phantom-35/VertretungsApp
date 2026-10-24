import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RoomMap } from "@/components/RoomMap";
import { MapIcon, findRoomClassName } from "@/components/RoomText";
import { openRoomPlan } from "@/hooks/useRoomPlan";
import { useSettings } from "@/hooks/useSettings";
import { findRoom } from "@/lib/rooms";

const noSubscribe = () => () => undefined;

/** Closed with Escape: asked again next time the app opens, not now. */
let postponed = false;

/** How the button looks in an entry, next to the room. */
function Example({ room }: { room: string }) {
  return (
    <div aria-hidden className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-card px-3.5 py-2.5">
      <span className="text-sm text-foreground">
        <span className="text-muted">Raum </span>
        <span className="font-semibold">{room}</span>
      </span>
      <span className={findRoomClassName}>
        <MapIcon />
        Wo ist das?
      </span>
    </div>
  );
}

/**
 * Asks once, over everything, whether entries should get a button that
 * shows their room on the room plan; after a "yes" it shows how and lets
 * people try it. Later the switch is in Settings → Anzeige.
 */
export function RoomPlanOffer({ ready, exampleRoom }: { ready: boolean; exampleRoom: string | null }) {
  const [settings, updateSettings] = useSettings();
  // Only the device knows the answer: never in the server-rendered page.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [step, setStep] = useState<"ask" | "done" | "closed">(() => (postponed ? "closed" : "ask"));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = mounted && ready && step !== "closed" && (settings.roomPlan === null || step === "done");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const example = exampleRoom ?? "114";
  const exampleFloor = findRoom(example)?.floor ?? 1;

  return (
    <dialog
      ref={dialogRef}
      // The dialog itself takes the focus when it opens, not "Ja, gerne".
      tabIndex={-1}
      aria-labelledby="room-plan-offer-title"
      onCancel={() => {
        // Escape or the back button: not decided, so asked again next time.
        if (step === "ask") {
          postponed = true;
        }
        setStep("closed");
      }}
      // Closed some other way (e.g. repeated back presses): asked again next time.
      onClose={() => {
        if (settings.roomPlan === null) {
          postponed = true;
        }
        setStep("closed");
      }}
      className="room-offer fixed inset-0 outline-none m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto overscroll-contain rounded-[1.75rem] border border-line bg-background p-0 text-foreground shadow-[0_24px_60px_rgba(18,41,39,0.3)] backdrop:bg-black/45"
    >
      {open ? (
        <div className="p-5">
          <div aria-hidden className="overflow-hidden rounded-2xl border border-line bg-card p-2">
            <RoomMap floor={exampleFloor} marked={[example]} className="block h-auto w-full" />
          </div>
          {step === "ask" ? (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">Neu</p>
              <h2 id="room-plan-offer-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
                Raumplan
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Soll die App dir zeigen, wo ein Raum ist? Dann steht in jeder Vertretung neben dem Raum der Knopf „Wo ist
                das?“. Ein Tipp darauf zeigt dir den Raum auf dem Plan der Schule.
              </p>
              <Example room={example} />
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("done");
                    updateSettings({ roomPlan: true });
                  }}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
                >
                  Ja, gerne
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("closed");
                    updateSettings({ roomPlan: false });
                  }}
                  className="rounded-full border border-line bg-surface px-5 py-3 text-sm font-semibold text-accent-strong transition active:scale-[0.98]"
                >
                  Nein, danke
                </button>
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-muted">
                Später änderbar in den Einstellungen unter „Anzeige“.
              </p>
            </>
          ) : (
            <>
              <h2 id="room-plan-offer-title" className="mt-4 text-2xl font-semibold tracking-[-0.03em]">
                Raumplan ist an
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                So geht’s: Tipp in einer Vertretung neben dem Raum auf „Wo ist das?“ – dann siehst du, wo der Raum ist.
              </p>
              <Example room={example} />
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("closed");
                    openRoomPlan([example]);
                  }}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
                >
                  Ausprobieren
                </button>
                <button
                  type="button"
                  onClick={() => setStep("closed")}
                  className="rounded-full border border-line bg-surface px-5 py-3 text-sm font-semibold text-accent-strong transition active:scale-[0.98]"
                >
                  Alles klar
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
