import { describe, expect, it } from "vitest";
import { openRoles } from "./config";
import { csvLine, csvLineQuoted, csvRows, decodeCsvBytes } from "./csv";
import { exportCsv, sampleCsv, templateCsv } from "./exports";
import { autoModel } from "../test/fixtures";

describe("csvRows", () => {
  it("引用符・エスケープ・CRLF・空行・trim", () => {
    expect(csvRows('a, "b,c" ,"d""e"\r\n\r\n , \n"x\ny",z')).toEqual([
      ["a", "b,c", 'd"e'],
      ["x\ny", "z"],
    ]);
  });
  it("最後の行に改行がなくても読む・空文字は []", () => {
    expect(csvRows("a,b")).toEqual([["a", "b"]]);
    expect(csvRows("")).toEqual([]);
  });
  it("csvLine と往復する", () => {
    const row = ["山田, 太郎", 'a"b', "c\nd", "", "普通"];
    expect(csvLine(row)).toBe('"山田, 太郎","a""b","c\nd",,普通');
    expect(csvRows(csvLine(row))).toEqual([row]);
  });
  it("csvLineQuoted はすべて囲む", () => {
    expect(csvLineQuoted(["a", 'b"', 3])).toBe('"a","b""","3"');
  });
});

describe("decodeCsvBytes", () => {
  it("UTF-8 と Shift_JIS", () => {
    expect(decodeCsvBytes(new TextEncoder().encode("氏名,日付"))).toBe("氏名,日付");
    // 「氏名」の Shift_JIS
    expect(decodeCsvBytes(new Uint8Array([0x8e, 0x81, 0x96, 0xbc]))).toBe("氏名");
  });
});

describe("書き出し", () => {
  it("ひな形・サンプルは BOM つき", () => {
    expect(templateCsv().startsWith("﻿氏名,ステータス,所属店舗,")).toBe(true);
    expect(templateCsv().endsWith("\n")).toBe(true);
    const rows = csvRows(sampleCsv().slice(1));
    // 2025年ベースのサンプル（mockSurvey.ts）：50名・155行、働ける量の列つき
    expect(rows.length).toBe(1 + 155);
    expect(rows[0][7]).toBe("働ける量（少し／5時間程度／いっぱい）");
    expect(new Set(rows.slice(1).map((r) => r[0])).size).toBe(50);
    expect(rows[1]).toEqual(["野村岳", "上級生", "本店, くれあ", "○", "あり", "豆屋", "マスター, ホール", "いっぱい", "2026-10-30", "10:00", "20:00"]);
  });
  it("シフト CSV は枠の数＋見出し、未割当は「未割当」（人数の上限がない係の空きの番目は出さない）", () => {
    const m = autoModel();
    const rows = csvRows(exportCsv(m).slice(1));
    const items = m.slots.reduce((n, s) => n + s.count - (openRoles.includes(s.role) ? 1 : 0), 0);
    expect(rows.length).toBe(items + 1);
    expect(rows[0]).toEqual(["日付", "店舗", "ロール", "開始時刻", "終了時刻", "担当者"]);
    expect(rows.some((r) => r[2] === "ドリッパー 6th")).toBe(true);
    expect(rows.every((r, i) => !i || r[5] === "未割当" || Object.values(m.assignments).includes(r[5]))).toBe(true);
  });
});
