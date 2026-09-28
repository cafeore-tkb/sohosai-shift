import { describe, expect, it } from "vitest";
import { assignmentAudit } from "./audit";
import { autoAssign } from "./autoAssign";
import { importSurvey } from "./importSurvey";
import { createModel, refreshDerived } from "./model";
import { parseWorkload } from "./parse";
import { flattened } from "./slots";
import { overTargetIfPicked, overTargets, workloadTarget } from "./workload";
import { D, autoModel } from "../test/fixtures";

describe("働ける量", () => {
  it('parseWorkload はゆるく読み、アンケートの任意の列「働ける量」を読み込む', () => {
    expect(["少し", "すこし", "少なめ", "2時間", "3h", "少し（2〜3時間）"].map(parseWorkload)).toEqual(
      Array(6).fill("少し"),
    );
    expect(["5時間程度", "５時間", "4時間", "6h", "5時間くらい", "ふつう"].map(parseWorkload)).toEqual(
      Array(6).fill("5時間程度"),
    );
    expect(["いっぱい", "いくらでも", "たくさん", "8時間", "何時間でも"].map(parseWorkload)).toEqual(
      Array(5).fill("いっぱい"),
    );
    expect(["", " ", "希望なし", "-"].map(parseWorkload)).toEqual(["", "", "", ""]);
    expect(parseWorkload("よくわからない")).toBeUndefined();
    // アンケートの任意の列「働ける量」を読み込む（空は目安なし、読めない値は警告）
    const m = createModel();
    m.memberWorkload.C = "少し";
    const r = importSurvey(
      m,
      "氏名,ステータス,所属店舗,働ける量（少し／5時間程度／いっぱい）,日付,開始時刻,終了時刻\n" +
        "A,上級生,本店,少し,2026-10-31,10:00,12:00\nB,上級生,本店,,2026-10-31,10:00,12:00\n" +
        "C,上級生,本店,,2026-10-31,10:00,12:00\nE,上級生,本店,???,2026-10-31,10:00,12:00",
    );
    expect(m.memberWorkload).toEqual({ A: "少し" });
    expect(r.messages[1]).toBe("ステータス・所属店舗・働ける量を4名分反映しました。");
    expect(r.warns).toEqual(["働ける量を判別できなかった回答（目安なしとして扱います）：E（???）"]);
    // 列がなければ変えない
    importSurvey(m, "氏名,日付,開始時刻,終了時刻\nA,2026-10-31,10:00,12:00");
    expect(m.memberWorkload).toEqual({ A: "少し" });
  });

  it("自動割当は目安に届いた人を後回しにする（ほかにいなければ超えても入れる）", () => {
    // 本店・レジ（10:00〜19:00 に 1人）だけの小さな例：A は少し（1日 3時間）、B は目安なし
    const run = (bEnd: string) => {
      const m = createModel();
      m.availability.push(
        { name: "A", date: D, start: "10:00", end: "20:00" },
        { name: "B", date: D, start: "10:00", end: bEnd },
      );
      for (const n of ["A", "B"]) {
        m.memberStatuses[n] = "上級生";
        m.memberStores[n] = ["本店"];
      }
      m.memberWorkload.A = "少し";
      refreshDerived(m);
      for (const s of m.slots) if (!(s.store === "本店" && s.role === "レジ")) s.count = 0;
      autoAssign(m);
      return assignmentAudit(m).hours;
    };
    const both = run("20:00");
    expect(both.A[D]).toBeLessThanOrEqual(3.5);
    expect(both.A[D] + both.B[D]).toBe(9);
    // B が 12:00 までしかいなければ、A は目安を超えても入る
    const short = run("12:00");
    expect(short.A[D]).toBeGreaterThan(3);
    expect(short.A[D] + short.B[D]).toBe(9);
    expect(workloadTarget(createModel(), "A")).toBeNull();
  });

  it("overTargets・overTargetIfPicked", () => {
    const m = autoModel();
    const name = Object.keys(m.memberWorkload).find((n) => m.memberWorkload[n] === "少し")!;
    const mine = flattened(m).filter((x) => x.date === D && x.role !== "昼食");
    // 目安（3時間）を超えるよう 10:00〜14:00 のレジに入れる
    for (const x of mine.filter(
      (x) => x.store === "本店" && x.role === "レジ" && x.start >= "10:00" && x.start < "14:00",
    ))
      m.assignments[x.key] = name;
    const audit = assignmentAudit(m);
    const list = overTargets(m, audit).filter((o) => o.name === name && o.date === D);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ day: "本番1日目", target: 3, level: "少し" });
    expect(overTargetIfPicked(m, audit, name, D)).toBe(true);
    expect(overTargetIfPicked(m, audit, "だれでもない", D)).toBe(false);
  });
});
