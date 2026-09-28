// 書き出す CSV（シフト・アンケートのひな形・サンプル）と、サンプルの読み込み

import { csvLine, csvLineQuoted } from "./csv";
import { MOCK_SURVEY_HEADERS, mockSurveyCsv, mockSurveyNames } from "./mockSurvey";
import { posLabel } from "./rules";
import { flattened } from "./slots";
import type { Model } from "./types";

const BOM = "﻿";
/** アンケート回答 CSV の列（ひな形・サンプル共通。働ける量は任意） */
const SURVEY_HEADERS = MOCK_SURVEY_HEADERS;

/** shift.csv の中身（BOM つき、すべて "" で囲む、改行は LF、末尾に改行なし） */
export function exportCsv(m: Model): string {
  const rows: unknown[][] = [["日付", "店舗", "ロール", "開始時刻", "終了時刻", "担当者"]];
  flattened(m).forEach((x) =>
    rows.push([
      x.date,
      x.store,
      `${x.role}${Number(x.count) > 1 ? ` ${posLabel(x.role, x.occ)}` : ""}`,
      x.start,
      x.end,
      m.assignments[x.key] || "未割当",
    ]),
  );
  return BOM + rows.map(csvLineQuoted).join("\n");
}

/** survey_template.csv の中身 */
export function templateCsv(): string {
  return (
    BOM +
    [
      SURVEY_HEADERS,
      [
        "山田 太郎",
        "2年目合格",
        "本店",
        "1杯のみ",
        "あり",
        "ドリッパー, レジ",
        "マスター",
        "5時間程度",
        "2026-10-30",
        "09:00",
        "17:00",
      ],
      [
        "山田 太郎",
        "2年目合格",
        "本店",
        "1杯のみ",
        "あり",
        "ドリッパー, レジ",
        "マスター",
        "5時間程度",
        "2026-10-31",
        "10:00",
        "18:00",
      ],
      ["佐藤 花子", "1年目合格", "本店, くれあ", "○", "なし", "ホール", "", "", "2026-11-01", "12:00", "20:00"],
    ]
      .map(csvLine)
      .join("\n") +
    "\n"
  );
}

export const EXPORT_FILE = "shift.csv";
export const TEMPLATE_FILE = "survey_template.csv";
export const SAMPLE_FILE = "survey_sample_2025base_50members.csv";
export const PRINT_FILE = "event_shift_print.html";

// ---- サンプル（2025年ベースの50名・3日間。中身は mockSurvey.ts）----

/** サンプルの氏名（架空） */
export const sampleNames: readonly string[] = mockSurveyNames;

/** サンプルのアンケート回答 CSV（BOM つき、末尾に改行なし）。雙峰祭2025 の構成を写した架空の50名 */
export const sampleCsv = (): string => mockSurveyCsv();

/** サンプルを読み込んだときに、読み込み結果の代わりに出す文 */
export const SAMPLE_INTRO =
  "2025年ベースのサンプル（架空の50名・3日間：10/30 前日準備、10/31・11/1 本番）を読み込みました。雙峰祭2025 の人数・勤務可能時間・ステータス・所属店舗をもとにしたデータで、対応ドリップ・車の有無・役職の希望・働ける量もCSVから反映しています。";

/** サンプルを読み込む前に枠・必要人数などを空にする（このあと importSurvey(m, sampleCsv())） */
export function resetForSample(m: Model): void {
  m.slots = [];
  m.slotTypes = {};
  m.slotCounts = {};
  m.slotBlanks = {};
  m.gridDate = "";
}
