import { describe, expect, it } from "vitest";
import { assignmentAudit } from "./audit";
import { autoAssign, isMasterSlot } from "./autoAssign";
import { autoRules, setAutoRule } from "./autoRules";
import { createModel } from "./model";
import type { Model } from "./types";
import { refreshDerived } from "./model";
import { canWorkAt, fitsSlot, levelOf, unfitReasons } from "./rules";
import { dripsForIce, iceOf } from "./parse";
import { flattened } from "./slots";
import { statusLevels } from "./config";
import { D, autoModel, item, sampleModel, tinyModel } from "../test/fixtures";

describe("autoAssign（サンプル）", () => {
  const m = autoModel();
  const items = flattened(m);
  const assigned = items.filter((x) => m.assignments[x.key]);

  it("ほとんどの枠が埋まり、重複なし・条件と勤務可能時間を満たす（ドリッパー 1st・6th は上級生）", () => {
    expect(assigned.length / items.length).toBeGreaterThan(0.8);
    expect(assignmentAudit(m).conflicts.size).toBe(0);
    const keys = new Set(items.map((x) => x.key));
    for (const [k, name] of Object.entries(m.assignments)) {
      expect(keys.has(k)).toBe(true);
      expect(name).not.toBe("");
    }
    for (const x of assigned) {
      const name = m.assignments[x.key];
      expect(fitsSlot(m, name, x)).toBe(true);
      expect(canWorkAt(m, name, x)).toBe(true);
      if (x.role === "ドリッパー" && (x.occ === 0 || x.occ === 5)) expect(levelOf(m, name)).toBe(statusLevels["上級生"]);
    }
  });
  it("ドリッパーの記号（H・1・2）のある人は各時間1人まで（どこかの時間に固まらない）", () => {
    const byTime: Record<string, number> = {};
    for (const x of assigned)
      if (x.role === "ドリッパー" && iceOf(m.memberDrips[m.assignments[x.key]]) !== "○")
        byTime[`${x.date} ${x.start}`] = (byTime[`${x.date} ${x.start}`] || 0) + 1;
    expect(Math.max(...Object.values(byTime))).toBe(1);
  });
  it("同じ入力なら同じ結果・既存の割当は捨てる", () => {
    const again = sampleModel();
    again.assignments = { dummy: "x" };
    autoAssign(again);
    refreshDerived(again);
    expect(again.assignments).toEqual(m.assignments);
  });
});

describe("autoAssign（小さな例）", () => {
  it("同じ人を次の30分にも続けて入れる", () => {
    const m = tinyModel();
    for (const s of m.slots) if (s.role !== "レジ") s.count = 0;
    autoAssign(m);
    const names = ["10:00", "10:30", "11:00", "11:30"].map((h) => m.assignments[item(m, "レジ", h).key]);
    expect(names[0]).toBe(names[1]);
    expect(names[2]).toBe(names[3]);
  });
  it("条件に合う人がいなければ空けておく（店舗のない美化・裏シフトだけ埋まる）", () => {
    const m = tinyModel();
    m.memberStores = {};
    autoAssign(m);
    const roles = new Set(flattened(m).filter((x) => m.assignments[x.key]).map((x) => x.role));
    expect(roles).toEqual(new Set(["美化", "裏シフト"]));
  });
  it("車が必要な係には車ありの人だけ", () => {
    const m = tinyModel();
    m.availability.forEach((a) => (a.date = "2026-10-30"));
    m.slots = [];
    refreshDerived(m);
    m.memberCars.B = true;
    for (const s of m.slots) if (s.role !== "買い出し") s.count = 0;
    autoAssign(m);
    const buyers = flattened(m).filter((x) => x.role === "買い出し" && m.assignments[x.key]);
    expect(buyers.length).toBeGreaterThan(0);
    expect(new Set(buyers.map((x) => m.assignments[x.key]))).toEqual(new Set(["B"]));
  });
});

/** 本番1日目、本店の1つの役職だけ（1人ずつ）。people：氏名 → [開始, 終了]（全員 本店・上級生） */
function oneRole(role: string, people: Record<string, [string, string]>, setup?: (m: Model) => void): Model {
  const m = createModel();
  for (const [name, [start, end]] of Object.entries(people)) {
    m.availability.push({ name, date: D, start, end });
    m.memberStatuses[name] = "上級生";
    m.memberStores[name] = ["本店"];
  }
  setup?.(m);
  refreshDerived(m);
  for (const s of m.slots) s.count = s.store === "本店" && s.role === role ? 1 : 0;
  autoAssign(m);
  return m;
}
/** 時刻順の担当者（未割当は ""） */
const timeline = (m: Model, role: string) =>
  flattened(m)
    .filter((x) => x.role === role && x.store === "本店")
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((x) => m.assignments[x.key] || "");
/** 1人ずつの、続けて入った時間（分）の一覧 */
function runs(names: string[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  names.forEach((n, i) => {
    if (!n) return;
    if (names[i - 1] === n) out[n][out[n].length - 1] += 30;
    else (out[n] ??= []).push(30);
  });
  return out;
}

describe("autoAssign（自動割当の決まり）", () => {
  const all = (s: string, e: string, ...names: string[]) => Object.fromEntries(names.map((n) => [n, [s, e] as [string, string]]));

  it("決まりの標準（マスター 1時間・勤務可能時間の 80%・連続 3時間・ドリッパーの記号 1人）と、変えた値の保存", () => {
    const m = createModel();
    expect(autoRules(m)).toEqual({ masterHours: 1, availPercent: 80, maxRunHours: 3, dripMarked: 1 });
    expect(setAutoRule(m, "maxRunHours", 2.3)).toBe(true);
    expect(setAutoRule(m, "availPercent", 150)).toBe(true);
    expect(setAutoRule(m, "masterHours", -1)).toBe(false);
    expect(setAutoRule(m, "dripMarked", 1.6)).toBe(true);
    expect(m.settings).toEqual({ autoMaxRunHours: 2.5, autoAvailPercent: 100, autoDripMarked: 2 });
    setAutoRule(m, "maxRunHours", 3);
    setAutoRule(m, "dripMarked", 1);
    expect(m.settings).toEqual({ autoAvailPercent: 100 });
  });

  it("マスターは人が足りていれば1人1時間ずつ", () => {
    // 本店は 10:00〜19:00（9時間）。9人いれば全員 1時間
    const m = oneRole("マスター", all("10:00", "19:00", ..."ABCDEFGHI"));
    const r = runs(timeline(m, "マスター"));
    expect(Object.keys(r)).toHaveLength(9);
    for (const list of Object.values(r)) expect(list).toEqual([60]);
  });

  it("マスターは1時間ずつで足りないときだけ2時間ずつ（全員同じくらい）", () => {
    // 9時間を5人：1時間ずつでは足りないので 2時間まで（2+2+2+2+1）
    const m = oneRole("マスター", all("10:00", "19:00", ..."ABCDE"));
    const hours = Object.values(runs(timeline(m, "マスター"))).map((l) => l.reduce((a, b) => a + b, 0) / 60);
    expect(hours.sort()).toEqual([1, 2, 2, 2, 2]);
    expect(timeline(m, "マスター").every(Boolean)).toBe(true);
  });

  it("マスターは本番の全日程の合計で数える（2日とも来られても合計1時間。足りなければ全員同じだけ増やす）", () => {
    // マスターは本番1日目 9時間＋2日目 6時間＝15時間
    const master = (names: string) => {
      const m = createModel();
      for (const name of names)
        for (const date of [D, "2026-11-01"]) {
          m.availability.push({ name, date, start: "10:00", end: "19:00" });
          m.memberStatuses[name] = "上級生";
          m.memberStores[name] = ["本店"];
        }
      refreshDerived(m);
      for (const s of m.slots) s.count = isMasterSlot(s) ? s.count : 0;
      autoAssign(m);
      const hours: Record<string, number> = {};
      for (const x of flattened(m).filter(isMasterSlot)) {
        const n = m.assignments[x.key];
        expect(n).toBeTruthy();
        hours[n] = (hours[n] || 0) + 0.5;
      }
      return Object.values(hours);
    };
    expect(master("ABCDEFGHIJKLMNO")).toEqual(Array(15).fill(1));
    // 5人なら 1時間ずつ・2時間ずつでは足りず、3時間ずつ
    expect(master("ABCDE")).toEqual(Array(5).fill(3));
  });

  it("1日の勤務時間の目安を超えて入れるのは上級生から", () => {
    // レジ 9時間を2人（どちらも 9時間いられる）。40% ＝ 3.5時間までなので、足りない分は上級生の A が入る
    const m = oneRole("レジ", all("10:00", "19:00", "A", "B"), (m) => {
      m.memberStatuses.B = "1年目合格";
      setAutoRule(m, "availPercent", 40);
      setAutoRule(m, "maxRunHours", 0);
    });
    const t = timeline(m, "レジ");
    expect(t.every(Boolean)).toBe(true);
    expect(t.filter((n) => n === "B").length / 2).toBeLessThanOrEqual(4);
    expect(t.filter((n) => n === "A").length / 2).toBeGreaterThanOrEqual(5);
  });

  it("できるだけ続けて入れ、連続は上限まで（超えるなら空ける）", () => {
    // 2人・レジ 9時間：交代で続けて入る（上限の最後の1時間は、空いている人がいれば交代＝2時間ずつ）
    const two = timeline(oneRole("レジ", all("10:00", "19:00", "A", "B"), (m) => setAutoRule(m, "availPercent", 0)), "レジ");
    expect(two.every(Boolean)).toBe(true);
    expect(two.slice(0, 4)).toEqual(["A", "A", "A", "A"]);
    for (const r of Object.values(runs(two)).flat()) expect(r).toBeGreaterThanOrEqual(60), expect(r).toBeLessThanOrEqual(180);
    // 1人だけなら 3時間ごとに 30分空ける
    const one = timeline(oneRole("レジ", all("10:00", "19:00", "A"), (m) => setAutoRule(m, "availPercent", 0)), "レジ");
    expect(runs(one).A).toEqual([180, 180, 180 - 60]);
    expect(one.filter((n) => !n)).toHaveLength(2);
    // 上限なし（0）なら続けて全部
    const free = timeline(
      oneRole("レジ", all("10:00", "19:00", "A"), (m) => {
        setAutoRule(m, "availPercent", 0);
        setAutoRule(m, "maxRunHours", 0);
      }),
      "レジ",
    );
    expect(runs(free).A).toEqual([540]);
  });

  it("1日の勤務時間は勤務可能時間の 80% くらいまで（ほかにいれば交代）", () => {
    // A は 10:00〜15:00（5時間 → 4時間まで）、B は 14:00〜19:00。レジは 10:00〜19:00
    const m = oneRole("レジ", { A: ["10:00", "15:00"], B: ["14:00", "19:00"] }, (m) => setAutoRule(m, "maxRunHours", 0));
    const t = timeline(m, "レジ");
    const hoursOf = (n: string) => t.filter((x) => x === n).length / 2;
    expect(hoursOf("A")).toBe(4);
    // B は A の分も入る（目安を超えてもほかにいない）
    expect(hoursOf("B")).toBe(5);
    expect(t.every(Boolean)).toBe(true);
  });

  it("未合格の人はドリッパーに入れない（役職ルールを条件なしにしても）", () => {
    const m = createModel();
    for (const name of ["A", "B"]) {
      m.availability.push({ name, date: D, start: "10:00", end: "12:00" });
      m.memberStores[name] = ["本店"];
    }
    m.memberStatuses = { A: "未合格", B: "1年目合格" };
    for (const k of Object.keys(m.roleRequirements)) m.roleRequirements[k] = "未設定";
    refreshDerived(m);
    for (const s of m.slots) s.count = s.store === "本店" && s.role === "ドリッパー" ? 2 : 0;
    autoAssign(m);
    const got = (role: string) => new Set(flattened(m).filter((x) => x.role === role).map((x) => m.assignments[x.key]));
    expect(got("ドリッパー")).toEqual(new Set(["B", undefined]));
    const x = flattened(m).find((y) => y.role === "ドリッパー")!;
    expect(fitsSlot(m, "A", { ...x, role: "レジ" })).toBe(true);
    expect(fitsSlot(m, "A", x)).toBe(false);
    expect(unfitReasons(m, "A", x)).toEqual(["ドリップ不可"]);
  });
  it("ドリッパーの記号（H・1・2）のある人は各時間1人まで、できなければ2人まで", () => {
    // ドリッパー3人の枠。ice：氏名 → アイス（○／×／1杯のみ／2杯のみ）
    const drip = (ice: Record<string, string>) => {
      const m = createModel();
      for (const [name, v] of Object.entries(ice)) {
        m.availability.push({ name, date: D, start: "10:00", end: "12:00" });
        m.memberStatuses[name] = "上級生";
        m.memberStores[name] = ["本店"];
        m.memberDrips[name] = dripsForIce(v);
      }
      refreshDerived(m);
      for (const s of m.slots) s.count = s.store === "本店" && s.role === "ドリッパー" ? 3 : 0;
      autoAssign(m);
      const at: Record<string, string[]> = {};
      for (const x of flattened(m)) if (m.assignments[x.key]) (at[x.start] ??= []).push(iceOf(m.memberDrips[m.assignments[x.key]]));
      return Object.values(at).map((ices) => [ices.length, ices.filter((i) => i !== "○").length]);
    };
    // ○ が2人いれば、記号のある人は各時間1人（H・1・2 は合わせて数える）
    expect(drip({ A: "×", B: "1杯のみ", C: "2杯のみ", D: "○", E: "○" }).every(([n, k]) => n === 3 && k === 1)).toBe(true);
    // ○ が1人なら2人まで（空けはしない）
    expect(drip({ A: "×", B: "1杯のみ", C: "2杯のみ", D: "○" }).every(([n, k]) => n === 3 && k === 2)).toBe(true);
  });
});
