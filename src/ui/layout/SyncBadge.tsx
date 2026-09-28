// 共同編集の状態（#modeBadge）。sync が store.ui.share.badge に書く状態を、spec §3 の見た目の種類に対応させる。
// 共同編集していなければ「オフライン対応」。ログインが必要なときは押すと共同編集のダイアログを開く。
// 共同編集している人の表示（アバター・人数）はない（バックエンドに在室の情報がないため。リードの判断）。

import { store, useUi } from "../../store";
import { cx } from "../components";
import styles from "./SyncBadge.module.css";

export type SyncVariant = "offline" | "room" | "saving" | "reconnecting" | "error" | "login";

/** sync の状態（connecting / live / saving / offline / error / login）→ 見た目 */
const VARIANT: Record<string, SyncVariant> = {
  connecting: "saving",
  live: "room",
  saving: "saving",
  offline: "reconnecting",
  error: "error",
  login: "login",
};
/** スマホ（と狭いときの title）の短い表示 */
const SHORT: Record<SyncVariant, string> = {
  offline: "オフライン",
  room: "共同編集",
  saving: "保存中",
  reconnecting: "再接続待ち",
  error: "エラー",
  login: "要ログイン",
};
/** 詳しい説明（title） */
const DETAIL: Record<SyncVariant, string> = {
  offline: "データはこのブラウザ内で処理されます（インターネット接続は不要）",
  room: "共同編集中・変更は自動で保存されます",
  saving: "変更を保存しています",
  reconnecting: "オフラインです。再接続すると自動で同期します",
  error: "共同編集でエラーが起きました",
  login: "共同編集を続けるにはログインしてください（押すと開きます）",
};

/** sync の状態 → 見た目の種類と文言（旧版の文言の先頭の「● 」は点（::before）で描くので外す） */
export function syncLook(badge: { kind: string; text: string } | null): { variant: SyncVariant; text: string } {
  if (!badge) return { variant: "offline", text: "オフライン対応" };
  return { variant: VARIANT[badge.kind] ?? "saving", text: badge.text.replace(/^●\s*/, "") };
}

/** #modeBadge（store の共同編集の状態を表示する） */
export function SyncBadge() {
  const badge = useUi((u) => u.share.badge);
  const { variant, text } = syncLook(badge);
  return <SyncPill id="modeBadge" live variant={variant} text={text} onLogin={() => store.shareActions?.open()} />;
}

export interface SyncPillProps {
  variant: SyncVariant;
  text: string;
  id?: string;
  /** 状態が変わったら読み上げる（aria-live。#modeBadge だけ） */
  live?: boolean;
  /** login のとき押したら（共同編集のダイアログを開く） */
  onLogin?: () => void;
}

/** 状態のピル（見た目だけ。共有ダイアログの見出しなどにも使える） */
export function SyncPill({ variant, text, id, live, onLogin }: SyncPillProps) {
  const detail = DETAIL[variant];
  const title = detail.startsWith(text) ? detail : `${text}：${detail}`;
  const label = (
    <>
      <span className={styles.full}>{text}</span>
      <span className={styles.short} aria-hidden="true">
        {SHORT[variant]}
      </span>
    </>
  );
  return (
    <span id={id} className={cx(styles.sync, styles[variant])} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} title={title}>
      {variant === "login" && onLogin ? (
        <button type="button" className={styles.loginBtn} onClick={onLogin}>
          {label}
        </button>
      ) : (
        label
      )}
    </span>
  );
}
