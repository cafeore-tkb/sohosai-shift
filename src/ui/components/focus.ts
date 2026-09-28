// フォーカスの扱い（ドロワー・ポップアップ・メニューで共通）

/** Tab で止まる要素（tabindex="-1" は除く：候補の一覧の option など、矢印キーで動かすもの） */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
]
  .map((x) => `${x}:not([tabindex="-1"])`)
  .join(", ");

/** el の中でフォーカスできる要素（見えているものだけ） */
export function focusables(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0 && !x.closest("[hidden]"));
}

/** Tab／Shift+Tab を el の中で回す（キーダウンのハンドラから呼ぶ）。回したら true */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, el: HTMLElement): boolean {
  if (e.key !== "Tab") return false;
  const list = focusables(el);
  if (!list.length) return false;
  const first = list[0],
    last = list[list.length - 1],
    active = document.activeElement;
  // 一覧にない要素（スクロールできる候補の一覧など、ブラウザが Tab で止まる入れ物）にいるとき：DOM の位置で端を判断
  if (active && el.contains(active) && !list.includes(active as HTMLElement)) {
    const after = list.filter((x) => active.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING).length;
    const edge = e.shiftKey ? after === list.length : after === 0;
    if (!edge) return false;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return true;
  }
  if (e.shiftKey && (active === first || !el.contains(active))) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (active === last || !el.contains(active))) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** 開いたときにフォーカスを移し、閉じたときに戻すための記録 */
export function rememberFocus(): () => void {
  const prev = document.activeElement as HTMLElement | null;
  return () => {
    if (prev && prev.isConnected && prev !== document.body && prev.getClientRects().length > 0) prev.focus({ preventScroll: true });
  };
}
