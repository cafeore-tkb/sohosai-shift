import { describe, expect, it } from "vitest";
import { carlessItems } from "./audit";
import { autoAssign } from "./autoAssign";
import { addBuyShop, buyShopAssigned, removeBuyShop, renameBuyShop } from "./buyShops";
import { personCellLabel } from "./labels";
import { createModel, refreshDerived } from "./model";
import { posKey, ruleKey } from "./rules";
import { applySharedChange } from "./shared";
import { BUY_SHOPS_KEY, buyShops, findSlot, flattened } from "./slots";
import type { Model } from "./types";

const P = "2026-10-30";
/** 前日準備の 10:00〜14:00 に A・B・C（C だけ車あり） */
function prepModel(): Model {
  const m = createModel();
  for (const name of ["A", "B", "C"]) m.availability.push({ name, date: P, start: "10:00", end: "14:00" });
  m.memberCars.C = true;
  refreshDerived(m);
  return m;
}
const slotOf = (m: Model, role: string, start: string) => findSlot(m, P, "準備", role, start);
const key = (m: Model, role: string, start: string, occ = 0) => `${slotOf(m, role, start)!.id}-${occ}`;
const buyRoles = (m: Model) => [...new Set(m.slots.filter((s) => s.role.startsWith("買い出し")).map((s) => s.role))];
/** 操作のあとの commit と同じ補正 */
const run = <T,>(m: Model, f: () => T): T => {
  const r = f();
  refreshDerived(m);
  return r;
};

describe("買い出し先", () => {
  it("なければ買い出しは1つの係（いままでどおり）", () => {
    const m = prepModel();
    expect(buyShops(m)).toEqual([]);
    expect(buyRoles(m)).toEqual(["買い出し"]);
  });

  it("最初の買い出し先は、いまの買い出しの割当・必要人数・役職ルール・固定を引き継ぐ", () => {
    const m = prepModel();
    m.assignments[key(m, "買い出し", "10:00")] = "A";
    m.assignments[key(m, "買い出し", "10:00", 1)] = "B";
    m.pinnedSlots[key(m, "買い出し", "10:00")] = "A";
    m.slotCounts[slotOf(m, "買い出し", "11:00")!.id] = 1;
    m.roleRequirements[ruleKey("準備", "買い出し")] = "1年目合格";
    m.roleRequirements[posKey("準備", "買い出し", 1)] = "上級生";
    const r = run(m, () => addBuyShop(m, " 100均 "));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("「100均」");
    expect(m.settings[BUY_SHOPS_KEY]).toEqual(["100均"]);
    expect(buyRoles(m)).toEqual(["買い出し（100均）"]);
    expect(m.assignments[key(m, "買い出し（100均）", "10:00")]).toBe("A");
    expect(m.assignments[key(m, "買い出し（100均）", "10:00", 1)]).toBe("B");
    expect(m.pinnedSlots[key(m, "買い出し（100均）", "10:00")]).toBe("A");
    expect(slotOf(m, "買い出し（100均）", "11:00")!.count).toBe(1);
    expect(slotOf(m, "買い出し（100均）", "12:00")!.count).toBe(2);
    expect(m.roleRequirements).toMatchObject({
      [ruleKey("準備", "買い出し（100均）")]: "1年目合格",
      [posKey("準備", "買い出し（100均）", 1)]: "上級生",
    });
    expect(m.roleRequirements[ruleKey("準備", "買い出し")]).toBeUndefined();
    // 割当の数は変わらない（前の係のキーは残らない）
    expect(Object.values(m.assignments).filter(Boolean)).toHaveLength(2);
    expect(buyShopAssigned(m, "100均")).toBe(2);
  });

  it("2つ目からは新しい列（標準の人数は買い出しと同じ）。同じ名前・空の名前は足せない", () => {
    const m = prepModel();
    run(m, () => addBuyShop(m, "100均"));
    run(m, () => addBuyShop(m, "トライアル"));
    expect(buyRoles(m)).toEqual(["買い出し（100均）", "買い出し（トライアル）"]);
    expect(slotOf(m, "買い出し（トライアル）", "10:00")!.count).toBe(2);
    expect(addBuyShop(m, "100均")).toEqual({ ok: false, message: "買い出し先「100均」はもうあります" });
    expect(addBuyShop(m, "  ").ok).toBe(false);
    expect(addBuyShop(m, "a|b").ok).toBe(false);
    expect(buyShops(m)).toEqual(["100均", "トライアル"]);
  });

  it("名前を変えると割当などはそのまま新しい名前の係へ", () => {
    const m = prepModel();
    run(m, () => addBuyShop(m, "100均"));
    run(m, () => addBuyShop(m, "トライアル"));
    m.assignments[key(m, "買い出し（トライアル）", "12:00")] = "C";
    m.slotCounts[slotOf(m, "買い出し（トライアル）", "13:00")!.id] = 0;
    const r = run(m, () => renameBuyShop(m, "トライアル", "トライアル 学園店"));
    expect(r).toEqual({ ok: true, message: "買い出し先「トライアル」を「トライアル 学園店」に変えました" });
    expect(buyShops(m)).toEqual(["100均", "トライアル 学園店"]);
    expect(m.assignments[key(m, "買い出し（トライアル 学園店）", "12:00")]).toBe("C");
    expect(slotOf(m, "買い出し（トライアル 学園店）", "13:00")!.count).toBe(0);
    expect(slotOf(m, "買い出し（トライアル）", "12:00")).toBeUndefined();
    expect(renameBuyShop(m, "100均", "トライアル 学園店").ok).toBe(false);
  });

  it("消すとその行き先の割当も外れる。最後の1つを消すと買い出しに戻る（割当はそのまま）", () => {
    const m = prepModel();
    run(m, () => addBuyShop(m, "100均"));
    run(m, () => addBuyShop(m, "トライアル"));
    m.assignments[key(m, "買い出し（100均）", "10:00")] = "A";
    m.assignments[key(m, "買い出し（トライアル）", "10:00")] = "B";
    m.assignments[key(m, "買い出し（トライアル）", "10:30")] = "B";
    const r = run(m, () => removeBuyShop(m, "トライアル"));
    expect(r.message).toBe("買い出し先「トライアル」を削除しました（割当 2 枠を外しました）");
    expect(Object.values(m.assignments).filter(Boolean)).toEqual(["A"]);
    const last = run(m, () => removeBuyShop(m, "100均"));
    expect(last.ok).toBe(true);
    expect(buyShops(m)).toEqual([]);
    expect(m.settings[BUY_SHOPS_KEY]).toBeUndefined();
    expect(buyRoles(m)).toEqual(["買い出し"]);
    expect(m.assignments[key(m, "買い出し", "10:00")]).toBe("A");
  });

  it("自動割当・勤務状況チェックは、行き先ごとに車ありの人を1人以上", () => {
    const m = prepModel();
    run(m, () => addBuyShop(m, "100均"));
    run(m, () => addBuyShop(m, "トライアル"));
    m.memberCars.A = true;
    for (const s of m.slots) s.count = s.role.startsWith("買い出し") && s.start === "10:00" ? 1 : 0;
    autoAssign(m);
    const names = ["100均", "トライアル"].map((s) => m.assignments[key(m, `買い出し（${s}）`, "10:00")]);
    expect(names.sort()).toEqual(["A", "C"]);
    expect(carlessItems(m)).toEqual([]);
    // 車なしの人に替えると、その行き先だけ出る
    m.assignments[key(m, "買い出し（トライアル）", "10:00")] = "B";
    expect(carlessItems(m).map((x) => x.role)).toEqual(["買い出し（トライアル）"]);
  });

  it("共同編集で買い出し先が変わったら枠を作り直す", () => {
    const m = prepModel();
    applySharedChange(m, "settings", BUY_SHOPS_KEY, ["100均"]);
    refreshDerived(m);
    expect(buyRoles(m)).toEqual(["買い出し（100均）"]);
    expect(flattened(m).some((x) => x.role === "買い出し")).toBe(false);
  });

  it("個人別の表のセルは「買100均」", () => {
    expect(personCellLabel({ store: "準備", role: "買い出し（100均）", occ: 0 })).toBe("買100均");
    expect(personCellLabel({ store: "準備", role: "買い出し", occ: 0 })).toBe("買い出し");
  });
});
