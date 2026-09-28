import { describe, expect, it } from "vitest";
import { importSurvey } from "./importSurvey";
import { createModel } from "./model";

const H = "氏名,ステータス,所属店舗,アイス,車の有無,やりたい役職,苦手な役職,日付,開始時刻,終了時刻";

describe("importSurvey", () => {
  it("アンケート形式：勤務可能時間とプロフィールを反映", () => {
    const m = createModel();
    m.assignments = { x: "A" };
    m.slotBlanks = { y: true };
    const r = importSurvey(
      m,
      `﻿${H}\n山田 太郎,2年目合格,"本店, くれあ",1杯のみ,あり,"ドリッパー, レジ",マスター,2026/10/31,9:00,17:00\n山田 太郎,,,,,,,2026-11-01,10:00,18:00\n佐藤,未合格,本店,○,なし,,,2026-10-31,12:00,20:00`,
    );
    expect(r).toEqual({
      messages: ["2名・3件の勤務可能時間を読み込みました。", "ステータス・所属店舗・アイス・車の有無・役職の希望を2名分反映しました。"],
      warns: [],
    });
    expect(m.availability[0]).toEqual({ name: "山田 太郎", date: "2026-10-31", start: "09:00", end: "17:00" });
    expect(m.memberStatuses).toEqual({ "山田 太郎": "2年目合格", 佐藤: "未合格" });
    expect(m.memberStores["山田 太郎"]).toEqual(["本店", "くれあ"]);
    expect(m.memberDrips["山田 太郎"]).toEqual(["1杯ホット", "2杯ホット", "1杯アイス"]);
    expect(m.memberDrips.佐藤).toEqual(["1杯ホット", "2杯ホット"]); // 未合格はアイス不可
    expect(m.memberCars).toEqual({ "山田 太郎": true, 佐藤: false });
    expect(m.memberWants["山田 太郎"]).toEqual(["レジ", "ドリッパー"]);
    expect(m.memberDislikes["山田 太郎"]).toEqual(["マスター"]);
    expect(m.assignments).toEqual({});
    expect(m.slotBlanks).toEqual({});
    expect(m.view).toBe("shift");
  });

  it("判別できない値は警告", () => {
    const m = createModel();
    const r = importSurvey(
      m,
      [H, "A,3年,本店／別館,?,たぶん,受付,,2026-10-31,10:00,12:00", "B,上級生,本店,,,,,2026-10-31,10:00,12:00"].join("\n"),
    );
    expect(r.warns).toEqual([
      "ステータスを判別できなかった回答：A（3年）",
      "アイスを判別できなかった回答（未設定にしました）：A（?）",
      "車の有無を判別できなかった回答（車なしとして扱います）：A（たぶん）",
      "不明な役職名：受付",
      "不明な店舗名：別館",
    ]);
    expect(m.memberCars).toEqual({ A: false, B: false });
    expect("A" in m.memberDrips).toBe(false);
  });

  it("ステータス・店舗の列がないとき", () => {
    const r = importSurvey(createModel(), "name,date,start,end\nA,2026-10-31,10:00,12:00");
    expect(r.messages[1]).toBe("CSVにステータス・所属店舗の列がないため、「メンバーのステータス」で設定してください。");
  });

  it("Attendar 形式：続いた時間をつなげる", () => {
    const m = createModel();
    const r = importSurvey(
      m,
      [
        "Start Time,End Time,A,B",
        "2026-10-31 10:00,2026-10-31 10:30,yes,no",
        "2026-10-31 10:30,2026-10-31 11:00,はい,○",
        "2026-10-31 11:00,2026-10-31 11:30,no,1",
      ].join("\n"),
    );
    expect(r.messages[0]).toBe("Attendar形式の2名・2件の勤務可能時間を読み込みました。");
    expect(m.availability).toEqual([
      { date: "2026-10-31", start: "10:00", end: "11:00", name: "A" },
      { date: "2026-10-31", start: "10:30", end: "11:30", name: "B" },
    ]);
  });

  it("読めないときはエラー（Model は変えない）", () => {
    const m = createModel();
    const before = JSON.stringify(m);
    expect(() => importSurvey(m, H)).toThrow("データ行がありません。");
    expect(() => importSurvey(m, `${H}\nA,,,,,,,,10:00,11:00`)).toThrow("勤務可能時間を取得できませんでした。CSVの内容を確認してください。");
    expect(JSON.stringify(m)).toBe(before);
  });
});
