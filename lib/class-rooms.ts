/**
 * Which room belongs to which class, as printed on the room plan (rooms like
 * "C6-1" are the year group's extra rooms). Kept apart from the plan itself
 * so it is easy to take out: set SHOW_CLASS_ROOMS to false (or delete this
 * file and its uses) and the plan shows only the room numbers, without
 * the year groups on the clusters.
 */

export const SHOW_CLASS_ROOMS = true;

const CLASS_ROOMS: Record<string, string> = {
  // Ground floor
  "039": "6B",
  "038": "6C",
  "037": "C6-1",
  "036": "6D",
  "040": "C6-2",
  "041": "6A",
  "042": "5D",
  "043": "C5-2",
  "001": "5C",
  "002": "5B",
  "003": "C5-1",
  "004": "5A",
  // 1st floor
  "130": "8B",
  "129": "8C",
  "128": "C8-1",
  "127": "8D",
  "131": "C8-2",
  "132": "8A",
  "133": "7D",
  "134": "C7-2",
  "101": "7C",
  "102": "7B",
  "103": "C7-1",
  "104": "7A",
  // 2nd floor
  "234": "10B",
  "233": "10C",
  "232": "C10-1",
  "231": "10D",
  "235": "C10-2",
  "236": "10A",
  "237": "9D",
  "238": "C9-2",
  "201": "9C",
  "202": "9B",
  "203": "C9-1",
  "204": "9A",
};

/** The label printed in the room ("6A", "C6-1"), or null. */
export function classRoomLabel(roomId: string) {
  return SHOW_CLASS_ROOMS ? (CLASS_ROOMS[roomId] ?? null) : null;
}

/** The class whose own room this is ("6A"), not for the year groups' extra rooms. */
export function classOfRoom(roomId: string) {
  const label = classRoomLabel(roomId);
  return label && /^\d{1,2}[A-Z]$/.test(label) ? label : null;
}

/** "Stufe 6" for a cluster whose class rooms are all of one year group, else null. */
export function gradeOfRooms(roomIds: readonly string[]) {
  const grades = new Set(roomIds.map((id) => classOfRoom(id)?.match(/^\d+/)?.[0]).filter(Boolean));
  return grades.size === 1 ? `Stufe ${[...grades][0]}` : null;
}
