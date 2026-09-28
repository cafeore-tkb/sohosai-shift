// カレンダー配信の閲覧ページ（/shift＝名前の一覧、/shift/{名前}＝その人。ログイン不要）。その人の予定の確認と、購読（webcal）・ファイルで取り込む（.ics）ができる。
// 前に選んだ人はこのブラウザ（localStorage）に残し、一覧の上に出す。アプリ本体（store・共同編集）は起動しない

import { useEffect, useMemo, useState } from "react";
import { CALENDAR_TITLE, dayLabel, dayName, importIcs } from "../../domain";
import type { CalEvent } from "../../domain";
import { feedUrls, fetchMember, fetchPub } from "../../sync/calendarFeed";
import type { PubSummary } from "../../sync/calendarFeed";
import { calendarUrl, currentRoute } from "../../sync/site";
import { Button, IconSprite, LinkButton, Notice, SearchInput } from "../components";
import styles from "./CalendarPage.module.css";

type Member = PubSummary["members"][number];
const STORE_KEY = "shift-cal-member";
const remembered = (): string => {
  try {
    return localStorage.getItem(STORE_KEY) || "";
  } catch {
    return "";
  }
};
const remember = (slug: string) => {
  try {
    localStorage.setItem(STORE_KEY, slug);
  } catch {
    /* 保存できなくても使える */
  }
};
const fmtStamp = (d: Date | null) =>
  d ? d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function CalendarPage({ initialSlug }: { initialSlug: string }) {
  const [pub, setPub] = useState<PubSummary | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState(initialSlug);

  useEffect(() => {
    fetchPub().then(setPub, (e: Error) => setError(e.message));
    // ブラウザの戻る・進む
    const onPop = () => {
      const r = currentRoute();
      setSlug(r.kind === "calendar" ? r.slug : "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const member = pub?.members.find((x) => x.slug === slug) || null;
  useEffect(() => {
    if (member) {
      remember(member.slug);
      document.title = `${member.name} さんのシフト`;
    } else document.title = "シフトをカレンダーに入れる";
  }, [member]);
  const choose = (next: string) => {
    setSlug(next);
    history.pushState(null, "", calendarUrl(next));
    scrollTo(0, 0);
  };
  const last = pub?.members.find((x) => x.slug === remembered()) || null;

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
        <Notice tone="warn">いまはカレンダーを配信していません。シフト担当者に確認してください。</Notice>
      ) : member ? (
        <MemberPanel member={member} onChange={() => choose("")} />
      ) : (
        <>
          {slug ? <Notice tone="warn">{`「${slug}」さんは見つかりません。一覧から名前を選んでください。`}</Notice> : null}
          <NamePicker members={pub.members} last={last} onPick={choose} />
        </>
      )}
    </div>
  );
}

function NamePicker({ members, last, onPick }: { members: Member[]; last: Member | null; onPick: (slug: string) => void }) {
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
      {last ? (
        <p className={styles.last}>
          前回：
          <button type="button" className={styles.name} data-cal-last={last.slug} onClick={() => onPick(last.slug)}>
            {last.name}
          </button>
        </p>
      ) : null}
      <SearchInput id="calSearch" placeholder="名前で検索" aria-label="名前で検索" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <ul className={styles.names}>
        {shown.map((x) => (
          <li key={x.id}>
            <a className={styles.name} href={calendarUrl(x.slug)} data-cal-member={x.slug} onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
                e.preventDefault();
                onPick(x.slug);
              }}>
              {x.name}
            </a>
          </li>
        ))}
      </ul>
      {!shown.length ? <p className={styles.meta}>見つかりません。</p> : null}
    </section>
  );
}

function MemberPanel({ member, onChange }: { member: Member; onChange: () => void }) {
  const [data, setData] = useState<{ events: CalEvent[]; ics: string } | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setData(undefined);
    fetchMember(member.id).then(setData, (e: Error) => setError(e.message));
  }, [member.id]);
  const urls = feedUrls(member.slug);
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
    a.download = `シフト_${member.slug}.ics`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(urls.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("この URL をコピーしてください", urls.https);
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
