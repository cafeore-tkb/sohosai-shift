// モーダル（ネイティブの <dialog>・showModal）。共同編集のダイアログ（#shareDialog）など
// - open が変わったら showModal()／close()。Esc（cancel）・背景・[data-close] を押したら onClose
// - 見出しの × には data-close が付く（回帰テストが #shareDialog [data-close] を押す）

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { CloseButton } from "./CloseButton";
import { cx } from "./cx";
import styles from "./Dialog.module.css";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  id?: string;
  /** 本文の入れ物の id（#shareBody） */
  bodyId?: string;
  /** 見出しの右（状態のピルなど） */
  headExtra?: ReactNode;
  /** 下の帯のボタン（閉じるボタンにも data-close を付けると閉じる） */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Dialog({ open, onClose, title, icon, id, bodyId, headExtra, footer, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={cx(styles.dialog, className)}
      aria-labelledby={titleId}
      onClose={() => onClose()}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t === ref.current || t.closest("[data-close]")) onClose();
      }}
    >
      <div className={styles.head}>
        {icon ? <Icon name={icon} size={20} /> : null}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {headExtra}
        <CloseButton className={styles.close} data-close="" />
      </div>
      <div id={bodyId} className={styles.body}>
        {children}
      </div>
      {footer ? <div className={styles.foot}>{footer}</div> : null}
    </dialog>
  );
}
