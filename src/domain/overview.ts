// カレンダー配信の表（/shift/all＝全体、/shift/{名前}＝その人）：シフト調整の「個人別」と同じ形（行：30分の時間、列：メンバー、担当は縦につないだ枠）。
// 配信のときに作って pubs/shift に JSON で置く（閲覧ページは Model を持たないので、表の形のまま渡す）

import { assignmentAudit } from "./audit";
import { namesOn } from "./availability";
import { personMatrix } from "./cells";
import { dayName, storeClass } from "./config";
import { eventDates } from "./slots";
import type { Model } from "./types";

/**
 * 1人・1日の縦の並び（上から順に、行をすべて覆う）：[行数, 種類, 表示, 店舗]
 * 種類：o＝担当（店舗の色）・b＝昼食・休憩・c＝重なり（表示は「／」区切り）・f＝空き（参加できる）・n＝参加できない
 */
export type OverviewSeg = [rows: number, kind: "o" | "b" | "c" | "f" | "n", label: string, store: string];

export interface OverviewDay {
  date: string;
  /** 前日準備・本番1日目… */
  name: string;
  hours: string[];
  /** その日の参加者（メンバーの並び順）と勤務時間（h。昼食・休憩は含まない） */
  people: { name: string; hours: number }[];
  /** cols[参加者] */
  cols: OverviewSeg[][];
}

const STORE_OF_CLASS: Record<string, string> = Object.fromEntries(
  ["本店", "2号店", "くれあ", "準備", "美化"].map((s) => [storeClass(s), s]),
);

export function shiftOverview(m: Model): OverviewDay[] {
  const audit = assignmentAudit(m);
  return eventDates(m).map((date, index) => {
    const names = namesOn(m, date),
      { hours, cols, span } = personMatrix(m, date, names);
    return {
      date,
      name: dayName(date, index),
      hours,
      people: names.map((name) => ({ name, hours: audit.hours[name]?.[date] || 0 })),
      cols: cols.map((col, i) => {
        const segs: OverviewSeg[] = [];
        col.forEach((c, r) => {
          const n = span[i][r];
          if (!n) return;
          const [cls, sc] = c.cls.split(" ");
          // 閲覧用なので、勤務可能時間の外（off）はふつうの担当として出す（店舗は分からないので色なし）
          const kind: OverviewSeg[1] = !c.label ? (cls === "na" ? "n" : "f") : cls === "conflict" ? "c" : cls === "brk" ? "b" : "o";
          const last = segs[segs.length - 1];
          // 空き・参加できない時間は1行ずつなので、続いていればまとめる
          if (!c.label && last && last[1] === kind) last[0] += n;
          else segs.push([n, kind, c.label, kind === "o" ? STORE_OF_CLASS[sc] || "" : ""]);
        });
        return segs;
      }),
    };
  });
}

/** 縦の並び → 行ごと（同じ枠の行は同じ配列） */
export const expandSegs = (segs: readonly OverviewSeg[]): OverviewSeg[] => segs.flatMap((s) => Array.from({ length: s[0] }, () => s));
