"use client";

import { useEffect, useRef, useState } from "react";
import { RoomMap } from "@/components/RoomMap";
import { Segmented } from "@/components/Segmented";
import { closeRoomPlan, useRoomPlanRequest, type RoomPlanRequest } from "@/hooks/useRoomPlan";
import { classOfRoom, classRoomLabel } from "@/lib/class-rooms";
import { FLOORS, PLAN_WIDTH, ROOM_PLAN_EDITION, findRoom, floorName, type Floor } from "@/lib/rooms";
import { lockPageScroll } from "@/lib/scroll-lock";

/** What the room is for, as far as the plan says ("Kunst", "Klassenraum der 6A"). */
function roomPurpose(roomId: string, name: string | undefined, myClass: string | null) {
  const owner = classOfRoom(roomId);
  if (owner) {
    return `Klassenraum der ${owner}${owner === myClass ? " (deine Klasse)" : ""}`;
  }
  return classRoomLabel(roomId) ?? name ?? null;
}

function RoomPlanContent({ request, myClass, onClose }: { request: RoomPlanRequest; myClass: string | null; onClose: () => void }) {
  const room = request.room ? findRoom(request.room) : null;
  const [floor, setFloor] = useState<Floor>(room?.floor ?? 0);
  const scroller = useRef<HTMLDivElement>(null);

  // The marked room in the middle of the (on phones wider than the screen) plan.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = scroller.current;
      const map = element?.firstElementChild;
      if (!element || !map) {
        return;
      }
      const center = room && room.floor === floor ? (room.x + room.w / 2 + 6) / (PLAN_WIDTH + 12) : 0.5;
      element.scrollLeft = center * map.clientWidth - element.clientWidth / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [floor, room]);

  const purpose = room ? roomPurpose(room.id, room.name, myClass) : null;
  return (
    <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-10 -mx-5 bg-background px-5 pb-3 pt-3">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line wide:hidden" />
        <div className="flex items-center justify-between gap-3">
          <h2 id="room-plan-title" className="truncate text-xl font-semibold tracking-[-0.03em]">
            {room ? `Raum ${room.id}` : "Raumplan"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white"
          >
            Fertig
          </button>
        </div>
        {room ? (
          <p className="mt-1 text-sm leading-5 text-muted">
            {purpose ? <span className="font-semibold text-foreground">{purpose} · </span> : null}
            {floorName(room.floor)}
          </p>
        ) : null}
      </div>

      <Segmented
        name="room-plan-floor"
        label="Stockwerk"
        options={FLOORS.map((item) => ({ value: item.floor, label: item.short }))}
        value={floor}
        onChange={setFloor}
      />

      <div
        ref={scroller}
        // Wider than a phone: also movable with the keyboard.
        tabIndex={0}
        role="region"
        aria-label="Plan, zur Seite verschiebbar"
        className="-mx-5 mt-3 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 overflow-x-auto overscroll-x-contain px-5 pb-1 [scrollbar-width:thin] wide:mx-0 wide:overflow-visible wide:px-0"
      >
        <RoomMap floor={floor} marked={room?.id ?? null} className="block h-auto w-[50rem] max-w-none wide:w-full" />
      </div>
      <p className="mt-1 text-center text-xs text-muted wide:hidden">Zum Verschieben zur Seite wischen.</p>

      {room && room.floor !== floor ? (
        <p className="mt-3 rounded-2xl bg-accent-soft/60 px-3 py-2 text-sm text-accent-strong">
          Raum {room.id} ist im {floorName(room.floor)}.
        </p>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-muted">
        Vereinfacht nach dem {ROOM_PLAN_EDITION} der Schule, nur das Hauptgebäude. Ausschalten kannst du den Raumplan in
        den Einstellungen unter „Anzeige“.
      </p>
    </div>
  );
}

/** The room plan as a sheet (a dialog in the middle on large screens). */
export function RoomPlanSheet({ myClass }: { myClass: string | null }) {
  const request = useRoomPlanRequest();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelClosing = useRef<(() => void) | null>(null);
  // The last request, kept while the sheet slides away.
  const [shown, setShown] = useState<RoomPlanRequest | null>(null);
  if (request && request !== shown) {
    setShown(request);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !request) {
      return;
    }
    // Opened again while sliding away: it stays.
    cancelClosing.current?.();
    if (!dialog.open) {
      dialog.showModal();
    }
    return lockPageScroll();
  }, [request]);

  const close = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open || dialog.dataset.closing !== undefined) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.dataset.closing = "";
    dialog.inert = true;
    const finish = () => {
      cancelClosing.current?.();
      if (dialog.open) {
        dialog.close();
      }
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === dialog && !event.pseudoElement) {
        finish();
      }
    };
    dialog.addEventListener("animationend", onAnimationEnd);
    // In case the animation does not run (e.g. a hidden tab).
    const fallback = window.setTimeout(finish, 450);
    cancelClosing.current = () => {
      cancelClosing.current = null;
      window.clearTimeout(fallback);
      dialog.removeEventListener("animationend", onAnimationEnd);
      delete dialog.dataset.closing;
      dialog.inert = false;
    };
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="room-plan-title"
      onClose={() => {
        cancelClosing.current?.();
        closeRoomPlan();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
      className="room-sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-[1.75rem] border border-b-0 border-line bg-background p-0 text-foreground shadow-[0_-18px_45px_rgba(18,41,39,0.18)] backdrop:bg-black/40 wide:inset-0 wide:m-auto wide:h-fit wide:max-w-4xl wide:rounded-[1.75rem] wide:border-b wide:shadow-[0_24px_60px_rgba(18,41,39,0.25)]"
    >
      {shown ? <RoomPlanContent key={shown.id} request={shown} myClass={myClass} onClose={close} /> : null}
    </dialog>
  );
}
