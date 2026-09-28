// カレンダー配信の閲覧ページ（/shift＝名前の一覧とその下に全体のシフト、/shift/{名前}＝その人。ログイン不要。以前の /shift/all は /shift へ）。
// 表はシフト調整の「個人別」と同じ形（Timetable）。その人のページでは、購読（webcal）・ファイルで取り込む（.ics）ができる。
// 前に選んだ人はこのブラウザ（localStorage）に残し、一覧の上に出す。アプリ本体（store・共同編集）は起動しない

import { useEffect, useMemo, useState } from "react";
import { CALENDAR_TITLE, OVERVIEW_SLUG, expandSegs, fmt, importIcs, shortDay } from "../../domain";
import type { OverviewDay, OverviewSeg } from "../../domain";
import { feedUrls, fetchIcs, fetchOverview, fetchPub } from "../../sync/calendarFeed";
import type { PubSummary } from "../../sync/calendarFeed";
import { calendarUrl, currentRoute } from "../../sync/site";
import { Button, IconSprite, LinkButton, Notice, SearchInput, cx } from "../components";
import styles from "./CalendarPage.module.css";
import { OverviewPanel } from "./OverviewPanel";
import { Timetable } from "./Timetable";

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
  const [slug, setSlug] = useState(() => {
    if (initialSlug.toLowerCase() !== OVERVIEW_SLUG) return initialSlug;
    history.replaceState(null, "", calendarUrl());
    return "";
  });
  // 表（全体・個人で共用。必要になったら1回だけ読む）
  const [days, setDays] = useState<OverviewDay[] | null | undefined>(undefined);

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
  useEffect(() => {
    if (days === undefined && pub) fetchOverview().then(setDays, (e: Error) => setError(e.message));
  }, [days, pub]);
  const choose = (next: string) => {
    setSlug(next);
    history.pushState(null, "", calendarUrl(next));
    scrollTo(0, 0);
  };
  const last = pub?.members.find((x) => x.slug === remembered()) || null;

  const list = !!pub && !member;
  return (
    // 名前の一覧のページは、全体のシフトの表に合わせて横に広い（上の部分は画面の幅で、表を横にスクロールしても左に残る）
    <div className={list ? styles.shell : undefined}>
      <div className={cx(styles.page, list && styles.pageWide)}>
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
          <>
            <Nav onBack={() => choose("")} />
            <MemberPanel member={member} days={days} />
          </>
        ) : (
          <>
            {slug ? <Notice tone="warn">{`「${slug}」さんは見つかりません。一覧から名前を選んでください。`}</Notice> : null}
            <NamePicker members={pub.members} last={last} onPick={choose} />
          </>
        )}
      </div>
      {/* 全体のシフト：名前の一覧の下。表は画面の幅に収めず、ページごと縦横にスクロールする（見出しと時間は固定） */}
      {list ? (
        <div className={styles.full} id="calAllSection">
          {days ? <OverviewPanel days={days} members={pub.members} mine={remembered()} onPick={choose} /> : <Loading done={days === null} />}
        </div>
      ) : null}
    </div>
  );
}

/** 一覧（と全体のシフト）へ戻るリンク */
function Nav({ onBack }: { onBack: () => void }) {
  const go = (f: () => void) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    f();
  };
  return (
    <nav className={styles.nav}>
      <LinkButton id="calBack" variant="ghost" size="sm" icon="back" href={calendarUrl()} onClick={go(onBack)}>
        名前の一覧・全体のシフト
      </LinkButton>
    </nav>
  );
}

function Loading({ done }: { done: boolean }) {
  return done ? (
    <Notice tone="warn">表が見つかりません。配信し直してもらってください。</Notice>
  ) : (
    <p className={styles.meta} role="status">
      読み込み中…
    </p>
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
      <p className={styles.last}>
        <LinkButton
          id="calAllLink"
          size="sm"
          icon="grid"
          href="#calAllSection"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("calAllSection")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          全体のシフトを見る（この下）
        </LinkButton>
      </p>
      <SearchInput id="calSearch" placeholder="名前で検索" aria-label="名前で検索" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <ul className={styles.names}>
        {shown.map((x) => (
          <li key={x.id}>
            <a
              className={styles.name}
              href={calendarUrl(x.slug)}
              data-cal-member={x.slug}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
                e.preventDefault();
                onPick(x.slug);
              }}
            >
              {x.name}
            </a>
          </li>
        ))}
      </ul>
      {!shown.length ? <p className={styles.meta}>見つかりません。</p> : null}
    </section>
  );
}

/** その人の列を日ごとに並べる（行＝その人が参加する日の時間をあわせたもの。その日にない時間は null） */
function personColumns(days: readonly OverviewDay[], name: string) {
  const mine = days.flatMap((d) => {
    const i = d.people.findIndex((p) => p.name === name);
    return i < 0 ? [] : [{ day: d, hours: d.people[i].hours, cells: expandSegs(d.cols[i]) }];
  });
  const hours = [...new Set(mine.flatMap((x) => x.day.hours))].sort();
  return {
    hours,
    total: mine.reduce((t, x) => t + x.hours, 0),
    columns: mine.map(({ day, hours: h, cells }) => {
      const at = new Map(day.hours.map((t, r): [string, OverviewSeg] => [t, cells[r]]));
      return {
        key: day.date,
        title: `${day.name} ${shortDay(day.date)}（${fmt(h)}）`,
        cells: hours.map((t) => at.get(t) || null),
        head: (
          <>
            <span className={styles.headName}>{day.name}</span>
            <small>{`${shortDay(day.date)}・${fmt(h)}`}</small>
          </>
        ),
      };
    }),
  };
}

function MemberPanel({ member, days }: { member: Member; days: OverviewDay[] | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const urls = feedUrls(member.slug);
  const table = useMemo(() => (days ? personColumns(days, member.name) : null), [days, member.name]);

  const download = async () => {
    setBusy(true);
    try {
      const ics = await fetchIcs(member.id);
      if (!ics) return alert("この人のカレンダーは見つかりません。配信し直してもらってください。");
      const blob = new Blob([importIcs(ics)], { type: "text/calendar;charset=utf-8" }),
        a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `シフト_${member.slug}.ics`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      alert(`ダウンロードできませんでした：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
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
          {table ? <span className={styles.meta}>{`合計 ${fmt(table.total)}`}</span> : null}
        </div>
        {days === undefined ? (
          <Loading done={false} />
        ) : !table ? (
          <Loading done />
        ) : table.columns.length ? (
          <div className={styles.tableBox} id="calEvents">
            <Timetable hours={table.hours} columns={table.columns} label={`${member.name} さんのシフト`} wide />
          </div>
        ) : (
          <p className={styles.meta}>いまは参加する日がありません。購読しておくと、シフトが決まったときにカレンダーに入ります。</p>
        )}
        <p className={styles.meta}>斜線は参加できない時間、灰色はその日にない時間です。勤務時間に昼食・休憩は含みません。</p>
      </section>

      <section className={styles.card} aria-labelledby="calSubTitle">
        <h2 id="calSubTitle" className={styles.h2}>
          購読する <span className={styles.rec}>おすすめ</span>
        </h2>
        <p className={styles.lead}>
          シフトが変わると、カレンダーにも自動で反映されます。「{`${CALENDAR_TITLE}（${member.name}）`}
          」という専用のカレンダーとして追加され、色や名前はカレンダーごとに変えられます。
        </p>
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
          <li>
            反映されるまでの時間はアプリ次第です（Google は数時間〜1日、iPhone
            は設定の「照会カレンダー」の更新間隔）。直前の変更はシフト担当者の連絡を優先してください。
          </li>
          <li>Android・Outlook などは「URL をコピー」して、カレンダーの「URL で追加」に貼り付けてください。</li>
        </ul>
      </section>
      <section className={styles.card} aria-labelledby="calFileTitle">
        <h2 id="calFileTitle" className={styles.h2}>
          ファイルで取り込む
        </h2>
        <p className={styles.lead}>いま使っているカレンダーに、予定として入れます（色や種類を予定ごとに変えられます）。</p>
        <div className={styles.actions}>
          <Button id="calDownload" icon="download" disabled={busy} onClick={() => void download()}>
            .ics ファイルをダウンロード
          </Button>
        </div>
        <ul className={styles.notes}>
          <li>
            <b>シフトが変わっても自動では変わりません。</b>
            変更の連絡があったら、前に取り込んだ予定を消してから取り込み直してください（予定のメモに配信の日時が書いてあります）。
          </li>
          <li>Google カレンダーはパソコンのブラウザの「設定 → インポート」から、取り込み先のカレンダーを選べます。</li>
        </ul>
      </section>
    </>
  );
}
