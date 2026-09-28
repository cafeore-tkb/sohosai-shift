// 勤務可能時間（勤務可能表）

import { SLOT, hmToMin, plusSlot, toHM } from "./time";
import type { Availability, Model } from "./types";

import { orderedNames } from "./order";

/** その日の参加者（最初に出てきた順） */
export const peopleOn = (m: Model, date: string): string[] => [
  ...new Set(m.availability.filter((a) => a.date === date).map((a) => a.name)),
];

/** その日の参加者（メンバーの並び順。保存していなければ五十音順） */
export const namesOn = (m: Model, date: string): string[] => orderedNames(m, peopleOn(m, date));

/** 勤務可能表の行：その日の参加者＋手で追加したメンバー（メンバーの並び順） */
export const boardNames = (m: Model, date: string, extra: readonly string[] = []): string[] =>
  orderedNames(m, [...peopleOn(m, date), ...extra]);

/** 「この日にメンバーを追加」の候補：表にまだいない参加者（メンバーの並び順） */
export const addableNames = (m: Model, shown: readonly string[]): string[] =>
  orderedNames(m, m.availability.map((a) => a.name)).filter((n) => !shown.includes(n));

/** その日の h から30分間、参加できるか */
export const canAt = (m: Model, date: string, name: string, h: string): boolean =>
  m.availability.some((a) => a.date === date && a.name === name && a.start <= h && a.end >= plusSlot(h));

/** 塗り替えの内容：氏名 → 開始時刻 → ○（true）／—（false） */
export type AvailabilityChanges = Record<string, Record<string, boolean>>;

// 勤務可能時間を塗り替える：{name:{h:true/false}} を反映し、30分ごとの○をつなげて時間帯に戻す
// 変更前の availability（元に戻す用のコピー）を返す
export function applyAvailability(m: Model, date: string, changes: AvailabilityChanges): Availability[] {
  const before = m.availability.map((a) => ({ ...a }));
  const next = m.availability.filter((a) => !(a.date === date && changes[a.name]));
  for (const [name, cells] of Object.entries(changes)) {
    const on = new Set<number>();
    for (const a of m.availability)
      if (a.date === date && a.name === name)
        for (let t = Math.floor(hmToMin(a.start) / SLOT) * SLOT; t + SLOT <= hmToMin(a.end); t += SLOT) on.add(t);
    for (const [h, v] of Object.entries(cells)) {
      if (v) on.add(hmToMin(h));
      else on.delete(hmToMin(h));
    }
    let run: { start: number; end: number } | null = null;
    for (const t of [...on].sort((a, b) => a - b)) {
      if (run && t === run.end) run.end += SLOT;
      else {
        if (run) next.push({ name, date, start: toHM(run.start), end: toHM(run.end) });
        run = { start: t, end: t + SLOT };
      }
    }
    if (run) next.push({ name, date, start: toHM(run.start), end: toHM(run.end) });
  }
  m.availability = next;
  return before;
}

export const AVAILABILITY_CHANGED = "勤務可能時間を変更しました";
export const UNDO_BLOCKED = "その後に変更があったため元に戻せません";
export const UNDONE = "元に戻しました";
/** 勤務可能表にメンバーを追加したときの案内 */
export const addedMemberMessage = (name: string): string =>
  `${name} を追加しました。参加できる時間のセルを ○ にしてください`;
