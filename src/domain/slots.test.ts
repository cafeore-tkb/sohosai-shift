import { describe, expect, it } from "vitest";
import { createModel, refreshDerived } from "./model";
import { autoAssign } from "./autoAssign";
import { openRoles } from "./config";
import {
  countedItems,
  defaultCount,
  ensureAllSlots,
  eventDates,
  findSlot,
  flattened,
  hoursForDate,
  partnerOf,
  resetCounts,
  setRoleCounts,
  setSlotCount,
  slotAtOffset,
  slotId,
  slotType,
} from "./slots";
import { D, item, tinyModel } from "../test/fixtures";

describe("slotId", () => {
  it("旧版と同じハッシュ", () => {
    expect(slotId("2026-10-31", "本店", "レジ", "10:00")).toBe("s9srsevq7i3");
    expect(slotId("2026-10-30", "準備", "買い出し", "09:30")).toBe("s8bmhqelj6j");
    expect(slotId("2026-11-01", "本店", "ドリッパー", "13:30")).toBe("s2lbga3tsdg");
    expect(slotId("", "", "", "")).toBe("sx0r4t9sd3z");
  });
});

describe("枠の生成", () => {
  it("hoursForDate は30分刻みで最初〜最後、eventDates は先頭3日", () => {
    const m = createModel();
    m.availability.push({ name: "A", date: D, start: "09:40", end: "11:10" }, { name: "B", date: D, start: "10:00", end: "10:30" });
    expect(hoursForDate(m, D)).toEqual(["09:30", "10:00", "10:30", "11:00"]);
    expect(hoursForDate(m, "2026-11-01")).toEqual([]);
    for (const date of ["2026-11-04", "2026-11-01", "2026-11-03", "2026-11-02"]) m.availability.push({ name: "A", date, start: "10:00", end: "11:00" });
    expect(eventDates(m)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("本番の日は 時間 × 店舗 × 役職 の順に枠を作る（必要人数は標準）", () => {
    const m = tinyModel();
    expect(m.slots.length).toBe(4 * 13);
    expect(m.slots.slice(0, 3).map((s) => [s.store, s.role, s.start, s.end, s.count])).toEqual([
      ["本店", "マスター", "10:00", "10:30", 1],
      ["本店", "レジ", "10:00", "10:30", 1],
      ["本店", "豆屋", "10:00", "10:30", 1],
    ]);
    expect(m.slots.at(-1)).toMatchObject({ store: "裏シフト", role: "裏シフト", start: "11:30", count: 0 });
    // 本番1日目の 10〜12時：ドリッパーは 5（6th は 12:00〜）、美化は 11時台だけ 2、裏シフトは 10:00〜10:30 だけ 1
    const base = 1 + 1 + 1 + 5 + 3 + 2 + 2 + 1 + 2 + 1 + 1;
    expect(flattened(m).length).toBe(4 * base + 2 * 2 + 1);
    expect(m.settings).toEqual({ slotMinutes: 30, positions: 1 });
  });

  it("本番の標準人数は時間割どおり（営業時間外は 0、ドリッパー 6th は昼だけ、美化・裏シフトは時間帯だけ）", () => {
    const D2 = "2026-11-01";
    // 店舗の営業時間：本店 1日目 19:00・2日目 16:00 まで、くれあ 2日目 16:00、2号店 2日目 17:00
    expect(defaultCount(D, "本店", "レジ", "18:30")).toBe(1);
    expect(defaultCount(D, "本店", "レジ", "19:00")).toBe(0);
    expect(defaultCount(D, "くれあ", "レジ", "19:30")).toBe(1);
    expect(defaultCount(D2, "本店", "レジ", "15:30")).toBe(1);
    expect(defaultCount(D2, "本店", "ドリッパー", "16:00")).toBe(0);
    expect(defaultCount(D2, "くれあ", "調理", "16:00")).toBe(0);
    expect(defaultCount(D2, "2号店", "調理", "16:30")).toBe(2);
    expect(defaultCount(D2, "2号店", "調理", "17:00")).toBe(0);
    expect(defaultCount(D, "本店", "レジ", "09:30")).toBe(0);
    // ドリッパー：1日目 12:00〜18:00、2日目 11:00〜16:00 だけ 6人
    expect(defaultCount(D, "本店", "ドリッパー", "11:30")).toBe(5);
    expect(defaultCount(D, "本店", "ドリッパー", "12:00")).toBe(6);
    expect(defaultCount(D, "本店", "ドリッパー", "18:00")).toBe(5);
    expect(defaultCount(D2, "本店", "ドリッパー", "11:00")).toBe(6);
    // 美化：11時台 2人、1日目 18時台・2日目 16時台 3人
    expect([10, 11, 12, 18].map((h) => defaultCount(D, "美化", "美化", `${h}:00`))).toEqual([0, 2, 0, 3]);
    expect([11, 16, 18].map((h) => defaultCount(D2, "美化", "美化", `${h}:30`))).toEqual([2, 3, 0]);
    // 裏シフト：1日目 10:00〜10:30 に 1人、16時台 2人。2日目はなし
    expect(["10:00", "10:30", "16:00", "16:30", "17:00"].map((h) => defaultCount(D, "裏シフト", "裏シフト", h))).toEqual([1, 0, 2, 2, 0]);
    expect(defaultCount(D2, "裏シフト", "裏シフト", "16:00")).toBe(0);
    // 時間割のない日（前日準備）は係の一覧のまま（標準 0 人の係もある）。知らない本番の日は本番1日目と同じ
    expect(defaultCount("2026-10-30", "準備", "買い出し", "20:00")).toBe(2);
    expect(defaultCount("2026-10-30", "準備", "店舗準備（本店）")).toBe(10);
    expect(defaultCount("2026-10-30", "準備", "昼食")).toBe(0);
    expect(defaultCount("2027-11-06", "本店", "ドリッパー", "12:00")).toBe(6);
    expect(defaultCount("2027-11-06", "本店", "ドリッパー", "10:00")).toBe(5);
  });
});

describe("必要人数", () => {
  it("標準と同じなら slotCounts から消し、違えば残す（数値に丸める）。枠を作り直しても残る", () => {
    const m = tinyModel();
    const s = m.slots.find((x) => x.role === "レジ")!;
    setSlotCount(m, s, "3.9");
    expect(s.count).toBe(3);
    expect(m.slotCounts[s.id]).toBe(3);
    setSlotCount(m, s, "-2");
    expect(m.slotCounts[s.id]).toBe(0);
    setSlotCount(m, s, 1);
    expect(s.id in m.slotCounts).toBe(false);
    setRoleCounts(m, D, "本店", "ホール", 0);
    m.slots = [];
    refreshDerived(m);
    expect(m.slots.filter((s) => s.role === "ホール").map((s) => s.count)).toEqual([0, 0, 0, 0]);
  });
  it("一括は標準が 1人以上の時間帯だけ（営業時間外・美化の時間帯の外はそのまま）。標準に戻すと時間割どおり", () => {
    const m = createModel();
    m.availability.push({ name: "A", date: "2026-11-01", start: "10:00", end: "17:00" });
    refreshDerived(m);
    const counts = (store: string, role: string) =>
      m.slots.filter((s) => s.date === "2026-11-01" && s.store === store && s.role === role).map((s) => s.count);
    // 本店は 16:00 閉店：16:00〜17:00 は標準 0（不要な時間）
    expect(counts("本店", "レジ")).toEqual([...Array(12).fill(1), 0, 0]);
    setRoleCounts(m, "2026-11-01", "本店", "レジ", 2);
    expect(counts("本店", "レジ")).toEqual([...Array(12).fill(2), 0, 0]);
    setRoleCounts(m, "2026-11-01", "美化", "美化", 1);
    expect(counts("美化", "美化")).toEqual([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    // その日ずっと標準 0 人の役職（2日目の裏シフト）は全時間帯
    setRoleCounts(m, "2026-11-01", "裏シフト", "裏シフト", 1);
    expect(counts("裏シフト", "裏シフト")).toEqual(Array(14).fill(1));
    resetCounts(m, "2026-11-01");
    expect(m.slotCounts).toEqual({});
    expect(counts("美化", "美化")).toEqual([0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3]);
  });
});

describe("前後の枠", () => {
  it("slotAtOffset / partnerOf / slotType", () => {
    const m = tinyModel();
    const x = item(m, "レジ", "10:00");
    expect(slotAtOffset(m, x, 1).map((y) => y.start)).toEqual(["10:30"]);
    expect(slotAtOffset(m, x, -1)).toEqual([]);
    m.assignments[item(m, "レジ", "10:30").key] = "A";
    expect(partnerOf(m, x, "A")?.item.start).toBe("10:30");
    expect(partnerOf(m, x, "B")).toBeNull();
    // :30 の枠の相方は前の枠
    expect(partnerOf(m, item(m, "レジ", "10:30"), "A")).toBeNull();
    // slotType：ドリッパーは番目で初期値、ほかは空
    expect(slotType(m, item(m, "ドリッパー", "10:00", 5))).toBe("1杯アイス");
    m.slotTypes[item(m, "ドリッパー", "10:00", 5).key] = "";
    expect(slotType(m, item(m, "ドリッパー", "10:00", 5))).toBe("");
    expect(slotType(m, item(m, "レジ", "10:00"))).toBe("");
  });
});

describe("移行処理", () => {
  it("1時間枠の割当を 30分の枠にも写す（空文字は上書き）", () => {
    const m = tinyModel();
    const hourly = `${slotId(D, "本店", "レジ", "10:00")}-0`,
      half = `${slotId(D, "本店", "レジ", "10:30")}-0`;
    m.settings = { positions: 1 };
    m.assignments = { [hourly]: "A", [half]: "" };
    ensureAllSlots(m);
    expect(m.assignments[half]).toBe("A");
    expect(m.settings.slotMinutes).toBe(30);
  });
  it("旧ドリッパー2役職を 1st〜6th にまとめる（上級生の枠は 1st と最後）", () => {
    const m = tinyModel();
    const sup = slotId(D, "本店", "ドリッパー上級生", "10:00"),
      mix = slotId(D, "本店", "ドリッパー（下級生＋上級生）", "10:00"),
      id = slotId(D, "本店", "ドリッパー", "10:00");
    m.settings = { slotMinutes: 30 };
    m.roleRequirements = { "本店|||ドリッパー上級生": "2年目合格" };
    m.assignments = { [`${sup}-0`]: "A", [`${sup}-1`]: "B", [`${mix}-0`]: "C" };
    m.memberStatuses.C = "未合格";
    ensureAllSlots(m);
    expect(m.assignments).toEqual({ [`${id}-0`]: "A", [`${id}-1`]: "C", [`${id}-5`]: "B" });
    expect(m.roleRequirements).toEqual({
      "本店|||ドリッパー": "1年目合格",
      "本店|||ドリッパー|||0": "2年目合格",
      "本店|||ドリッパー|||5": "2年目合格",
    });
    expect(m.memberDrips.C).toEqual(["1杯ホット", "2杯ホット"]);
  });
  it("slotBlanks の番目を詰めて必要人数を減らす", () => {
    const m = tinyModel();
    const s = m.slots.find((x) => x.role === "リベロ" && x.start === "10:00")!;
    m.assignments[`${s.id}-2`] = "A";
    m.slotBlanks = { [`${s.id}-0`]: true };
    ensureAllSlots(m);
    expect(s.count).toBe(2);
    expect(m.slotCounts[s.id]).toBe(2);
    expect(m.assignments[`${s.id}-1`]).toBe("A");
    expect(m.assignments[`${s.id}-2`]).toBeUndefined();
    expect(m.slotBlanks).toEqual({});
  });
});

describe("人数の上限がない係（前日準備の昼食・休憩・最終オペ練）", () => {
  const P = "2026-10-30";
  const prepModel = () => {
    const m = createModel();
    for (const name of ["A", "B", "C"]) m.availability.push({ name, date: P, start: "11:00", end: "13:00" });
    refreshDerived(m);
    return m;
  };
  const counts = (m: ReturnType<typeof createModel>, role: string) =>
    m.slots.filter((s) => s.date === P && s.role === role).map((s) => s.count);

  it("空きが1つ。入れるたびにその役職のすべての時間で番目が1つ増え、外すと戻る", () => {
    const m = prepModel();
    expect(counts(m, "昼食")).toEqual([1, 1, 1, 1]);
    const lunch = (start: string, occ: number) => `${findSlot(m, P, "準備", "昼食", start)!.id}-${occ}`;
    m.assignments[lunch("12:00", 0)] = "A";
    refreshDerived(m);
    expect(counts(m, "昼食")).toEqual([2, 2, 2, 2]);
    m.assignments[lunch("12:00", 1)] = "B";
    m.assignments[lunch("11:30", 2)] = "C";
    refreshDerived(m);
    expect(counts(m, "昼食")).toEqual([4, 4, 4, 4]);
    m.assignments[lunch("11:30", 2)] = "";
    refreshDerived(m);
    expect(counts(m, "昼食")).toEqual([3, 3, 3, 3]);
    expect(counts(m, "休憩")).toEqual([1, 1, 1, 1]);
    expect(counts(m, "最終オペ練")).toEqual([1, 1, 1, 1]);
  });

  it("必要人数の設定は効かず、slotCounts にも書かない", () => {
    const m = prepModel();
    const s = findSlot(m, P, "準備", "休憩", "11:00")!;
    setSlotCount(m, s, 5);
    setRoleCounts(m, P, "準備", "休憩", 3);
    refreshDerived(m);
    expect(s.count).toBe(1);
    expect(m.slotCounts).toEqual({});
  });

  it("自動割当では埋めず、未割当・充足率に数えない", () => {
    const m = prepModel();
    autoAssign(m);
    refreshDerived(m);
    expect(flattened(m).filter((x) => openRoles.includes(x.role) && m.assignments[x.key])).toEqual([]);
    expect(countedItems(m).some((x) => openRoles.includes(x.role))).toBe(false);
  });
});
