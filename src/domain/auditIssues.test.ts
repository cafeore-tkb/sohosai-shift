import { describe, expect, it } from "vitest";
import { assignmentAudit, dislikedCount, offAssignments, unfitAssignments } from "./audit";
import { slotCell } from "./cells";
import { auditIssues } from "./auditIssues";
import { item, tinyModel } from "../test/fixtures";

describe("auditIssues", () => {
  it("重複：人・日ごとに1件、同じ時間帯なら役職を ／ で並べる", () => {
    const m = tinyModel();
    const a = item(m, "レジ", "10:00"),
      a2 = item(m, "レジ", "10:30"),
      b = item(m, "ホール", "10:00"),
      b2 = item(m, "ホール", "10:30");
    Object.assign(m.assignments, { [a.key]: "A", [a2.key]: "A", [b.key]: "A", [b2.key]: "A" });
    const { conflicts, offs, dislikes } = auditIssues(m, assignmentAudit(m));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe("A");
    expect(conflicts[0].first).toBe(conflicts[0].keys[0]);
    expect([a.key, b.key]).toContain(conflicts[0].first);
    expect([...conflicts[0].keys].sort()).toEqual([a.key, a2.key, b.key, b2.key].sort());
    expect(conflicts[0].where).toMatch(/^本番1日目 10:00–11:00 本店・(ホール|レジ)( 1)? ／ 本店・(ホール|レジ)( 1)?$/);
    expect(offs).toEqual([]);
    expect(dislikes).toEqual([]);
  });

  it("時間外・苦手：件数は旧版の数え方と合う", () => {
    const m = tinyModel();
    m.availability.push({ name: "D", date: "2026-10-31", start: "10:00", end: "10:30" });
    m.memberDislikes = { B: ["マスター"] };
    m.assignments[item(m, "マスター", "10:00").key] = "B";
    m.assignments[item(m, "マスター", "10:30").key] = "B";
    m.assignments[item(m, "ホール", "11:00").key] = "D";
    const { offs, dislikes } = auditIssues(m, assignmentAudit(m));
    expect(offs.map((x) => [x.name, x.where])).toEqual([["D", expect.stringMatching(/^本番1日目 11:00–11:30 本店・ホール/)]]);
    expect(dislikes.map((x) => [x.name, x.where])).toEqual([["B", "本番1日目 10:00–11:00 本店・マスター"]]);
    expect(dislikes.flatMap((x) => x.keys)).toHaveLength(dislikedCount(m));
    expect(offs.flatMap((x) => x.keys)).toHaveLength(offAssignments(m).length);
  });

  it("条件外：所属・ステータスに合わない割当。セルの色は 重複 > 勤務できない時間 > 条件外 > 苦手", () => {
    const m = tinyModel();
    m.memberStatuses.C = "1年目合格";
    m.memberDislikes = { C: ["マスター"] };
    const mt = item(m, "マスター", "10:00");
    m.assignments[mt.key] = "C";
    const { unfits } = auditIssues(m, assignmentAudit(m));
    expect(unfits.map((x) => [x.name, x.where, x.first])).toEqual([["C", "本番1日目 10:00–10:30 本店・マスター", mt.key]]);
    expect(unfits.flatMap((x) => x.keys)).toHaveLength(unfitAssignments(m).length);
    const cell = () => slotCell(m, mt, assignmentAudit(m), {});
    expect(cell().kind).toBe("unfit"); // 苦手より条件外
    expect(cell().unfit).toEqual(["ステータス"]);
    expect(cell().tip).toContain("条件外（ステータス）");
    m.availability = m.availability.map((a) => (a.name === "C" ? { ...a, start: "11:00" } : a));
    expect(cell().kind).toBe("off"); // 条件外より勤務できない時間
    m.assignments[item(m, "レジ", "10:00").key] = "C";
    expect(cell().kind).toBe("conflict");
  });
});
