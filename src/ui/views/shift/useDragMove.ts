// 名前をドラッグして別の枠へ移動（マウス：5px 動かすと開始／タッチ：350ms 長押ししてから。8px 動いたら取り消し）
// 表の端・画面の端に近づいたら自動でスクロール。ドラッグのあとのクリックは無視する。
// 移動先は data-drop-ok の枠（移動元以外のすべて。状態から描く）。ポインタの下の移動先の足あと（footprint.ts：範囲が入る枠すべて）と
// ゴーストだけ DOM を直接触る。選んでいる範囲（Shift＋クリック）の中の枠をつかむと範囲ごと動く（actions.beginDrag）。
// ゴースト（class drag-ghost）：名前（範囲に何人かいれば「山田 他1人」）・長さ（30分／Nコマ）・「移動元 → 移動先」と、
// 落としたら出る注意（⚠ 重複・勤務できない時間・条件外／× 入りません）。タッチでは指に隠れないよう指の上に出す。

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { flattened, itemLabel, previewMove } from "../../../domain";
import type { Item } from "../../../domain";
import { actions, movingRange, store } from "../../../store";
import { tabBarRef } from "../../domRefs";
import g from "./DragGhost.module.css";
import { clearFootprint, showFootprint } from "./footprint";
import { slotButtonAt } from "./gridDom";

interface Press {
  key: string;
  id: number;
  x: number;
  y: number;
  touch: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}
interface Drag {
  key: string;
  ghost: HTMLElement;
  x: number;
  y: number;
  raf: number;
  /** いまゴーストに出している移動先（同じなら書き直さない） */
  target: string | null;
  /** タッチ（ゴーストを指の上に出す） */
  touch: boolean;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** 「本店・レジ 10:00」、範囲なら「本店・レジ 10:00–11:30」 */
const place = (xs: readonly Item[]) =>
  xs.length > 1 ? `${itemLabel(xs[0])} ${xs[0].start}–${xs[xs.length - 1].end}` : `${itemLabel(xs[0])} ${xs[0].start}`;

/** ゴーストの中身（移動先 to がなければ移動元だけ） */
function ghostHtml(fromKey: string, toKey: string | null): string {
  const m = store.model,
    range = movingRange(store.ui);
  const byKey = new Map(flattened(m).map((x) => [x.key, x]));
  const srcs = (range.length ? range : [fromKey])
    .map((k) => byKey.get(k))
    .filter((x): x is Item => !!x)
    .sort((a, b) => a.start.localeCompare(b.start));
  const names = [...new Set(srcs.map((x) => m.assignments[x.key]).filter(Boolean))];
  const who = names.length > 1 ? `${names[0]} 他${names.length - 1}人` : names[0] || m.assignments[fromKey] || "";
  const len = srcs.length > 1 ? `${srcs.length}コマ` : "30分";
  // 移動先があれば domain の移動と同じ決まりで、入る枠と注意を出す
  const pv = toKey ? previewMove(m, fromKey, toKey, srcs.length > 1 ? range : [fromKey]) : null;
  const targets = pv?.plan.ok ? pv.plan.cells.map((c) => c.target!) : pv ? [pv.plan.to] : [];
  const route = srcs.length ? `${esc(place(srcs))}${targets.length ? ` → <b>${esc(place(targets))}</b>` : ""}` : "";
  const note = !pv
    ? ""
    : !pv.plan.ok
      ? `× 入りません（移動先の列に枠のない時間があります）`
      : pv.issues.length
        ? `⚠ ${pv.issues.join("・")}`
        : "";
  return (
    `<svg class="${g.icon}" aria-hidden="true" focusable="false"><use href="#i-move"></use></svg>` +
    `<span class="${g.body}"><span class="${g.name}">${esc(who)}<span class="${g.len}">${len}</span></span>` +
    (route ? `<small class="${g.route}">${route}</small>` : "") +
    (note ? `<small class="${g.note}">${esc(note)}</small>` : "") +
    `</span>`
  );
}

const TARGET = "[data-drop-ok]";

/** ゴーストを消す。落とした先があれば、そこへ縮みながら消える（--dur-base。動きを減らす設定なら 0 なのですぐ消す） */
function landGhost(ghost: HTMLElement, target: HTMLElement | null): void {
  const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-base")) || 0;
  if (!target || ms <= 0) return ghost.remove();
  const r = target.getBoundingClientRect();
  ghost.classList.add(g.landing);
  ghost.style.transform = `translate(${Math.round(r.left + 4)}px,${Math.round(r.top + 2)}px) scale(0.4)`;
  setTimeout(() => ghost.remove(), ms);
}

export interface DragMove {
  /** 表の pointerdown：担当者のいる枠の名前を押したら、ドラッグの準備 */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /** ドラッグ直後のクリックなら true を返して、以後は通常に戻す */
  consumeSuppressedClick: () => boolean;
}

export function useDragMove(wrapRef: RefObject<HTMLElement | null>): DragMove {
  const press = useRef<Press | null>(null),
    drag = useRef<Drag | null>(null),
    suppressClick = useRef(false);

  const clearHover = () => clearFootprint(wrapRef.current);
  const hoverTarget = (): HTMLElement | null => {
    const d = drag.current;
    const el = d ? (document.elementFromPoint(d.x, d.y)?.closest<HTMLElement>(TARGET) ?? null) : null;
    const to = el?.dataset.slotKey ?? null;
    // 移動先が変わったときだけ足あととゴーストを作り直す（自動スクロール中も同じ枠なら何もしない）
    if (d && to !== d.target) {
      d.target = to;
      d.ghost.innerHTML = ghostHtml(d.key, to);
      if (wrapRef.current) showFootprint(wrapRef.current, el);
    }
    return el;
  };
  const moveDrag = () => {
    const d = drag.current;
    if (!d) return;
    // 右端では指（ポインタ）の左側に出す（画面からはみ出さない）。タッチでは指の上（指と手でねらう枠が隠れないように）
    const w = d.ghost.offsetWidth,
      h = d.ghost.offsetHeight;
    const x = d.touch
      ? Math.min(Math.max(8, d.x - w / 2), innerWidth - w - 8)
      : d.x + 14 + w > innerWidth - 8
        ? Math.max(8, d.x - 14 - w)
        : d.x + 14;
    const y = d.touch ? Math.max(8, d.y - h - 24) : d.y + 10;
    d.ghost.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) rotate(-2deg)`;
    hoverTarget();
  };
  const autoScroll = () => {
    const wrap = wrapRef.current,
      d = drag.current;
    if (!d || !wrap) return;
    const r = wrap.getBoundingClientRect(),
      edge = 56,
      speed = (n: number) => Math.ceil((edge - n) / 4);
    const { x, y } = d;
    let dx = 0,
      dy = 0;
    if (x < r.left + edge) dx = -speed(x - r.left);
    else if (x > r.right - edge) dx = speed(r.right - x);
    if (y < r.top + edge) dy = -speed(y - r.top);
    else if (y > r.bottom - edge) dy = speed(r.bottom - y);
    if (dx || dy) {
      wrap.scrollBy(dx, dy);
      hoverTarget();
    }
    const top = tabBarRef.current?.getBoundingClientRect().bottom ?? 0;
    if (y < top + 30) scrollBy(0, -12);
    else if (y > innerHeight - 30) scrollBy(0, 12);
    d.raf = requestAnimationFrame(autoScroll);
  };
  const startDrag = (x: number, y: number) => {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    press.current = null;
    actions.beginDrag(p.key);
    const ghost = document.createElement("div");
    ghost.className = `drag-ghost ${g.ghost}`;
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = ghostHtml(p.key, null);
    document.body.append(ghost);
    drag.current = { key: p.key, ghost, x, y, raf: 0, target: null, touch: p.touch };
    suppressClick.current = true;
    if (navigator.vibrate) navigator.vibrate(15);
    moveDrag();
    autoScroll();
  };
  /** ドラッグの表示を片付ける（移動先の要素を返す）。land：落とした先へゴーストを縮めながら消す（spec §6） */
  const stopDrag = (land = false): HTMLElement | null => {
    const d = drag.current;
    if (!d) return null;
    cancelAnimationFrame(d.raf);
    const el = hoverTarget();
    landGhost(d.ghost, land ? el : null);
    drag.current = null;
    clearHover();
    return el;
  };
  const clearPress = () => {
    if (press.current) {
      clearTimeout(press.current.timer);
      press.current = null;
    }
  };
  // 最新のクロージャを window のリスナーから呼ぶ
  const handlers = useRef({ startDrag, stopDrag, clearPress, moveDrag });
  handlers.current = { startDrag, stopDrag, clearPress, moveDrag };

  useEffect(() => {
    const h = () => handlers.current;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d) {
        d.x = e.clientX;
        d.y = e.clientY;
        h().moveDrag();
        return;
      }
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) {
        if (dist > 8) h().clearPress();
        return;
      }
      if (dist > 5) h().startDrag(e.clientX, e.clientY);
    };
    const onUp = () => {
      h().clearPress();
      if (!drag.current) return;
      const from = drag.current.key,
        el = h().stopDrag(true);
      actions.endDrag(from, el?.dataset.slotKey ?? null);
      setTimeout(() => (suppressClick.current = false), 0);
    };
    const onCancel = () => {
      h().clearPress();
      if (!drag.current) return;
      h().stopDrag();
      actions.clearTargets();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current) e.preventDefault();
    };
    const onContextMenu = (e: Event) => {
      if (press.current || drag.current) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("contextmenu", onContextMenu);
      // 途中で外れたら、長押しのタイマー・自動スクロール・ゴーストを片付ける
      h().clearPress();
      h().stopDrag();
    };
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    // td の余白を押しても、その枠のボタンを押したのと同じ（タッチの的を td いっぱいに）
    const btn = slotButtonAt(e.target as HTMLElement).closest<HTMLElement>("[data-pick-slot]");
    const key = btn?.dataset.pickSlot;
    if (!key || !store.model.assignments[key] || e.button > 0 || store.ui.moveMode === "moving") return;
    if (e.pointerType === "mouse") e.preventDefault();
    const p: Press = { key, id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse", timer: undefined };
    clearTimeout(press.current?.timer);
    press.current = p;
    if (p.touch)
      p.timer = setTimeout(() => {
        if (press.current === p) handlers.current.startDrag(p.x, p.y);
      }, 350);
  }, []);

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { onPointerDown, consumeSuppressedClick };
}
