import { describe, expect, it } from "vitest";
import {
  busyElsewhere,
  canTake,
  clearAssignment,
  columnRange,
  diffChanges,
  dropTargets,
  fitTargets,
  moveAssignment,
  moveSpan,
  pickName,
  pickerCandidates,
  previewMove,
  runTargets,
  snapshotAssignments,
  undoChanges,
} from "./assign";
import { flattened } from "./slots";
import { item, tinyModel } from "../test/fixtures";

const setup = () => {
  const m = tinyModel();
  return { m, key: (role: string, start: string, occ = 0) => item(m, role, start, occ).key };
};

describe("moveAssignment（30分のセル単位・どの枠へも）", () => {
  it("空いている枠へ、つかんだ30分のセルだけを移動", () => {
    const { m, key } = setup();
    m.assignments[key("レジ", "10:00")] = "A";
    const res = moveAssignment(m, key("レジ", "10:00"), key("ホール", "10:00"));
    expect(res).toEqual({
      ok: true,
      message: "A を 本番1日目 10:00〜 本店・ホール 1 に移動しました",
      changes: [
        ["assignments", key("レジ", "10:00"), "A", ""],
        ["assignments", key("ホール", "10:00"), "", "A"],
        // 手で入れた印（自動割当でそのままにする）
        ["manualSlots", key("ホール", "10:00"), "", "A"],
      ],
    });
    // 移動元は "" で残る
    expect(m.assignments[key("レジ", "10:00")]).toBe("");
    // 1時間のまとまりでも、つかんだ30分のセルだけを動かす（自動でまとめない）
    m.assignments[key("レジ", "10:30")] = "A";
    moveAssignment(m, key("レジ", "10:30"), key("ホール", "11:00"));
    expect(m.assignments[key("ホール", "11:00")]).toBe("A");
    expect(m.assignments[key("ホール", "11:30")]).toBeUndefined();
  });

  it("相手が元の枠の条件に合わなくても入れ替える（未割当にしない・条件外と添える）", () => {
    const { m, key } = setup();
    m.roleRequirements["本店|||レジ"] = "上級生";
    m.memberStatuses.B = "1年目合格";
    m.assignments[key("レジ", "10:00")] = "A";
    m.assignments[key("ホール", "10:00")] = "B";
    const res = moveAssignment(m, key("レジ", "10:00"), key("ホール", "10:00"));
    expect(res?.message).toBe("A と B を入れ替えました（条件外）");
    expect(m.assignments[key("レジ", "10:00")]).toBe("B");
    expect(m.assignments[key("ホール", "10:00")]).toBe("A");
  });

  it("条件・勤務可能時間・同じ時間の別の枠に関係なく移し、結果の注意を添える", () => {
    const { m, key } = setup();
    // 条件外：マスターは上級生のみ
    m.memberStatuses.A = "1年目合格";
    m.assignments[key("レジ", "10:00")] = "A";
    const before = structuredClone(m.assignments);
    const res = moveAssignment(m, key("レジ", "10:00"), key("マスター", "11:00"));
    expect(res?.ok).toBe(true);
    expect(res?.message).toBe("A を 本番1日目 11:00〜 本店・マスター に移動しました（条件外）");
    expect(m.assignments[key("マスター", "11:00")]).toBe("A");
    // 元に戻すと、前とまったく同じ
    undoChanges(m, res!.changes);
    expect(m.assignments).toEqual({ ...before, [key("マスター", "11:00")]: "" });
    // 重複・勤務できない時間
    m.availability = m.availability.map((a) => (a.name === "B" ? { ...a, end: "11:00" } : a));
    m.assignments[key("レジ", "10:00")] = "B";
    m.assignments[key("ホール", "11:30")] = "B";
    const res2 = moveAssignment(m, key("レジ", "10:00"), key("ホール", "11:30", 1));
    expect(res2?.message).toBe("B を 本番1日目 11:30〜 本店・ホール 2 に移動しました（重複・勤務できない時間）");
  });

  it("選んだ範囲をまとめて移す：時間のずれを保ち、移動先の人は元の時間へ入れ替わる", () => {
    const { m, key } = setup();
    m.assignments[key("レジ", "10:00")] = "A";
    m.assignments[key("レジ", "10:30")] = "A";
    m.assignments[key("ホール", "11:00")] = "B";
    m.assignments[key("ホール", "11:30")] = "C";
    const before = structuredClone(m.assignments);
    const sel = columnRange(m, key("レジ", "10:00"), key("レジ", "10:30"));
    expect(sel).toEqual([key("レジ", "10:00"), key("レジ", "10:30")]);
    // 下のセルをつかんで 11:30 に落とす → 11:00〜12:00 に入る
    const res = moveAssignment(m, key("レジ", "10:30"), key("ホール", "11:30"), sel);
    expect(res?.message).toBe("A を 11:00〜12:00 本店・ホール 1 に移動し、B・C と入れ替えました");
    expect(m.assignments[key("ホール", "11:00")]).toBe("A");
    expect(m.assignments[key("ホール", "11:30")]).toBe("A");
    expect(m.assignments[key("レジ", "10:00")]).toBe("B");
    expect(m.assignments[key("レジ", "10:30")]).toBe("C");
    // 元に戻すは1回で全部
    expect(undoChanges(m, res!.changes)).toBe("元に戻しました");
    expect(m.assignments).toEqual(before);
    // columnRange：同じ列の範囲（列が違えば後の枠だけ）
    expect(columnRange(m, key("レジ", "11:00"), key("レジ", "10:00"))).toEqual([key("レジ", "10:00"), key("レジ", "10:30"), key("レジ", "11:00")]);
    expect(columnRange(m, key("レジ", "10:00"), key("ホール", "11:00"))).toEqual([key("ホール", "11:00")]);
    expect(columnRange(m, key("レジ", "10:00"), "none-0")).toEqual([]);
  });

  it("範囲が移動先の列に入りきらなければ動かさない", () => {
    const { m, key } = setup();
    m.assignments[key("レジ", "11:00")] = "A";
    m.assignments[key("レジ", "11:30")] = "B";
    const before = structuredClone(m.assignments);
    const sel = columnRange(m, key("レジ", "11:00"), key("レジ", "11:30"));
    const res = moveAssignment(m, key("レジ", "11:00"), key("ホール", "11:30"), sel);
    expect(res).toEqual({ ok: false, message: "移動先の列には 12:00 の枠がないため、選んだ 2コマをまとめて移動できません", changes: [] });
    expect(m.assignments).toEqual(before);
    expect(moveSpan(m, key("レジ", "11:00"), key("ホール", "11:30"), sel)).toBe(0);
    expect(moveSpan(m, key("レジ", "11:00"), key("ホール", "11:00"), sel)).toBe(2);
    // 範囲に入っていない枠をつかめば、その枠だけ
    expect(moveSpan(m, key("ホール", "10:00"), key("ホール", "11:30"), sel)).toBe(0); // 移動元が空
    m.assignments[key("ホール", "10:00")] = "C";
    expect(moveSpan(m, key("ホール", "10:00"), key("ホール", "11:30"), sel)).toBe(1);
  });

  it("previewMove：Model を変えずに、入る枠と注意を返す", () => {
    const { m, key } = setup();
    m.memberStatuses.A = "1年目合格";
    m.assignments[key("レジ", "10:00")] = "A";
    const before = structuredClone(m.assignments);
    const pv = previewMove(m, key("レジ", "10:00"), key("マスター", "10:30"));
    expect(pv?.plan.ok).toBe(true);
    expect(pv?.plan.cells.map((c) => c.target?.key)).toEqual([key("マスター", "10:30")]);
    expect(pv?.issues).toEqual(["条件外"]);
    expect(m.assignments).toEqual(before);
  });

  it("何もしないときは null", () => {
    const { m, key } = setup();
    expect(moveAssignment(m, key("レジ", "10:00"), key("ホール", "10:00"))).toBeNull(); // 移動元が空
    m.assignments[key("レジ", "10:00")] = "A";
    expect(moveAssignment(m, key("レジ", "10:00"), key("レジ", "10:00"))).toBeNull();
    expect(moveAssignment(m, key("レジ", "10:00"), "none-0")).toBeNull();
    // 同じ人の別の枠へ落としても変わらない（元に戻すものもない）
    m.assignments[key("ホール", "11:00")] = "A";
    expect(moveAssignment(m, key("レジ", "10:00"), key("ホール", "11:00"))?.changes).toEqual([]);
  });

});

describe("runTargets / pickName / 候補", () => {
  it("runTargets：同じ役職の次の枠に続けて入れる（limit まで・埋まった枠で止まる）", () => {
    const { m } = setup();
    const x = item(m, "レジ", "10:00");
    expect(runTargets(m, x, "A").map((y) => y.start)).toEqual(["10:00", "10:30", "11:00", "11:30"]);
    expect(runTargets(m, x, "A", 2).map((y) => y.start)).toEqual(["10:00", "10:30"]);
    // 埋まっている枠で止まる
    m.assignments[item(m, "レジ", "11:00").key] = "B";
    expect(runTargets(m, x, "A").map((y) => y.start)).toEqual(["10:00", "10:30"]);
    // 自分が入っている枠は飛ばして数えない
    m.assignments[item(m, "レジ", "10:30").key] = "A";
    expect(runTargets(m, x, "A", 3).map((y) => y.start)).toEqual(["10:00"]);
    // 別の番目が空いていれば、そちらに続ける
    const m2 = setup().m;
    const h = item(m2, "ホール", "10:00", 0);
    m2.assignments[item(m2, "ホール", "10:30", 0).key] = "B";
    expect(runTargets(m2, h, "A", 2).map((y) => y.key)).toEqual([h.key, item(m2, "ホール", "10:30", 1).key]);
  });

  it("pickName：空いていれば続けて、勤務中ならそこから移す", () => {
    const { m, key } = setup();
    const res = pickName(m, key("レジ", "10:00"), "A", 2);
    expect(res?.message).toBe("A を 10:00〜11:00 本店・レジ に割り当てました");
    const res2 = pickName(m, key("ホール", "10:00"), "A");
    expect(res2?.message).toBe("A を 本店・レジ から 本店・ホール 1 へ移動しました");
    expect(m.assignments[key("レジ", "10:00")]).toBe("");
    expect(m.assignments[key("レジ", "10:30")]).toBe("A");
    expect(pickName(m, "none-0", "A")).toBeNull();
  });

  it("pickerCandidates：空いている人と勤務中の人に分け、検索で絞る", () => {
    const { m, key } = setup();
    m.assignments[key("ホール", "10:00")] = "B";
    m.memberWants.C = ["レジ"];
    const x = item(m, "レジ", "10:00");
    const { free, busy } = pickerCandidates(m, x);
    expect(free.map((c) => c.name)).toEqual(["C", "A"]); // やりたい役職の人が先
    expect(busy.map((c) => [c.name, c.busyAt.map((y) => y.role)])).toEqual([["B", ["ホール"]]]);
    expect(free[0].windows).toBe("10:00–12:00");
    expect(pickerCandidates(m, x, " Ａ ").free.map((c) => c.name)).toEqual(["A"]);
  });

  it("busyElsewhere / canTake / dropTargets / fitTargets", () => {
    const { m, key } = setup();
    m.memberStatuses.A = "1年目合格";
    m.assignments[key("レジ", "10:00")] = "A";
    m.assignments[key("ホール", "11:00")] = "A";
    const hall = item(m, "ホール", "10:00");
    expect(busyElsewhere(m, "A", hall, [])).toBe(true);
    expect(busyElsewhere(m, "A", hall, [key("レジ", "10:00")])).toBe(false);
    expect(canTake(m, "A", item(m, "ホール", "10:30"), [])).toBe(true);
    // 移動先：移動元以外のすべての枠
    const targets = dropTargets(m, key("レジ", "10:00"));
    expect(targets.size).toBe(flattened(m).length - 1);
    expect(targets.has(key("レジ", "10:00"))).toBe(false);
    expect(targets.has(key("マスター", "10:00"))).toBe(true);
    // 緑：条件に合い、同じ時間の別の枠に入っておらず、すでにその枠にいない
    const fit = fitTargets(m, key("レジ", "10:00"));
    expect(fit.has(hall.key)).toBe(true);
    expect(fit.has(key("マスター", "10:00"))).toBe(false); // 上級生のみ
    expect(fit.has(key("ホール", "11:00"))).toBe(false); // 自分がいる
    expect(fit.has(key("ホール", "11:00", 1))).toBe(false); // 同じ時間に別の枠
    // 範囲：全部のセルが入り、全員が条件に合う移動先だけ
    m.assignments[key("レジ", "10:30")] = "B";
    const sel = [key("レジ", "10:00"), key("レジ", "10:30")];
    const fit2 = fitTargets(m, key("レジ", "10:00"), sel);
    expect(fit2.has(key("ホール", "10:00"))).toBe(true);
    expect(fit2.has(key("ホール", "11:30"))).toBe(false); // 12:00 がない
    expect(fit2.has(key("ホール", "10:30", 1))).toBe(true);
    expect(fit2.has(key("ホール", "11:00", 1))).toBe(false); // A が同じ時間のホール 1 にいる
  });
});

describe("元に戻す", () => {
  it("差分を戻し、その後に変わった枠はそのまま。外すも戻せる", () => {
    const { m, key } = setup();
    const before = snapshotAssignments(m);
    m.assignments[key("レジ", "10:00")] = "A";
    m.assignments[key("レジ", "10:30")] = "A";
    const changes = diffChanges(before, m);
    expect(changes.length).toBe(2);
    m.assignments[key("レジ", "10:30")] = "B";
    expect(undoChanges(m, changes)).toBe("元に戻しました（その後に変更された 1 枠はそのままです）");
    expect(m.assignments[key("レジ", "10:00")]).toBe("");
    expect(m.assignments[key("レジ", "10:30")]).toBe("B");
    // 外す
    m.assignments[key("レジ", "10:00")] = "A";
    const res = clearAssignment(m, key("レジ", "10:00"));
    expect(res.message).toBe("A を外しました");
    expect(undoChanges(m, res.changes)).toBe("元に戻しました");
    expect(m.assignments[key("レジ", "10:00")]).toBe("A");
  });
});
