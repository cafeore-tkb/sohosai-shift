// 読み込みの絵：ドリッパー（CSV）から一滴落ちて、表になる。色は --illus-* だけ（店舗・状態の色は使わない）

import { cx } from "../../components";
import styles from "./ImportView.module.css";

export function PourOver({ className }: { className?: string }) {
  return (
    <svg className={cx(styles.illus, className)} width="112" height="112" viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
      <circle className={styles.iBg} cx="60" cy="60" r="56" />
      <path className={styles.iPaper} d="M34 34h52l-16 30H50z" strokeWidth="2.5" strokeLinejoin="round" />
      <path className={styles.iSteam} d="M41 42h38" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
      <text className={styles.iText} x="60" y="55" textAnchor="middle" fontSize="10" fontWeight="700">
        CSV
      </text>
      <path className={styles.iLine} d="M46 64h28" strokeWidth="2.5" strokeLinecap="round" />
      <path className={styles.iDrip} d="M60 69v4" strokeWidth="2.5" strokeLinecap="round" />
      <circle className={styles.iDrop} cx="60" cy="78" r="1.8" />
      <rect className={styles.iPaper} x="38" y="84" width="44" height="22" rx="5" strokeWidth="2.5" />
      <path className={styles.iGrid} d="M38 91.5h44M52.7 84v22M67.3 84v22" strokeWidth="1.5" />
      <rect className={styles.iB2} x="54" y="93" width="12" height="5.5" rx="1.2" />
      <rect className={styles.iB1} x="40" y="93" width="11" height="5.5" rx="1.2" />
      <rect className={styles.iB3} x="69" y="99.5" width="11" height="5" rx="1.2" />
      <path className={styles.iSteam} d="M86 30c4-4 10-3 12 1M92 22c3-2 6-1 7 1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
