// 充足率のメーター（スチールの帯。100% でも色は変えない＝重複の赤と混ざらないように）。値の文字は呼ぶ側が隣に置く

import { cx } from "./cx";
import styles from "./Meter.module.css";

export interface MeterProps {
  /** 0–100 */
  value: number;
  /** 帯の幅（px）。既定 110（ステータスバー）。スマホの帯は 56 */
  width?: number;
  /** 塗りの要素の id（#fillBar） */
  fillId?: string;
  className?: string;
}

export function Meter({ value, width = 110, fillId, className }: MeterProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={cx(styles.track, className)} style={{ width }} role="presentation">
      <i id={fillId} className={styles.fill} style={{ width: `${v}%` }} />
    </span>
  );
}
