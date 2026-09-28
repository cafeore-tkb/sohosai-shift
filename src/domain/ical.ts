// 個人TTのカレンダー（iCalendar / .ics）。メンバーごとに、その人の担当を時間順につないだ予定を作る。
// 配信（Firestore の pubs/{キー}）に置いた文字列を、購読（Worker 経由の webcal）とダウンロードの両方で使う（中身は1か所で作る）

import { eventDates } from "./slots";
import { personSegments } from "./cells";
import { allNames } from "./audit";
import type { Model } from "./types";

export const CALENDAR_TITLE = "雙峰祭シフト";

/** カレンダーの1件（時刻は日本時間の "HH:MM"） */
export interface CalEvent {
  date: string;
  start: string;
  end: string;
  summary: string;
}

/** 配信する中身（pubs/{キー} に置く） */
export interface Publication {
  /** メンバーの並び順 */
  members: { id: string; name: string }[];
  /** id → その人の予定（閲覧ページの確認用） */
  events: Record<string, CalEvent[]>;
  /** id → その人の .ics */
  ics: Record<string, string>;
  /** 予定の中身から作る値。いまの Model の digest と違えば「未配信の変更あり」 */
  digest: string;
}

// 文字列 → 53ビットのハッシュ（cyrb53）。暗号用ではない（ID と変更の検出だけに使う）
function hash53(s: string): number {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const hashHex = (s: string) => hash53(s).toString(16).padStart(14, "0");

/**
 * 氏名 → カレンダーの ID（"m" + 16進14桁）。名前が同じなら配信し直しても同じ（購読の URL が変わらない）。
 * ID は Firestore のフィールド名と URL にそのまま使える文字だけ
 */
export function calendarIds(names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {},
    used = new Set<string>();
  for (const name of names) {
    let id = `m${hashHex(name)}`;
    for (let n = 2; used.has(id); n++) id = `m${hashHex(`${name}#${n}`)}`;
    used.add(id);
    out[name] = id;
  }
  return out;
}

/** その人の予定（日付順・時間順。同じ担当が続く時間は1件にまとめる。昼食・休憩も含む） */
export function memberEvents(m: Model, name: string): CalEvent[] {
  return eventDates(m).flatMap((date) => personSegments(m, name, date).map((s) => ({ date, start: s.start, end: s.end, summary: s.label })));
}

// ---- iCalendar の書式 ----

const escText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// 1行は75オクテットまで（UTF-8）。超える分は「改行＋空白」で折り返す（文字の途中では切らない）
const encoder = new TextEncoder();
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "",
    size = 0,
    limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > limit) {
      parts.push(cur);
      cur = "";
      size = 0;
      limit = 74; // 続きの行は先頭の空白の1オクテットを含めて75
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** 日本時間の日付＋"HH:MM" → UTC の "YYYYMMDDTHHMMSSZ" */
export function utcStamp(date: string, hm: string): string {
  const [y, mo, d] = date.split("-").map(Number),
    [h, mi] = hm.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface IcsOptions {
  /** 配信の日時（DTSTAMP） */
  stamp: Date;
  /** 予定のメモに書く版（例：「10/28 12:00 配信版」） */
  version: string;
}

/** 1人分の .ics（購読用。カレンダー名と更新間隔の指定つき） */
export function personIcs(id: string, name: string, events: readonly CalEvent[], { stamp, version }: IcsOptions): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    uids = new Set<string>();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cafeore//sohosai-shift//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escText(`${CALENDAR_TITLE}（${name}）`)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    // UID は日時・担当・人から作る（配信し直しても同じ予定は同じ UID）。同じ時刻に重なった担当は番号で区別する
    let uid = `${utcStamp(e.date, e.start)}-${hashHex(e.summary)}-${id}@sohosai-shift`;
    for (let n = 2; uids.has(uid); n++) uid = `${utcStamp(e.date, e.start)}-${hashHex(e.summary)}-${n}-${id}@sohosai-shift`;
    uids.add(uid);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${utcStamp(e.date, e.start)}`,
      `DTEND:${utcStamp(e.date, e.end)}`,
      `SUMMARY:${escText(e.summary)}`,
      `DESCRIPTION:${escText(`${CALENDAR_TITLE}（${version}）`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// 購読だけに意味のある、カレンダー全体の指定（取り込みでは「新しいカレンダー」を作るきっかけになるので外す）
const SUBSCRIPTION_ONLY = /^(X-WR-CALNAME|X-WR-TIMEZONE|REFRESH-INTERVAL|X-PUBLISHED-TTL|METHOD)[:;]/;

/** 購読用の .ics → ファイルで取り込む用（自分のカレンダーに予定だけを入れる） */
export function importIcs(ics: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of ics.split("\r\n")) {
    if (line.startsWith(" ")) {
      if (!skipping) out.push(line);
      continue;
    }
    skipping = SUBSCRIPTION_ONLY.test(line);
    if (!skipping) out.push(line);
  }
  return out.join("\r\n");
}

/** 配信の中身の digest（予定が同じなら同じ。配信の日時は含まない） */
export function publicationDigest(m: Model): string {
  return hashHex(JSON.stringify(allNames(m).map((n) => [n, memberEvents(m, n)])));
}

/** 全員分の配信の中身 */
export function buildPublication(m: Model, opts: IcsOptions): Publication {
  const names = allNames(m),
    ids = calendarIds(names),
    events: Publication["events"] = {},
    ics: Publication["ics"] = {};
  const all = names.map((n): [string, CalEvent[]] => [n, memberEvents(m, n)]);
  for (const [name, list] of all) {
    events[ids[name]] = list;
    ics[ids[name]] = personIcs(ids[name], name, list, opts);
  }
  return {
    members: names.map((name) => ({ id: ids[name], name })),
    events,
    ics,
    digest: hashHex(JSON.stringify(all)),
  };
}
