// 勤務状況チェック（重複・勤務時間・時間外・条件外・希望外）と集計

import { breakRoles, roleBase } from "./config";
import { orderedNames } from "./order";
import { canWorkAt, decided, dislikes, fitsSlot } from "./rules";
import { countedItems, flattened } from "./slots";
import { toMin } from "./time";
import type { Item, Model } from "./types";

/** 割当済みの枠（担当者名つき） */
export type AssignedItem = Item & { name: string };

export interface Audit {
  /** 同じ人が同じ時間に重なって入っている枠の key */
  conflicts: Set<string>;
  /** 氏名 → 日付 → 勤務時間（h）。昼食・休憩は含まない */
  hours: Record<string, Record<string, number>>;
  /** "氏名|日付" → その日の割当 */
  booked: Record<string, AssignedItem[]>;
}

/** 時間帯をつなげる（重なり・隣接をまとめる）。分で返す */
export function mergeSpans(items: readonly { start: string; end: string }[]): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const x of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    const last = spans[spans.length - 1];
    if (last && toMin(x.start) <= last.end) last.end = Math.max(last.end, toMin(x.end));
    else spans.push({ start: toMin(x.start), end: toMin(x.end) });
  }
  return spans;
}

export function assignmentAudit(m: Model): Audit {
  const assigned = flattened(m)
    .filter((item) => m.assignments[item.key])
    .map((item) => ({ ...item, name: m.assignments[item.key] }));
  const conflicts = new Set<string>(),
    hours: Audit["hours"] = {},
    booked: Audit["booked"] = {};
  for (const x of assigned) (booked[`${x.name}|${x.date}`] ??= []).push(x);
  for (const [id, items] of Object.entries(booked)) {
    const [name, date] = id.split("|");
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++)
        if (items[j].start < items[i].end && items[i].start < items[j].end) {
          conflicts.add(items[i].key);
          conflicts.add(items[j].key);
        }
    const spans = mergeSpans(items.filter((x) => !breakRoles.includes(x.role)));
    (hours[name] ??= {})[date] = spans.reduce((sum, sp) => sum + sp.end - sp.start, 0) / 60;
  }
  return { conflicts, hours, booked };
}

/** 参加者（メンバーの並び順。保存していなければ五十音順） */
export const allNames = (m: Model): string[] => orderedNames(m, m.availability.map((a) => a.name));

// やりたい役職を書いているのに、その役職に1つも入っていない人
export function wantsMissing(m: Model): { name: string; wants: string[]; none: boolean }[] {
  const got: Record<string, Set<string>> = {};
  for (const x of flattened(m)) {
    const n = m.assignments[x.key];
    if (n) (got[n] ??= new Set()).add(roleBase(x.role));
  }
  return allNames(m)
    .filter((n) => (m.memberWants[n] || []).length && !m.memberWants[n].some((r) => got[n]?.has(r)))
    .map((n) => ({ name: n, wants: m.memberWants[n], none: !got[n] }));
}

/** 勤務可能表では × の時間に入っている割当 */
export const offAssignments = (m: Model): Item[] =>
  flattened(m).filter((x) => m.assignments[x.key] && !canWorkAt(m, m.assignments[x.key], x));

/**
 * 条件外の割当：所属店舗・ステータス（番目ごと）・車の条件（fitsSlot）に合わない人が入っている枠。
 * 自動割当はこうならない。手で移動した（どの枠へも移せる）か、あとから条件を変えたときに起きる（割当は外さない）
 */
export const unfitAssignments = (m: Model): Item[] =>
  flattened(m).filter((x) => m.assignments[x.key] && !fitsSlot(m, m.assignments[x.key], x));

/** 苦手な役職への割当の数 */
export const dislikedCount = (m: Model): number =>
  flattened(m).filter((x) => m.assignments[x.key] && dislikes(m, m.assignments[x.key], x.role)).length;

/** 勤務状況チェックの表の1行：その日に参加しない日は null */
export function auditRow(m: Model, audit: Audit, name: string, dates: readonly string[]): { perDay: (number | null)[]; total: number } {
  const perDay = dates.map((date) =>
    m.availability.some((a) => a.name === name && a.date === date) ? audit.hours[name]?.[date] || 0 : null,
  );
  const total = perDay.reduce<number>((sum, h) => sum + (h || 0), 0);
  return { perDay, total };
}

/** 埋まり具合（cls：full / partial / empty / ""） */
export function fillOf(m: Model, list: readonly Item[]): { filled: number; total: number; cls: string } {
  const filled = list.filter((x) => decided(m, x.key)).length;
  return { filled, total: list.length, cls: !list.length ? "" : filled === list.length ? "full" : filled ? "partial" : "empty" };
}

/** ヘッダーのサマリー（旧 updateStats の数値） */
export function summaryStats(m: Model, audit: Audit = assignmentAudit(m)) {
  // 必要枠・未割当・充足率は人数の上限がない係を数えない（割当済みは数える）
  const items = countedItems(m),
    filled = flattened(m).filter((x) => m.assignments[x.key]).length,
    open = items.filter((x) => !decided(m, x.key)).length,
    rate = items.length ? Math.round(((items.length - open) / items.length) * 100) : 0,
    staff = new Set(m.availability.map((x) => x.name)).size;
  return { staff, slots: items.length, filled, open, conflicts: audit.conflicts.size, rate };
}
