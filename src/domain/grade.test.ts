import { describe, expect, it } from "vitest";
import { GRADE_BASE, gradeCode, gradeOf, gradeText } from "./config";
import { importSurvey } from "./importSurvey";
import { createModel } from "./model";
import { filterMembers } from "./members";
import { orderedNames, sortedMembers } from "./order";
import { parseGrade, parseKana } from "./parse";

describe("ふりがな・学年", () => {
  it("学年は入学年度の下2桁（在籍コード）で覚える：2026年度は B1(26)〜B4(23)、M1(22)〜M2(21)、D1(20)〜D3(18)", () => {
    expect(GRADE_BASE).toBe(26);
    expect(["B1", "B2", "B3", "B4", "M1", "M2", "D1", "D2", "D3"].map(gradeCode)).toEqual([26, 25, 24, 23, 22, 21, 20, 19, 18]);
    expect(gradeOf(22)).toBe("M1");
    expect(gradeOf(17)).toBe("");
    expect(gradeText(17)).toBe("17年度");
    // アンケートの書き方いろいろ
    expect(["B1", "b1", "Ｂ１", "B1(26)", "学部1年", "1年", "26", "2026", "26年度", "26生"].map(parseGrade)).toEqual(Array(10).fill(26));
    expect(["M2", "修士2年", "博士前期2年"].map(parseGrade)).toEqual([21, 21, 21]);
    expect(["D1", "博士1年", "博士後期1年"].map(parseGrade)).toEqual([20, 20, 20]);
    expect(["", " ", "なし", "-"].map(parseGrade)).toEqual(["", "", "", ""]);
    expect(parseGrade("社会人")).toBeUndefined();
  });

  it("ふりがなはひらがなにそろえる", () => {
    expect(parseKana("ヤマダ　タロウ")).toBe("やまだ たろう");
    expect(parseKana(" ﾔﾏﾀﾞ ﾀﾛｳ ")).toBe("やまだ たろう");
    expect(parseKana("")).toBe("");
  });

  it("アンケートの列（「名前（ふりがな）」も氏名と取り違えない）を読み、五十音順は読み・学年順は上の学年から", () => {
    const m = createModel();
    const r = importSurvey(
      m,
      "名前（ふりがな）,氏名,学年,日付,開始時刻,終了時刻\n" +
        "しみず あや,清水 彩,B1,2026-10-31,10:00,12:00\n" +
        "カワイ リク,河合 陸,M1,2026-10-31,10:00,12:00\n" +
        ",東 葵,社会人,2026-10-31,10:00,12:00\n" +
        "あずま ゆう,東 優,B3,2026-10-31,10:00,12:00",
    );
    expect(Object.keys(m.memberKana).sort()).toEqual(["東 優", "河合 陸", "清水 彩"].sort());
    expect(m.memberKana["河合 陸"]).toBe("かわい りく");
    expect(m.memberGrade).toEqual({ "清水 彩": 26, "河合 陸": 22, "東 優": 24 });
    expect(r.warns).toEqual(["学年を判別できなかった回答（未回答にしました。B1〜B4・M1〜M2・D1〜D3）：東 葵（社会人）"]);
    const all = ["清水 彩", "河合 陸", "東 葵", "東 優"];
    // 読みの五十音順（東 優＝あずま、河合＝かわい、清水＝しみず。ふりがなのない 東 葵 は氏名で比べる）
    expect(sortedMembers(m, all, "kana").slice(0, 3)).toEqual(["東 優", "河合 陸", "清水 彩"]);
    expect(orderedNames(m, all).indexOf("東 優")).toBeLessThan(orderedNames(m, all).indexOf("清水 彩"));
    // 上の学年から、未回答は最後
    expect(sortedMembers(m, all, "grade")).toEqual(["河合 陸", "東 優", "清水 彩", "東 葵"]);
    // ふりがなでも（カタカナでも）検索できる
    expect(filterMembers(m, all, "シミズ", "")).toEqual(["清水 彩"]);
  });
});
