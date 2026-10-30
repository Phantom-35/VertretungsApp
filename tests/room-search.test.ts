import { describe, expect, it } from "vitest";
import { searchRooms } from "@/lib/room-search";

const ids = (query: string) => searchRooms(query).hits.map((hit) => hit.room.id);
const first = (query: string) => ids(query)[0];

describe("searchRooms", () => {
  it("finds a room by its number, with or without the leading zero", () => {
    expect(first("114")).toBe("114");
    expect(first("41")).toBe("041");
    expect(first("041")).toBe("041");
    // "11" is room 011 first, then the rooms starting with 11.
    expect(ids("11")[0]).toBe("011");
    expect(ids("11").slice(1).every((id) => id.startsWith("11"))).toBe(true);
  });

  it("finds a room by what is in it, also in everyday words", () => {
    expect(first("Kunst")).toBe("114");
    expect(ids("Chemie")).toEqual(expect.arrayContaining(["109", "111"]));
    expect(first("Chemie 2")).toBe("111");
    expect(first("Physik 2")).toBe("108");
    expect(first("bio")).toBe("112");
    expect(ids("Info")).toEqual(expect.arrayContaining(["115", "117"]));
    expect(first("sekretariat")).toBe("029");
    expect(first("Lehrer")).toBe("014");
    expect(first("Klausur 2")).toBe("249");
    expect(first("Bücherei")).toBe("018");
  });

  it("finds a class's own room", () => {
    expect(searchRooms("6a").hits[0]).toMatchObject({ room: { id: "041" }, label: "Klassenraum der 6A" });
    expect(first("9B")).toBe("202");
    expect(first("10 a")).toBeUndefined();
    expect(first("C6-1")).toBe("037");
  });

  it("forgives small typos, but not anything", () => {
    expect(first("Chemi")).toBe("109");
    expect(first("Physick")).toBe("106");
    expect(first("Sekretarait")).toBeUndefined();
    expect(ids("xyz")).toEqual([]);
    expect(ids("")).toEqual([]);
  });

  it("says where what is not on the plan is", () => {
    expect(searchRooms("Turnhalle")).toMatchObject({ hits: [], note: expect.stringContaining("nicht im Hauptgebäude") });
    expect(searchRooms("TU3").note).toContain("Turnhallen");
    expect(searchRooms("Klo").note).toContain("WCs");
    expect(searchRooms("114").note).toBeNull();
  });
});
