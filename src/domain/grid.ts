// 役職別のシフト表（行：時間、列：役職の各番目＝1セル1人）の列の組み立て

import { groupOrder, roleBase, rolesForDate, storeNames } from "./config";
import { namesOn } from "./availability";
import { hoursForDate } from "./slots";
import type { Item, Model, Slot } from "./types";

export interface GridColumn {
  store: string;
  role: string;
  /** 標準の必要人数 */
  count: number;
  base: string;
  occ: number;
  /** 同じ店舗・役職のまとまりでの通し番号（1〜） */
  num: number;
  /** 役職のまとまりの最初の列（左に太線） */
  gstart: boolean;
}

export interface GridHead {
  store: string;
  base: string;
  role: string;
  count: number;
  cols: GridColumn[];
}

export interface DayGrid {
  hours: string[];
  /** 店舗ごとの列数（見出しの1行目） */
  stores: [store: string, cols: number][];
  /** 役職のまとまり（見出しの2行目。cols が2つ以上なら3行目に番目） */
  heads: GridHead[];
  cols: GridColumn[];
  /** `${store}|${role}|${start}` → 枠 */
  slotAt: Map<string, Slot>;
}

/** 1日分の表の列（storeF で店舗を絞り込み。該当なしなら null） */
export function dayGrid(m: Model, date: string, storeF: string): DayGrid | null {
  const hours = hoursForDate(m, date);
  const groups = Object.entries(rolesForDate(date)).filter(([store]) => !storeF || store === storeF);
  if (!groups.length) return null;
  const slotAt = new Map(m.slots.filter((s) => s.date === date).map((s) => [`${s.store}|${s.role}|${s.start}`, s]));
  const cols: GridColumn[] = [];
  for (const [store, roles] of groups)
    for (const [role, count] of roles) {
      const max = Math.max(1, ...hours.map((h) => Number(slotAt.get(`${store}|${role}|${h}`)?.count) || 0)),
        base = roleBase(role),
        prev = cols[cols.length - 1],
        same = prev && prev.store === store && prev.base === base;
      for (let i = 0; i < max; i++) {
        const p = cols[cols.length - 1];
        cols.push({ store, role, count, base, occ: i, num: i || same ? p.num + 1 : 1, gstart: i === 0 && !same });
      }
    }
  const heads: GridHead[] = [];
  for (const c of cols) {
    const g = heads[heads.length - 1];
    if (g && g.store === c.store && g.base === c.base) g.cols.push(c);
    else heads.push({ store: c.store, base: c.base, role: c.role, count: c.count, cols: [c] });
  }
  const stores = groups.map(([store]): [string, number] => [store, cols.filter((c) => c.store === store).length]);
  return { hours, stores, heads, cols, slotAt };
}

/** 表のセル：その時間・番目の Item（不要な時間なら null。slot は必要人数を開くため） */
export function gridCell(grid: DayGrid, c: GridColumn, hour: string): { slot: Slot | undefined; item: Item | null } {
  const slot = grid.slotAt.get(`${c.store}|${c.role}|${hour}`);
  if (!slot || c.occ >= (Number(slot.count) || 0)) return { slot, item: null };
  return { slot, item: { ...slot, occ: c.occ, key: `${slot.id}-${c.occ}` } };
}

/** 表示する日付の店舗（準備・本店・2号店・くれあ・美化の順） */
export const gridStores = (viewDates: readonly string[]): string[] =>
  [...new Set(viewDates.flatMap((d) => Object.keys(rolesForDate(d))))].sort(
    (a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b),
  );

/** シフト表で表示する日付・店舗の絞り込み（gridDate が "all" なら全日。gridStore がその日付にない店舗なら絞り込まない） */
export function gridView(m: Model, dates: readonly string[]): { viewDates: string[]; stores: string[]; storeF: string } {
  const viewDates = m.gridDate === "all" ? [...dates] : [m.gridDate],
    stores = gridStores(viewDates);
  return { viewDates, stores, storeF: stores.includes(m.gridStore) ? m.gridStore : "" };
}

/** 個人別の表の列：その日の参加者（店舗で絞り込んだときは、その店舗に所属するメンバーだけ） */
export const personNamesFor = (m: Model, date: string, storeF: string): string[] =>
  namesOn(m, date).filter((n) => !storeNames.includes(storeF) || (m.memberStores[n] || []).includes(storeF));
