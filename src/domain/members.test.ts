import { describe, expect, it } from "vitest";
import { applyAvailability, boardNames, canAt, namesOn } from "./availability";
import { carFreeAt, dripBadge, personMatrix, personSegments } from "./cells";
import { dayGrid, gridCell } from "./grid";
import { itemLabel, personCellLabel, requirementNote } from "./labels";
import { setMemberCar, setMemberIce, setMemberStatus, setMemberStore, setRoleRequirement, filterMembers } from "./members";
import { refreshDerived } from "./model";
import { buildShortNames, displayName, surname } from "./names";
import { pruneAssignments, prunedMessage } from "./prune";
import { posTag, unfitReasons } from "./rules";
import { unfitAssignments } from "./audit";
import { setSlotCount } from "./slots";
import { D, item, tinyModel } from "../test/fixtures";

describe("名前", () => {
  it("surname / buildShortNames（名字がかぶれば下の名前の頭を足す）", () => {
    expect(surname("山田 太郎")).toBe("山田");
    expect(surname("佐々木翔")).toBe("佐々木");
    expect(surname("田中はると")).toBe("田中");
    expect(surname("たなか")).toBe("たな");
    // buildShortNames：名字がかぶれば下の名前の頭を足す
    const m = tinyModel();
    m.availability = ["山田 太郎", "山田 花子", "佐藤あかり", "鈴木一郎", "鈴木一朗"].map((name) => ({ name, date: D, start: "10:00", end: "11:00" }));
    const s = buildShortNames(m);
    expect(s).toEqual({ "山田 太郎": "山田太", "山田 花子": "山田花", 佐藤あかり: "佐藤", 鈴木一郎: "鈴木一郎", 鈴木一朗: "鈴木一朗" });
    expect(displayName("山田 太郎", false, s)).toBe("山田太");
    expect(displayName("山田 太郎", true, s)).toBe("山田 太郎");
    expect(displayName("いない", false, s)).toBe("いない");
  });
});

describe("メンバー・ルールの編集と pruneAssignments", () => {
  it("条件に合わなくなった割当は外さない（条件外）。枠がなくなった割当だけ外す", () => {
    const m = tinyModel();
    m.assignments[item(m, "レジ", "10:00").key] = "A";
    m.assignments[item(m, "マスター", "10:00").key] = "A";
    m.assignments[item(m, "ホール", "10:00").key] = "";
    m.assignments["none-0"] = "B";
    expect(setMemberStatus(m, "A", "2年目合格")).toBe(1); // none-0 は枠がない。マスター（上級生のみ）は残る
    expect(m.assignments[item(m, "マスター", "10:00").key]).toBe("A");
    expect(unfitAssignments(m).map((x) => x.key)).toEqual([item(m, "マスター", "10:00").key]);
    expect(m.assignments[item(m, "ホール", "10:00").key]).toBe("");
    expect(prunedMessage(2)).toBe("必要人数が減ってなくなった 2 枠の割当を外しました");
    expect(setMemberStore(m, "A", "本店", false)).toBe(0);
    expect(m.memberStores.A).toEqual([]);
    expect(unfitAssignments(m)).toHaveLength(2);
    expect(unfitReasons(m, "A", item(m, "マスター", "10:00"))).toEqual(["所属店舗", "ステータス"]);
    expect(pruneAssignments(m)).toBe(0);
    // 必要人数を減らしてなくなった枠の割当は外す
    const two = item(m, "ホール", "10:00", 1);
    m.assignments[two.key] = "A";
    const slot = m.slots.find((x) => two.key.startsWith(`${x.id}-`))!;
    setSlotCount(m, slot, 1);
    expect(pruneAssignments(m)).toBe(1);
    expect(two.key in m.assignments).toBe(false);
  });
  it("未合格にするとアイス ×、アイス未設定は削除。filterMembers", () => {
    const m = tinyModel();
    setMemberIce(m, "A", "○");
    expect(m.memberDrips.A.length).toBe(4);
    setMemberStatus(m, "A", "未合格");
    expect(m.memberDrips.A).toEqual(["1杯ホット", "2杯ホット"]);
    setMemberIce(m, "A", "");
    expect("A" in m.memberDrips).toBe(false);
    setMemberCar(m, "A", true);
    expect(m.memberCars.A).toBe(true);
    m.memberStores.C = [];
    expect(filterMembers(m, ["A", "B", "C"], "", "none")).toEqual(["C"]);
    expect(filterMembers(m, ["A", "B", "C"], "Ｂ", "本店")).toEqual(["B"]);
  });
  it("番目ごとの条件と見出し", () => {
    const m = tinyModel();
    setRoleRequirement(m, "本店|||ホール|||1", "2年目合格");
    expect(posTag(m, "本店", "ホール", 1)).toBe("2年↑");
    expect(posTag(m, "本店", "ホール", 0)).toBe("");
    expect(posTag(m, "本店", "ドリッパー", 0)).toBe("上級");
    expect(requirementNote(m, item(m, "ホール", "10:00", 1))).toBe("・2年目合格以上");
    expect(requirementNote(m, item(m, "マスター", "10:00"))).toBe("・上級生のみ");
    expect(requirementNote(m, item(m, "レジ", "10:00"))).toBe("");
  });
});

describe("勤務可能表", () => {
  it("塗り替えて時間帯に戻す（元の配列を返す）", () => {
    const m = tinyModel();
    const before = applyAvailability(m, D, { A: { "10:30": false, "12:00": true }, E: { "09:00": true, "09:30": true } });
    expect(before.length).toBe(3);
    expect(m.availability.filter((a) => a.name === "A")).toEqual([
      { name: "A", date: D, start: "10:00", end: "10:30" },
      { name: "A", date: D, start: "11:00", end: "12:30" },
    ]);
    expect(m.availability.at(-1)).toEqual({ name: "E", date: D, start: "09:00", end: "10:00" });
    expect(canAt(m, D, "A", "10:30")).toBe(false);
    expect(namesOn(m, D)).toEqual(["A", "B", "C", "E"]);
    expect(boardNames(m, D, ["Z", "A"])).toEqual(["A", "B", "C", "E", "Z"]);
  });
});

describe("セルのデータ", () => {
  it("dripBadge / carFreeAt", () => {
    const m = tinyModel();
    m.memberDrips = { A: ["1杯ホット", "2杯ホット", "1杯アイス", "2杯アイス"], B: ["1杯ホット", "2杯ホット", "2杯アイス"], C: ["1杯ホット"] };
    expect(dripBadge(m, "A")).toMatchObject({ all: true, text: "○" });
    expect(dripBadge(m, "B")).toMatchObject({ all: false, text: "2", cls: "ice", title: "アイス：2杯のみ" });
    expect(dripBadge(m, "C")).toMatchObject({ text: "H", cls: "hot" });
    expect(dripBadge(m, "D")).toBeNull();
    // carFreeAt：シフトに入っていない車持ち
    expect(carFreeAt(m, D)).toBeNull();
    m.memberCars = { A: true, B: true, C: false };
    m.assignments[item(m, "レジ", "10:00").key] = "A";
    const free = carFreeAt(m, D)!;
    expect(free("10:00")).toEqual(["B"]);
    expect(free("10:30")).toEqual(["A", "B"]);
  });
  it("personMatrix / personSegments / ラベル", () => {
    const m = tinyModel();
    for (const h of ["10:00", "10:30"]) m.assignments[item(m, "ドリッパー", h, 1).key] = "A";
    m.assignments[item(m, "レジ", "11:00").key] = "A";
    m.assignments[item(m, "ホール", "11:00").key] = "A";
    const pm = personMatrix(m, D, ["A", "B"]);
    expect(pm.hours).toEqual(["10:00", "10:30", "11:00", "11:30"]);
    expect(pm.cols[0].map((c) => [c.label, c.cls])).toEqual([
      ["本ドリ2nd", "on store-main"],
      ["本ドリ2nd", "on store-main"],
      ["本レジ／本ホール", "conflict"],
      ["", "free"],
    ]);
    expect(pm.span[0]).toEqual([2, 0, 1, 1]);
    expect(personSegments(m, "A", D)).toEqual([
      { start: "10:00", end: "11:00", label: "本店・ドリッパー 2nd" },
      { start: "11:00", end: "11:30", label: "本店・レジ" },
      { start: "11:00", end: "11:30", label: "本店・ホール" },
    ]);
    expect(itemLabel(item(m, "ホール", "11:00", 1))).toBe("本店・ホール 2");
    expect(personCellLabel(item(m, "美化", "11:00", 0, "美化"))).toBe("美化");
  });
  it("dayGrid：役職の各番目が列（必要人数の最大まで）", () => {
    const m = tinyModel();
    m.slots.find((s) => s.role === "レジ" && s.start === "11:00")!.count = 2;
    const g = dayGrid(m, D, "本店")!;
    // ドリッパーは 10〜12時は 5人（6th は昼だけ）なので列も 5
    expect(g.stores).toEqual([["本店", 1 + 2 + 1 + 5 + 3 + 2 + 2]]);
    expect(g.heads.map((h) => [h.role, h.cols.length])).toEqual([
      ["マスター", 1],
      ["レジ", 2],
      ["豆屋", 1],
      ["ドリッパー", 5],
      ["リベロ", 3],
      ["提供", 2],
      ["ホール", 2],
    ]);
    const reji2 = g.cols[2];
    expect(gridCell(g, reji2, "10:00").item).toBeNull();
    expect(gridCell(g, reji2, "11:00").item?.key).toMatch(/-1$/);
    expect(dayGrid(m, D, "準備")).toBeNull();
    refreshDerived(m);
  });
});
