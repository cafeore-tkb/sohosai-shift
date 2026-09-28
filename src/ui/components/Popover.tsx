// ポップアップ（凡例と操作ヘルプなど）。押した要素（anchor）の近くに fixed で出す
// 外側を押すと onClose。Esc は store の Esc の順（actions.escape）で閉じるので、ここでは扱わない
// 下からのシートのとき（スマホ）は Tab を中で回す

import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { focusables, rememberFocus, trapTab } from "./focus";
import styles from "./Popover.module.css";

export type Placement = "top-end" | "top-start" | "bottom-end" | "bottom-start";

export interface PopoverProps {
  open: boolean;
  /** 外側を押したとき（anchor を押したときは呼ばない。anchor 側で切り替える） */
  onClose: () => void;
  /** 位置の基準の要素（開くたびに呼ぶ） */
  anchor: () => HTMLElement | null;
  placement?: Placement;
  /** 幅（px）。既定は中身なり */
  width?: number;
  /** 読み上げ名 */
  label: string;
  id?: string;
  className?: string;
  /** 開いたとき最初の操作できる要素へフォーカスする（既定 true）。閉じたら元の要素に戻す */
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /**
   * 基準の要素が見つからないとき（スマホで基準のボタンが隠れているなど）と、幅 640px 以下では、
   * 画面の下からのシートとして出す（既定 false：基準がなければ左上）
   */
  sheetWithoutAnchor?: boolean;
  children: ReactNode;
}

const GAP = 8,
  EDGE = 8;

/** anchor の近くに置く。入らなければ上下を入れ替え、画面の中に収め、高さは空いているぶんまで */
function place(el: HTMLElement, a: DOMRect, placement: Placement): void {
  el.style.maxHeight = "";
  const w = el.offsetWidth,
    h = el.offsetHeight;
  const above = a.top - GAP - EDGE,
    below = innerHeight - a.bottom - GAP - EDGE;
  let top = placement.startsWith("top");
  if (top && h > above && below > above) top = false;
  else if (!top && h > below && above > below) top = true;
  const room = top ? above : below;
  if (h > room) el.style.maxHeight = `${Math.max(120, room)}px`;
  const hh = Math.min(h, Math.max(120, room));
  const left = placement.endsWith("end") ? a.right - w : a.left;
  el.style.left = `${Math.round(Math.min(Math.max(EDGE, left), innerWidth - w - EDGE))}px`;
  el.style.top = `${Math.round(top ? Math.max(EDGE, a.top - GAP - hh) : a.bottom + GAP)}px`;
}

export function Popover({
  open,
  onClose,
  anchor,
  placement = "bottom-start",
  width,
  label,
  id,
  className,
  autoFocus = true,
  onKeyDown,
  sheetWithoutAnchor = false,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef({ onClose, anchor });
  cb.current = { onClose, anchor };

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current!;
    const relayout = () => {
      const a = cb.current.anchor();
      const sheet = sheetWithoutAnchor && (!a || innerWidth <= 640);
      el.toggleAttribute("data-sheet", sheet);
      if (sheet) {
        el.style.left = el.style.top = el.style.maxHeight = "";
        return;
      }
      if (a) place(el, a.getBoundingClientRect(), placement);
    };
    relayout();
    const restore = rememberFocus();
    if (autoFocus) (focusables(el)[0] ?? el).focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el.contains(t) || cb.current.anchor()?.contains(t)) return;
      cb.current.onClose();
    };
    addEventListener("resize", relayout);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      removeEventListener("resize", relayout);
      document.removeEventListener("pointerdown", onDown, true);
      if (el.contains(document.activeElement) || document.activeElement === document.body) restore();
    };
  }, [open, placement, autoFocus, sheetWithoutAnchor]);

  if (!open) return null;
  return createPortal(
    <>
      {/* scrim: only drawn while the popover is a bottom sheet (CSS :has) */}
      {sheetWithoutAnchor ? <div className={styles.scrim} aria-hidden="true" /> : null}
      <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className={cx(styles.pop, className)}
      style={width ? { width } : undefined}
      data-overlay=""
      onKeyDown={(e) => {
        // 下からのシート（スクリムつき）のときは Tab を中で回す
        if (e.currentTarget.hasAttribute("data-sheet") && trapTab(e, e.currentTarget)) return;
        onKeyDown?.(e);
      }}
    >
      {children}
      </div>
    </>,
    document.body,
  );
}

/** メニューの中で ↑↓・Home・End でフォーカスを動かす */
export function moveInMenu(e: KeyboardEvent<HTMLElement>, el: HTMLElement): void {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const list = focusables(el);
  if (!list.length) return;
  e.preventDefault();
  const i = list.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
  list[next].focus();
}
