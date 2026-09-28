// 勤務状況チェックの「直したほうがよい枠」：重複・勤務できない時間・条件外・苦手な役職の割当を、人と日ごとにまとめる
// （ドロワーのカードの文と「表で見る」の枠。旧版はバッジと名前の一覧だけだった＝表示の追加で、Model は変えない）

import { dayName, groupOrder } from "./config";
import { dislikes } from "./rules";
import { eventDates, flattened } from "./slots";
import { itemLabel } from "./labels";
import type { Audit } from "./audit";
import { offAssignments, unfitAssignments } from "./audit";
import type { Item, Model } from "./types";

/** 1人・1日ぶんの問題 */
export interface AuditIssue {
  name: string;
  date: string;
  /** その人のその日の該当する枠（時間順） */
  keys: string[];
  /** 「表で見る」で見せる枠（いちばん早いもの） */
  first: string;
  /** 例：「本番1日目 14:00–15:00 本店・ホール 1 ／ 2号店・レジ」 */
  where: string;
}

export interface AuditIssues {
  conflicts: AuditIssue[];
  offs: AuditIssue[];
  /** 所属店舗・ステータス・車の条件に合わない割当（条件外） */
  unfits: AuditIssue[];
  dislikes: AuditIssue[];
}

interface Run {
  start: string;
  end: string;
  label: string;
  /** 店舗の並び（表と同じ：準備・本店・2号店・くれあ・美化） */
  group: number;
}

/** 同じ番目で続いている枠を1つの時間帯にまとめる */
function runsOf(items: readonly Item[]): Run[] {
  const byPos = new Map<string, Item[]>();
  for (const x of items) {
    const k = `${x.store}|${x.role}|${x.occ}`;
    const list = byPos.get(k);
    if (list) list.push(x);
    else byPos.set(k, [x]);
  }
  const runs: Run[] = [];
  for (const list of byPos.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    let cur: Run | null = null;
    for (const x of sorted) {
      if (cur && cur.end === x.start) cur.end = x.end;
      else runs.push((cur = { start: x.start, end: x.end, label: itemLabel(x), group: groupOrder.indexOf(x.store) }));
    }
  }
  return runs.sort((a, b) => a.start.localeCompare(b.start) || a.group - b.group || a.label.localeCompare(b.label, "ja"));
}

/** 時間帯がすべて同じなら「14:00–15:00 A ／ B」、違えば「10:00–11:00 A ／ 12:00–12:30 B」 */
function describe(runs: readonly Run[]): string {
  const same = runs.every((r) => r.start === runs[0].start && r.end === runs[0].end);
  return same
    ? `${runs[0].start}–${runs[0].end} ${runs.map((r) => r.label).join(" ／ ")}`
    : runs.map((r) => `${r.start}–${r.end} ${r.label}`).join(" ／ ");
}

/** 枠を人・日ごとにまとめる（日付順・時間順） */
export function groupIssues(m: Model, items: readonly Item[]): AuditIssue[] {
  const dates = eventDates(m);
  const groups = new Map<string, Item[]>();
  for (const x of items) {
    const name = m.assignments[x.key];
    if (!name) continue;
    const k = `${name}|${x.date}`;
    const list = groups.get(k);
    if (list) list.push(x);
    else groups.set(k, [x]);
  }
  const out: AuditIssue[] = [];
  for (const [k, list] of groups) {
    const [name, date] = k.split("|");
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    out.push({
      name,
      date,
      keys: sorted.map((x) => x.key),
      first: sorted[0].key,
      where: `${dayName(date, dates.indexOf(date))} ${describe(runsOf(sorted))}`,
    });
  }
  const order = (d: string) => (dates.includes(d) ? dates.indexOf(d) : dates.length);
  return out.sort(
    (a, b) =>
      order(a.date) - order(b.date) || a.date.localeCompare(b.date) || a.where.localeCompare(b.where) || a.name.localeCompare(b.name, "ja"),
  );
}

/** 勤務状況チェックのカード（重複・勤務できない時間・条件外・苦手な役職） */
export function auditIssues(m: Model, audit: Audit): AuditIssues {
  const all = flattened(m);
  return {
    conflicts: groupIssues(
      m,
      all.filter((x) => audit.conflicts.has(x.key)),
    ),
    offs: groupIssues(m, offAssignments(m)),
    unfits: groupIssues(m, unfitAssignments(m)),
    dislikes: groupIssues(
      m,
      all.filter((x) => m.assignments[x.key] && dislikes(m, m.assignments[x.key], x.role)),
    ),
  };
}
