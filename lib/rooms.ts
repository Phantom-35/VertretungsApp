/**
 * The school's room plan (main building, "Raumplan 2026/2027" of 09.07.2026),
 * drawn after the printed plan: simplified, but every room where it is.
 * Each floor is 1000 × 385 units, the street side (entrance) at the bottom.
 * When the school changes rooms for a new school year, update it here.
 */

/** The school year (its first year) the plan and the class rooms are for. */
export const ROOM_PLAN_SCHOOL_YEAR = 2026;
export const ROOM_PLAN_EDITION = `Raumplan ${ROOM_PLAN_SCHOOL_YEAR}/${String((ROOM_PLAN_SCHOOL_YEAR + 1) % 100).padStart(2, "0")}`;

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

/*
 * The building, regular as it is: around the stairwell in the middle a wing
 * on each side, each with a garden (open to the sky through all floors) and
 * two clusters of rooms around it, top and bottom. The two clusters of a
 * wing share the toilets between them. Rows and columns of rooms all end in
 * a straight line towards the corridor.
 */
/** Where the top row of rooms ends and the bottom row begins. */
const TOP = 82;
const BOTTOM = 303;
/** The left and the right column of rooms. */
const LEFT = 100;
const RIGHT = 900;
/** The inner part of a wing: gardens, middle blocks, toilets. */
const INNER_TOP = 108;
const INNER_BOTTOM = 277;
/** The line between the two clusters of a wing. */
export const CLUSTER_LINE = 192;

/** Toilets and storerooms around a shaft, between the two clusters of a wing. */
function core(x: number, upper: string, lower: string, mirrored = false): Shape[] {
  const shaftX = mirrored ? x + 22 : x;
  const roomX = mirrored ? x : x + 39;
  return [
    of("wc", x, 118, 61, 32),
    of("blocked", shaftX, 150, 39, 84),
    room(upper, roomX, 150, 22, 42, "Lehrmittel"),
    room(lower, roomX, 192, 22, 42, "Lehrmittel"),
    of("wc", x, 234, 61, 32),
  ];
}

/** The left column: the same four rooms on every floor. */
function leftColumn(ids: [string, string, string, string]): Shape[] {
  return [
    room(ids[0], 0, TOP, LEFT, 46),
    room(ids[1], 0, 128, LEFT, 68),
    room(ids[2], 0, 196, LEFT, 64),
    room(ids[3], 0, 260, LEFT, BOTTOM - 260),
  ];
}

const row = (top: boolean) => (top ? { y: 0, h: TOP } : { y: BOTTOM, h: PLAN_HEIGHT - BOTTOM });
const gardens: Shape[] = [
  of("court", 240, INNER_TOP, 130, INNER_BOTTOM - INNER_TOP, "Garten"),
  of("court", 668, INNER_TOP, 122, INNER_BOTTOM - INNER_TOP, "Garten"),
];
const r = (id: string, x: number, w: number, top: boolean, name?: string) => {
  const { y, h } = row(top);
  return room(id, x, y, w, h, name);
};
const o = (kind: Shape["kind"], x: number, w: number, top: boolean) => {
  const { y, h } = row(top);
  return of(kind, x, y, w, h);
};

const groundFloor: Shape[] = [
  r("039", 0, 98, true),
  r("038", 98, 88, true),
  r("037", 186, 48, true),
  r("036", 234, 84, true),
  o("stairs", 318, 52, true),
  of("wc", 370, 0, 40, 50),
  of("lift", 370, 50, 40, 32),
  o("blocked", 436, 26, true),
  r("030", 462, 45, true, "Schulleitung"),
  r("029", 507, 97, true, "Sekretariat"),
  r("028", 604, 55, true, "Schulleitung"),
  o("wc", 659, 30, true),
  o("wc", 689, 30, true),
  o("stairs", 719, 56, true),
  r("022", 775, 40, true, "Verwaltung"),
  r("021", 815, 41, true, "Schulentwicklung"),
  r("020", 856, 47, true, "Mittelstufe"),
  r("019", 903, 49, true, "Erprobungsstufe"),
  r("018", 952, 48, true, "Bibliothek"),
  ...leftColumn(["040", "041", "042", "043"]),
  r("001", 0, 110, false),
  r("002", 110, 95, false),
  r("003", 205, 47, false),
  r("004", 252, 77, false),
  o("stairs", 329, 51, false),
  room("006", 380, BOTTOM, 37, 41, "Pause"),
  room("005", 380, 344, 37, PLAN_HEIGHT - 344, "Sanitäter"),
  r("007", 578, 49, false, "Sek-II-Beratung"),
  r("008", 627, 49, false, "Sek-II-Beratung"),
  r("009", 676, 39, false, "SII-Leitung"),
  o("stairs", 715, 53, false),
  r("010", 768, 30, false, "BOB"),
  r("011", 798, 34, false, "Beratung"),
  r("012", 832, 68, false, "Konferenz / Stillarbeit"),
  r("013", RIGHT, 100, false, "Stillarbeit"),
  room("017", RIGHT, TOP, 100, 73, "Ruheraum"),
  room("016", RIGHT, 155, 100, 74, "Küche"),
  room("015", RIGHT, 229, 100, BOTTOM - 229, "Kopierer"),
  ...core(145, "047", "046"),
  ...gardens,
  room("054", 370, INNER_TOP, 50, 32, "SV"),
  room("053", 370, 140, 50, 36, "Schulsozialarbeit"),
  of("wc", 462, INNER_TOP, 35, 62),
  of("wc", 497, INNER_TOP, 34, 62),
  of("stairs", 490, 200, 36, 30),
  room("060", 575, INNER_TOP, 32, INNER_BOTTOM - INNER_TOP, "Materiallager"),
  room("061", 628, INNER_TOP, 40, 56, "Beratung 1"),
  room("062", 628, 164, 40, 57, "Hausmeister"),
  room("063", 628, 221, 40, INNER_BOTTOM - 221, "Beratung 3"),
  room("014", 790, INNER_TOP, 110, INNER_BOTTOM - INNER_TOP, "Lehrerzimmer"),
];

const firstFloor: Shape[] = [
  r("130", 0, 104, true),
  r("129", 104, 86, true),
  r("128", 190, 49, true),
  r("127", 239, 83, true),
  o("stairs", 322, 55, true),
  of("wc", 377, 0, 38, 55),
  of("lift", 377, 55, 38, TOP - 55),
  o("wc", 440, 54, true),
  r("117", 494, 101, true, "Informatik / PC\u00a02"),
  r("116", 595, 37, true, "Kunst-Vorbereitung"),
  r("115", 632, 95, true, "Informatik / PC\u00a01"),
  o("stairs", 727, 55, true),
  r("114", 782, 118, true, "Kunst"),
  r("113", RIGHT, 100, true, "Biologie-Vorbereitung"),
  ...leftColumn(["131", "132", "133", "134"]),
  r("101", 0, 123, false),
  r("102", 123, 83, false),
  r("103", 206, 48, false),
  r("104", 254, 80, false),
  o("stairs", 334, 52, false),
  r("105", 386, 38, false, "Musik-Vorbereitung"),
  r("106", 424, 108, false, "Physik 1"),
  r("107", 532, 78, false, "Physik-Vorbereitung"),
  r("108", 610, 114, false, "Physik 2"),
  o("stairs", 724, 51, false),
  r("109", 775, 125, false, "Chemie 1"),
  r("110", RIGHT, 100, false, "Chemie-Vorbereitung"),
  room("112", RIGHT, TOP, 100, CLUSTER_LINE - TOP, "Biologie 1 / NW"),
  room("111", RIGHT, CLUSTER_LINE, 100, BOTTOM - CLUSTER_LINE, "Chemie 2"),
  ...core(145, "138", "137"),
  ...gardens,
  of("space", 370, INNER_TOP, 75, INNER_BOTTOM - INNER_TOP, "Bibliothek"),
  of("stairs", 490, 200, 36, 30),
  of("blocked", 560, INNER_TOP, 36, 55),
  room("145", 560, 163, 36, 57, "Bücherlager"),
  room("147", 596, INNER_TOP, 72, 112, "Biologie 2 / Kunst / Musik"),
  room("146", 560, 220, 108, INNER_BOTTOM - 220, "Musik"),
  ...core(830, "152", "153", true),
];

const secondFloor: Shape[] = [
  r("234", 0, 101, true),
  r("233", 101, 88, true),
  r("232", 189, 49, true),
  r("231", 238, 86, true),
  o("stairs", 324, 57, true),
  of("wc", 381, 0, 38, 55),
  of("lift", 381, 55, 38, TOP - 55),
  o("wc", 445, 55, true),
  r("222", 500, 79, true, "Sek II"),
  r("221", 579, 81, true, "Sek II"),
  r("220", 660, 80, true, "Sek II"),
  o("stairs", 740, 57, true),
  r("219", 797, 65, true, "Sek II"),
  r("218", 862, 64, true, "Sek II"),
  r("217", 926, 74, true, "Sek II"),
  ...leftColumn(["235", "236", "237", "238"]),
  r("201", 0, 121, false),
  r("202", 121, 85, false),
  r("203", 206, 48, false),
  r("204", 254, 80, false),
  o("stairs", 334, 55, false),
  o("blocked", 389, 24, false),
  r("206", 413, 53, false, "Arbeitsraum Sek II"),
  r("208", 495, 86, false, "Sek II"),
  r("209", 581, 78, false, "Sek II"),
  r("210", 659, 74, false, "Sek II"),
  o("stairs", 733, 50, false),
  r("211", 783, 61, false, "Sek II"),
  r("212", 844, 56, false, "Sek II"),
  r("213", RIGHT, 100, false, "Sek II"),
  room("216", RIGHT, TOP, 100, 93, "Sek II"),
  room("215", RIGHT, 175, 100, 30, "Lehrmittel"),
  room("214", RIGHT, 205, 100, BOTTOM - 205, "Sek II"),
  ...core(145, "242", "241"),
  ...gardens,
  room("247", 370, INNER_TOP, 75, INNER_BOTTOM - INNER_TOP, "Oberstufenraum"),
  of("stairs", 490, 200, 36, 30),
  room("248", 560, INNER_TOP, 108, CLUSTER_LINE - INNER_TOP, "Klausur 1"),
  room("249", 560, CLUSTER_LINE, 108, INNER_BOTTOM - CLUSTER_LINE, "Klausur 2"),
  ...core(830, "254", "255", true),
];

export const FLOOR_PLANS: Record<Floor, Shape[]> = { 0: groundFloor, 1: firstFloor, 2: secondFloor };

export type Cluster = "left-top" | "left-bottom" | "right-top" | "right-bottom";
export const CLUSTERS: readonly Cluster[] = ["left-top", "left-bottom", "right-top", "right-bottom"];

/** What the right wing's clusters hold; the left ones are named by their classes (lib/class-rooms.ts). */
export const CLUSTER_NAMES: Record<Floor, Partial<Record<Cluster, string>>> = {
  0: { "right-top": "Verwaltung", "right-bottom": "Beratung · Stillarbeit" },
  1: { "right-top": "Informatik · Kunst · Biologie", "right-bottom": "Physik · Chemie" },
  2: { "right-top": "Oberstufe", "right-bottom": "Oberstufe" },
};

/**
 * The cluster a shape belongs to, or null: the middle around the stairwell,
 * the gardens, the toilets two clusters share, and what spans both.
 */
export function clusterOf(shape: Shape): Cluster | null {
  if (shape.kind === "court" || shape.kind === "blocked") {
    return null;
  }
  const cx = shape.x + shape.w / 2;
  const inner = shape.y >= INNER_TOP - 10 && shape.y + shape.h <= INNER_BOTTOM + 10;
  const shared = inner && ((cx > 140 && cx < 210) || (cx > 825 && cx < 895));
  const middle = inner ? cx >= 370 && cx <= 668 : cx >= 445 && cx <= 560;
  const spans = shape.y < CLUSTER_LINE - 10 && shape.y + shape.h > CLUSTER_LINE + 10;
  if (shared || middle || spans) {
    return null;
  }
  const half = shape.y + shape.h / 2 < CLUSTER_LINE ? "top" : "bottom";
  return cx < 500 ? `left-${half}` : `right-${half}`;
}

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
