// ボタン（primary / secondary / ghost、danger、sm / md / lg、アイコン、ラベルの短縮、アイコンだけ）

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Button.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Kbd } from "./Kbd";

/** 短いラベルに切り替える幅：その幅以下（"1320" と "1279" は 641px 以上のときだけ。スマホは別の並びになるため） */
export type ShortAt = "1320" | "1279" | "1023" | "640";
/** アイコンだけにする幅："1439"＝641〜1439px、"1023"＝1023px 以下、"640"＝スマホ */
export type IconOnlyAt = "1439" | "1023" | "640";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  /** 危ない操作（文字が赤。secondary なら枠も赤） */
  danger?: boolean;
  size?: "sm" | "md" | "lg";
  /** 先頭のアイコン */
  icon?: IconName;
  /** 末尾のアイコン（「表で見る ›」など） */
  iconEnd?: IconName;
  /** 狭い画面で使う短いラベル（children が .lbl-full、これが .lbl-short） */
  shortLabel?: ReactNode;
  shortAt?: ShortAt;
  /** true：常にアイコンだけ（ラベルは読み上げ用に残る）。幅を指定するとその幅だけ */
  iconOnly?: boolean | IconOnlyAt;
  /** 末尾のキーキャップ（飾り。aria-hidden） */
  kbd?: string | readonly string[];
  /** アイコンボタンの右上の件数（赤い丸） */
  dot?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  danger,
  size = "md",
  icon,
  iconEnd,
  shortLabel,
  shortAt,
  iconOnly,
  kbd,
  dot,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const keys = kbd === undefined ? [] : typeof kbd === "string" ? [kbd] : kbd;
  return (
    <button
      type={type}
      className={cx(
        styles.btn,
        styles[variant],
        danger && styles.danger,
        size !== "md" && styles[size],
        iconOnly === true && styles.iconOnly,
        typeof iconOnly === "string" && styles[`io${iconOnly}`],
        shortLabel !== undefined && shortAt && styles[`swap${shortAt}`],
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "lg" && iconOnly === true ? 20 : 16} className={styles.ic} /> : null}
      {children !== undefined && children !== null && children !== false ? (
        <span className={styles.label}>
          {shortLabel !== undefined ? (
            <>
              <span className={cx(styles.full, "lbl-full")}>{children}</span>
              <span className={cx(styles.short, "lbl-short")}>{shortLabel}</span>
            </>
          ) : (
            children
          )}
        </span>
      ) : null}
      {iconEnd ? <Icon name={iconEnd} size={14} className={styles.ic} /> : null}
      {keys.length ? (
        <span className={styles.keys} aria-hidden="true">
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      ) : null}
      {dot !== undefined && dot !== null && dot !== false ? <span className={styles.dot}>{dot}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children" | "icon" | "iconOnly" | "shortLabel" | "shortAt"> {
  icon: IconName;
  /** 読み上げ用の名前（title の既定値にもなる） */
  label: string;
}

/** アイコンだけのボタン（aria-label と title に label） */
export function IconButton({ icon, label, variant = "ghost", title, ...rest }: IconButtonProps) {
  return <Button variant={variant} icon={icon} iconOnly aria-label={label} title={title ?? label} {...rest} />;
}

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
}

/** ボタンの見た目のリンク（<a>。webcal:// やダウンロードなど、押すと別のアプリ・ページへ行くもの） */
export function LinkButton({ variant = "secondary", size = "md", icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <a className={cx(styles.btn, styles[variant], size !== "md" && styles[size], className)} {...rest}>
      {icon ? <Icon name={icon} size={16} className={styles.ic} /> : null}
      <span className={styles.label}>{children}</span>
    </a>
  );
}
