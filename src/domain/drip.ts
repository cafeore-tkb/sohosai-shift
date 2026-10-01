// ドリップの時間（本店のドリッパー）：入れる人は全日程で1時間以上（自動割当・勤務状況チェック）

import { available, type SlotLike } from "./rules";
import { flattened } from "./slots";
import type { Model } from "./types";

/** 本店のドリッパーの枠か */
export const isDripSlot = (x: SlotLike): boolean => x.store === "本店" && x.role === "ドリッパー";

/** ドリッパーに入れる人は、全日程でこの枠の数（1時間）は入れる */
export const DRIP_MIN = 2;

/** 氏名 → ドリッパーに入れる時間（"日付 開始" の一覧。勤務可能時間と条件〈所属・ステータス〉を満たす） */
export function dripReach(m: Model): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const x of flattened(m).filter(isDripSlot))
    for (const a of available(m, x)) (out[a.name] ??= new Set()).add(`${x.date} ${x.start}`);
  return Object.fromEntries(Object.entries(out).map(([n, s]) => [n, [...s].sort()]));
}

/** ドリッパーに入れる時間が1時間以上ある人（＝1時間以上入れる人） */
export const canDrip = (reach: Record<string, string[]>, name: string): boolean => (reach[name]?.length || 0) >= DRIP_MIN;

export interface DripRow {
  /** ドリッパーに入っている時間（h・全日程） */
  hours: number;
  /** 1時間以上ドリッパーに入れる人か */
  can: boolean;
  /** 入れるのに1時間未満 */
  short: boolean;
}

/** 氏名 → ドリップの時間（参加者全員） */
export function dripRows(m: Model, names: readonly string[]): Record<string, DripRow> {
  const reach = dripReach(m),
    times: Record<string, Set<string>> = {};
  for (const x of flattened(m).filter(isDripSlot)) {
    const n = m.assignments[x.key];
    if (n) (times[n] ??= new Set()).add(`${x.date} ${x.start}`);
  }
  return Object.fromEntries(
    names.map((n) => {
      const used = times[n]?.size || 0,
        can = canDrip(reach, n);
      return [n, { hours: used / 2, can, short: can && used < DRIP_MIN }];
    }),
  );
}
