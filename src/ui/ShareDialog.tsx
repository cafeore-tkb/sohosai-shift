// 共同編集のダイアログ（#shareDialog・本文 #shareBody）。中身は sync が store.ui.share に書き、操作は store.shareActions を呼ぶ。
// 状態：設定なし（disabled）・読み込み中・ログイン（#shareSignIn）・開始（#shareStartBtn）・参加中（リンク＋コピー、管理者の一覧、#adminForm #adminEmail、
// 編集できる人 #editorForm #editorEmail、カレンダー配信 #calPublishBtn #calUrl）・本番の部屋への案内（goto）・登録されていないアカウント（denied）。
// 共同編集している人の表示（アバター）はない（バックエンドに在室の情報がないため。リードの判断）

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { publicationDigest } from "../domain";
import { store, useModelVersion, useUi } from "../store";
import type { CalendarShare, ShareDialogContent } from "../store";
import { Button, Dialog, Icon, LinkButton, Notice, Pill, Spacer, TextInput } from "./components";
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
    case "goto":
      return {
        body: (
          <>
            <Account email={c.email} />
            <p>本番のシフトの共同編集は、専用のページで行います。編集できるのは、管理者が登録した人だけです。</p>
            <p className={styles.muted}>このページ（{location.host}/）はローカル用です。データはこのブラウザの中だけで扱い、ほかの人とは共有されません。</p>
          </>
        ),
        footer: (
          <>
            <Button variant="ghost" data-close="">
              閉じる
            </Button>
            <LinkButton id="shareGotoBtn" variant="primary" icon="users" href={c.url}>
              本番の共同編集を開く
            </LinkButton>
          </>
        ),
      };
    case "denied":
      return {
        body: (
          <>
            <Account email={c.email} />
            <Notice tone="warn">このアカウントは、本番のシフトを編集できる人に登録されていません。</Notice>
            <p>
              管理者に、このメールアドレス（<b>{c.email}</b>）を「編集できる人」に追加してもらってから、読み込み直してください。別のアカウントで入る場合は、ログアウトしてからログインし直してください。
            </p>
          </>
        ),
        footer: (
          <>
            <LinkButton variant="ghost" href="/">
              ローカルで使う
            </LinkButton>
            <Spacer />
            <Button variant="primary" icon="reset" onClick={() => location.reload()}>
              読み込み直す
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

/** 読み取り専用のリンク＋コピー */
function CopyLink({ id, btnId, value, label }: { id: string; btnId: string; value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

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
    <div className={styles.linkbox}>
      <TextInput id={id} ref={urlRef} mono readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <Button id={btnId} variant="primary" icon={copied ? "check" : "copy"} onClick={copy} aria-live="polite">
        {copied ? "コピーしました" : "コピー"}
      </Button>
    </div>
  );
}

function RoomBody({ c }: { c: Extract<ShareDialogContent, { kind: "room" }> }) {
  const emailRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Account email={c.email} />
      <p>このリンクを共有すると、同じシフトを一緒に編集できます。</p>
      <CopyLink id="shareUrl" btnId="shareCopyBtn" value={c.url} label="共同編集のリンク" />

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

      {c.editors ? <EditorsSection editors={c.editors} isAdmin={c.isAdmin} /> : null}
      {c.calendar.enabled ? <CalendarSection cal={c.calendar} isAdmin={c.isAdmin} /> : null}

      <ul className={styles.notes}>
        <li>{c.editors ? "閲覧・編集できるのは、管理者と「編集できる人」に登録した人だけです。" : "リンクを持っていて Google ログインした人は、誰でも閲覧・編集できます。"}</li>
        <li>同じ枠を同時に変更した場合は、あとから変更した内容が残ります。</li>
        {c.updatedBy ? <li>{`最終更新：${c.updatedBy}${c.when ? `（${c.when}）` : ""}`}</li> : null}
      </ul>
    </>
  );
}

/** カレンダー配信（個人TT）：管理者が配信した時点の内容を、共通リンクからメンバーが購読・取り込みできる */
function CalendarSection({ cal, isAdmin }: { cal: CalendarShare; isAdmin: boolean }) {
  const version = useModelVersion();
  // 今の Model の digest（配信した内容と比べて「未配信の変更あり」を出す）
  const digest = useMemo(() => (cal.published ? publicationDigest(store.model) : ""), [cal.published, version]);
  const dirty = !!cal.published && digest !== cal.published.digest;
  const live = !!cal.published && !!cal.url;
  return (
    <section className={styles.admins} aria-labelledby="calTitle">
      <h3 id="calTitle" className={styles.adminsTitle}>
        カレンダー配信（個人TT）
      </h3>
      {live ? (
        <>
          <p>メンバーにはこのリンクだけを共有します。名前を選ぶと、自分のシフトをカレンダーに購読・取り込みできます（ログイン不要・検索エンジンには載りません）。個人のページは「/shift/名前」です。</p>
          <CopyLink id="calUrl" btnId="calCopyBtn" value={cal.url} label="カレンダーの共通リンク" />
          <p className={styles.muted}>
            {`最終配信：${cal.published!.by}${cal.published!.when ? `（${cal.published!.when}）` : ""}`}
            {dirty ? (
              <>
                {" "}
                <Pill tone="warn">未配信の変更あり</Pill>
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p className={styles.muted}>
          いまは配信していません。
          配信すると、メンバーが /shift から自分のシフトをカレンダーに入れられます。配信した時点の内容だけが見え、編集中の内容は「配信」を押すまで届きません。
        </p>
      )}
      {isAdmin ? (
        <div className={styles.linkbox}>
          <Button id="calPublishBtn" variant={live ? "secondary" : "primary"} icon="cal" disabled={cal.publishing} onClick={() => act().publish()}>
            {cal.publishing ? "配信中…" : live ? "いまの内容で配信し直す" : "配信する"}
          </Button>
          {live ? (
            <Button id="calStopBtn" variant="ghost" danger onClick={() => act().unpublish()}>
              配信を止める
            </Button>
          ) : null}
        </div>
      ) : (
        <p className={styles.muted}>配信は管理者だけができます。</p>
      )}
    </section>
  );
}

/** 編集できる人（本番の部屋）：管理者のほかに、閲覧・編集できる Google アカウント */
function EditorsSection({ editors, isAdmin }: { editors: string[]; isAdmin: boolean }) {
  const emailRef = useRef<HTMLInputElement>(null);
  return (
    <section className={styles.admins} aria-labelledby="shareEditorsTitle">
      <h3 id="shareEditorsTitle" className={styles.adminsTitle}>
        編集できる人
      </h3>
      {editors.length ? (
        <ul className={styles.adminList}>
          {editors.map((a) => (
            <li key={a}>
              <span className={styles.email}>{a}</span>
              {isAdmin ? (
                <Button variant="ghost" size="sm" danger data-remove-editor={a} aria-label={`${a} を編集できる人から削除`} onClick={() => act().removeEditor(a)}>
                  削除
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>まだいません（管理者だけが編集できます）。</p>
      )}
      {isAdmin ? (
        <form
          key={editors.join()}
          id="editorForm"
          className={styles.linkbox}
          onSubmit={(e) => {
            e.preventDefault();
            act().addEditor(emailRef.current!.value);
          }}
        >
          <TextInput
            id="editorEmail"
            ref={emailRef}
            type="email"
            placeholder="追加するGoogleアカウントのメールアドレス"
            aria-label="追加する編集できる人のメールアドレス"
            required
          />
          <Button type="submit" icon="plus">
            追加
          </Button>
        </form>
      ) : (
        <p className={styles.muted}>編集できる人の追加・削除は管理者だけができます。</p>
      )}
    </section>
  );
}
