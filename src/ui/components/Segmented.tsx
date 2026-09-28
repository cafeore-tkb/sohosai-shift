// セグメント（日付・表示の切り替え）：押されているものは aria-pressed="true"。data-* などは SegButton にそのまま渡す

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import styles from "./Segmented.module.css";

export interface SegmentedProps {
  /** グループの読み上げ名（「日付」など） */
  label: string;
  size?: "sm" | "md";
  id?: string;
  className?: string;
  children: ReactNode;
}

/** セグメントの入れ物（role="group"） */
export function Segmented({ label, size = "md", id, className, children }: SegmentedProps) {
  return (
    <div role="group" aria-label={label} id={id} className={cx(styles.seg, size === "sm" && styles.sm, className)}>
      {children}
    </div>
  );
}

export interface SegButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  icon?: IconName;
  /** ラベルの右の小さな文字（「10/31」「N名」） */
  sub?: ReactNode;
  /** 右端のバッジ（<Fill>・<Pill> など） */
  badge?: ReactNode;
  /** sub を隠す幅（"1400"＝641〜1400px。日付の「10/31」） */
  hideSubAt?: "1400";
}

export function SegButton({ pressed, icon, sub, badge, hideSubAt, className, children, type = "button", ...rest }: SegButtonProps) {
  return (
    <button type={type} aria-pressed={pressed} className={cx(styles.btn, className)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {sub !== undefined && sub !== null ? <small className={cx(styles.sub, hideSubAt && "seg-sub-1400")}>{sub}</small> : null}
      {badge}
    </button>
  );
}

/** セグメントの区切り線（「3日分を一覧」の前） */
export const SegSep = () => <span className={styles.sep} aria-hidden="true" />;
