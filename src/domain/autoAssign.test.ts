import { describe, expect, it } from "vitest";
import { assignmentAudit } from "./audit";
import { autoAssign } from "./autoAssign";
import { refreshDerived } from "./model";
import { canWorkAt, fitsSlot, levelOf } from "./rules";
import { flattened } from "./slots";
import { statusLevels } from "./config";
import { autoModel, item, sampleModel, tinyModel } from "../test/fixtures";

describe("autoAssign（サンプル）", () => {
  const m = autoModel();
  const items = flattened(m);
  const assigned = items.filter((x) => m.assignments[x.key]);

  it("ほとんどの枠が埋まる", () => {
    expect(assigned.length / items.length).toBeGreaterThan(0.8);
  });
  it("重複なし・条件と勤務可能時間を満たす", () => {
    expect(assignmentAudit(m).conflicts.size).toBe(0);
    for (const x of assigned) {
      const name = m.assignments[x.key];
      expect(fitsSlot(m, name, x)).toBe(true);
      expect(canWorkAt(m, name, x)).toBe(true);
    }
  });
  it("ドリッパー 1st・6th は上級生だけ", () => {
    for (const x of assigned.filter((x) => x.role === "ドリッパー" && (x.occ === 0 || x.occ === 5)))
      expect(levelOf(m, m.assignments[x.key])).toBe(statusLevels["上級生"]);
  });
  it("割当のキーは実在する枠だけ（空文字は作らない）", () => {
    const keys = new Set(items.map((x) => x.key));
    for (const [k, v] of Object.entries(m.assignments)) {
      expect(keys.has(k)).toBe(true);
      expect(v).not.toBe("");
    }
  });
  it("同じ入力なら同じ結果・既存の割当は捨てる", () => {
    const again = sampleModel();
    again.assignments = { dummy: "x" };
    autoAssign(again);
    refreshDerived(again);
    expect(again.assignments).toEqual(m.assignments);
  });
});

describe("autoAssign（小さな例）", () => {
  it("同じ人を次の30分にも続けて入れる", () => {
    const m = tinyModel();
    for (const s of m.slots) if (s.role !== "レジ") s.count = 0;
    autoAssign(m);
    const names = ["10:00", "10:30", "11:00", "11:30"].map((h) => m.assignments[item(m, "レジ", h).key]);
    expect(names[0]).toBe(names[1]);
    expect(names[2]).toBe(names[3]);
  });
  it("条件に合う人がいなければ空けておく（店舗のない美化・裏シフトだけ埋まる）", () => {
    const m = tinyModel();
    m.memberStores = {};
    autoAssign(m);
    const roles = new Set(flattened(m).filter((x) => m.assignments[x.key]).map((x) => x.role));
    expect(roles).toEqual(new Set(["美化", "裏シフト"]));
  });
  it("車が必要な係には車ありの人だけ", () => {
    const m = tinyModel();
    m.availability.forEach((a) => (a.date = "2026-10-30"));
    m.slots = [];
    refreshDerived(m);
    m.memberCars.B = true;
    for (const s of m.slots) if (s.role !== "買い出し") s.count = 0;
    autoAssign(m);
    const buyers = flattened(m).filter((x) => x.role === "買い出し" && m.assignments[x.key]);
    expect(buyers.length).toBeGreaterThan(0);
    expect(new Set(buyers.map((x) => m.assignments[x.key]))).toEqual(new Set(["B"]));
  });
});
