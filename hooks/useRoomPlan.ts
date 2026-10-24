import { useSyncExternalStore } from "react";

/** What the room plan shows: a room (marked), or null for the plan alone. */
export type RoomPlanRequest = { room: string | null; id: number };

let request: RoomPlanRequest | null = null;
let count = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Opens the room plan from anywhere (a card, the settings, the offer). */
export function openRoomPlan(room: string | null) {
  count += 1;
  request = { room, id: count };
  emit();
}

export function closeRoomPlan() {
  if (request !== null) {
    request = null;
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoomPlanRequest() {
  return useSyncExternalStore(
    subscribe,
    () => request,
    () => null,
  );
}
