// アンケート回答 CSV の編集（/mock のページ）：読み込んだ CSV を Model に入れ、表で直して、同じ形式の CSV に書き出す。
// 読み込みはアプリと同じ importSurvey（Attendar 形式も読める）。書き出しはサンプル（mockSurvey.ts）と同じ列・形式

import { eventDays, gradeOf } from "./config";
import { csvLine } from "./csv";
import { importSurvey } from "./importSurvey";
import { MOCK_SURVEY_HEADERS } from "./mockSurvey";
import { createModel } from "./model";
import { iceOf } from "./parse";
import { toHM } from "./time";
import type { Availability, Model } from "./types";

export interface SurveyDoc {
  m: Model;
  /** メンバー（CSV の順。勤務可能時間のない人も残す） */
  names: string[];
}

/** メンバーごとの値の置き場所（名前を変える・消すときに全部たどる） */
const memberMaps = (m: Model) =>
  [
    m.memberStatuses,
    m.memberStores,
    m.memberWants,
    m.memberDislikes,
    m.memberDrips,
    m.memberCars,
    m.memberWorkload,
    m.memberKana,
    m.memberGrade,
    m.memberOrder,
  ] as Record<string, unknown>[];

/** CSV を読む（読めなければ importSurvey と同じ Error）。warns は判別できなかった回答など */
export function readSurvey(text: string): SurveyDoc & { warns: string[] } {
  const m = createModel();
  const { warns } = importSurvey(m, text);
  const names = [...new Set([...m.availability.map((a) => a.name), ...memberMaps(m).flatMap((x) => Object.keys(x))])];
  return { m, names, warns };
}

export const emptySurvey = (): SurveyDoc => ({ m: createModel(), names: [] });

/** 表の日付の列：前日準備・本番の日と、CSV にあるほかの日 */
export const surveyDates = (d: SurveyDoc): string[] =>
  [...new Set([...Object.keys(eventDays), ...d.m.availability.map((a) => a.date)])].sort();

const spansOf = (m: Model, name: string, date?: string): Availability[] =>
  m.availability
    .filter((a) => a.name === name && (date === undefined || a.date === date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

/** "10:00" → "10"、"10:30" → "10:30" */
const short = (t: string) => (t.endsWith(":00") ? String(Number(t.slice(0, 2))) : t.replace(/^0/, ""));

/** その日の勤務可能時間の表示（例："10-14 16:30-20"。不参加は ""） */
export const spansText = (d: SurveyDoc, name: string, date: string): string =>
  spansOf(d.m, name, date)
    .map((a) => `${short(a.start)}-${short(a.end)}`)
    .join(" ");

/** "10" "10:30" "1030" → 分（読めなければ NaN） */
const readTime = (s: string): number => {
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return NaN;
  const h = Number(m[1]),
    min = Number(m[2] || 0);
  return min < 60 && h * 60 + min <= 24 * 60 ? h * 60 + min : NaN;
};

/**
 * その日の勤務可能時間を置き換える。"10-14 16:30-20"（区切りは空白・読点・カンマ、範囲は - ~ 〜 など）。
 * 空なら不参加。読めない・開始が終了より後なら false（何も変えない）
 */
export function setSpans(d: SurveyDoc, name: string, date: string, text: string): boolean {
  const parts = text
    .normalize("NFKC")
    .split(/[\s,、，]+/)
    .filter(Boolean);
  const spans: Availability[] = [];
  for (const p of parts) {
    const r = p.match(/^([\d:]+)[-~〜～−–—]([\d:]+)$/);
    const s = r ? readTime(r[1]) : NaN,
      e = r ? readTime(r[2]) : NaN;
    if (!(s < e)) return false;
    spans.push({ name, date, start: toHM(s), end: e === 24 * 60 ? "24:00" : toHM(e) });
  }
  d.m.availability = [...d.m.availability.filter((a) => !(a.name === name && a.date === date)), ...spans];
  return true;
}

/** メンバーを足す（空・同じ名前がいれば false） */
export function addSurveyMember(d: SurveyDoc, name: string): boolean {
  const n = name.normalize("NFC").trim();
  if (!n || d.names.includes(n)) return false;
  d.names.push(n);
  return true;
}

/** 名前を変える（空・同じ名前がいれば false） */
export function renameSurveyMember(d: SurveyDoc, from: string, to: string): boolean {
  const n = to.normalize("NFC").trim();
  if (!n || n === from || d.names.includes(n)) return false;
  d.names = d.names.map((x) => (x === from ? n : x));
  for (const map of memberMaps(d.m))
    if (from in map) {
      map[n] = map[from];
      delete map[from];
    }
  for (const a of d.m.availability) if (a.name === from) a.name = n;
  return true;
}

export function removeSurveyMember(d: SurveyDoc, name: string): void {
  d.names = d.names.filter((x) => x !== name);
  for (const map of memberMaps(d.m)) delete map[name];
  d.m.availability = d.m.availability.filter((a) => a.name !== name);
}

/**
 * アンケート回答 CSV（サンプルと同じ列。BOM つき、改行は LF、末尾に改行なし）。1行＝1人の1つの時間帯。
 * 勤務可能時間のない人は日付・時刻を空にした1行（読み込むとメンバーだけ入る）
 */
export function surveyCsv(d: SurveyDoc): string {
  const { m } = d;
  const rows: string[][] = [[...MOCK_SURVEY_HEADERS]];
  for (const name of d.names) {
    const status = m.memberStatuses[name] || "",
      profile = [
        name,
        m.memberKana[name] || "",
        gradeOf(m.memberGrade[name]),
        status === "未設定" ? "" : status,
        (m.memberStores[name] || []).join(", "),
        iceOf(m.memberDrips[name]),
        name in m.memberCars ? (m.memberCars[name] ? "あり" : "なし") : "",
        (m.memberWants[name] || []).join(", "),
        (m.memberDislikes[name] || []).join(", "),
        m.memberWorkload[name] || "",
      ];
    const spans = spansOf(m, name);
    if (!spans.length) rows.push([...profile, "", "", ""]);
    for (const a of spans) rows.push([...profile, a.date, a.start, a.end]);
  }
  return "﻿" + rows.map(csvLine).join("\n");
}
