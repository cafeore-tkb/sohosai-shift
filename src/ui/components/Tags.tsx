// 小さな表示部品：Pill（件数・状態）/ Fill（充足率）/ ShopTag / StatusTag / PosTag / CarChip / Mark / Drip / Swatch

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { shopClass } from "./shop";
import styles from "./Tags.module.css";

export type PillTone = "neutral" | "open" | "danger" | "ok" | "accent" | "off" | "unfit" | "dislike" | "warn";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  /** sm 18px（タブの中）/ md 20px / lg 24px（ドロワーの見出し） */
  size?: "sm" | "md" | "lg";
}

/** 件数・状態の丸いラベル（未割当 154・重複 2・読み込み完了 など） */
export function Pill({ tone = "neutral", size = "md", className, ...rest }: PillProps) {
  return <span className={cx(styles.pill, styles[tone], size === "lg" && styles.pillLg, size === "sm" && styles.pillSm, className)} {...rest} />;
}

export type FillLevel = "full" | "part" | "empty";
/** 充足率 → 色（100% 以上 full・0 より大きい part・0 empty） */
const fillLevel = (rate: number): FillLevel => (rate >= 100 ? "full" : rate > 0 ? "part" : "empty");

/** 充足率のラベル（87%）。level を省くと rate から決める */
export function Fill({ rate, level, className, children }: { rate: number; level?: FillLevel; className?: string; children?: ReactNode }) {
  return <span className={cx(styles.fill, styles[level ?? fillLevel(rate)], className)}>{children ?? `${rate}%`}</span>;
}

/** 店舗名のタグ（店舗の色） */
export function ShopTag({ shop, children, className }: { shop: string; children?: ReactNode; className?: string }) {
  return <span className={cx(styles.shoptag, shopClass(shop), className)}>{children ?? shop}</span>;
}

/** ステータスの短いタグ（担当者ポップアップ：上級・2年・1年・未合格）。top＝上級生 */
export function StatusTag({ top, children, className }: { top?: boolean; children: ReactNode; className?: string }) {
  return <span className={cx(styles.stag, top && styles.stagTop, className)}>{children}</span>;
}

/** 番目の条件タグ（表の見出しの「上級」「2年↑」） */
export function PosTag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.ptag, className)}>{children}</span>;
}

/** 車の人数（車10。0 は赤） */
export function CarChip({ n, title, className }: { n: number; title?: string; className?: string }) {
  return (
    <span className={cx(styles.car, n === 0 && styles.carZero, className)} title={title}>
      {`車${n}`}
    </span>
  );
}

export type MarkKind = "want" | "dislike" | "off" | "unfit" | "conflict";
const MARK: Record<MarkKind, [string, string]> = {
  want: ["★", styles.want],
  dislike: ["△", styles.dislikeMk],
  off: ["×", styles.offMk],
  unfit: ["≠", styles.unfitMk],
  conflict: ["!", styles.conflictMk],
};
/** ★ やりたい / △ 苦手 / × 勤務できない時間 / ≠ 条件外 / ! 重複（色だけに頼らない記号） */
export function Mark({ kind, className, title }: { kind: MarkKind; className?: string; title?: string }) {
  const [ch, cls] = MARK[kind];
  return (
    <i className={cx(styles.mk, cls, className)} aria-hidden={title ? undefined : true} title={title}>
      {ch}
    </i>
  );
}

export type DripKind = "both" | "ice" | "hot";
/** ドリッパーのアイス可否（○ 両方 / 1・2 その杯数のみ / H 不可）。text は表示する文字 */
export function Drip({ kind, text, title, className }: { kind: DripKind; text: string; title?: string; className?: string }) {
  return (
    <i className={cx(styles.drip, kind === "both" ? styles.dripBoth : kind === "ice" ? styles.dripIce : styles.dripHot, className)} title={title}>
      {text}
    </i>
  );
}

export type SwatchKind = "open" | "none" | "dislike" | "conflict" | "off" | "unfit" | "na" | "stint" | "shop" | "brk";
const SW: Record<SwatchKind, [string, string]> = {
  open: [styles.swOpen, ""],
  none: [styles.swNone, ""],
  dislike: [styles.swDislike, "△"],
  conflict: [styles.swConflict, "!"],
  off: [styles.swOff, "×"],
  unfit: [styles.swUnfit, "≠"],
  na: [styles.swNa, ""],
  stint: [styles.swStint, ""],
  shop: [styles.swShop, ""],
  brk: [styles.swBrk, ""],
};
/** 凡例の見本（表のセルと同じ見た目）。shop のときは shop に店舗名 */
export function Swatch({ kind, shop, className }: { kind: SwatchKind; shop?: string; className?: string }) {
  const [cls, ch] = SW[kind];
  return (
    <i className={cx(styles.sw, cls, shop !== undefined && shopClass(shop), className)} aria-hidden="true">
      {ch}
    </i>
  );
}
