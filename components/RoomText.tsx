import { openRoomPlan } from "@/hooks/useRoomPlan";
import { useSettings } from "@/hooks/useSettings";
import { splitRooms } from "@/lib/rooms";

/** The map pin that marks a room number as tappable. */
export function PinIcon({ className = "size-3.5" }: { className?: string }) {
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
      <path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 1 1 13 0C18.5 15.3 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.3" />
    </svg>
  );
}

export const roomChipClassName =
  "inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2 py-px font-semibold text-accent-strong";

/** A room number that opens the room plan. */
export function RoomButton({ id, text = id }: { id: string; text?: string }) {
  return (
    <button
      type="button"
      onClick={() => openRoomPlan(id)}
      aria-label={`Raum ${text} auf dem Raumplan zeigen`}
      className={`tap-target ${roomChipClassName} transition active:scale-95`}
    >
      {text}
      <PinIcon />
    </button>
  );
}

/**
 * The room cell of an entry. With the room plan on, every room on the plan
 * opens it; others (gyms, other buildings) stay plain text.
 */
export function RoomText({ text }: { text: string }) {
  const [settings] = useSettings();
  if (settings.roomPlan !== true) {
    return <span className="font-semibold">{text}</span>;
  }
  return (
    <span className="font-semibold">
      {splitRooms(text).map((part, index) =>
        part.room ? <RoomButton key={index} id={part.room.id} text={part.text} /> : <span key={index}>{part.text}</span>,
      )}
    </span>
  );
}
