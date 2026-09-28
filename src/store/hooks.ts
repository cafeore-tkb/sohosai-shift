// React から store を読むフック（useSyncExternalStore）

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Model } from "../domain";
import { revealDone } from "./actions";
import { store } from "./store";
import type { RevealRequest, UiState } from "./store";

/** Model（直接書き換えられる1つのオブジェクト）。commit のたびに再描画する */
export function useModel(): Model {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.model;
}

/** Model の版（commit のたびに増える）。useMemo の依存に使う */
export const useModelVersion = (): number => useSyncExternalStore(store.subscribe, store.getVersion);

/** UI の状態の一部（選んだ値が変わったときだけ再描画） */
export function useUi<T>(select: (ui: UiState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.ui));
}

/** ⌘Z／「元に戻す」で戻せる変更があるか（ステータスバーのボタン） */
export const useCanUndo = (): boolean => useSyncExternalStore(store.subscribe, () => store.lastChange !== null);

/**
 * 「表で見せて」の依頼（actions.revealSlot / revealPerson → ui.reveal）を受け取る。シフト表（grid）が1か所で使う。
 * handler は描画のあと（useLayoutEffect）に呼ばれる。枠・列を見つけてスクロールできたら true を返すと依頼を消す（revealDone）。
 * false（まだ描かれていない）なら、次の描画（Model の版が変わったとき）にもう一度呼ぶ。
 * 光らせるのは store（revealSlot が flashKeys を呼ぶ）。セルは ui.flash を見るだけ（views/shift/cellUi.ts）
 */
export function useReveal(handler: (req: RevealRequest) => boolean): void {
  const req = useUi((u) => u.reveal);
  const version = useModelVersion();
  const h = useRef(handler);
  h.current = handler;
  useLayoutEffect(() => {
    if (req && h.current(req)) revealDone(req.seq);
  }, [req, version]);
}
