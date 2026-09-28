// キーキャップ（⌘ Z ／ Esc ／ / など）。飾りなので #toast の中には置かない（§8）

import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Kbd.module.css";

export function Kbd({ children, inverse, className }: { children: ReactNode; inverse?: boolean; className?: string }) {
  return <kbd className={cx(styles.kbd, inverse && styles.inverse, className)}>{children}</kbd>;
}

/** キーキャップ＋説明（「⌘ Z 元に戻す」）。keys は aria-hidden（説明の文字だけ読む） */
export function KbdHint({ keys, children, inverse, className }: { keys: readonly string[]; children?: ReactNode; inverse?: boolean; className?: string }) {
  return (
    <span className={cx(styles.hint, className)}>
      <span className={styles.keys} aria-hidden="true">
        {keys.map((k) => (
          <Kbd key={k} inverse={inverse}>
            {k}
          </Kbd>
        ))}
      </span>
      {children}
    </span>
  );
}

/** ⌘（Mac）か Ctrl（それ以外） */
export const MOD_KEY: string =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
