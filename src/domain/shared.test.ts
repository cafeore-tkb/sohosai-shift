import { describe, expect, it } from "vitest";
import { gridView } from "./grid";
import { createModel, refreshDerived } from "./model";
import { applySharedChange, replaceShared, sharedMap } from "./shared";
import { defaultCount, ensureAllSlots, eventDates } from "./slots";
import { SHARED_MAPS } from "./types";
import type { SharedMap } from "./types";
import { tinyModel } from "../test/fixtures";

const emptyMaps = () => Object.fromEntries(SHARED_MAPS.map((k) => [k, {}])) as Record<SharedMap, Record<string, unknown>>;

describe("共有データ", () => {
  it("replaceShared：置き換えて枠を作り直し、データがあれば読み込み画面からシフト調整へ", () => {
    const src = tinyModel();
    const m = createModel();
    const maps = emptyMaps();
    maps.assignments = { a: "x" };
    replaceShared(m, src.availability, maps);
    expect(m.availability).toBe(src.availability);
    expect(m.assignments).toEqual({ a: "x" });
    expect(m.slots).toEqual([]);
    expect(m.view).toBe("shift");
    const empty = createModel();
    replaceShared(empty, [], emptyMaps());
    expect(empty.view).toBe("import");
  });

  it("applySharedChange：必要人数は作ってある枠の人数も合わせ、undefined は削除して標準に戻す", () => {
    const m = tinyModel();
    refreshDerived(m);
    const slot = m.slots[0];
    applySharedChange(m, "slotCounts", slot.id, 5);
    expect(m.slotCounts[slot.id]).toBe(5);
    expect(slot.count).toBe(5);
    applySharedChange(m, "slotCounts", slot.id, undefined);
    expect(slot.id in m.slotCounts).toBe(false);
    expect(slot.count).toBe(defaultCount(slot.date, slot.store, slot.role));
    applySharedChange(m, "memberStatuses", "誰か", "上級生");
    expect(sharedMap(m, "memberStatuses")["誰か"]).toBe("上級生");
  });
});

describe("枠をそろえる", () => {
  it("ensureAllSlots は2回目に何も変えない（refreshDerived で1回だけ呼ぶ根拠）", () => {
    const m = tinyModel();
    refreshDerived(m);
    const before = JSON.stringify(m);
    ensureAllSlots(m);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe("シフト表の絞り込み", () => {
  it("gridView：all なら全日、日付にない店舗なら絞り込まない", () => {
    const m = tinyModel();
    refreshDerived(m);
    const dates = eventDates(m);
    m.gridDate = "all";
    m.gridStore = "存在しない店";
    const v = gridView(m, dates);
    expect(v.viewDates).toEqual(dates);
    expect(v.storeF).toBe("");
    m.gridDate = dates[0];
    const day = gridView(m, dates);
    expect(day.viewDates).toEqual([dates[0]]);
    m.gridStore = day.stores[0];
    expect(gridView(m, dates).storeF).toBe(day.stores[0]);
  });
});
