import { useSyncExternalStore } from "react";

/** What the room plan shows: the rooms of an entry (marked), or none for the plan alone. */
export type RoomPlanRequest = { rooms: readonly string[]; id: number };

let request: RoomPlanRequest | null = null;
let count = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Opens the room plan from anywhere (a card, the settings, the offer). */
export function openRoomPlan(rooms: readonly string[] = []) {
  count += 1;
  request = { rooms, id: count };
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
