// シフト表のキーボード操作（spec §7）。表は roving tabindex（Tab で入るセルは1つ）。
//   矢印：隣のセルへ／Home・End：行の端へ／Enter・Space：担当者を選ぶ（ボタンのクリックと同じ）
//   Delete・Backspace：その枠から外す（「外す」と同じトースト・元に戻す。個人別のブロックでも）
//   Shift＋↑↓：同じ列の範囲を選ぶ（Shift＋クリックと同じ。役職別だけ）
//   M：移動モード（「移動…」と同じ。役職別だけ。選んでいる範囲の中なら範囲ごと）。移動中の矢印は移動先（移動元以外のすべての枠）を
//   渡り、フォーカスした移動先に足あと（footprint.ts）を出す。Enter で移動、Esc で取り消し
// マウス・タッチの動きは変えない。⌘／Ctrl／Alt 付き・変換中は何もしない（⌘Z は store/keys.ts）。

import { useCallback } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { flattened, sameColumn } from "../../../domain";
import { actions, store } from "../../../store";
import { CELL, focusCell, nearestCell, neighbour, rowEdge } from "./gridDom";
import type { Dir } from "./gridDom";

const ARROWS: Readonly<Record<string, Dir>> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/** 移動モードで渡れるセル（移動先と移動元） */
const moveStop = (el: HTMLElement) => !!el.closest("[data-drop-ok],[data-drag-source]");

export function useGridKeys(wrapRef: RefObject<HTMLElement | null>): (e: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const wrap = wrapRef.current;
      if (!wrap || e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
      const cur = (e.target as HTMLElement).closest<HTMLElement>(CELL);
      if (!cur || !wrap.contains(cur)) return;
      const u = store.ui;
      const dir = ARROWS[e.key];
      const slot = cur.dataset.pickSlot;
      if (e.shiftKey && slot && !u.movingKey && (dir === "up" || dir === "down")) {
        e.preventDefault();
        const items = new Map(flattened(store.model).map((x) => [x.key, x]));
        const here = items.get(slot);
        const same = (el: HTMLElement) => {
          const x = el.dataset.pickSlot ? items.get(el.dataset.pickSlot) : undefined;
          return !!x && !!here && sameColumn(x, here);
        };
        const next = neighbour(wrap, cur, dir, same);
        if (!next?.dataset.pickSlot) return;
        actions.extendSelection(slot, next.dataset.pickSlot);
        focusCell(wrap, next);
        return;
      }
      if (dir) {
        e.preventDefault();
        const next = neighbour(wrap, cur, dir, u.movingKey ? moveStop : undefined);
        if (next) focusCell(wrap, next);
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        const next = rowEdge(cur, e.key === "End");
        if (next) {
          e.preventDefault();
          focusCell(wrap, next);
        }
        return;
      }
      // 以下は担当者のいる枠だけ。個人別のブロック（td[data-pm-key]）は、押すと開く担当者ポップアップと同じ枠
      const person = cur.closest<HTMLElement>("[data-pm-key]")?.dataset.pmKey;
      const key = cur.dataset.pickSlot ?? person;
      if (!key || u.movingKey || !store.model.assignments[key]) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // 担当者ポップアップの「外す」と同じ操作（同じトースト・元に戻す）
        const rect = cur.getBoundingClientRect();
        actions.openPicker(key);
        actions.clearPicked();
        // 個人別のブロックは外すとなくなる：フォーカスを見失わないよう、同じ列のいちばん近いセルへ移す
        if (person) keepFocusNear(wrap, cur, rect);
      } else if ((e.key === "m" || e.key === "M") && !person) {
        // 移動先（緑の枠）は役職別の表にしかないので、M は役職別だけ
        e.preventDefault();
        // 担当者ポップアップの「移動…」と同じ操作（移動中のトースト・Esc で取り消し）
        actions.openPicker(key);
        actions.startMove();
      }
    },
    [wrapRef],
  );
}

/** 描き直しのあと、cur がなくなっていたら（個人別で外したブロック）元の位置に近いセルへフォーカスを移す */
function keepFocusNear(wrap: HTMLElement, cur: HTMLElement, rect: DOMRect): void {
  requestAnimationFrame(() => {
    if (cur.isConnected && document.activeElement === cur) return;
    const a = document.activeElement;
    if (a && a !== document.body && !wrap.contains(a)) return;
    const next = nearestCell(wrap, rect);
    if (next) focusCell(wrap, next);
  });
}
