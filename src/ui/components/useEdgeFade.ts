// 横にスクロールする帯（店舗のチップ・凡例など）の端をぼかして、まだ続きがあることを示す。
// 続きがある側に data-fade-start / data-fade-end を付けるだけ（見た目は global.css の [data-fade-*]）。

import { useLayoutEffect } from "react";
import type { RefObject } from "react";

/** start: false なら右端だけ（左に固定の列がある表など、左端はぼかさない）。enabled: false の間はぼかさない */
export function useEdgeFade(ref: RefObject<HTMLElement | null>, { start = true, enabled = true }: { start?: boolean; enabled?: boolean } = {}): void {
  // 中身（チップの件数など）が変わると幅も変わるので、描画のたびに測り直す
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      // その幅では横スクロールの帯でない（スマホだけの帯など）
      el.removeAttribute("data-fade-start");
      el.removeAttribute("data-fade-end");
      return;
    }
    const update = () => {
      const rest = el.scrollWidth - el.clientWidth;
      el.toggleAttribute("data-fade-start", start && rest > 1 && el.scrollLeft > 1);
      el.toggleAttribute("data-fade-end", rest > 1 && el.scrollLeft < rest - 1);
    };
    update();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", update);
    };
  });
}
