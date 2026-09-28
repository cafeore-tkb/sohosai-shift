import { describe, expect, it } from "vitest";
import { diff, mergeAvailability, normalize } from "./firebase";

const a = (name: string, date: string, start: string, end: string) => ({ name, date, start, end });

describe("sync document format", () => {
  it("normalize fills missing maps and a missing availability string", () => {
    const n = normalize({ assignments: { k: "x" }, settings: "bad" });
    expect(n.availability).toBe("[]");
    expect(n.assignments).toEqual({ k: "x" });
    expect(n.settings).toEqual({});
    expect(Object.keys(n)).toContain("memberCars");
  });

  it("diff lists changed, added and removed keys (undefined = delete)", () => {
    const base = normalize({ assignments: { a: "x", b: "y" } });
    const cur = normalize({ availability: "[1]", assignments: { a: "x", b: "z", c: "w" } });
    expect(diff(cur, base)).toEqual([
      [["availability"], "[1]"],
      [["assignments", "b"], "z"],
      [["assignments", "c"], "w"],
    ]);
    expect(diff(base, cur)).toContainEqual([["assignments", "c"], undefined]);
    // memberOrder：古いクライアントの部屋にはなく、移動は動かした人のキーだけ送る
    expect(normalize({ assignments: {} }).memberOrder).toEqual({});
    const order = normalize({ memberOrder: { A: 1, B: 2, C: 3 } });
    expect(diff(normalize({ memberOrder: { A: 1, B: 2, C: 1.5 } }), order)).toEqual([[["memberOrder", "C"], 1.5]]);
  });

  it("mergeAvailability keeps my changed person×day and takes theirs elsewhere", () => {
    const base = JSON.stringify([a("A", "d1", "10:00", "12:00"), a("B", "d1", "10:00", "12:00")]);
    const local = JSON.stringify([a("A", "d1", "10:00", "14:00"), a("B", "d1", "10:00", "12:00")]);
    const remote = JSON.stringify([a("A", "d1", "10:00", "12:00"), a("B", "d1", "09:00", "12:00")]);
    expect(mergeAvailability(local, base, remote)).toEqual([a("A", "d1", "10:00", "14:00"), a("B", "d1", "09:00", "12:00")]);
  });
});
