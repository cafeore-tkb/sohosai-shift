// 「1つの DOM」でのスマホの ⋯ メニュー（spec §5）：
// 641px 以上では children をそのまま並べ（display: contents）、640px 以下では ⋯ ボタンの下のメニューに入れる。
// id の付いたボタンを2つ描かないための入れ物（#printExportBtn・#exportBtn、シフト調整の #clearBtn・#fullNameToggle など）。
// 開閉は呼ぶ側が store の ui.menu で持つ（actions.setMenu。Esc の順に入っている）。外側・項目を押したら・フォーカスが外へ出たら onOpenChange(false)。

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { moveInMenu } from "./Popover";
import { focusables } from "./focus";
import styles from "./Overflow.module.css";

export interface OverflowProps {
  /** メニューの id の元（パネルの id は `${menuId}-menu`） */
  menuId: string;
  /** スマホで開いているか（例：useUi((u) => u.menu === "appbar")） */
  open: boolean;
  /** 開閉（例：(o) => actions.setMenu(o ? "appbar" : null)） */
  onOpenChange: (open: boolean) => void;
  /** ⋯ ボタンの読み上げ名（「その他（印刷ビュー・CSVを書き出す）」） */
  label: string;
  /** メニューを出す向き（既定：ボタンの右端に合わせて下） */
  align?: "left" | "right";
  direction?: "down" | "up";
  /** ⋯ ボタンの見た目 */
  triggerVariant?: "ghost" | "secondary";
  className?: string;
  children: ReactNode;
}

export function Overflow({ menuId, open, onOpenChange, label, align = "right", direction = "down", triggerVariant = "ghost", className, children }: OverflowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  const panelId = `${menuId}-menu`;

  useEffect(() => {
    if (!open) return;
    const wrap = ref.current!;
    const panel = wrap.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`)!;
    focusables(panel)[0]?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!wrap.contains(e.target as Node)) change.current(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      // 閉じた（Esc・項目を押した）：フォーカスがメニューの中か body なら ⋯ ボタンへ戻す
      const a = document.activeElement;
      if (!a || a === document.body || panel.contains(a)) wrap.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(panelId)}"]`)?.focus({ preventScroll: true });
    };
  }, [open, panelId]);

  return (
    <div
      ref={ref}
      className={cx(styles.wrap, align === "left" && styles.left, direction === "up" && styles.up, className)}
      data-open={open ? "" : undefined}
      onBlur={(e) => {
        // Tab などでフォーカスがメニューの外へ出たら閉じる（開いたまま下のボタンを隠さないように）
        const to = e.relatedTarget as Node | null;
        if (open && to && !e.currentTarget.contains(to)) onOpenChange(false);
      }}
    >
      <Button
        variant={triggerVariant}
        icon="more"
        iconOnly
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      />
      <div
        id={panelId}
        className={styles.panel}
        // 開いている間は重なり（ショートカットの 1–5 などは効かない。store/keys.ts）
        data-overlay={open ? "" : undefined}
        onKeyDown={(e) => open && moveInMenu(e, e.currentTarget)}
        onClick={(e) => {
          // 項目（ボタン・チェックボックス）を押したら閉じる
          if (open && (e.target as Element).closest("button, input")) onOpenChange(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
