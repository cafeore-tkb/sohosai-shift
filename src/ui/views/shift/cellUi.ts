// 1つの枠の「いまの見た目の状態」（担当者ポップアップで選択中・範囲の選択・移動元・移動先・光っている）を store から読む。
// 枠ごとに購読するので、ポップアップの開閉や移動の開始で変わった枠だけが描き直される（表全体は描き直さない）。

import { useLayoutEffect, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { movingRange, store } from "../../../store";
import { dropFitFor } from "../../useDerived";

export interface CellUi {
  picking: boolean;
  /** 選んでいる範囲（Shift＋クリック）に入っている */
  selected: boolean;
  /** 移動中に動かす枠（つかんだ枠・範囲） */
  source: boolean;
  /** 移動先にできる（移動中、移動元以外のすべての枠） */
  dropOk: boolean;
  /** 移動先のうち条件に合う枠（緑） */
  dropFit: boolean;
  /** 光らせている回の番号（0＝光っていない） */
  flash: number;
}

const snapshot = (key: string): string => {
  const u = store.ui;
  const p = u.picker?.key === key ? "p" : "-";
  let mv = "-";
  if (u.movingKey) {
    const range = movingRange(u);
    // s＝つかんだ枠、r＝一緒に動く範囲の枠（移動元だが、同じ列でずらす移動先にもなる）
    mv = key === u.movingKey ? "s" : range.includes(key) ? "r" : dropFitFor(u.movingKey, range).has(key) ? "f" : "o";
  }
  const sel = u.selection.includes(key) ? "x" : "-";
  const f = u.flash && u.flash.keys.has(key) ? u.flash.seq : 0;
  return `${p}${mv}${sel}${f}`;
};

/** 枠 key の見た目の状態（key が "" なら何もない状態） */
export function useCellUi(key: string): CellUi {
  const s = useSyncExternalStore(store.subscribe, () => (key ? snapshot(key) : "---0"));
  return {
    picking: s[0] === "p",
    source: s[1] === "s" || s[1] === "r",
    dropOk: s[1] === "f" || s[1] === "o" || s[1] === "r",
    dropFit: s[1] === "f",
    selected: s[2] === "x",
    flash: Number(s.slice(3)),
  };
}

/**
 * 光らせる（animation: var(--anim-flash)）。同じ枠を続けて光らせたときは、要素を作り直さずに
 * アニメーションだけやり直す（キーボードのフォーカスを失わないように）
 */
export function useRestartFlash(ref: RefObject<HTMLElement | null>, flash: number): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !flash || typeof el.getAnimations !== "function") return;
    for (const a of el.getAnimations()) {
      if ((a as CSSAnimation).animationName !== "sm-flash") continue;
      a.cancel();
      a.play();
    }
  }, [flash, ref]);
}
