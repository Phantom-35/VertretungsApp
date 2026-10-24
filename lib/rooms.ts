/**
 * The school's room plan (main building, "Raumplan 2026/2027" of 09.07.2026),
 * drawn after the printed plan: simplified, but every room where it is.
 * Each floor is 1000 × 385 units, the street side (entrance) at the bottom.
 * When the school changes rooms for a new school year, update it here.
 */

export const ROOM_PLAN_EDITION = "Raumplan 2026/27";

export type Floor = 0 | 1 | 2;

export const FLOORS: readonly { floor: Floor; short: string; name: string }[] = [
  { floor: 0, short: "EG", name: "Erdgeschoss" },
  { floor: 1, short: "1. OG", name: "1. Obergeschoss" },
  { floor: 2, short: "2. OG", name: "2. Obergeschoss" },
];

export const PLAN_WIDTH = 1000;
export const PLAN_HEIGHT = 385;

export type Area = { x: number; y: number; w: number; h: number };

export type Shape = Area & {
  /** room: numbered; space: named, no number; court: open to the sky; blocked: shafts and the like. */
  kind: "room" | "space" | "wc" | "lift" | "stairs" | "court" | "blocked";
  id?: string;
  name?: string;
};

export type Room = Shape & { kind: "room"; id: string; floor: Floor };

const room = (id: string, x: number, y: number, w: number, h: number, name?: string): Shape => ({
  kind: "room",
  id,
  x,
  y,
  w,
  h,
  name,
});
const of = (kind: Shape["kind"], x: number, y: number, w: number, h: number, name?: string): Shape => ({
  kind,
  x,
  y,
  w,
  h,
  name,
});

/** Toilets and storerooms around a shaft: the same on every floor, left and right. */
function core(x: number, upper: string, lower: string, mirrored = false): Shape[] {
  const shaftX = mirrored ? x + 22 : x;
  const roomX = mirrored ? x : x + 39;
  return [
    of("wc", x, 127, 61, 32),
    of("blocked", shaftX, 159, 39, 66),
    room(upper, roomX, 159, 22, 33, "Lehrmittel"),
    room(lower, roomX, 192, 22, 33, "Lehrmittel"),
    of("wc", x, 225, 61, 33),
  ];
}

const groundFloor: Shape[] = [
  room("039", 0, 0, 98, 82),
  room("038", 98, 0, 88, 82),
  room("037", 186, 0, 48, 82),
  room("036", 234, 0, 84, 82),
  of("stairs", 318, 0, 52, 82),
  of("wc", 370, 0, 40, 50),
  of("lift", 370, 50, 40, 32),
  of("blocked", 436, 0, 26, 82),
  room("030", 462, 0, 45, 52, "Schulleitung"),
  room("029", 507, 0, 97, 52, "Sekretariat"),
  room("028", 604, 0, 55, 52, "Schulleitung"),
  of("wc", 659, 0, 30, 80),
  of("wc", 689, 0, 30, 80),
  of("stairs", 719, 0, 56, 80),
  room("022", 775, 0, 40, 52, "Verwaltung"),
  room("021", 815, 0, 41, 52, "Schulentwicklung"),
  room("020", 856, 0, 47, 52, "Mittelstufe"),
  room("019", 903, 0, 49, 52, "Erprobungsstufe"),
  room("018", 952, 0, 48, 84, "Bibliothek"),
  room("040", 0, 82, 84, 46),
  room("041", 0, 128, 115, 68),
  room("042", 0, 196, 118, 64),
  room("043", 0, 260, 82, 46),
  room("001", 0, 306, 110, 79),
  room("002", 110, 296, 95, 89),
  room("003", 205, 296, 47, 89),
  room("004", 252, 292, 77, 93),
  of("stairs", 329, 290, 51, 95),
  room("006", 380, 288, 37, 44, "Pause"),
  room("005", 380, 332, 37, 53, "Sanitäter"),
  room("007", 578, 312, 49, 73, "Sek-II-Beratung"),
  room("008", 627, 312, 49, 73, "Sek-II-Beratung"),
  room("009", 676, 312, 39, 73, "SII-Leitung"),
  of("stairs", 715, 282, 53, 103),
  room("010", 768, 282, 30, 103, "BOB"),
  room("011", 798, 282, 34, 103, "Beratung"),
  room("012", 832, 282, 71, 103, "Konferenz / Stillarbeit"),
  room("013", 903, 282, 97, 103, "Stillarbeit"),
  ...core(145, "047", "046"),
  of("court", 242, 108, 126, 162),
  room("054", 368, 108, 50, 25, "SV"),
  room("053", 368, 133, 50, 29, "Schulsozialarbeit"),
  of("wc", 462, 104, 35, 62),
  of("wc", 497, 104, 34, 62),
  of("stairs", 490, 190, 36, 30),
  room("060", 577, 106, 35, 154, "Materiallager"),
  room("061", 629, 104, 39, 52, "Beratung 1"),
  room("062", 629, 156, 39, 51, "Hausmeister"),
  room("063", 629, 207, 39, 51, "Beratung 3"),
  of("court", 668, 104, 119, 154),
  room("014", 787, 100, 143, 158, "Lehrerzimmer"),
  room("017", 930, 98, 70, 58, "Ruheraum"),
  room("016", 930, 156, 70, 55, "Küche"),
  room("015", 930, 211, 70, 47, "Kopierer"),
];

const firstFloor: Shape[] = [
  room("130", 0, 0, 104, 82),
  room("129", 104, 0, 86, 82),
  room("128", 190, 0, 49, 82),
  room("127", 239, 0, 83, 82),
  of("stairs", 322, 0, 55, 82),
  of("wc", 377, 0, 38, 55),
  of("lift", 377, 55, 38, 27),
  of("wc", 440, 0, 54, 82),
  room("117", 494, 0, 101, 82, "Informatik / PC 2"),
  room("116", 595, 0, 37, 82, "Kunst-Vorbereitung"),
  room("115", 632, 0, 95, 82, "Informatik / PC 1"),
  of("stairs", 727, 0, 55, 82),
  room("114", 782, 0, 123, 82, "Kunst"),
  room("113", 905, 0, 95, 90, "Biologie-Vorbereitung"),
  room("131", 0, 82, 84, 46),
  room("132", 0, 128, 115, 68),
  room("133", 0, 196, 118, 64),
  room("134", 0, 260, 82, 46),
  room("101", 0, 306, 123, 79),
  room("102", 123, 296, 83, 89),
  room("103", 206, 296, 48, 89),
  room("104", 254, 292, 80, 93),
  of("stairs", 334, 290, 52, 95),
  room("105", 386, 290, 38, 95, "Musik-Vorbereitung"),
  room("106", 424, 290, 108, 95, "Physik 1"),
  room("107", 532, 290, 78, 95, "Physik-Vorbereitung"),
  room("108", 610, 290, 114, 95, "Physik 2"),
  of("stairs", 724, 290, 51, 95),
  room("109", 775, 290, 111, 95, "Chemie 1"),
  room("110", 886, 290, 114, 95, "Chemie-Vorbereitung"),
  room("112", 930, 90, 70, 105, "Biologie 1 / NW"),
  room("111", 930, 195, 70, 95, "Chemie 2"),
  ...core(145, "138", "137"),
  of("court", 242, 105, 127, 162),
  of("space", 369, 95, 76, 162, "Bibliothek"),
  of("stairs", 490, 190, 36, 30),
  of("blocked", 559, 108, 35, 55),
  room("145", 559, 163, 35, 50, "Bücherlager"),
  room("147", 594, 108, 74, 105, "Biologie 2 / Kunst / Musik"),
  room("146", 559, 213, 109, 54, "Musik"),
  of("court", 668, 105, 120, 162),
  ...core(833, "152", "153", true),
];

const secondFloor: Shape[] = [
  room("234", 0, 0, 101, 82),
  room("233", 101, 0, 88, 82),
  room("232", 189, 0, 49, 82),
  room("231", 238, 0, 86, 82),
  of("stairs", 324, 0, 57, 82),
  of("wc", 381, 0, 38, 55),
  of("lift", 381, 55, 38, 27),
  of("wc", 445, 0, 55, 82),
  room("222", 500, 0, 79, 82, "Sek II"),
  room("221", 579, 0, 81, 82, "Sek II"),
  room("220", 660, 0, 80, 82, "Sek II"),
  of("stairs", 740, 0, 57, 82),
  room("219", 797, 0, 65, 82, "Sek II"),
  room("218", 862, 0, 64, 86, "Sek II"),
  room("217", 926, 0, 74, 95, "Sek II"),
  room("235", 0, 82, 84, 46),
  room("236", 0, 128, 115, 68),
  room("237", 0, 196, 118, 64),
  room("238", 0, 260, 82, 46),
  room("201", 0, 306, 121, 79),
  room("202", 121, 296, 85, 89),
  room("203", 206, 296, 48, 89),
  room("204", 254, 292, 80, 93),
  of("stairs", 334, 290, 55, 95),
  of("blocked", 389, 290, 24, 95),
  room("206", 413, 290, 53, 95, "Arbeitsraum Sek II"),
  room("208", 495, 290, 86, 95, "Sek II"),
  room("209", 581, 290, 78, 95, "Sek II"),
  room("210", 659, 290, 74, 95, "Sek II"),
  of("stairs", 733, 290, 50, 95),
  room("211", 783, 290, 61, 95, "Sek II"),
  room("212", 844, 290, 60, 95, "Sek II"),
  room("213", 904, 290, 96, 95, "Sek II"),
  room("216", 930, 95, 70, 90, "Sek II"),
  room("215", 930, 185, 70, 28, "Lehrmittel"),
  room("214", 930, 213, 70, 77, "Sek II"),
  ...core(145, "242", "241"),
  of("court", 242, 105, 127, 162),
  room("247", 369, 95, 76, 162, "Oberstufenraum"),
  of("stairs", 490, 190, 36, 30),
  room("248", 559, 105, 109, 80, "Klausur 1"),
  room("249", 559, 185, 109, 82, "Klausur 2"),
  of("court", 668, 105, 120, 162),
  ...core(833, "254", "255", true),
];

export const FLOOR_PLANS: Record<Floor, Shape[]> = { 0: groundFloor, 1: firstFloor, 2: secondFloor };

/** Where the entrance is (ground floor, bottom edge). */
export const ENTRANCE = { x: 417, w: 161 };

const ROOMS = new Map<string, Room>();
for (const { floor } of FLOORS) {
  for (const shape of FLOOR_PLANS[floor]) {
    if (shape.kind === "room" && shape.id) {
      ROOMS.set(shape.id, { ...shape, kind: "room", id: shape.id, floor });
    }
  }
}

export const ALL_ROOMS: readonly Room[] = [...ROOMS.values()];

/** "41" and "041" are the same room; anything else (e.g. "TU1", the gym) is not on the plan. */
export function normalizeRoom(text: string) {
  const trimmed = text.trim();
  return /^\d{1,3}$/.test(trimmed) ? trimmed.padStart(3, "0") : trimmed.toUpperCase();
}

/** The room on the plan, or null (gyms, swimming pool, other buildings, typos). */
export function findRoom(text: string): Room | null {
  return ROOMS.get(normalizeRoom(text)) ?? null;
}

export function floorName(floor: Floor) {
  return FLOORS.find((item) => item.floor === floor)!.name;
}

/**
 * A room cell from the plan in pieces: the room numbers on the plan, and the
 * text around them ("114", "114 / 115", "TU1").
 */
export function splitRooms(text: string): ({ text: string; room: null } | { text: string; room: Room })[] {
  const parts: ({ text: string; room: null } | { text: string; room: Room })[] = [];
  let rest = "";
  for (const piece of text.split(/(\b\d{1,3}\b)/)) {
    const found = /^\d{1,3}$/.test(piece) ? findRoom(piece) : null;
    if (found) {
      if (rest) {
        parts.push({ text: rest, room: null });
        rest = "";
      }
      parts.push({ text: piece, room: found });
    } else {
      rest += piece;
    }
  }
  if (rest) {
    parts.push({ text: rest, room: null });
  }
  return parts;
}

/** The first room on the plan in these room cells (for "Ausprobieren"). */
export function firstKnownRoom(rooms: readonly string[]) {
  for (const text of rooms) {
    const found = splitRooms(text).find((part) => part.room !== null);
    if (found?.room) {
      return found.room.id;
    }
  }
  return null;
}
