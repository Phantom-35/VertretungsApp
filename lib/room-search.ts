/**
 * Finding a room on the plan from what people type: a room number ("41",
 * "114"), what is in it ("Chemie", "Bio", "Sekretariat", "Lehrer") or a
 * class ("6a" → its class room). Small typos are forgiven.
 */
import { classOfRoom, classRoomLabel } from "@/lib/class-rooms";
import { ALL_ROOMS, type Room } from "@/lib/rooms";

export type RoomHit = { room: Room; label: string };

/** Short and everyday words for what the plan calls otherwise. */
const SYNONYMS: Record<string, string[]> = {
  bio: ["biologie"],
  info: ["informatik"],
  pc: ["informatik"],
  computer: ["informatik"],
  chem: ["chemie"],
  phy: ["physik"],
  mu: ["musik"],
  ku: ["kunst"],
  sek: ["sekretariat"],
  sekretärin: ["sekretariat"],
  büro: ["sekretariat", "verwaltung"],
  lehrer: ["lehrerzimmer"],
  lehrerin: ["lehrerzimmer"],
  bücherei: ["bibliothek"],
  bib: ["bibliothek"],
  bibo: ["bibliothek"],
  oberstufe: ["oberstufenraum", "sek"],
  klausuren: ["klausur"],
  erstehilfe: ["sanitäter"],
  sani: ["sanitäter"],
  direktor: ["schulleitung"],
  rektor: ["schulleitung"],
  schulleiter: ["schulleitung"],
  sozialarbeit: ["schulsozialarbeit"],
  kopieren: ["kopierer"],
};

/** What is not on the plan, with a word on where it is instead. */
const ELSEWHERE: { words: RegExp; note: string }[] = [
  {
    words: /^(turn|sport)(halle)?|^tu\d?$|^halle|^schwimm|^swi$|^bad$|^sport$/,
    note: "Turnhallen und Schwimmbad sind nicht im Hauptgebäude und deshalb nicht auf dem Plan.",
  },
  {
    words: /^(wc|klo|toilette|toiletten|bad)$/,
    note: "WCs gibt es auf jedem Stockwerk, bei jedem Treppenhaus und zwischen den Clustern.",
  },
  {
    words: /^(mensa|cafeteria|kiosk|essen)$/,
    note: "Mensa und Kiosk sind nicht auf dem Plan des Hauptgebäudes.",
  },
];

const fold = (text: string) =>
  text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

/** Fewer than two changes from one word to the other (a typo), checked cheaply. */
function nearlyEqual(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) {
    return false;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** The same, with the words folded as typed words are. */
const FOLDED_SYNONYMS = new Map(Object.entries(SYNONYMS).map(([word, meant]) => [fold(word), meant.map(fold)]));

type Entry = { room: Room; words: string[]; classLabel: string | null; label: string };

const ENTRIES: Entry[] = ALL_ROOMS.map((room) => {
  const classLabel = classRoomLabel(room.id);
  const owner = classOfRoom(room.id);
  const purpose = owner ? `Klassenraum der ${owner}` : (classLabel ?? room.name ?? "");
  const words = fold(`${room.name ?? ""} ${classLabel ?? ""}`)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return { room, words, classLabel: classLabel ? fold(classLabel) : null, label: purpose };
});

/** How well one typed word fits a room: 0 is not at all. */
function scoreToken(token: string, entry: Entry) {
  const { room, words, classLabel } = entry;
  if (/^\d{1,3}$/.test(token)) {
    if (room.id === token.padStart(3, "0")) {
      return 100;
    }
    if (token.length >= 2 && room.id.startsWith(token)) {
      return 50;
    }
    // "Chemie 2", "Klausur 1": a number in the name.
    return words.includes(token) ? 40 : 0;
  }
  if (classLabel && token.replace(/-/g, "") === classLabel.replace(/-/g, "")) {
    return 95;
  }
  let best = 0;
  for (const candidate of [token, ...(FOLDED_SYNONYMS.get(token) ?? [])]) {
    for (const word of words) {
      if (word === candidate) {
        best = Math.max(best, 80);
      } else if (candidate.length >= 2 && word.startsWith(candidate)) {
        best = Math.max(best, 60);
      } else if (candidate.length >= 4 && word.includes(candidate)) {
        best = Math.max(best, 40);
      } else if (nearlyEqual(word, candidate)) {
        best = Math.max(best, 30);
      }
    }
  }
  return best;
}

/** The rooms that fit, best first, and a note for what is not on the plan. */
export function searchRooms(query: string, limit = 6): { hits: RoomHit[]; note: string | null } {
  const tokens = fold(query.trim())
    .split(/[\s,;/]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return { hits: [], note: null };
  }
  const note = ELSEWHERE.find(({ words }) => tokens.some((token) => words.test(token)))?.note ?? null;
  const scored = ENTRIES.flatMap((entry) => {
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(token, entry);
      // Every word typed has to fit.
      if (score === 0) {
        return [];
      }
      total += score;
    }
    return [{ entry, total }];
  });
  scored.sort((left, right) => right.total - left.total || left.entry.room.id.localeCompare(right.entry.room.id));
  return {
    hits: scored.slice(0, limit).map(({ entry }) => ({ room: entry.room, label: entry.label })),
    note: scored.length === 0 ? note : null,
  };
}
