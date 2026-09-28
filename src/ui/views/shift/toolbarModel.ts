// シフト調整のツールバーに出す数（日付の充足率・店舗ごとの未割当・スマホの上の帯）。DOM・React に触らない。
// 数え方は旧版と同じ：充足率は fillOf（decided）、未割当は担当者のいない枠。

import { countedItems, dayLabel, dayName, fillOf, gridView } from "../../../domain";
import type { Audit, Item, Model } from "../../../domain";

export interface DayOption {
  /** data-grid-date（YYYY-MM-DD か "all"） */
  value: string;
  /** 本番1日目 / 3日分を一覧 */
  label: string;
  /** スマホの短い名前（準備・1日目・一覧） */
  short: string;
  /** 10/31（一覧は ""） */
  sub: string;
  title: string;
  /** 充足率（%）。枠がなければ null */
  rate: number | null;
}

const rateOf = (m: Model, list: readonly Item[]): number | null => {
  const f = fillOf(m, list);
  return f.total ? Math.round((f.filled / f.total) * 100) : null;
};

/** 10/31（ゼロなし・曜日なし） */
export const monthDay = (d: string): string => {
  const [, mo, da] = d.split("-").map(Number);
  return `${mo}/${da}`;
};

/** 「本番1日目」→「1日目」、「前日準備」→「準備」 */
export const shortDayName = (name: string): string => name.replace(/^本番/, "").replace(/^前日/, "");

export function dayOptions(m: Model, dates: readonly string[]): DayOption[] {
  if (!dates.length) return [];
  const items = countedItems(m);
  const days = dates.map((date, i): DayOption => {
    const label = dayName(date, i);
    return {
      value: date,
      label,
      short: shortDayName(label),
      sub: monthDay(date),
      title: `${label} ${dayLabel(date)}`,
      rate: rateOf(m, items.filter((x) => x.date === date)),
    };
  });
  if (dates.length > 1)
    days.push({
      value: "all",
      label: `${dates.length}日分を一覧`,
      short: "一覧",
      sub: "",
      title: `${dates.length}日分を縦に並べて表示`,
      rate: rateOf(m, items.filter((x) => dates.includes(x.date))),
    });
  return days;
}

export interface StoreOption {
  /** data-grid-store（"" = すべて） */
  value: string;
  label: string;
  open: number;
}

/** 店舗の絞り込み（店舗が1つだけの日は出さない＝空）。current は実際に効いている絞り込み */
export function storeOptions(m: Model, dates: readonly string[]): { options: StoreOption[]; current: string } {
  if (!dates.length) return { options: [], current: "" };
  const { viewDates, stores, storeF } = gridView(m, dates);
  if (stores.length < 2) return { options: [], current: storeF };
  const inView = countedItems(m).filter((x) => viewDates.includes(x.date));
  const open = (list: Item[]) => list.filter((x) => !m.assignments[x.key]).length;
  return {
    options: [
      { value: "", label: "すべての店舗", open: open(inView) },
      ...stores.map((st) => ({ value: st, label: st, open: open(inView.filter((x) => x.store === st)) })),
    ],
    current: storeF,
  };
}

/** スマホの上の帯：表示中の日（一覧なら全日）の未割当・重複・充足率 */
export function viewSummary(m: Model, dates: readonly string[], audit: Audit): { open: number; conflicts: number; rate: number; all: boolean } {
  if (!dates.length) return { open: 0, conflicts: 0, rate: 0, all: false };
  const { viewDates } = gridView(m, dates);
  const inView = countedItems(m).filter((x) => viewDates.includes(x.date));
  return {
    open: inView.filter((x) => !m.assignments[x.key]).length,
    conflicts: inView.filter((x) => audit.conflicts.has(x.key)).length,
    rate: rateOf(m, inView) ?? 0,
    all: m.gridDate === "all",
  };
}

/** 「勤務状況チェック」の件数（重複・時間外・条件外・希望外） */
export function auditBadge(conflicts: number, offs: number, unfits: number, missing: number): { text: string; total: number; title: string } {
  const text = [conflicts ? `重複 ${conflicts}` : "", offs ? `時間外 ${offs}` : "", unfits ? `条件外 ${unfits}` : "", missing ? `希望外 ${missing}` : ""]
    .filter(Boolean)
    .join("・");
  const title = [
    conflicts ? `重複 ${conflicts}枠` : "",
    offs ? `勤務できない時間 ${offs}枠` : "",
    unfits ? `条件外 ${unfits}枠` : "",
    missing ? `やりたい役職に入っていない ${missing}名` : "",
  ]
    .filter(Boolean)
    .join("・");
  return { text, total: conflicts + offs + unfits + missing, title };
}
