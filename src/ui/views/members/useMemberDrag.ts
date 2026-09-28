// メンバー表の並べ替え：行の左のつまみ（data-member-handle）をドラッグして1人ずつ動かす。
// ・マウス：押して 4px 動いたらドラッグ開始。指・ペン：長押し（350ms）してから（つまみは touch-action: none）
// ・ドラッグ中は動かしている行に data-member-dragging、入る位置に線（行の data-member-drop="before|after"）を DOM に直接付ける
// ・離したら actions.moveMemberTo（見えている行の順で入る位置を渡す。検索・絞り込み中は見えている隣の人が基準）
// ・Esc・pointercancel は取り消し（反映しない）。表の枠（またはページ）の上下の端では自動でスクロールする
// ・キーボード：つまみで Alt+↑／↓ で1つ上／下へ（動かしたあともつまみにフォーカスを残す）

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { actions } from "../../../store";

const ROW = "tr[data-member-row]";
const LONG_PRESS = 350,
  SLOP = 8,
  MOUSE_SLOP = 4,
  EDGE = 48,
  MAX_SPEED = 18;

interface Drag {
  name: string;
  pointerId: number;
  handle: HTMLElement;
  touch: boolean;
  startX: number;
  startY: number;
  lastY: number;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** 入る位置（動かす人を除いた見えている行の中。-1＝まだない） */
  to: number;
  raf?: number;
}

const cssEscape = (s: string) => CSS.escape(s);

/** 縦にスクロールしている入れ物（表の枠。スマホはページ） */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

export function useMemberDrag(tbodyRef: RefObject<HTMLTableSectionElement | null>, visible: readonly string[]) {
  const drag = useRef<Drag | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  /** キーボードで動かしたあと、つまみへフォーカスを戻す */
  const refocus = useRef<string | null>(null);

  const rows = () => [...(tbodyRef.current?.querySelectorAll<HTMLElement>(ROW) || [])];

  const clearMarks = () => {
    for (const r of rows()) {
      r.removeAttribute("data-member-drop");
      r.removeAttribute("data-member-dragging");
    }
    tbodyRef.current?.removeAttribute("data-reordering");
  };

  const end = useCallback((apply: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    clearTimeout(d.timer);
    if (d.raf) cancelAnimationFrame(d.raf);
    try {
      if (d.handle.hasPointerCapture(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
    } catch {
      /* もう外れている */
    }
    clearMarks();
    window.removeEventListener("keydown", onKey, true);
    if (apply && d.started && d.to >= 0) actions.moveMemberTo(d.name, visibleRef.current, d.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape" || !drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    end(false);
  }

  /** ポインタの高さから入る位置を決め、線を出す */
  const track = (y: number) => {
    const d = drag.current;
    if (!d) return;
    const list = rows(),
      rest = list.filter((r) => r.dataset.memberRow !== d.name),
      from = list.findIndex((r) => r.dataset.memberRow === d.name);
    let to = rest.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return y < b.top + b.height / 2;
    });
    if (to < 0) to = rest.length;
    for (const r of rest) r.removeAttribute("data-member-drop");
    // 元の位置のまま（何も変わらない）なら線を出さない
    if (to === from) {
      d.to = -1;
      return;
    }
    d.to = to;
    if (to < rest.length) rest[to].setAttribute("data-member-drop", "before");
    else if (rest.length) rest[rest.length - 1].setAttribute("data-member-drop", "after");
  };

  /** 端に近いあいだは自動でスクロールし、位置を決め直す */
  const autoScroll = () => {
    const d = drag.current;
    if (!d || !d.started) return;
    const sc = scrollerOf(d.handle);
    const page = sc === document.scrollingElement || sc === document.documentElement;
    const r = page ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
    // ページのときは上のアプリバー（sticky 52px）と下のタブバーの分だけ内側を端とみなす
    const top = r.top + (page ? 60 : 0),
      bottom = r.bottom - (page ? 72 : 0);
    let v = 0;
    if (d.lastY < top + EDGE) v = -MAX_SPEED * Math.min(1, (top + EDGE - d.lastY) / EDGE);
    else if (d.lastY > bottom - EDGE) v = MAX_SPEED * Math.min(1, (d.lastY - (bottom - EDGE)) / EDGE);
    if (v) {
      if (page) window.scrollBy(0, v);
      else sc.scrollTop += v;
      track(d.lastY);
    }
    d.raf = requestAnimationFrame(autoScroll);
  };

  const begin = () => {
    const d = drag.current;
    if (!d) return;
    d.started = true;
    tbodyRef.current?.setAttribute("data-reordering", "");
    tbodyRef.current?.querySelector(`${ROW}[data-member-row="${cssEscape(d.name)}"]`)?.setAttribute("data-member-dragging", "");
    track(d.lastY);
    d.raf = requestAnimationFrame(autoScroll);
  };

  const onPointerDown = (name: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || drag.current) return;
    const touch = e.pointerType !== "mouse";
    if (!touch) e.preventDefault(); // 文字の選択を始めない（フォーカスは下の click で付く）
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    drag.current = { name, pointerId: e.pointerId, handle, touch, startX: e.clientX, startY: e.clientY, lastY: e.clientY, started: false, to: -1 };
    if (touch) drag.current.timer = setTimeout(begin, LONG_PRESS);
    window.addEventListener("keydown", onKey, true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.lastY = e.clientY;
    const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.started) {
      if (d.touch) {
        if (moved > SLOP) end(false); // 長押しの前に動いた：並べ替えない
      } else if (moved > MOUSE_SLOP) begin();
      return;
    }
    e.preventDefault();
    track(e.clientY);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    end(true);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current && e.pointerId === drag.current.pointerId) end(false);
  };

  /** Alt+↑／↓：見えている行の中で1つ上／下へ */
  const onKeyDown = (name: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const list = visibleRef.current,
      i = list.indexOf(name);
    const to = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (i < 0 || to < 0 || to >= list.length) return;
    refocus.current = name;
    actions.moveMemberTo(name, list, to);
  };

  // 並びが変わって行が動くとフォーカスが外れることがあるので、つまみへ戻す
  useEffect(() => {
    const name = refocus.current;
    if (!name) return;
    refocus.current = null;
    const h = tbodyRef.current?.querySelector<HTMLElement>(`[data-member-handle="${cssEscape(name)}"]`);
    if (h && document.activeElement !== h) h.focus();
    h?.scrollIntoView({ block: "nearest" });
  });

  // 画面を離れる（タブの切り替えなど）ときは取り消す
  useEffect(() => () => end(false), [end]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown };
}
