// 全体のシフト（/shift の名前の一覧の下）：日を選ぶと、シフト調整の「個人別」と同じ表（行：時間、列：その日の参加者、担当は縦の枠）。
// 見出しの名前を押すとその人のページ（/shift/{名前}）。前に選んだ人（このブラウザ）の列は色を付ける

import { useMemo, useState } from "react";
import { dayLabel, expandSegs, fmt } from "../../domain";
import type { OverviewDay } from "../../domain";
import type { PubSummary } from "../../sync/calendarFeed";
import { calendarUrl } from "../../sync/site";
import { SegButton, Segmented, Switch } from "../components";
import styles from "./CalendarPage.module.css";
import { Timetable } from "./Timetable";

type Member = PubSummary["members"][number];

export function OverviewPanel({
  days,
  members,
  mine,
  onPick,
}: {
  days: OverviewDay[];
  members: Member[];
  mine: string;
  onPick: (slug: string) => void;
}) {
  // 今日が配信の日ならその日、そうでなければ最初の日
  const [date, setDate] = useState(() => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    return days.find((x) => x.date === today)?.date || days[0]?.date || "";
  });
  const [full, setFull] = useState(false);
  const byName = useMemo(() => new Map(members.map((x) => [x.name, x])), [members]);
  const day = days.find((d) => d.date === date);
  const columns = useMemo(
    () =>
      (day?.people || []).map((p, i) => {
        const m = byName.get(p.name);
        return {
          key: p.name,
          title: `${p.name}（${fmt(p.hours)}）`,
          mine: !!m && m.slug === mine,
          cells: expandSegs(day!.cols[i]),
          head: (
            <a
              className={styles.headLink}
              href={m ? calendarUrl(m.slug) : undefined}
              onClick={(e) => {
                if (!m || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
                e.preventDefault();
                onPick(m.slug);
              }}
            >
              <span className={styles.headName}>{full ? p.name : m?.short || p.name}</span>
              <small>{fmt(p.hours)}</small>
            </a>
          ),
        };
      }),
    [day, byName, mine, full, onPick],
  );

  return (
    <section className={styles.card} aria-labelledby="calAllTitle">
      <div className={styles.who}>
        <h2 id="calAllTitle" className={styles.h2}>
          全体のシフト
        </h2>
        <Switch label="フルネーム" checked={full} onChange={(e) => setFull(e.currentTarget.checked)} />
      </div>
      <Segmented label="日付" className={styles.daySeg}>
        {days.map((d) => (
          <SegButton key={d.date} pressed={d.date === date} sub={dayLabel(d.date)} data-cal-day={d.date} onClick={() => setDate(d.date)}>
            {d.name}
          </SegButton>
        ))}
      </Segmented>
      {day && day.people.length ? (
        <div className={styles.tableBox} id="calAll">
          <Timetable hours={day.hours} columns={columns} label={`${day.name} 全体のシフト`} />
        </div>
      ) : (
        <p className={styles.meta}>この日の参加者はいません。</p>
      )}
      <p className={styles.meta}>名前を押すと、その人のシフトとカレンダーへの追加。斜線は参加できない時間です。</p>
    </section>
  );
}
