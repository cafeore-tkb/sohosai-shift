// アンケート回答 CSV（または Attendar の出欠表）の読み込み

import { csvRows } from "./csv";
import {
  dripsForIce,
  normDate,
  normKey,
  normTime,
  parseCar,
  parseGrade,
  parseIce,
  parseKana,
  parseRoles,
  parseStatus,
  parseStores,
  parseWorkload,
  timePart,
} from "./parse";
import type { Availability, Model } from "./types";

export interface ImportResult {
  /** 読み込み結果（旧版では intro があればその代わりに intro を表示） */
  messages: string[];
  /** 判別できなかった回答など（「メンバー」タブで修正できる） */
  warns: string[];
}

/** Attendar 形式：1行＝30分、列＝メンバー（yes/はい/○/1）。連続した時間をつなげる */
export function attendarAvailability(headers: readonly string[], rows: readonly string[][]): Availability[] {
  const names = headers.slice(2).map((x) => x.trim());
  const active: ({ date: string; start: string; end: string } | null)[] = names.map(() => null),
    data: Availability[] = [];
  const close = (i: number) => {
    if (active[i]) data.push({ ...active[i], name: names[i] });
    active[i] = null;
  };
  for (const row of rows) {
    const start = timePart(row[0]),
      end = timePart(row[1]);
    if (!start || !end) continue;
    names.forEach((_name, i) => {
      const yes = /^(yes|はい|○|1)$/i.test(String(row[i + 2] || "").trim());
      if (!yes) return close(i);
      const cur = active[i];
      if (cur && cur.date === start.date && cur.end === start.time) cur.end = end.time;
      else {
        close(i);
        active[i] = { date: start.date, start: start.time, end: end.time };
      }
    });
  }
  names.forEach((_, i) => close(i));
  return data.filter((x) => x.name && x.start && x.end);
}

interface Profile {
  status?: string;
  stores?: string;
  drips?: string;
  car?: string;
  wants?: string;
  dislikes?: string;
  workload?: string;
  kana?: string;
  grade?: string;
  hasDrips?: boolean;
  hasWorkload?: boolean;
  hasKana?: boolean;
  hasGrade?: boolean;
  hasCar?: boolean;
  hasPrefs?: boolean;
}

/**
 * CSV を読み込んで Model に反映する（勤務可能時間を置き換え、割当はクリア、view = "shift"）。
 * 読めないときは Model を変えずに Error を投げる（メッセージは旧版と同じ）。
 */
export function importSurvey(m: Model, text: string): ImportResult {
  const rows = csvRows(text);
  if (rows.length < 2) throw Error("データ行がありません。");
  const originalHeaders = rows.shift()!;
  const headers = originalHeaders.map(normKey);
  let data: Availability[],
    format = "";
  const profiles: Record<string, Profile> = {};
  if (headers[0]?.includes("starttime") && headers[1]?.includes("endtime")) {
    data = attendarAvailability(originalHeaders, rows);
    format = "Attendar形式の";
  } else {
    const col = (...keys: string[]) => {
      for (const k of keys) {
        const i = headers.findIndex((h, j) => h.includes(k) && !skip.includes(j));
        if (i >= 0) return i;
      }
      return -1;
    };
    // ふりがなの列（「名前（ふりがな）」など）は氏名の列と取り違えないよう先に決めて、氏名を探すときは除く
    const skip: number[] = [];
    const kana = col("ふりがな", "フリガナ", "よみがな", "ヨミガナ", "読み", "かな", "カナ", "furigana", "kana", "reading", "yomi");
    if (kana >= 0) skip.push(kana);
    const idx = {
      kana,
      grade: col("学年", "grade", "入学年度", "学籍"),
      name: col("氏名", "名前", "name", "staff"),
      status: col("ステータス", "status", "合格", "経験", "年目"),
      wants: col("やりたい", "希望役職", "want"),
      dislikes: col("苦手", "dislike"),
      stores: col("所属", "店舗", "store"),
      drips: col("アイス", "ドリップ", "ice", "drip"),
      car: col("車", "car"),
      workload: col("働ける量", "働ける", "勤務量", "入れる時間の量", "workload"),
      date: col("日付", "date"),
      start: col("開始", "start", "from"),
      end: col("終了", "end", "to"),
    };
    const cell = (r: readonly string[], k: keyof typeof idx) => (idx[k] < 0 ? "" : String(r[idx[k]] ?? "").trim());
    data = rows
      .map((r) => ({
        name: cell(r, "name"),
        date: normDate(cell(r, "date")),
        start: normTime(cell(r, "start")),
        end: normTime(cell(r, "end")),
      }))
      .filter((x) => x.name && x.date && x.start && x.end);
    rows.forEach((r) => {
      const name = cell(r, "name");
      if (!name) return;
      const p = (profiles[name] ??= {});
      if (!p.status && cell(r, "status")) p.status = cell(r, "status");
      if (!p.stores && cell(r, "stores")) p.stores = cell(r, "stores");
      if (!p.drips && cell(r, "drips")) p.drips = cell(r, "drips");
      if (!p.car && cell(r, "car")) p.car = cell(r, "car");
      if (!p.wants && cell(r, "wants")) p.wants = cell(r, "wants");
      if (!p.dislikes && cell(r, "dislikes")) p.dislikes = cell(r, "dislikes");
      if (!p.workload && cell(r, "workload")) p.workload = cell(r, "workload");
      if (!p.kana && cell(r, "kana")) p.kana = cell(r, "kana");
      if (!p.grade && cell(r, "grade")) p.grade = cell(r, "grade");
    });
    Object.values(profiles).forEach((p) => {
      p.hasDrips = idx.drips >= 0;
      p.hasCar = idx.car >= 0;
      p.hasPrefs = idx.wants >= 0 || idx.dislikes >= 0;
      p.hasWorkload = idx.workload >= 0;
      p.hasKana = idx.kana >= 0;
      p.hasGrade = idx.grade >= 0;
    });
  }
  if (!data.length) throw Error("勤務可能時間を取得できませんでした。CSVの内容を確認してください。");
  const badStatus: string[] = [],
    badStores = new Set<string>(),
    badCars: string[] = [],
    badRoles = new Set<string>(),
    badIce: string[] = [],
    badWorkload: string[] = [],
    badGrade: string[] = [];
  let reflected = 0;
  for (const [name, p] of Object.entries(profiles)) {
    if (p.status) {
      const st = parseStatus(p.status);
      if (st) m.memberStatuses[name] = st;
      else badStatus.push(`${name}（${p.status}）`);
    }
    if (p.stores) {
      const { stores, unknown } = parseStores(p.stores);
      m.memberStores[name] = stores;
      unknown.forEach((x) => badStores.add(x));
    }
    if (p.hasDrips) {
      const ice = parseIce(p.drips);
      if (ice) m.memberDrips[name] = dripsForIce(ice);
      else {
        delete m.memberDrips[name];
        if (ice === undefined) badIce.push(`${name}（${p.drips}）`);
      }
    }
    /* 未合格はアイス不可、上級生はアイス ○ */
    if (m.memberStatuses[name] === "未合格") m.memberDrips[name] = dripsForIce("×");
    if (m.memberStatuses[name] === "上級生") m.memberDrips[name] = dripsForIce("○");
    if (p.hasCar) {
      const car = parseCar(p.car);
      m.memberCars[name] = car === true;
      if (p.car && car === undefined) badCars.push(`${name}（${p.car}）`);
    }
    if (p.hasPrefs) {
      const w = parseRoles(p.wants),
        d = parseRoles(p.dislikes);
      m.memberWants[name] = w.roles;
      m.memberDislikes[name] = d.roles;
      [...w.unknown, ...d.unknown].forEach((x) => badRoles.add(x));
    }
    if (p.hasWorkload) {
      const w = parseWorkload(p.workload);
      if (w) m.memberWorkload[name] = w;
      else {
        delete m.memberWorkload[name];
        if (w === undefined) badWorkload.push(`${name}（${p.workload}）`);
      }
    }
    if (p.hasKana) {
      const k = parseKana(p.kana);
      if (k) m.memberKana[name] = k;
      else delete m.memberKana[name];
    }
    if (p.hasGrade) {
      const g = parseGrade(p.grade);
      if (typeof g === "number") m.memberGrade[name] = g;
      else {
        delete m.memberGrade[name];
        if (g === undefined) badGrade.push(`${name}（${p.grade}）`);
      }
    }
    if (p.status || p.stores) reflected++;
  }
  m.availability = data;
  m.assignments = {};
  m.slotBlanks = {};
  m.pinnedSlots = {};
  const all = Object.values(profiles);
  const messages = [
      `${format}${new Set(data.map((x) => x.name)).size}名・${data.length}件の勤務可能時間を読み込みました。`,
    ],
    warns: string[] = [];
  messages.push(
    reflected
      ? `ステータス・所属店舗${all.some((p) => p.hasDrips) ? "・アイス" : ""}${all.some((p) => p.hasCar) ? "・車の有無" : ""}${all.some((p) => p.hasPrefs) ? "・役職の希望" : ""}${all.some((p) => p.hasWorkload) ? "・働ける量" : ""}${all.some((p) => p.hasKana) ? "・ふりがな" : ""}${all.some((p) => p.hasGrade) ? "・学年" : ""}を${reflected}名分反映しました。`
      : "CSVにステータス・所属店舗の列がないため、「メンバーのステータス」で設定してください。",
  );
  if (badStatus.length) warns.push(`ステータスを判別できなかった回答：${badStatus.join("、")}`);
  if (badIce.length) warns.push(`アイスを判別できなかった回答（未設定にしました）：${badIce.join("、")}`);
  if (badCars.length) warns.push(`車の有無を判別できなかった回答（車なしとして扱います）：${badCars.join("、")}`);
  if (badWorkload.length)
    warns.push(`働ける量を判別できなかった回答（目安なしとして扱います）：${badWorkload.join("、")}`);
  if (badGrade.length) warns.push(`学年を判別できなかった回答（未回答にしました。B1〜B4・M1〜M2・D1〜D3）：${badGrade.join("、")}`);
  if (badRoles.size) warns.push(`不明な役職名：${[...badRoles].join("、")}`);
  if (badStores.size) warns.push(`不明な店舗名：${[...badStores].join("、")}`);
  m.view = "shift";
  return { messages, warns };
}

/** 読み込みに失敗したときのアラート（ファイル選択から） */
export const importFailedMessage = (err: { message: string }): string => `読み込みに失敗しました：${err.message}`;
/** 共同編集中に管理者以外が読み込もうとしたときのアラート */
export const IMPORT_ADMIN_ONLY = "共同編集中のため、CSVの読み込みは管理者だけができます。";
/** 読み込み結果の下に出す注記（警告があるとき） */
export const IMPORT_WARN_NOTE = "「メンバー」タブで修正できます。";
