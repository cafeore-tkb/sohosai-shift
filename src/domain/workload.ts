// 働ける量（アンケートの任意の列）の目安：自動割当の優先と「目安超え」の表示

import { dayName, workloadTargetHours } from "./config";
import { allNames, type Audit } from "./audit";
import { eventDates } from "./slots";
import type { Model } from "./types";

/** 目安超えの表示の文言 */
export const OVER_TARGET_LABEL = "目安超え";

/** その人の1日あたりの目安（時間）。いっぱい・未回答は null（目安なし） */
export const workloadTarget = (m: Model, name: string): number | null =>
  workloadTargetHours[m.memberWorkload?.[name] ?? ""] ?? null;

/** その日の勤務時間 hours が目安を超えているか */
export const isOverTarget = (m: Model, name: string, hours: number): boolean => {
  const t = workloadTarget(m, name);
  return t !== null && hours > t;
};

export interface OverTarget {
  name: string;
  date: string;
  /** 例：「本番1日目」 */
  day: string;
  hours: number;
  target: number;
  /** 例：「少し」 */
  level: string;
}

/** 勤務状況チェックの「目安超え」：働ける量の目安（1日あたり）を超えて割り当てられている人・日（メンバーの並び・日付順） */
export function overTargets(m: Model, audit: Audit): OverTarget[] {
  const dates = eventDates(m),
    out: OverTarget[] = [];
  for (const name of allNames(m)) {
    const target = workloadTarget(m, name);
    if (target === null) continue;
    dates.forEach((date, i) => {
      const hours = audit.hours[name]?.[date] || 0;
      if (hours > target)
        out.push({
          name,
          date,
          day: dayName(date, i),
          hours,
          target,
          level: m.memberWorkload[name],
        });
    });
  }
  return out;
}

/** 担当者ポップアップの候補：この枠（30分）を入れるとその日の目安を超えるか（すでに入っている枠なら今の時間で見る） */
export function overTargetIfPicked(m: Model, audit: Audit, name: string, date: string, alreadyHere = false): boolean {
  const hours = audit.hours[name]?.[date] || 0;
  return isOverTarget(m, name, hours + (alreadyHere ? 0 : 0.5));
}
