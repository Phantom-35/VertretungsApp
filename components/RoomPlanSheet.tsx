"use client";

import { useEffect, useRef, useState } from "react";
import { RoomMap } from "@/components/RoomMap";
import { roomsLabel } from "@/components/RoomText";
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

/** The floors as a row of choices; the marker glides to the chosen one. */
function FloorPicker({ value, onChange, withRoom }: { value: Floor; onChange: (floor: Floor) => void; withRoom: Floor[] }) {
  const index = FLOORS.findIndex((item) => item.floor === value);
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Stockwerk</legend>
      <div className="relative grid grid-cols-3 rounded-[1.4rem] border border-line bg-card p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-accent transition-transform duration-[380ms] ease-[var(--ease-ios)] motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {FLOORS.map((item) => {
          const active = item.floor === value;
          return (
            <label
              key={item.floor}
              className={`relative cursor-pointer whitespace-nowrap rounded-full px-2 py-1.5 text-center text-xs font-semibold transition-colors duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                active ? "text-white" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="room-plan-floor"
                value={item.floor}
                checked={active}
                onChange={() => onChange(item.floor)}
                autoComplete="off"
                className="sr-only"
              />
              {item.short}
              {/* Where the room is, also when another floor is shown. */}
              {withRoom.includes(item.floor) && !active ? (
                <span aria-hidden className="absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" />
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Up: the floor below sinks away, the new one comes from above; down the other way round. */
type Change = { from: Floor; up: boolean; id: number };

function RoomPlanContent({ request, myClass, onClose }: { request: RoomPlanRequest; myClass: string | null; onClose: () => void }) {
  const rooms = request.rooms.map(findRoom).filter((room) => room !== null);
  const first = rooms[0] ?? null;
  const [floor, setFloor] = useState<Floor>(first?.floor ?? 0);
  const [change, setChange] = useState<Change | null>(null);
  const changes = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const ids = rooms.map((room) => room.id);
  const onFloor = rooms.filter((room) => room.floor === floor);

  /** The (on phones wider than the screen) plan moved so that a room is in the middle. */
  const centerOn = (room: { x: number; w: number }, behavior: ScrollBehavior) => {
    const element = scroller.current;
    const map = element?.firstElementChild;
    if (element && map) {
      const center = (room.x + room.w / 2 + 6) / (PLAN_WIDTH + 12);
      element.scrollTo({ left: center * map.clientWidth - element.clientWidth / 2, behavior });
    }
  };

  // Opened: the room in the middle at once.
  useEffect(() => {
    const frame = requestAnimationFrame(() => centerOn(first ?? { x: PLAN_WIDTH / 2, w: 0 }, "instant"));
    return () => cancelAnimationFrame(frame);
    // Only when it opens; a new request is a new component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFloor = (next: Floor) => {
    if (next === floor) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    changes.current += 1;
    setChange(reduced ? null : { from: floor, up: next > floor, id: changes.current });
    setFloor(next);
    // Same place in the building on the other floor; to the room if it is there.
    const target = rooms.find((room) => room.floor === next);
    if (target) {
      centerOn(target, reduced ? "instant" : "smooth");
    }
  };

  const single = rooms.length === 1 ? first : null;
  const purpose = single ? roomPurpose(single.id, single.name, myClass) : null;
  const floorsWithRoom = [...new Set(rooms.map((room) => room.floor))];
  const where =
    floorsWithRoom.length === 1
      ? floorName(floorsWithRoom[0])
      : rooms.map((room) => `${room.id}: ${FLOORS.find((item) => item.floor === room.floor)!.short}`).join(" · ");
  const mapClass = "block h-auto w-[50rem] max-w-none wide:w-full";
  return (
    <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-10 -mx-5 bg-background px-5 pb-3 pt-3">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line wide:hidden" />
        <div className="flex items-center justify-between gap-3">
          <h2 id="room-plan-title" className="truncate text-xl font-semibold tracking-[-0.03em]">
            {rooms.length > 0 ? roomsLabel(ids) : "Raumplan"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white"
          >
            Fertig
          </button>
        </div>
        {rooms.length > 0 ? (
          <p className="mt-1 text-sm leading-5 text-muted">
            {purpose ? <span className="font-semibold text-foreground">{purpose} · </span> : null}
            {where}
          </p>
        ) : null}
      </div>

      <FloorPicker value={floor} onChange={chooseFloor} withRoom={floorsWithRoom} />

      <div
        ref={scroller}
        // Wider than a phone: also movable with the keyboard.
        tabIndex={0}
        role="region"
        aria-label="Plan, zur Seite verschiebbar"
        className="-mx-5 mt-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 pb-1 outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-accent/40 wide:mx-0 wide:overflow-visible wide:px-0"
      >
        <div className="relative w-fit wide:w-full">
          <RoomMap
            key={floor}
            floor={floor}
            marked={ids}
            className={`${mapClass} ${change ? (change.up ? "floor-in-from-above" : "floor-in-from-below") : ""}`}
          />
          {change ? (
            // The floor left behind, fading away over the new one.
            <div
              key={change.id}
              aria-hidden
              className={`pointer-events-none absolute inset-0 ${change.up ? "floor-out-down" : "floor-out-up"}`}
              onAnimationEnd={() => setChange(null)}
            >
              <RoomMap floor={change.from} marked={ids} className={mapClass} />
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-muted wide:hidden">Zum Verschieben zur Seite wischen.</p>

      {rooms.length > 0 && onFloor.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-accent-soft/60 px-3 py-2 text-sm text-accent-strong">
          {floorsWithRoom
            .map((item) => {
              const here = rooms.filter((room) => room.floor === item).map((room) => room.id);
              return `${roomsLabel(here)} ${here.length === 1 ? "ist" : "sind"} im ${floorName(item)}.`;
            })
            .join(" ")}
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
