// ドロワー（勤務状況チェック・必要人数の設定）：ページの範囲（アプリバーとステータスバーの間）に右から出す。
// - 閉じていても DOM は残す（hidden）。中の id・data-* は常にある（旧版と同じ。回帰テストが閉じたまま押すことがある）
// - 開いたら閉じるボタンへフォーカス（中にもうフォーカスがあればそのまま）、閉じたら元の要素へ戻す
// - モーダルではない（旧版と同じ）：スクリムはなく、開いたままシフト表を押して編集できる。Tab も中に閉じ込めない。
//   スマホ（幅 640px 以下・横向きで高さ 560px 以下）だけは画面いっぱいのシートなので、Tab を中で回す
// - Esc は store の Esc の順（actions.escape）で閉じる。ここでは扱わない

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { CloseButton } from "./CloseButton";
import { cx } from "./cx";
import { rememberFocus, trapTab } from "./focus";

/** 画面いっぱいのシートになる大きさ（Drawer.module.css と同じ。スマホと、横向きのスマホ＝高さ 560px 以下） */
const SHEET = "(max-width: 640px), (max-height: 560px)";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  /** 閉じるボタン */
  onClose: () => void;
  /** 見出し（aria-label にも使う） */
  title: string;
  icon?: IconName;
  /** ルートの id（#auditDrawer・#countDrawer） */
  id?: string;
  /** 閉じるボタンの id（#auditClose・#countClose） */
  closeId?: string;
  /** 本文の入れ物の id（#assignmentAudit など） */
  bodyId?: string;
  /** 見出しの右（日付の切り替え・「この日を標準に戻す」など） */
  headExtra?: ReactNode;
  /** 下の帯（凡例・キーの説明） */
  footer?: ReactNode;
  /** 広い（必要人数：min(1100px, 94vw)） */
  wide?: boolean;
  /** 開いたときのフォーカス："close"（既定）＝閉じるボタン、"none"＝動かさない（中身が自分で決める） */
  initialFocus?: "close" | "none";
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  icon,
  id,
  closeId,
  bodyId,
  headExtra,
  footer,
  wide,
  initialFocus = "close",
  className,
  bodyClassName,
  children,
}: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current!;
    const restore = rememberFocus();
    if (initialFocus === "close" && !el.contains(document.activeElement)) closeRef.current?.focus({ preventScroll: true });
    return () => {
      // 閉じた：フォーカスがこの中（または body）なら、開く前の要素へ戻す
      const a = document.activeElement;
      if (!a || a === document.body || el.contains(a)) restore();
    };
  }, [open, initialFocus]);

  return (
    <aside
      ref={ref}
      id={id}
      className={cx(styles.drawer, wide && styles.wide, className)}
      aria-label={title}
      hidden={!open}
      tabIndex={-1}
      data-overlay=""
      onKeyDown={(e) => {
        if (matchMedia(SHEET).matches) trapTab(e, e.currentTarget);
      }}
    >
      <div className={styles.head}>
        {icon ? <Icon name={icon} size={20} /> : null}
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.extra}>{headExtra}</div>
        <CloseButton id={closeId} ref={closeRef} className={styles.close} onClick={onClose} />
      </div>
      <div id={bodyId} className={cx(styles.body, bodyClassName)}>
        {children}
      </div>
      {footer ? <div className={styles.foot}>{footer}</div> : null}
    </aside>
  );
}
