// カレンダー配信の閲覧ページ（#cal=キー。ログイン不要）。名前を選ぶと、その人の予定の確認と、購読（webcal）・ファイルで取り込む（.ics）ができる。
// 選んだ人は URL（#cal=キー&m=ID）と、このブラウザ（localStorage）に残す。アプリ本体（store・共同編集）は起動しない

import { useEffect, useMemo, useState } from "react";
import { CALENDAR_TITLE, dayLabel, dayName, importIcs } from "../../domain";
import type { CalEvent } from "../../domain";
import { feedUrls, fetchMember, fetchPub } from "../../sync/calendarFeed";
import type { PubSummary } from "../../sync/calendarFeed";
import { Button, IconSprite, LinkButton, Notice, SearchInput } from "../components";
import styles from "./CalendarPage.module.css";

const hashParam = (k: string) => new URLSearchParams(location.hash.slice(1)).get(k) || "";
const STORE_KEY = "shift-cal-member";
const remembered = (key: string): string => {
  try {
    return localStorage.getItem(`${STORE_KEY}:${key}`) || "";
  } catch {
    return "";
  }
};
const remember = (key: string, id: string) => {
  try {
    localStorage.setItem(`${STORE_KEY}:${key}`, id);
  } catch {
    /* 保存できなくても使える */
  }
};
const fmtStamp = (d: Date | null) =>
  d ? d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function CalendarPage() {
  const key = hashParam("cal");
  const [pub, setPub] = useState<PubSummary | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [id, setId] = useState(() => hashParam("m") || remembered(key));

  useEffect(() => {
    fetchPub(key).then(setPub, (e: Error) => setError(e.message));
  }, [key]);

  const member = pub?.members.find((x) => x.id === id) || null;
  const choose = (next: string) => {
    setId(next);
    if (next) remember(key, next);
    history.replaceState(null, "", `#cal=${key}${next ? `&m=${next}` : ""}`);
  };

  return (
    <div className={styles.page}>
      <IconSprite />
      <header className={styles.head}>
        <p className={styles.eyebrow}>{pub?.title || "シフト"}</p>
        <h1 className={styles.title}>シフトをカレンダーに入れる</h1>
        {pub?.publishedAt ? <p className={styles.meta}>{`${fmtStamp(pub.publishedAt)} 配信の内容です`}</p> : null}
      </header>
      {error ? (
        <Notice tone="warn">{`${error}。時間をおいて読み込み直してください。`}</Notice>
      ) : pub === undefined ? (
        <p className={styles.meta} role="status">
          読み込み中…
        </p>
      ) : pub === null ? (
        <Notice tone="warn">このリンクのカレンダーは見つかりません。配信が止められたか、リンクが違います。シフト担当者に確認してください。</Notice>
      ) : member ? (
        <MemberPanel pubKey={key} member={member} onChange={() => choose("")} />
      ) : (
        <NamePicker members={pub.members} onPick={choose} />
      )}
    </div>
  );
}

function NamePicker({ members, onPick }: { members: PubSummary["members"]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.replace(/\s+/g, "");
    return t ? members.filter((x) => x.name.replace(/\s+/g, "").includes(t)) : members;
  }, [members, q]);
  return (
    <section className={styles.card} aria-labelledby="calPickTitle">
      <h2 id="calPickTitle" className={styles.h2}>
        自分の名前を選んでください
      </h2>
      <SearchInput id="calSearch" placeholder="名前で検索" aria-label="名前で検索" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <ul className={styles.names}>
        {shown.map((x) => (
          <li key={x.id}>
            <button type="button" className={styles.name} data-cal-member={x.id} onClick={() => onPick(x.id)}>
              {x.name}
            </button>
          </li>
        ))}
      </ul>
      {!shown.length ? <p className={styles.meta}>見つかりません。</p> : null}
    </section>
  );
}

function MemberPanel({ pubKey, member, onChange }: { pubKey: string; member: { id: string; name: string }; onChange: () => void }) {
  const [data, setData] = useState<{ events: CalEvent[]; ics: string } | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setData(undefined);
    fetchMember(pubKey, member.id).then(setData, (e: Error) => setError(e.message));
  }, [pubKey, member.id]);
  const urls = feedUrls(pubKey, member.id);
  const days = useMemo(() => {
    const out: [string, CalEvent[]][] = [];
    for (const e of data?.events || []) {
      const last = out[out.length - 1];
      if (last && last[0] === e.date) last[1].push(e);
      else out.push([e.date, [e]]);
    }
    return out;
  }, [data]);

  const download = () => {
    const blob = new Blob([importIcs(data!.ics)], { type: "text/calendar;charset=utf-8" }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `シフト_${member.name.replace(/[\\/:*?"<>|\s]+/g, "")}.ics`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(urls!.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("この URL をコピーしてください", urls!.https);
    }
  };

  return (
    <>
      <section className={styles.card} aria-labelledby="calWho">
        <div className={styles.who}>
          <h2 id="calWho" className={styles.h2}>
            {`${member.name} さんのシフト`}
          </h2>
          <Button id="calChange" variant="ghost" size="sm" onClick={onChange}>
            別の人を選ぶ
          </Button>
        </div>
        {error ? (
          <Notice tone="warn">{error}</Notice>
        ) : data === undefined ? (
          <p className={styles.meta} role="status">
            読み込み中…
          </p>
        ) : data === null ? (
          <Notice tone="warn">この人のカレンダーは見つかりません。名前を選び直してください。</Notice>
        ) : days.length ? (
          <div className={styles.days} id="calEvents">
            {days.map(([date, list], i) => (
              <div key={date} className={styles.day}>
                <h3 className={styles.dayHead}>
                  {dayName(date, i)}
                  <small>{dayLabel(date)}</small>
                </h3>
                <ul className={styles.events}>
                  {list.map((e) => (
                    <li key={`${e.start}-${e.summary}`}>
                      <span className={styles.time}>{`${e.start}–${e.end}`}</span>
                      <span>{e.summary}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.meta}>いまは担当がありません。購読しておくと、担当が決まったときにカレンダーに入ります。</p>
        )}
      </section>

      {data ? (
        <>
          {urls ? (
            <section className={styles.card} aria-labelledby="calSubTitle">
              <h2 id="calSubTitle" className={styles.h2}>
                購読する <span className={styles.rec}>おすすめ</span>
              </h2>
              <p className={styles.lead}>シフトが変わると、カレンダーにも自動で反映されます。「{`${CALENDAR_TITLE}（${member.name}）`}」という専用のカレンダーとして追加され、色や名前はカレンダーごとに変えられます。</p>
              <div className={styles.actions}>
                <LinkButton id="calWebcal" variant="primary" icon="cal" href={urls.webcal}>
                  iPhone・Mac のカレンダーで購読
                </LinkButton>
                <LinkButton id="calGoogle" icon="cal" href={urls.google} target="_blank" rel="noopener noreferrer">
                  Google カレンダーで購読
                </LinkButton>
                <Button id="calCopy" icon={copied ? "check" : "copy"} onClick={copy}>
                  {copied ? "コピーしました" : "URL をコピー"}
                </Button>
              </div>
              <ul className={styles.notes}>
                <li>Google カレンダーはスマホのアプリからは追加できません。パソコンのブラウザで開いて追加すると、スマホにも出ます。</li>
                <li>反映されるまでの時間はアプリ次第です（Google は数時間〜1日、iPhone は設定の「照会カレンダー」の更新間隔）。直前の変更はシフト担当者の連絡を優先してください。</li>
                <li>Android・Outlook などは「URL をコピー」して、カレンダーの「URL で追加」に貼り付けてください。</li>
              </ul>
            </section>
          ) : null}
          <section className={styles.card} aria-labelledby="calFileTitle">
            <h2 id="calFileTitle" className={styles.h2}>
              ファイルで取り込む
            </h2>
            <p className={styles.lead}>いま使っているカレンダーに、予定として入れます（色や種類を予定ごとに変えられます）。</p>
            <div className={styles.actions}>
              <Button id="calDownload" icon="download" onClick={download}>
                .ics ファイルをダウンロード
              </Button>
            </div>
            <ul className={styles.notes}>
              <li>
                <b>シフトが変わっても自動では変わりません。</b>変更の連絡があったら、前に取り込んだ予定を消してから取り込み直してください（予定のメモに配信の日時が書いてあります）。
              </li>
              <li>Google カレンダーはパソコンのブラウザの「設定 → インポート」から、取り込み先のカレンダーを選べます。</li>
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}
