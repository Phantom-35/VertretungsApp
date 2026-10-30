import { useSyncExternalStore } from "react";

/**
 * What the room plan shows: the rooms of an entry (marked), or none for the
 * plan alone; with a search field when opened to look something up.
 */
export type RoomPlanRequest = { rooms: readonly string[]; id: number; search: boolean };

let request: RoomPlanRequest | null = null;
let count = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Opens the room plan from anywhere (a card, the settings, the note, the header). */
export function openRoomPlan(rooms: readonly string[] = [], { search = false }: { search?: boolean } = {}) {
  count += 1;
  request = { rooms, id: count, search };
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
