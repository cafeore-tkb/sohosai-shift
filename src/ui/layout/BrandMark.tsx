// ロゴ（スチールブルーの角丸の上に、白いカップ・淡いラテ・撫子のハート）。色は --illus-mark-* / --brand-tile

import styles from "./BrandMark.module.css";

/** カップの絵（22px）。タイルの地は呼ぶ側（AppBar の .mark、空の状態など）が --brand-tile で塗る */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.mark}>
      <circle cx="11.2" cy="12.6" r="8.2" className={styles.rim} />
      <circle cx="11.2" cy="12.6" r="6.2" className={styles.latte} />
      <path d="M11.2 16.4c-2.6-1.6-3.6-3-3.6-4.3a1.9 1.9 0 0 1 3.6-.9 1.9 1.9 0 0 1 3.6.9c0 1.3-1 2.7-3.6 4.3z" className={styles.heart} />
      <path d="M19.2 10.3a2.3 2.3 0 0 1 0 4.6" className={styles.handle} />
    </svg>
  );
}

/** ロゴのタイル（スチールブルーの角丸＋カップ）。size はタイルの一辺 */
export function BrandTile({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span className={[styles.tile, className].filter(Boolean).join(" ")} style={{ width: size, height: size }} aria-hidden="true">
      <BrandMark size={Math.round(size * 0.73)} />
    </span>
  );
}
