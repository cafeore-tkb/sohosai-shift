import { describe, expect, it } from "vitest";
import { sendToBreak } from "./assign";
import { createModel, refreshDerived } from "./model";
import { findSlot } from "./slots";
import type { Model } from "./types";

const P = "2026-10-30";
/** 前日準備の 11:00〜14:00 に A・B（B は 12:30 まで） */
function prepModel(): Model {
  const m = createModel();
  m.availability.push({ name: "A", date: P, start: "11:00", end: "14:00" }, { name: "B", date: P, start: "11:00", end: "12:30" });
  refreshDerived(m);
  return m;
}
const key = (m: Model, role: string, start: string, occ = 0) => `${findSlot(m, P, "準備", role, start)!.id}-${occ}`;

describe("昼食へ・休憩へ（sendToBreak）", () => {
  it("その時間から長さぶん昼食に入れ、同じ時間の担当からは外す", () => {
    const m = prepModel();
    for (const t of ["11:00", "11:30", "12:00", "12:30"]) m.assignments[key(m, "買い出し", t)] = "A";
    refreshDerived(m);
    const r = sendToBreak(m, key(m, "買い出し", "12:00"), "昼食", 2)!;
    refreshDerived(m);
    expect(r.message).toBe("A を 12:00〜13:00 昼食 に入れました（買い出し から外しました）");
    expect([m.assignments[key(m, "昼食", "12:00")], m.assignments[key(m, "昼食", "12:30")]]).toEqual(["A", "A"]);
    expect(["11:00", "11:30", "12:00", "12:30"].map((t) => m.assignments[key(m, "買い出し", t)])).toEqual(["A", "A", "", ""]);
    // 元に戻すための差分
    expect(r.changes.filter((c) => c[0] === "assignments").length).toBe(4);
  });

  it("空いている一番前の番目に入れる。参加できない時間で止まる", () => {
    const m = prepModel();
    m.assignments[key(m, "昼食", "12:00")] = "A";
    m.assignments[key(m, "実委からの受け取り", "12:00")] = "B";
    refreshDerived(m);
    const r = sendToBreak(m, key(m, "実委からの受け取り", "12:00"), "昼食", 2)!;
    refreshDerived(m);
    // B は 12:30 までなので 30分だけ。番目 0 は A がいるので 1 へ
    expect(r.message).toBe("B を 12:00〜12:30 昼食 に入れました（実委からの受け取り から外しました）");
    expect(m.assignments[key(m, "昼食", "12:00", 1)]).toBe("B");
    expect(m.assignments[key(m, "実委からの受け取り", "12:00")]).toBe("");
  });

  it("昼食から休憩へ移す。昼食・休憩のない日（本番）や空きの枠は null", () => {
    const m = prepModel();
    m.assignments[key(m, "昼食", "11:00")] = "A";
    refreshDerived(m);
    const r = sendToBreak(m, key(m, "昼食", "11:00"), "休憩", 1)!;
    expect(r.message).toBe("A を 11:00〜11:30 休憩 に入れました（昼食 から外しました）");
    expect(m.assignments[key(m, "昼食", "11:00")]).toBe("");
    expect(sendToBreak(m, key(m, "買い出し", "11:00"), "昼食", 1)).toBeNull();
  });
});
