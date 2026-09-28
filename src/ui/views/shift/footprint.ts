// 移動先の足あと：移動中（ドラッグ・「移動…」・キーボードの M）に、ポインタ（またはフォーカス）がある移動先へ落としたら
// 動かす範囲が入る枠をすべて強調する。つかんだ枠が入る枠に is-drop-hover、ほかの枠に is-drop-foot、
// 入れ替えで人が移動元へ戻る枠に is-drop-swap、条件に合わない（緑でない）移動先なら is-drop-warn、
// 範囲がその列に入りきらない（不要な時間・表の外にかかる。落としても動かない）なら全部に is-drop-bad。
// どの枠に入るか・入れ替えになるか・入りきるかは domain の planMove。ここはポインタに合わせた一時的な表示だけ DOM を直接触る
// （useDragMove のゴーストと同じ扱い。移動元・移動先・緑の枠は状態から描く）。

import { planMove } from "../../../domain";
import { movingRange, store } from "../../../store";
import { dropFitFor } from "../../useDerived";

export const FOOT = {
  hover: "is-drop-hover",
  foot: "is-drop-foot",
  swap: "is-drop-swap",
  warn: "is-drop-warn",
  bad: "is-drop-bad",
} as const;
const ALL = Object.values(FOOT);
const SELECTOR = ALL.map((c) => `.${c}`).join(",");

/** 足あとを消す */
export function clearFootprint(wrap: HTMLElement | null): void {
  wrap?.querySelectorAll(SELECTOR).forEach((el) => el.classList.remove(...ALL));
}

/**
 * 移動先の td（[data-slot-key]）に落としたときの足あとを出す（前の足あとは消す）。td が null・移動中でなければ消すだけ。
 * 枠のない時間（不要な時間・表の外）は、その行（tr[data-hour]）の同じ列の td を探す
 */
export function showFootprint(wrap: HTMLElement, td: HTMLElement | null): void {
  clearFootprint(wrap);
  const u = store.ui,
    from = u.movingKey,
    to = td?.dataset.slotKey;
  if (!td || !from || !to) return;
  const range = movingRange(u);
  const plan = planMove(store.model, from, to, range);
  if (!plan) return;
  const table = td.closest("table"),
    col = (td as HTMLTableCellElement).cellIndex;
  if (!table) return;
  const warn = plan.ok && !dropFitFor(from, range).has(to);
  for (const c of plan.cells) {
    let el: Element | null = null;
    if (c.target) el = table.querySelector(`td[data-slot-key="${CSS.escape(c.target.key)}"]`);
    else if (c.start) el = table.querySelector<HTMLTableRowElement>(`tr[data-hour="${c.start}"]`)?.cells[col] ?? null;
    if (!el) continue;
    el.classList.add(c.source.key === plan.grab.key ? FOOT.hover : FOOT.foot);
    if (!plan.ok) el.classList.add(FOOT.bad);
    else {
      if (warn) el.classList.add(FOOT.warn);
      if (c.swapOut) el.classList.add(FOOT.swap);
    }
  }
}
