import { describe, expect, it } from "vitest";
import { classOfRoom, classRoomLabel, gradeOfRooms } from "@/lib/class-rooms";
import { SCHOOL_CLASSES } from "@/lib/entries";
import {
  ALL_ROOMS,
  CLUSTERS,
  FLOORS,
  FLOOR_PLANS,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  clusterOf,
  findRoom,
  firstKnownRoom,
  normalizeRoom,
  splitRooms,
  type Area,
} from "@/lib/rooms";

const overlap = (a: Area, b: Area) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

describe("room plan", () => {
  it("has every room once, on the floor its number says, inside the building", () => {
    const ids = ALL_ROOMS.map((room) => room.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const room of ALL_ROOMS) {
      expect(room.id, room.id).toMatch(/^[012]\d\d$/);
      expect(Number(room.id[0]), room.id).toBe(room.floor);
      expect(room.x >= 0 && room.y >= 0 && room.w > 0 && room.h > 0, room.id).toBe(true);
      expect(room.x + room.w <= PLAN_WIDTH && room.y + room.h <= PLAN_HEIGHT, room.id).toBe(true);
    }
  });

  it("draws nothing on top of anything else", () => {
    for (const { floor } of FLOORS) {
      const shapes = FLOOR_PLANS[floor];
      shapes.forEach((shape, index) => {
        for (const other of shapes.slice(index + 1)) {
          expect(overlap(shape, other), `${floor}: ${shape.id ?? shape.kind} / ${other.id ?? other.kind}`).toBe(false);
        }
      });
    }
  });

  it("knows the rooms of the plan, with or without the leading zero", () => {
    // Rooms from a real plan (October 2026).
    for (const id of ["114", "115", "117", "204", "218", "222", "221", "209", "004", "001", "041", "127", "201", "248"]) {
      expect(findRoom(id)?.id, id).toBe(id);
    }
    expect(findRoom("41")?.id).toBe("041");
    expect(findRoom(" 114 ")?.floor).toBe(1);
    expect(normalizeRoom("tu1")).toBe("TU1");
    // Gyms, the swimming pool and nonsense are not on the plan.
    for (const text of ["TU1", "TU3", "SWI", "", "999", "1140"]) {
      expect(findRoom(text), text).toBeNull();
    }
  });

  it("finds the rooms in a room cell", () => {
    expect(splitRooms("248, 249")).toEqual([
      { text: "248", room: findRoom("248") },
      { text: ", ", room: null },
      { text: "249", room: findRoom("249") },
    ]);
    expect(splitRooms("SWI, TU3")).toEqual([{ text: "SWI, TU3", room: null }]);
    expect(splitRooms("TU1")).toEqual([{ text: "TU1", room: null }]);
    expect(splitRooms("")).toEqual([]);
    expect(firstKnownRoom(["", "TU3", "SWI, 104"])).toBe("104");
    expect(firstKnownRoom(["TU3"])).toBeNull();
  });
});

describe("clusters", () => {
  const roomsIn = (floor: 0 | 1 | 2, cluster: (typeof CLUSTERS)[number]) =>
    FLOOR_PLANS[floor].filter((shape) => shape.id && clusterOf(shape) === cluster).map((shape) => shape.id!);

  it("are the year groups on the left, top and bottom of each floor", () => {
    expect([0, 1, 2].map((floor) => gradeOfRooms(roomsIn(floor as 0 | 1 | 2, "left-top")))).toEqual([
      "Stufe 6",
      "Stufe 8",
      "Stufe 10",
    ]);
    expect([0, 1, 2].map((floor) => gradeOfRooms(roomsIn(floor as 0 | 1 | 2, "left-bottom")))).toEqual([
      "Stufe 5",
      "Stufe 7",
      "Stufe 9",
    ]);
    // Each holds all four classes of its year group.
    expect(roomsIn(0, "left-top").filter((id) => classOfRoom(id))).toHaveLength(4);
    expect(roomsIn(2, "left-bottom").filter((id) => classOfRoom(id))).toHaveLength(4);
  });

  it("leave out the middle, the gardens and the toilets two clusters share", () => {
    const shape = (floor: 0 | 1 | 2, id: string) => FLOOR_PLANS[floor].find((item) => item.id === id)!;
    expect(clusterOf(shape(1, "138"))).toBeNull();
    expect(clusterOf(shape(1, "152"))).toBeNull();
    expect(clusterOf(shape(2, "247"))).toBeNull();
    expect(clusterOf(shape(0, "029"))).toBeNull();
    expect(FLOOR_PLANS[1].filter((item) => item.kind === "court").map(clusterOf)).toEqual([null, null]);
    expect(clusterOf(shape(1, "114"))).toBe("right-top");
    expect(clusterOf(shape(1, "109"))).toBe("right-bottom");
  });
});

describe("class rooms", () => {
  it("belong to rooms on the plan and to real classes", () => {
    const owners = new Set<string>();
    for (const room of ALL_ROOMS) {
      const label = classRoomLabel(room.id);
      const owner = classOfRoom(room.id);
      if (owner) {
        expect(SCHOOL_CLASSES).toContain(owner);
        expect(owners.has(owner), owner).toBe(false);
        owners.add(owner);
      } else if (label) {
        // The year groups' extra rooms, e.g. "C6-1".
        expect(label).toMatch(/^C\d{1,2}-\d$/);
      }
    }
    // Every class from 5 to 10 has its room.
    expect(owners.size).toBe(24);
    expect(classOfRoom("041")).toBe("6A");
    expect(classOfRoom("037")).toBeNull();
    expect(classRoomLabel("037")).toBe("C6-1");
    expect(classRoomLabel("114")).toBeNull();
  });
});
