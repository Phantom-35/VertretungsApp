import { openRoomPlan } from "@/hooks/useRoomPlan";
import { useSettings } from "@/hooks/useSettings";
import { splitRooms } from "@/lib/rooms";

/** A folded map: the sign for the room plan. */
export function MapIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}

export const findRoomClassName =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/20 bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-strong";

/** "Raum 114", "Räume 248 und 249" */
export function roomsLabel(rooms: readonly string[]) {
  if (rooms.length === 1) {
    return `Raum ${rooms[0]}`;
  }
  return `Räume ${rooms.slice(0, -1).join(", ")} und ${rooms.at(-1)}`;
}

/** The rooms of an entry that are on the plan, if the room plan is switched on. */
export function useRoomsOnPlan(text: string) {
  const [settings] = useSettings();
  if (!settings.roomPlanButton || !text) {
    return [];
  }
  return [...new Set(splitRooms(text).flatMap((part) => (part.room ? [part.room.id] : [])))];
}

/** The button next to the room of an entry: opens the plan with the room marked. */
export function FindRoomButton({ rooms }: { rooms: readonly string[] }) {
  return (
    <button
      type="button"
      onClick={() => openRoomPlan(rooms)}
      className={`tap-target ${findRoomClassName} transition active:scale-95`}
    >
      <MapIcon />
      Wo ist das?
      <span className="sr-only"> {roomsLabel(rooms)} auf dem Raumplan zeigen</span>
    </button>
  );
}

/** Round button in the header: the room plan with a search, to look something up. */
export function RoomPlanHeaderButton() {
  const [settings] = useSettings();
  if (!settings.roomPlanButton) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => openRoomPlan([], { search: true })}
      aria-label="Raumplan"
      title="Raumplan"
      aria-haspopup="dialog"
      className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface/70 text-foreground transition active:scale-95"
    >
      <MapIcon className="size-[1.1rem]" />
    </button>
  );
}
