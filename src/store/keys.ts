// キーボードの操作（App が document の keydown をここへ渡す）。
// ⌘Z／Ctrl+Z と Esc は旧版と同じ条件。それ以外のショートカット（1–5・F・?・/）は文字入力中・修飾キー付き・ダイアログ中・⋯ メニューが開いている間は効かない。

import { dataViews } from "../domain";
import type { View } from "../domain";
import * as actions from "./actions";
import { focusPageSearch } from "./browser";
import { store } from "./store";

/** 文字を打たない input（ショートカットを止めない）。checkbox のスイッチにフォーカスがあっても F・1–5 は効く */
const NON_TEXT_INPUT = /^(checkbox|radio|range|button|submit|reset|file|color|image)$/;

/** 文字を入力している要素か（文字の input・select・textarea・contenteditable） */
export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT") return !NON_TEXT_INPUT.test((el as HTMLInputElement).type);
  return /^(SELECT|TEXTAREA)$/.test(el.tagName) || (el as HTMLElement).isContentEditable === true;
}

/** タブの順（1–5 キー） */
export const TAB_ORDER: readonly View[] = ["import", "availability", "members", "rules", "shift"];

/** そのタブを開けるか（データがないときは 読み込み・役職ルール だけ） */
export const canShowView = (view: View): boolean => store.model.availability.length > 0 || !dataViews.includes(view);

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  /** 変換中の keydown は 229（Safari は isComposing が false のことがある） */
  keyCode?: number;
  preventDefault(): void;
}

/** document の keydown。処理したら true（preventDefault 済み） */
export function handleKeyDown(e: KeyLike, active: Element | null = document.activeElement): boolean {
  // ⌘Z／Ctrl+Z：旧版と同じ（input・textarea の中では効かない。戻せる変更があるときだけ）
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && store.lastChange && !/^(INPUT|TEXTAREA)$/.test(active?.tagName ?? "")) {
    e.preventDefault();
    actions.undoShortcut();
    return true;
  }
  if (e.key === "Escape") {
    // 変換中の Esc は変換の取り消しだけ（担当者ポップアップなどは閉じない）
    if (e.isComposing || e.keyCode === 229) return false;
    // 共同編集のダイアログ（ネイティブの <dialog>）は自分で閉じる。下のドロワーなどは閉じない（1回の Esc で1つ）
    if (store.ui.share.dialogOpen) return false;
    actions.escape();
    return false;
  }
  // ここからは新しいショートカット：入力中・修飾キー・変換中・ダイアログ／ポップアップ／移動中は何もしない
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.key === "Process") return false;
  if (isTypingTarget(active)) return false;
  // ドロワー・ヘルプなどの中にフォーカスがあるときも効かない（後ろのページだけが変わってしまう）。? はヘルプの開け閉め
  if (e.key !== "?" && active?.closest?.("[data-overlay],[role=dialog],dialog")) return false;
  const u = store.ui;
  if (u.share.dialogOpen || u.picker || u.movingKey || u.moveMode || u.painting || (u.menu && e.key !== "?")) return false;

  const m = store.model;
  if (/^[1-5]$/.test(e.key)) {
    if (e.shiftKey || u.shiftFocus) return false;
    const view = TAB_ORDER[Number(e.key) - 1];
    if (!canShowView(view) || m.view === view) return false;
    e.preventDefault();
    actions.showView(view);
    return true;
  }
  if (e.key === "f" || e.key === "F") {
    if (m.view !== "shift" || !m.availability.length) return false;
    e.preventDefault();
    actions.toggleFullscreen();
    return true;
  }
  if (e.key === "?") {
    e.preventDefault();
    actions.toggleHelp();
    return true;
  }
  if (e.key === "/" && !e.shiftKey) {
    if (!focusPageSearch()) return false;
    e.preventDefault();
    return true;
  }
  return false;
}
