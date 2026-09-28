import { describe, expect, it } from "vitest";
import { assignmentAudit, auditRow, dislikedCount, fillOf, mergeSpans, offAssignments, summaryStats, wantsMissing } from "./audit";
import { refreshDerived } from "./model";
import { fmt } from "./time";
import { flattened } from "./slots";
import { item, tinyModel } from "../test/fixtures";

describe("mergeSpans / fmt", () => {
  it("重なり・隣接をまとめる（分）、fmt", () => {
    expect(
      mergeSpans([
        { start: "11:00", end: "11:30" },
        { start: "10:00", end: "10:30" },
        { start: "10:30", end: "11:00" },
        { start: "13:00", end: "13:30" },
        { start: "10:00", end: "10:30" },
      ]),
    ).toEqual([
      { start: 600, end: 690 },
      { start: 780, end: 810 },
    ]);
    expect([fmt(0), fmt(1.5), fmt(2), fmt(1 / 3)]).toEqual(["0h", "1.5h", "2h", "0.3h"]);
  });
});

describe("assignmentAudit", () => {
  it("重複・勤務時間（重なりは1回だけ数える・昼食は含まない）", () => {
    const m = tinyModel();
    const a = item(m, "レジ", "10:00"),
      b = item(m, "ホール", "10:00"),
      c = item(m, "レジ", "10:30");
    Object.assign(m.assignments, { [a.key]: "A", [b.key]: "A", [c.key]: "A", [item(m, "マスター", "11:00").key]: "B" });
    const audit = assignmentAudit(m);
    expect([...audit.conflicts].sort()).toEqual([a.key, b.key].sort());
    expect(audit.hours).toEqual({ A: { "2026-10-31": 1 }, B: { "2026-10-31": 0.5 } });
    expect(Object.keys(audit.booked)).toEqual(["A|2026-10-31", "B|2026-10-31"]);
    expect(auditRow(m, audit, "A", ["2026-10-31", "2026-11-01"])).toEqual({ perDay: [1, null], total: 1 });
    expect(auditRow(m, audit, "C", ["2026-10-31"])).toEqual({ perDay: [0], total: 0 });
    // 昼食・休憩は勤務時間に含まない
    const p = tinyModel();
    p.availability.forEach((x) => (x.date = "2026-10-30"));
    p.slots = [];
    refreshDerived(p);
    const lunch = p.slots.find((s) => s.role === "昼食")!;
    lunch.count = 1;
    const prep = p.slots.find((s) => s.role === "店舗準備（本店）" && s.start === "11:00")!;
    p.assignments[`${lunch.id}-0`] = "A";
    p.assignments[`${prep.id}-0`] = "A";
    expect(assignmentAudit(p).hours.A["2026-10-30"]).toBe(0.5);
  });

  it("時間外・苦手・やりたい役職に入っていない人", () => {
    const m = tinyModel();
    m.availability.push({ name: "D", date: "2026-10-31", start: "10:00", end: "10:30" });
    m.memberWants = { A: ["レジ"], B: ["ドリッパー"], D: ["ホール"] };
    m.memberDislikes = { B: ["マスター"] };
    m.assignments[item(m, "レジ", "10:00").key] = "A";
    m.assignments[item(m, "マスター", "10:00").key] = "B";
    m.assignments[item(m, "ホール", "11:00").key] = "D";
    expect(offAssignments(m).map((x) => m.assignments[x.key])).toEqual(["D"]);
    expect(dislikedCount(m)).toBe(1);
    expect(wantsMissing(m)).toEqual([{ name: "B", wants: ["ドリッパー"], none: false }]);
    m.assignments[item(m, "ホール", "11:00").key] = "";
    expect(wantsMissing(m).map((x) => [x.name, x.none])).toEqual([
      ["B", false],
      ["D", true],
    ]);
  });

  it("fillOf / summaryStats", () => {
    const m = tinyModel();
    const items = flattened(m);
    m.assignments[items[0].key] = "A";
    expect(fillOf(m, items.slice(0, 1))).toEqual({ filled: 1, total: 1, cls: "full" });
    expect(fillOf(m, items.slice(0, 2)).cls).toBe("partial");
    expect(fillOf(m, items.slice(1, 2)).cls).toBe("empty");
    expect(fillOf(m, []).cls).toBe("");
    expect(summaryStats(m)).toEqual({ staff: 3, slots: items.length, filled: 1, open: items.length - 1, conflicts: 0, rate: 1 });
  });
});
