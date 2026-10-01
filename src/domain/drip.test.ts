import { describe, expect, it } from "vitest";
import { dripRows } from "./drip";
import { createModel, refreshDerived } from "./model";
import { flattened } from "./slots";
import { D } from "../test/fixtures";

describe("dripRows（勤務状況チェックのドリップの列）", () => {
  it("ドリッパーに入っている時間・入れるか・入れるのに1時間未満か", () => {
    const m = createModel();
    const add = (name: string, status: string, start: string, end: string) => {
      m.availability.push({ name, date: D, start, end });
      m.memberStatuses[name] = status;
      m.memberStores[name] = ["本店"];
    };
    add("A", "上級生", "10:00", "12:00");
    add("B", "1年目合格", "10:00", "12:00");
    add("C", "未合格", "10:00", "12:00"); // ドリッパーに入れない
    add("D", "上級生", "11:30", "12:00"); // 30分しかない＝1時間は入れない
    refreshDerived(m);
    const drips = flattened(m).filter((x) => x.store === "本店" && x.role === "ドリッパー" && x.occ === 1);
    const at = (h: string) => drips.find((x) => x.start === h)!.key;
    m.assignments[at("10:00")] = "A";
    m.assignments[at("10:30")] = "A";
    m.assignments[at("11:00")] = "B";
    m.assignments[at("11:30")] = "D";
    expect(dripRows(m, ["A", "B", "C", "D"])).toEqual({
      A: { hours: 1, can: true, short: false },
      B: { hours: 0.5, can: true, short: true },
      C: { hours: 0, can: false, short: false },
      D: { hours: 0.5, can: false, short: false },
    });
  });
});
