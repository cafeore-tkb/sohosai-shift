// レイアウトの部品：Page（タブ 1–4 の中央寄せのページ）・WorkSurface（タブ 5 の全面の作業面）・Card・Notice・Disclosure・Spacer

import { useId, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import styles from "./Layout.module.css";

export interface PageProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** 表示中でなければ true（section は hidden で残す） */
  hidden: boolean;
  /** STEP n / 5 の n（省くと eyebrow なし） */
  step?: number;
  title: ReactNode;
  description?: ReactNode;
  /** 見出しの右（役職ルールの段階の表示など） */
  aside?: ReactNode;
  /** 幅 1400px（勤務可能表）。既定 1240px */
  wide?: boolean;
  /** アプリバーのタブ（data-tab の値）：role=tabpanel・id・aria-labelledby をそのタブに合わせる */
  panelOf?: string;
}

/** タブの中身の id（旧版からの id がある画面はそれ：#availabilityPanel・#memberPanel）。AppBar の aria-controls と同じ */
export const panelIdOf = (view: string): string =>
  view === "availability" ? "availabilityPanel" : view === "members" ? "memberPanel" : `panel-${view}`;

/** タブの中身（role=tabpanel）の属性。タブは AppBar（id="tab-<view>"・aria-controls=panelIdOf(view)） */
const panelAttrs = (view?: string) => (view ? { role: "tabpanel", id: panelIdOf(view), "aria-labelledby": `tab-${view}` } : {});

/** タブ 1–4 のページ：eyebrow「STEP n / 5」＋ h1 ＋ 説明、中身は中央寄せ */
export function Page({ hidden, step, title, description, aside, wide, panelOf, className, children, ...rest }: PageProps) {
  return (
    <section hidden={hidden} className={cx(styles.page, wide && styles.wide, className)} {...panelAttrs(panelOf)} {...rest}>
      <header className={styles.head}>
        <div>
          {step ? <p className={styles.eyebrow}>{`STEP ${step} / 5`}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          {description ? <p className={styles.desc}>{description}</p> : null}
        </div>
        {aside ? <div className={styles.headAside}>{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** タブ 5（シフト調整）の作業面：アプリバーとステータスバーの間いっぱい（全画面なら画面いっぱい）。中の表だけがスクロールする */
export function WorkSurface({ hidden, panelOf, className, children, ...rest }: HTMLAttributes<HTMLElement> & { hidden: boolean; panelOf?: string }) {
  return (
    <section hidden={hidden} className={cx(styles.work, className)} {...panelAttrs(panelOf)} {...rest}>
      {children}
    </section>
  );
}

/** 紙のカード（枠・角丸・薄い影）。pad で内側の余白 */
export function Card({ pad, className, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: boolean }) {
  return <div className={cx(styles.card, pad && styles.pad, className)} {...rest} />;
}

const NOTICE_ICON: Record<"info" | "ok" | "warn", IconName> = { info: "info", ok: "check", warn: "alert" };

/** お知らせ（info＝灰、ok＝緑、warn＝橙）。icon を false にするとアイコンなし */
export function Notice({ tone = "info", icon, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: "info" | "ok" | "warn"; icon?: IconName | false }) {
  return (
    <div className={cx(styles.notice, styles[tone], className)} {...rest}>
      {icon === false ? null : <Icon name={icon ?? NOTICE_ICON[tone]} />}
      <div>{children}</div>
    </div>
  );
}

export interface DisclosureProps {
  label: ReactNode;
  /** 制御するとき（省くと中で開閉を持つ） */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/** 開閉できる説明（「CSVの形式を見る」など）。ボタンは aria-expanded / aria-controls */
export function Disclosure({ label, open, onToggle, defaultOpen = false, className, children }: DisclosureProps) {
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = open ?? own;
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => {
          setOwn(!isOpen);
          onToggle?.(!isOpen);
        }}
      >
        <Icon name="chev" />
        {label}
      </button>
      <div id={id} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}

/** 縦の区切り線（ツールバーの中） */
/** 残りの幅を埋める */
export const Spacer = () => <span className={styles.spacer} aria-hidden="true" />;
