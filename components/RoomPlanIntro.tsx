import { useEffect, useRef, useSyncExternalStore } from "react";
import { RoomMap } from "@/components/RoomMap";
import { MapIcon, findRoomClassName } from "@/components/RoomText";
import { openRoomPlan } from "@/hooks/useRoomPlan";
import { findRoom } from "@/lib/rooms";

/** Set once the note about the room plan was seen ("Zurücksetzen" removes it). */
export const ROOM_PLAN_INTRO_KEY = "kag:room-plan-intro";

let memorySeen = false;
const listeners = new Set<() => void>();

function seen() {
  try {
    return memorySeen || localStorage.getItem(ROOM_PLAN_INTRO_KEY) !== null;
  } catch {
    return memorySeen;
  }
}

function markSeen() {
  memorySeen = true;
  try {
    localStorage.setItem(ROOM_PLAN_INTRO_KEY, "1");
  } catch {
    // Kept in memory for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
 * Says once, over everything, that there is a room plan now and how to get
 * to it (the button next to the room), with a way to try it at once.
 */
export function RoomPlanIntro({ ready, exampleRoom }: { ready: boolean; exampleRoom: string | null }) {
  // Only the device knows whether it was seen: never in the server-rendered page.
  const done = useSyncExternalStore(subscribe, seen, () => true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = ready && !done;

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
      // The dialog itself takes the focus when it opens, not a button.
      tabIndex={-1}
      aria-labelledby="room-plan-intro-title"
      // Escape, the back button, or any other way of closing: seen.
      onClose={markSeen}
      className="room-offer fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto overscroll-contain rounded-[1.75rem] border border-line bg-background p-0 text-foreground shadow-[0_24px_60px_rgba(18,41,39,0.3)] outline-none backdrop:bg-black/45"
    >
      {open ? (
        <div className="p-5">
          <div aria-hidden className="overflow-hidden rounded-2xl border border-line bg-card p-2">
            <RoomMap floor={exampleFloor} marked={[example]} className="block h-auto w-full" />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">Neu</p>
          <h2 id="room-plan-intro-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
            Raumplan
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Die App zeigt dir jetzt, wo ein Raum ist: In jeder Vertretung steht neben dem Raum der Knopf „Wo ist das?“. Ein
            Tipp darauf zeigt dir den Raum auf dem Plan der Schule.
          </p>
          <Example room={example} />
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                markSeen();
                openRoomPlan([example]);
              }}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
            >
              Ausprobieren
            </button>
            <button
              type="button"
              onClick={markSeen}
              className="rounded-full border border-line bg-surface px-5 py-3 text-sm font-semibold text-accent-strong transition active:scale-[0.98]"
            >
              Alles klar
            </button>
          </div>
          <p className="mt-3 text-center text-xs leading-5 text-muted">
            Ausschalten kannst du den Knopf in den Einstellungen unter „Anzeige“.
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
