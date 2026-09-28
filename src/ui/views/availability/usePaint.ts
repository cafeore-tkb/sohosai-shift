// 勤務可能表の塗り替え：セルを押してドラッグした範囲を ○／— にする（押したセルの反対の値）
// 塗っている途中の表示（to-yes / to-no）は DOM に直接付け、離したときに外してから反映する。
// ポインタの近くに「○／— にする（N セル）・離すと確定」の吹き出しを出す（tip）。
// タッチ（指・ペン）：表を指でスクロールできるように、なぞって塗るのは長押し（350ms）してから。
//   長押しの前に 8px 動いたらスクロール（塗らない）。長押しの前に離したら（タップ）そのセルだけ塗る。
//   途中で取り消されたら（pointercancel：OS のジェスチャーなど）何も反映しない。

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { canAt } from "../../../domain";
import type { AvailabilityChanges } from "../../../domain";
import { actions, store } from "../../../store";
import styles from "./Availability.module.css";

const CELL = "td[data-av-name][data-av-h]";

interface Paint {
  value: boolean;
  cells: Map<string, HTMLElement>;
  /** 指・ペンで塗っている（吹き出しを指に隠れない上に出す） */
  touch: boolean;
}
/** タッチで押している途中（長押しを待っている） */
interface Press {
  id: number;
  x: number;
  y: number;
  td: HTMLElement;
  timer: ReturnType<typeof setTimeout>;
}

const LONG_PRESS = 350,
  SLOP = 8;

/** 塗っている途中の吹き出し（位置は最後に塗ったセルの下。下に入らなければ上。指・ペンは指に隠れないよう上） */
export interface PaintTip {
  value: boolean;
  count: number;
  left: number;
  top: number;
  above: boolean;
  /** 三角の位置（吹き出しの左端から。画面の右端で吹き出しを左へずらしたときもセルを指す） */
  caretX: number;
}

const TIP_H = 30,
  /** 指で塗るとき、吹き出しをセルの上端からこれだけ上に出す（指先に隠れないように） */
  TOUCH_LIFT = 40,
  /** 「— にする（12セル）・離すと確定」がちょうど入る幅（画面の右端からはみ出さないように） */
  TIP_W = 230;

/** 吹き出しの状態（表全体を描き直さないよう、吹き出しだけが購読する） */
class TipStore {
  private value: PaintTip | null = null;
  private listeners = new Set<() => void>();
  get = () => this.value;
  set(v: PaintTip | null) {
    this.value = v;
    for (const l of this.listeners) l();
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
}
export type { TipStore };

/** 吹き出しの状態を読む（PaintTipLayer 用） */
export const usePaintTip = (tips: TipStore) => useSyncExternalStore(tips.subscribe, tips.get, tips.get);

function tipFor(p: Paint, td: HTMLElement): PaintTip {
  const r = td.getBoundingClientRect();
  const below = r.bottom + 8;
  // 下の限界：スマホは下のタブバーの上、それ以外はステータスバーの上
  const bottom = window.innerHeight - (matchMedia("(max-width: 640px)").matches ? 66 : 36);
  const touchTop = r.top - TOUCH_LIFT - TIP_H;
  const above = p.touch ? touchTop >= 8 || below + TIP_H > bottom : below + TIP_H > bottom;
  const aboveTop = p.touch ? Math.max(8, touchTop) : r.top - 8 - TIP_H;
  const left = Math.max(8, Math.min(r.left + 6, window.innerWidth - TIP_W - 8));
  const caretX = Math.max(10, Math.min(r.left + 14 - left, TIP_W - 20));
  return { value: p.value, count: p.cells.size, left, top: above ? aboveTop : below, above, caretX };
}

export function usePaint() {
  const paint = useRef<Paint | null>(null);
  const press = useRef<Press | null>(null);
  const tips = useRef<TipStore>(null as unknown as TipStore);
  tips.current ??= new TipStore();
  const setTip = (v: PaintTip | null) => tips.current.set(v);
  const cls = (value: boolean) => (value ? styles.toYes : styles.toNo);
  // 塗る範囲にセルを加える（paint は ref なので、どの描画のものを呼んでも同じ）
  const paintCell = (td: HTMLElement | null | undefined) => {
    const p = paint.current;
    if (!td || !p) return;
    const k = `${td.dataset.avName}|${td.dataset.avH}`;
    if (p.cells.has(k)) return;
    p.cells.set(k, td);
    td.classList.add(cls(p.value));
    setTip(tipFor(p, td));
  };
  const unpaint = (p: Paint) => {
    for (const td of p.cells.values()) td.classList.remove(cls(p.value));
    setTip(null);
  };
  /** td から塗り始める（押したセルの反対の値） */
  const begin = (td: HTMLElement, touch = false) => {
    const m = store.model;
    paint.current = { value: !canAt(m, m.availDate, td.dataset.avName!, td.dataset.avH!), cells: new Map(), touch };
    store.setUi({ painting: true });
    paintCell(td);
  };
  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  // window のリスナーから最新のクロージャを呼ぶ
  const fns = useRef({ paintCell, unpaint, begin, clearPress });
  fns.current = { paintCell, unpaint, begin, clearPress };

  useEffect(() => {
    const f = () => fns.current;
    const move = (e: PointerEvent) => {
      const pr = press.current;
      if (pr && e.pointerId === pr.id && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > SLOP) f().clearPress();
      if (paint.current) f().paintCell(document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(CELL));
    };
    const up = (e: PointerEvent) => {
      const pr = press.current;
      if (pr && e.pointerId === pr.id) {
        // タッチのタップ（長押しの前に離した）：そのセルだけ塗る
        f().clearPress();
        f().begin(pr.td, true);
      }
      const p = paint.current;
      if (!p) return;
      paint.current = null;
      f().unpaint(p);
      store.setUi({ painting: false });
      const changes: AvailabilityChanges = {};
      for (const k of p.cells.keys()) {
        const [name, h] = k.split("|");
        (changes[name] ??= {})[h] = p.value;
      }
      if (Object.keys(changes).length) actions.paintAvailability(changes);
    };
    // 取り消し（スクロールが始まった・OS のジェスチャー）：途中の表示を消して、何も反映しない
    const cancel = () => {
      f().clearPress();
      const p = paint.current;
      if (!p) return;
      paint.current = null;
      f().unpaint(p);
      store.setUi({ painting: false });
    };
    // 塗っている間は指で表がスクロールしないように
    const touchMove = (e: TouchEvent) => {
      if (paint.current && e.cancelable) e.preventDefault();
    };
    const contextMenu = (e: Event) => {
      if (press.current || paint.current) e.preventDefault();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("contextmenu", contextMenu);
      f().clearPress();
      // 塗っている途中で外れたら、途中の表示だけ消す（反映はしない）
      const p = paint.current;
      paint.current = null;
      if (p) {
        for (const td of p.cells.values()) td.classList.remove(cls(p.value));
        store.setUi({ painting: false });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>(CELL);
    if (!td || e.button > 0) return;
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      // 指：まだ塗らない（動かせばスクロール）。長押しで塗り始める
      fns.current.clearPress();
      const pr: Press = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        td,
        timer: setTimeout(() => {
          if (press.current !== pr) return;
          press.current = null;
          fns.current.begin(td, true);
          if (navigator.vibrate) navigator.vibrate(15);
        }, LONG_PRESS),
      };
      press.current = pr;
      return;
    }
    e.preventDefault();
    fns.current.begin(td);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { onPointerDown, tips: tips.current };
}
