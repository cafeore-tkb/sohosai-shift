// フィルターのチップ（店舗・メンバーの絞り込み）：押されているものは aria-pressed="true"

import { useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { shopClass } from "./shop";
import { useEdgeFade } from "./useEdgeFade";

/** チップを並べる入れ物（role="group"） */
export function ChipGroup({ label, id, className, children }: { label: string; id?: string; className?: string; children: ReactNode }) {
  // 横にスクロールするとき（狭い画面）は、続きのある端をぼかす
  const ref = useRef<HTMLDivElement>(null);
  useEdgeFade(ref);
  return (
    <div ref={ref} role="group" aria-label={label} id={id} className={cx(styles.chips, className)}>
      {children}
    </div>
  );
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  /** 店舗名を渡すとその色の点を出す（"" は点なし） */
  shop?: string;
  /** 店舗の点の代わりに「要確認」の橙の点を出す（メンバーの「店舗未設定」） */
  attentionDot?: boolean;
  /** 右の件数（<ChipCount>） */
  count?: ReactNode;
}

export function Chip({ pressed, shop, attentionDot, count, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={pressed} className={cx(styles.chip, shop ? shopClass(shop) : undefined, className)} {...rest}>
      {shop || attentionDot ? <span className={cx(styles.dot, attentionDot && styles.dotOpen)} aria-hidden="true" /> : null}
      {children}
      {count}
    </button>
  );
}

/** チップ・帯の件数。tone="hot"＝未割当あり（橙）、"ok"＝✓ 充足（children を省くと「充足」） */
export function ChipCount({ tone, children }: { tone?: "hot" | "ok"; children?: ReactNode }) {
  if (tone === "ok")
    return (
      <span className={cx(styles.n, styles.ok)}>
        <Icon name="check" size={14} />
        {children ?? "充足"}
      </span>
    );
  return <span className={cx(styles.n, tone === "hot" && styles.hot)}>{children}</span>;
}
