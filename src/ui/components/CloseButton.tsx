// 閉じるボタン（Esc のキーキャップ＋×）。ドロワー・ダイアログ・ポップアップの右上。読み上げは aria-label「閉じる（Esc）」

import type { ButtonHTMLAttributes, Ref } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Kbd } from "./Kbd";
import styles from "./CloseButton.module.css";

export function CloseButton({ className, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <Button variant="ghost" size="sm" className={cx(styles.close, className)} aria-label="閉じる（Esc）" title="閉じる（Esc）" ref={ref} {...rest}>
      <span className={styles.glyph} aria-hidden="true">
        <Kbd className={styles.kbd}>Esc</Kbd>
        <Icon name="x" />
      </span>
    </Button>
  );
}
