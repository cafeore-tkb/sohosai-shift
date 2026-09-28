// シフト表の中のセルを探す・見える位置へスクロールする・キーボードの移動先（roving tabindex）を決める。
// セルは [data-cell] の button（役職別の枠・不要な時間、個人別のブロック）。見た目のクラス名には頼らない。

export const CELL = "[data-cell]";

/** 押した要素。役職別の枠の td（担当者ボタンのまわりの余白）なら、その中の担当者ボタン（タッチの的を td いっぱいに） */
export function slotButtonAt(t: HTMLElement): HTMLElement {
  if (t.matches("td[data-slot-key]")) return t.querySelector<HTMLElement>("[data-pick-slot]") ?? t;
  return t;
}

/** 固定の見出し・時間の列に隠れない、表の中で見えている範囲（画面の座標） */
function visibleBox(wrap: HTMLElement, el: Element) {
  const w = wrap.getBoundingClientRect();
  const table = el.closest("table");
  // 見出しの行は th が sticky なので、thead の箱は元の位置のまま。止まっているときの下端は
  // 表の上端の余白（「一覧」なら日の見出しの高さ --rg-top）＋ 見出しの高さ
  const thead = table?.tHead;
  const rgTop = table ? parseFloat(getComputedStyle(table).getPropertyValue("--rg-top")) || 0 : 0;
  const headBottom = thead ? Math.max(thead.getBoundingClientRect().bottom, w.top + rgTop + thead.offsetHeight) : w.top;
  const rowHead = el.closest("tr")?.querySelector("th")?.getBoundingClientRect();
  const left = rowHead ? Math.max(w.left, rowHead.right) : w.left;
  let right = w.left + wrap.clientWidth;
  // 開いているドロワー（勤務状況チェック・必要人数）の下に隠れる部分は見えていないものとする
  for (const d of document.querySelectorAll<HTMLElement>("#auditDrawer, #countDrawer")) {
    if (d.closest("[hidden]") || !d.getClientRects().length) continue;
    const r = d.getBoundingClientRect();
    if (r.width && r.left > left + 120 && r.left < right) right = r.left;
  }
  return {
    top: Math.min(Math.max(w.top, headBottom), w.top + wrap.clientHeight / 2),
    left,
    bottom: w.top + wrap.clientHeight,
    right,
  };
}

/** el（セル・td・th）を表の見えている範囲に入れる。center なら真ん中へ */
export function scrollCellIntoView(wrap: HTMLElement, el: Element, { center = false, smooth = false } = {}): void {
  const v = visibleBox(wrap, el),
    r = el.getBoundingClientRect();
  let dx = 0,
    dy = 0;
  if (center) {
    dy = (r.top + r.bottom) / 2 - (v.top + v.bottom) / 2;
    dx = (r.left + r.right) / 2 - (v.left + v.right) / 2;
  } else {
    if (r.top < v.top) dy = r.top - v.top - 4;
    else if (r.bottom > v.bottom) dy = r.bottom - v.bottom + 4;
    if (r.left < v.left) dx = r.left - v.left - 4;
    else if (r.right > v.right) dx = r.right - v.right + 4;
  }
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  wrap.scrollBy({ left: dx, top: dy, behavior: smooth && !reduce ? "smooth" : "auto" });
}

/** キーボードで入れるセルを1つだけにする（ほかは tabindex=-1） */
export function setRoving(wrap: HTMLElement, el: HTMLElement): void {
  wrap.querySelectorAll<HTMLElement>(`${CELL}[tabindex="0"]`).forEach((x) => x !== el && (x.tabIndex = -1));
  el.tabIndex = 0;
}

/** 描き直したあと：Tab で表に入れるセルが1つあるようにする（前のセルがなくなったら最初のセル） */
export function ensureRoving(wrap: HTMLElement | null): void {
  if (!wrap || wrap.querySelector(`${CELL}[tabindex="0"]`)) return;
  const first = wrap.querySelector<HTMLElement>(CELL);
  if (first) first.tabIndex = 0;
}

/** セルへフォーカスを移す（見える位置へ） */
export function focusCell(wrap: HTMLElement, el: HTMLElement): void {
  setRoving(wrap, el);
  el.focus({ preventScroll: true });
  scrollCellIntoView(wrap, el);
}

export type Dir = "left" | "right" | "up" | "down";

/**
 * 矢印キーの移動先：同じ行（左右）・同じ列（上下）でいちばん近いセル。位置で探すので、
 * 結合したセル（個人別）や「一覧」の日の境目もまたげる。only があれば、その中からだけ選ぶ（移動モードの移動先）
 */
export function neighbour(wrap: HTMLElement, cur: HTMLElement, dir: Dir, only?: (el: HTMLElement) => boolean): HTMLElement | null {
  const r = cur.getBoundingClientRect(),
    cx = (r.left + r.right) / 2,
    cy = (r.top + r.bottom) / 2;
  const horizontal = dir === "left" || dir === "right";
  let best: HTMLElement | null = null,
    bestScore = Infinity,
    loose: HTMLElement | null = null,
    looseScore = Infinity;
  for (const el of wrap.querySelectorAll<HTMLElement>(CELL)) {
    if (el === cur || (only && !only(el))) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const bx = (b.left + b.right) / 2,
      by = (b.top + b.bottom) / 2;
    const d = dir === "right" ? bx - cx : dir === "left" ? cx - bx : dir === "down" ? by - cy : cy - by;
    if (d <= 1) continue;
    const aligned = horizontal ? b.top < r.bottom - 2 && b.bottom > r.top + 2 : b.left < r.right - 2 && b.right > r.left + 2;
    if (aligned && d < bestScore) {
      best = el;
      bestScore = d;
    }
    const off = horizontal ? Math.abs(by - cy) : Math.abs(bx - cx);
    const score = d + off * 3;
    if (score < looseScore) {
      loose = el;
      looseScore = score;
    }
  }
  return best ?? (only ? loose : null);
}

/** 行の最初・最後のセル（Home / End） */
export function rowEdge(cur: HTMLElement, last: boolean): HTMLElement | null {
  const cells = [...(cur.closest("tr")?.querySelectorAll<HTMLElement>(CELL) ?? [])];
  return (last ? cells[cells.length - 1] : cells[0]) ?? null;
}

/** 列の中のセル（el＝列の見出し th など と横に重なるセル）。上から順 */
export function cellsInColumn(wrap: HTMLElement, el: Element): HTMLElement[] {
  const r = el.getBoundingClientRect();
  return [...wrap.querySelectorAll<HTMLElement>(CELL)]
    .filter((c) => {
      const b = c.getBoundingClientRect();
      return b.width > 0 && b.left < r.right - 2 && b.right > r.left + 2;
    })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
}

/** なくなったセルの位置（画面の座標）にいちばん近いセル：同じ列を優先し、なければ表全体から */
export function nearestCell(wrap: HTMLElement, r: { left: number; right: number; top: number; bottom: number }): HTMLElement | null {
  const cx = (r.left + r.right) / 2,
    cy = (r.top + r.bottom) / 2;
  let best: HTMLElement | null = null,
    bestScore = Infinity;
  for (const el of wrap.querySelectorAll<HTMLElement>(CELL)) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const sameCol = b.left < r.right - 2 && b.right > r.left + 2;
    const score = (sameCol ? 0 : 1e6) + Math.abs((b.top + b.bottom) / 2 - cy) + Math.abs((b.left + b.right) / 2 - cx) * 3;
    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}
