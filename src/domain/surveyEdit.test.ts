import { describe, expect, it } from "vitest";
import { mockSurveyCsv, mockSurveyNames } from "./mockSurvey";
import {
  addSurveyMember,
  emptySurvey,
  readSurvey,
  removeSurveyMember,
  renameSurveyMember,
  setSpans,
  spansText,
  surveyCsv,
  surveyDates,
} from "./surveyEdit";
import { setMemberStatus } from "./members";
import { iceOf } from "./parse";

describe("アンケート回答 CSV の編集（/mock）", () => {
  it("サンプルを読んでそのまま書き出すと同じ CSV", () => {
    const d = readSurvey(mockSurveyCsv());
    expect(d.names).toEqual(mockSurveyNames);
    // 同じ行数・同じ中身（やりたい・苦手な役職は役職の順に並べ直す）。もう一度読んで書いても変わらない
    const out = surveyCsv(d),
      again = readSurvey(out);
    expect(out.split("\n")).toHaveLength(mockSurveyCsv().split("\n").length);
    expect(again.m).toEqual(d.m);
    expect(surveyCsv(again)).toBe(out);
    expect(surveyDates(d)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("勤務可能時間を「10-14 16:30-20」で読み書きする（空なら不参加、読めなければ変えない）", () => {
    const d = readSurvey(mockSurveyCsv()),
      n = d.names[0];
    expect(setSpans(d, n, "2026-10-31", "16:30〜20、10-14")).toBe(true);
    expect(spansText(d, n, "2026-10-31")).toBe("10-14 16:30-20");
    expect(setSpans(d, n, "2026-10-31", "14-10")).toBe(false);
    expect(setSpans(d, n, "2026-10-31", "あとで")).toBe(false);
    expect(spansText(d, n, "2026-10-31")).toBe("10-14 16:30-20");
    expect(setSpans(d, n, "2026-10-31", "")).toBe(true);
    expect(spansText(d, n, "2026-10-31")).toBe("");
    const again = readSurvey(surveyCsv(d));
    expect(spansText(again, n, "2026-10-30")).toBe("10-20");
    expect(spansText(again, n, "2026-10-31")).toBe("");
  });
  it("ステータス・名前の変更、追加・削除が書き出しに残る（勤務可能時間のない人も）", () => {
    const d = readSurvey(mockSurveyCsv()),
      [a, b] = d.names;
    setMemberStatus(d.m, b, "上級生");
    expect(renameSurveyMember(d, a, b)).toBe(false);
    expect(renameSurveyMember(d, a, "新しい 名前")).toBe(true);
    expect(addSurveyMember(d, "追加 さん")).toBe(true);
    expect(addSurveyMember(d, "追加 さん")).toBe(false);
    removeSurveyMember(d, d.names[2]);
    const again = readSurvey(surveyCsv(d));
    expect(again.names).toEqual(d.names);
    expect(again.names[0]).toBe("新しい 名前");
    expect(again.m.memberStatuses[b]).toBe("上級生");
    expect(iceOf(again.m.memberDrips[b])).toBe("○");
    expect(again.names.at(-1)).toBe("追加 さん");
    expect(again.m.availability.some((x) => x.name === "追加 さん")).toBe(false);
  });
  it("未合格の人はアイスの欄を「ドリップ不可」で書き出す（読み込み直しても未合格のまま）", () => {
    const d = readSurvey(mockSurveyCsv()),
      n = d.names.find((x) => d.m.memberStatuses[x] === "未合格")!;
    const out = surveyCsv(d);
    expect(out.split("\n").find((l) => l.startsWith(`${n},`))).toContain(",未合格,");
    expect(out.split("\n").find((l) => l.startsWith(`${n},`))).toContain(",ドリップ不可,");
    expect(readSurvey(out).m.memberStatuses[n]).toBe("未合格");
  });
  it("空から作れる", () => {
    const d = emptySurvey();
    addSurveyMember(d, "A");
    setSpans(d, "A", "2026-10-31", "10-12");
    expect(readSurvey(surveyCsv(d)).names).toEqual(["A"]);
  });
});
