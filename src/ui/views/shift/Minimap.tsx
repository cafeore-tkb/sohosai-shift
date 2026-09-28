// 表示位置のミニマップ（役職別の表の店舗の帯を横に並べ、いま見えている範囲を枠で示す）。
// 帯を押すとその店舗までスクロール。枠は表のスクロールに合わせて DOM を直接動かす（再描画しない）。

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { cx, shopClass } from "../../components";
import s from "./Toolbar.module.css";

export interface MinimapProps {
  /** 店舗と列の数（date の日の表） */
  bands: readonly (readonly [store: string, cols: number])[];
  /** 帯を測る表の日付（「一覧」では店舗が2つ以上ある最初の日。どの日の表も横のスクロールは同じ） */
  date: string;
  /** 表のスクロール（#shiftGridWrap） */
  wrapRef: RefObject<HTMLElement | null>;
  /** 描き直しのたびに位置を測り直す */
  version: number;
  className?: string;
}

const smooth = (): ScrollBehavior =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** その日の表の見出しの店舗の帯（th[data-band]） */
const bandCells = (wrap: HTMLElement, date: string): HTMLElement[] => {
  const table = wrap.querySelector(`table[data-grid-date="${CSS.escape(date)}"]`) ?? wrap.querySelector("table");
  return table ? [...table.querySelectorAll<HTMLElement>("thead th[data-band]")] : [];
};

export function Minimap({ bands, date, wrapRef, version, className }: MinimapProps) {
  const mapRef = useRef<HTMLSpanElement>(null),
    winRef = useRef<HTMLElement>(null);

  const update = useRef(() => {});
  update.current = () => {
    const wrap = wrapRef.current,
      map = mapRef.current,
      win = winRef.current;
    if (!wrap || !map || !win) return;
    const cells = bandCells(wrap, date),
      segs = [...map.querySelectorAll<HTMLElement>("button")];
    if (!cells.length || cells.length !== segs.length || !wrap.clientWidth) {
      win.style.width = "0";
      return;
    }
    const tc = cells[0].offsetLeft;
    // 表の x 座標 → ミニマップの x 座標（帯ごとに区切って比例）
    const at = (x: number) => {
      for (let i = 0; i < cells.length; i++) {
        const b = cells[i];
        if (x <= b.offsetLeft + b.offsetWidth || i === cells.length - 1) {
          const f = Math.max(0, Math.min(1, (x - b.offsetLeft) / b.offsetWidth));
          return segs[i].offsetLeft + f * segs[i].offsetWidth;
        }
      }
      return 0;
    };
    const a = at(wrap.scrollLeft + tc),
      z = at(wrap.scrollLeft + wrap.clientWidth);
    win.style.left = `${a}px`;
    win.style.width = `${Math.max(6, z - a)}px`;
  };

  useLayoutEffect(() => update.current(), [version, bands, date]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => update.current());
    };
    wrap.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      wrap.removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, [wrapRef]);

  const go = (i: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cells = bandCells(wrap, date);
    if (cells[i]) wrap.scrollTo({ left: cells[i].offsetLeft - cells[0].offsetLeft, behavior: smooth() });
  };

  return (
    <span className={cx(s.minimap, className)} role="group" aria-label="表示位置">
      <span className={s.mmLabel} aria-hidden="true">
        表示位置
      </span>
      <span className={s.mm} ref={mapRef}>
        {bands.map(([store, n], i) => (
          <button key={store} type="button" className={cx(s.mmSeg, shopClass(store))} style={{ flex: n }} title={`${store}へ移動`} onClick={() => go(i)}>
            {store}
          </button>
        ))}
        <i className={s.mmWin} ref={winRef} aria-hidden="true" />
      </span>
    </span>
  );
}
