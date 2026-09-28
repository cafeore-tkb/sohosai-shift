import { describe, expect, it } from "vitest";
import {
  dripsForIce,
  iceOf,
  normDate,
  normKey,
  normTime,
  parseCar,
  parseDrips,
  parseIce,
  parseRoles,
  parseStatus,
  parseStores,
  timePart,
} from "./parse";

describe("アンケートの値", () => {
  it("ステータス・アイス・車の有無はゆるく読み、読めなければ空か undefined", () => {
    expect(["上級", "２年合格", "1年 目 合格", "不合格", "未設定", "3年", null].map(parseStatus)).toEqual([
      "上級生",
      "2年目合格",
      "1年目合格",
      "未合格",
      "",
      "",
      "",
    ]);
    expect(["両方", "できない", "2杯", "1杯ホット, 2杯アイス", "1杯ホット・2杯ホット", "", "?"].map(parseIce)).toEqual([
      "○",
      "×",
      "2杯のみ",
      "2杯のみ",
      "×",
      "",
      undefined,
    ]);
    expect(parseDrips("2杯(アイス)、1杯 hot")).toEqual(["1杯ホット", "2杯アイス"]);
    for (const ice of ["○", "1杯のみ", "2杯のみ", "×"]) expect(iceOf(dripsForIce(ice))).toBe(ice);
    expect(["はい", "YES", "持ってない", "0", "", "たぶん"].map(parseCar)).toEqual([true, true, false, false, undefined, undefined]);
  });

  it("店舗は定義順、役職は部分一致（2文字以上）も拾い、不明なものは unknown", () => {
    expect(parseStores("くれあ、本店／別館")).toEqual({ stores: ["本店", "くれあ"], unknown: ["別館"] });
    expect(parseRoles("ホール・ドリップ、レジ")).toEqual({ roles: ["レジ", "ホール"], unknown: ["ドリップ"] });
    expect(parseRoles("ドリッパー1st").roles).toEqual(["ドリッパー"]);
    expect(parseRoles("リベ").roles).toEqual(["リベロ"]);
    expect(parseRoles("リ").unknown).toEqual(["リ"]);
  });

  it("時刻・日付・見出し", () => {
    expect([normTime("9:00"), normTime("１０：３０"), normTime("10時")]).toEqual(["09:00", "10:30", ""]);
    expect([normDate("2026/1/2"), normDate("2026年10月31日"), normDate("10/31")]).toEqual(["2026-01-02", "2026-10-31", ""]);
    expect(normKey("Start_Time ")).toBe("starttime");
    expect(timePart(" 2026-10-31T10:30 ")).toEqual({ date: "2026-10-31", time: "10:30" });
    expect(timePart("10:30")).toBeNull();
  });
});
