// 必要人数を減らすなどして枠がなくなったときに、その枠の割当を外す
//
// 条件（役職ルール・所属・ステータス・車）が変わって合わなくなった割当は外さない：
// 手で置いた割当が知らないうちに消えないよう、そのまま「条件外」として表示する（勤務状況チェックにも出る）。

import { flattened } from "./slots";
import type { Model } from "./types";

/** 枠がなくなった割当を削除し、外した数を返す（"" の割当はそのまま。条件に合わない割当は残す） */
export function pruneAssignments(m: Model): number {
  const keys = new Set(flattened(m).map((x) => x.key));
  let removed = 0;
  for (const [key, name] of Object.entries(m.assignments)) {
    if (!name || keys.has(key)) continue;
    delete m.assignments[key];
    removed++;
  }
  return removed;
}

/** pruneAssignments で外したときのメッセージ（外した数が 0 なら出さない） */
export const prunedMessage = (removed: number): string => `必要人数が減ってなくなった ${removed} 枠の割当を外しました`;
