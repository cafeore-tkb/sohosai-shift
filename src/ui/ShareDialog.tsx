// 共同編集のダイアログ（#shareDialog・本文 #shareBody）。中身は sync が store.ui.share に書き、操作は store.shareActions を呼ぶ。
// 状態：設定なし（disabled）・読み込み中・ログイン（#shareSignIn）・開始（#shareStartBtn）・参加中（リンク＋コピー、管理者の一覧、#adminForm #adminEmail）。
// 共同編集している人の表示（アバター）はない（バックエンドに在室の情報がないため。リードの判断）

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { store, useUi } from "../store";
import type { ShareDialogContent } from "../store";
import { Button, Dialog, Icon, Notice, Pill, Spacer, TextInput } from "./components";
import { SyncPill, syncLook } from "./layout/SyncBadge";
import styles from "./ShareDialog.module.css";

const act = () => store.shareActions!;

export function ShareDialog() {
  const open = useUi((u) => u.share.dialogOpen);
  const c = useUi((u) => u.share.dialog);
  const badge = useUi((u) => u.share.badge);
  const { body, footer } = c ? content(c) : { body: null, footer: null };
  const look = syncLook(badge);
  return (
    <Dialog
      id="shareDialog"
      bodyId="shareBody"
      title="共同編集"
      icon="users"
      open={open}
      onClose={() => store.shareActions?.close()}
      headExtra={c?.kind === "room" ? <SyncPill variant={look.variant} text={look.text} /> : null}
      footer={footer}
      className={styles.dialog}
    >
      {body}
    </Dialog>
  );
}

function content(c: ShareDialogContent): { body: ReactNode; footer: ReactNode } {
  switch (c.kind) {
    case "disabled":
      return {
        body: (
          <>
            <p>
              共同編集を使うには、Firebase の設定（<code className={styles.code}>firebase-config.js</code>）が必要です。設定方法は README を見てください。
            </p>
            <Notice tone="info" className={styles.notice}>
              この画面の操作はすべてこのブラウザ内で完結します。
            </Notice>
          </>
        ),
        footer: <Button data-close="">閉じる</Button>,
      };
    case "loading":
      return {
        body: (
          <p className={styles.loading} role="status">
            <span className={styles.pulse} aria-hidden="true" />
            読み込み中…
          </p>
        ),
        footer: null,
      };
    case "login":
      return {
        body: <p>{`${c.inRoom ? "この共同編集に参加するには" : "共同編集を使うには"}、Google アカウントでログインしてください。`}</p>,
        footer: (
          <>
            <Button variant="ghost" data-close="">
              閉じる
            </Button>
            <Button id="shareSignIn" variant="primary" icon="login" onClick={() => act().signIn()}>
              Google でログイン
            </Button>
          </>
        ),
      };
    case "start":
      return {
        body: (
          <>
            <Account email={c.email} />
            <p>いまのデータをもとに共同編集を始めます。発行されたリンクを共有すると、同じシフトを一緒に編集できます。</p>
            <ul className={styles.notes}>
              <li>リンクを持っていて Google ログインした人は、誰でも閲覧・編集できます。シフト担当者にだけ共有してください。</li>
              <li>始めた人が作成者（管理者）になります。管理者はあとから追加できます。</li>
              <li>勤務可能表（アンケートの回答）は参加者全員が修正できます。CSVの読み込み（回答の丸ごと置き換え）は管理者だけができます。</li>
            </ul>
          </>
        ),
        footer: (
          <>
            <Button variant="ghost" data-close="">
              キャンセル
            </Button>
            <Button id="shareStartBtn" variant="primary" icon="users" disabled={c.starting} onClick={() => act().start()}>
              {c.starting ? "作成中…" : "共同編集を始める"}
            </Button>
          </>
        ),
      };
    case "room":
      return {
        body: <RoomBody c={c} />,
        footer: (
          <>
            <Button id="shareLeaveBtn" variant="ghost" danger icon="leave" onClick={() => act().leave()}>
              このブラウザで共同編集を終了
            </Button>
            <Spacer />
            <Button data-close="">閉じる</Button>
          </>
        ),
      };
  }
}

/** ログイン中のアカウント（アバターは出さない：人の表示は在室の情報がないため使わない） */
function Account({ email }: { email: string }) {
  return (
    <div className={styles.acct}>
      <span className={styles.acctIcon} aria-hidden="true">
        <Icon name="person" />
      </span>
      <div className={styles.acctText}>
        <b>{email}</b>
        <small>Google アカウントでログイン中</small>
      </div>
      <Button id="shareSignOut" variant="ghost" size="sm" onClick={() => act().signOut()}>
        ログアウト
      </Button>
    </div>
  );
}

const COPIED_MS = 2000;

function RoomBody({ c }: { c: Extract<ShareDialogContent, { kind: "room" }> }) {
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const input = urlRef.current!;
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    setCopied(true);
  };

  return (
    <>
      <Account email={c.email} />
      <p>このリンクを共有すると、同じシフトを一緒に編集できます。</p>
      <div className={styles.linkbox}>
        <TextInput id="shareUrl" ref={urlRef} mono readOnly value={c.url} aria-label="共同編集のリンク" onFocus={(e) => e.currentTarget.select()} />
        <Button id="shareCopyBtn" variant="primary" icon={copied ? "check" : "copy"} onClick={copy} aria-live="polite">
          {copied ? "コピーしました" : "コピー"}
        </Button>
      </div>

      <section className={styles.admins} aria-labelledby="shareAdminsTitle">
        <h3 id="shareAdminsTitle" className={styles.adminsTitle}>
          管理者（CSVを読み込める人）
        </h3>
        <ul className={styles.adminList}>
          {c.admins.map((a) => (
            <li key={a}>
              <span className={styles.email}>{a}</span>
              {a === c.owner ? (
                <Pill tone="neutral">作成者</Pill>
              ) : c.isAdmin ? (
                <Button variant="ghost" size="sm" danger data-remove-admin={a} aria-label={`${a} を管理者から削除`} onClick={() => act().removeAdmin(a)}>
                  削除
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {c.isAdmin ? (
          <form
            key={c.admins.join()}
            id="adminForm"
            className={styles.linkbox}
            onSubmit={(e) => {
              e.preventDefault();
              act().addAdmin(emailRef.current!.value);
            }}
          >
            <TextInput
              id="adminEmail"
              ref={emailRef}
              type="email"
              placeholder="追加するGoogleアカウントのメールアドレス"
              aria-label="追加する管理者のメールアドレス"
              required
            />
            <Button type="submit" icon="plus">
              追加
            </Button>
          </form>
        ) : (
          <p className={styles.muted}>管理者の追加・削除は管理者だけができます。</p>
        )}
      </section>

      <ul className={styles.notes}>
        <li>リンクを持っていて Google ログインした人は、誰でも閲覧・編集できます。</li>
        <li>同じ枠を同時に変更した場合は、あとから変更した内容が残ります。</li>
        {c.updatedBy ? <li>{`最終更新：${c.updatedBy}${c.when ? `（${c.when}）` : ""}`}</li> : null}
      </ul>
    </>
  );
}
