// トースト（#toast の見た目）。契約（spec §8.1）：
// - textContent は「メッセージ＋アクションの文言」だけ（アイコンは aria-hidden の SVG、閉じるは aria-label だけ）
// - アクションは最初の <button>。⌘Z はアクションの title（キーキャップは #toast に入れない）
// - 表示のたびに中身を作り直す（呼ぶ側が key を変える）。非表示は hidden 属性

import { Fragment } from "react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import styles from "./Toast.module.css";

export interface ToastViewProps {
  id?: string;
  visible: boolean;
  /** 中身を作り直すための key（表示のたびに変わる） */
  contentKey?: string | number;
  message?: string;
  /** 最初の <button>。icon は飾り（aria-hidden の SVG なので textContent に入らない） */
  action?: { label: string; title?: string; icon?: IconName; onClick: () => void };
  /** 2つ目のボタン（手で動かしたあとの「固定」） */
  extra?: { label: string; title?: string; icon?: IconName; onClick: () => void };
  variant?: "default" | "move";
  onClose?: () => void;
}

export function ToastView({ id, visible, contentKey, message, action, extra, variant = "default", onClose }: ToastViewProps) {
  return (
    <div id={id} className={cx(styles.toast, variant === "move" && styles.move)} role="status" hidden={!visible}>
      {message !== undefined ? (
        <Fragment key={contentKey}>
          <Icon name={variant === "move" ? "move" : "check"} className={styles.icon} />
          <span className={styles.msg}>{message}</span>
          {action ? (
            <button type="button" className={styles.action} title={action.title} onClick={action.onClick}>
              {action.icon ? <Icon name={action.icon} size={14} /> : null}
              {action.label}
            </button>
          ) : null}
          {extra ? (
            <button type="button" className={styles.action} title={extra.title} onClick={extra.onClick}>
              {extra.icon ? <Icon name={extra.icon} size={14} /> : null}
              {extra.label}
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className={styles.close} aria-label="閉じる" onClick={onClose}>
              <Icon name="x" />
            </button>
          ) : null}
        </Fragment>
      ) : null}
    </div>
  );
}

/** トーストの並ぶ場所（下の中央、ステータスバーの上） */
/** besideDrawer：右にドロワー（--drawer-w）が開いているあいだ、残りの画面の中央に出す（幅 900px 以上） */
export function ToastDockView({ children, besideDrawer = false }: { children: ReactNode; besideDrawer?: boolean }) {
  return (
    <div className={styles.dock} data-beside-drawer={besideDrawer || undefined}>
      {children}
    </div>
  );
}

/** ドックの中のボタン（移動中の「キャンセル」）の見た目 */
export const toastDockButtonClass = styles.cancel;
