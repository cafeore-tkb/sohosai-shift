// 小さな吹き出し（濃い地・白い文字）。塗り替え中の「○ にする（4セル）・離すと確定」など、ポインタに付いて動く説明。
// 位置は呼ぶ側が style（left / top、position: fixed）で決める。読み上げが必要なら呼ぶ側で aria-live の要素に同じ文を置く

import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Tip.module.css";

export interface TipProps {
  /** 位置（fixed）。caretX は上向きの三角の位置（px、左端から） */
  style?: CSSProperties;
  caretX?: number;
  /** 2行目（薄い文字） */
  sub?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Tip({ style, caretX, sub, className, children }: TipProps) {
  return (
    <div className={cx(styles.tip, className)} style={{ ...style, ...(caretX !== undefined ? { "--tip-x": `${caretX}px` } : {}) } as CSSProperties} aria-hidden="true">
      {children}
      {sub ? <small className={styles.sub}>{sub}</small> : null}
    </div>
  );
}
