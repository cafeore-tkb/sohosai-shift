import { describe, expect, it } from "vitest";
import { assignmentAudit, carlessItems } from "./audit";
import { carlessIssues } from "./auditIssues";
import { autoAssign, isMasterSlot } from "./autoAssign";
import { clearPins, filledChanges, isPinned, pickName, pinTargets, pinnedCount, setPinned } from "./assign";
import { autoRules, setAutoRule } from "./autoRules";
import { createModel } from "./model";
import type { Model } from "./types";
import { refreshDerived } from "./model";
import { available, canWorkAt, fitsSlot, levelOf, posKey, ruleKey, unfitReasons } from "./rules";
import { setRoleRequirement } from "./members";
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
  it("ドリッパーに入れる人は全員、全日程で1時間以上ドリッパーに入る", () => {
    const drips = items.filter((x) => x.store === "本店" && x.role === "ドリッパー");
    const can = new Set(drips.flatMap((x) => available(m, x).map((a) => a.name)));
    const hours: Record<string, number> = {};
    for (const x of drips) if (m.assignments[x.key]) hours[m.assignments[x.key]] = (hours[m.assignments[x.key]] || 0) + 0.5;
    expect(can.size).toBeGreaterThan(30);
    expect([...can].filter((n) => (hours[n] || 0) < 1)).toEqual([]);
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
  it("買い出しは誰でも入れるが、各時間に車ありの人を1人以上（いなければ勤務状況チェックに出る）", () => {
    const m = tinyModel();
    m.availability.forEach((a) => (a.date = "2026-10-30"));
    m.slots = [];
    refreshDerived(m);
    m.memberCars.B = true;
    for (const s of m.slots) s.count = s.role === "買い出し" ? 2 : 0;
    autoAssign(m);
    const buyers = flattened(m).filter((x) => x.role === "買い出し");
    const times = [...new Set(buyers.map((x) => x.start))];
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      const names = buyers.filter((x) => x.start === t).map((x) => m.assignments[x.key]);
      expect(names).toContain("B");
      expect(names.filter(Boolean)).toHaveLength(2);
    }
    expect(carlessItems(m)).toEqual([]);
    // 車ありの人を外すと、その時間が出る
    const withB = buyers.filter((x) => m.assignments[x.key] === "B");
    for (const x of withB) m.assignments[x.key] = "";
    expect(carlessItems(m).length).toBe(withB.length);
    expect(carlessIssues(m)[0].where).toMatch(/^前日準備 10:00–.+ 買い出し$/);
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

  it("ドリッパーの条件は1年目合格より下げられない（未合格・未設定の人は入れない。旧データの「条件なし」も）", () => {
    const m = createModel();
    for (const name of ["A", "B", "C"]) {
      m.availability.push({ name, date: D, start: "10:00", end: "12:00" });
      m.memberStores[name] = ["本店"];
    }
    m.memberStatuses = { A: "未合格", C: "1年目合格" };
    const k = ruleKey("本店", "ドリッパー");
    setRoleRequirement(m, k, "未合格");
    expect(m.roleRequirements[k]).toBe("1年目合格");
    setRoleRequirement(m, posKey("本店", "ドリッパー", 1), "未合格");
    expect(m.roleRequirements[posKey("本店", "ドリッパー", 1)]).toBe("未設定");
    // 旧データ：条件なし
    for (const key of Object.keys(m.roleRequirements)) m.roleRequirements[key] = "未設定";
    refreshDerived(m);
    for (const s of m.slots) s.count = s.store === "本店" && s.role === "ドリッパー" ? 3 : 0;
    autoAssign(m);
    const got = new Set(flattened(m).filter((x) => x.role === "ドリッパー").map((x) => m.assignments[x.key]));
    expect(got).toEqual(new Set(["C", undefined]));
    const x = flattened(m).find((y) => y.role === "ドリッパー")!;
    expect(unfitReasons(m, "A", x)).toEqual(["ステータス"]);
    expect(fitsSlot(m, "A", { ...x, role: "レジ" })).toBe(true);
  });
  it("ドリッパーは、まだ1時間入っていない人から（続けて入れるより先）", () => {
    // ドリッパー1人の枠に A・B（10:00〜12:00）。続けて入れる・目安なしでも、2人とも1時間ずつ
    const m = oneRole("ドリッパー", all("10:00", "12:00", "A", "B"), (m) => {
      setAutoRule(m, "availPercent", 0);
      setAutoRule(m, "maxRunHours", 0);
    });
    const r = runs(timeline(m, "ドリッパー"));
    expect(r).toEqual({ A: [60], B: [60] });
    // B は 11:30 まで（あとがない）：先に B を入れて、A はあとから
    const m2 = oneRole("ドリッパー", { A: ["10:00", "12:00"], B: ["10:00", "11:30"] }, (m) => setAutoRule(m, "availPercent", 0));
    expect(timeline(m2, "ドリッパー").slice(0, 4)).toEqual(["B", "B", "A", "A"]);
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

  it("固定したコマはそのままにして、ほかをやり直す（人を替えた・固定を外したコマはやり直す）", () => {
    const m = oneRole("レジ", all("10:00", "19:00", "A", "B", "C"));
    const x = item(m, "レジ", "12:00");
    const other = ["A", "B", "C"].find((n) => n !== m.assignments[x.key])!;
    // 手で動かしただけでは固定しない
    const r = pickName(m, x.key, other, 2)!;
    expect(isPinned(m, x.key)).toBe(false);
    // 固定の対象は、その人が続けて入っているコマ
    const keys = pinTargets(m, x.key);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(filledChanges(m, r.changes).every((k) => keys.includes(k))).toBe(true);
    expect(setPinned(m, keys, true)).toBe(keys.length);
    expect(pinnedCount(m)).toBe(keys.length);
    expect(autoAssign(m).kept).toBe(keys.length);
    for (const k of keys) expect(m.assignments[k]).toBe(other);
    // 固定した人も連続の上限に数える
    for (const run of Object.values(runs(timeline(m, "レジ"))).flat()) expect(run).toBeLessThanOrEqual(180);
    // 人を替えると固定は外れる
    m.assignments[keys[0]] = "Z";
    expect(isPinned(m, keys[0])).toBe(false);
    m.assignments[keys[0]] = other;
    expect(setPinned(m, keys, false)).toBe(keys.length);
    expect(autoAssign(m).kept).toBe(0);
    // 範囲を選んでいれば範囲ごと
    const range = [item(m, "レジ", "15:00").key, item(m, "レジ", "15:30").key, item(m, "レジ", "16:00").key];
    expect(pinTargets(m, range[1], range)).toEqual(range);
    setPinned(m, range, true);
    clearPins(m);
    expect(pinnedCount(m)).toBe(0);
  });
});
