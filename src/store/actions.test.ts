import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allNames, createModel, flattened, plusSlot, sameColumn } from "../domain";
import * as actions from "./actions";
import { store } from "./store";

const confirm = vi.fn(() => true);
const alert = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { scrollTo: vi.fn(), confirm, alert, open: vi.fn(() => null) });
  Object.assign(store.model, createModel());
  store.ui = { ...store.ui, picker: null, movingKey: null, selection: [], selAnchor: null, moveMode: "", auditOpen: false, countsOpen: false, shiftFocus: false, importStatus: null, toast: null, toastVisible: false };
  store.lastChange = null;
  store.canImportCSV = () => true;
  store.onStateChange = null;
  confirm.mockClear();
  alert.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


describe("store actions", () => {
  it("表示だけの変更では dataVersion（派生データの作り直し）は増えない", () => {
    actions.loadSample();
    const v = store.dataVersion;
    actions.setMemberQuery("山");
    actions.setGridDate("all");
    actions.showView("members");
    expect(store.dataVersion).toBe(v);
    actions.runAutoAssign();
    expect(store.dataVersion).toBe(v + 1);
    store.dataChanged();
    expect(store.dataVersion).toBe(v + 2);
  });

  it("loads the sample (shift view, intro text); blocked while the co-editing lock is on", () => {
    actions.loadSample();
    const m = store.model;
    expect(m.view).toBe("shift");
    expect(m.availability.length).toBe(155);
    expect(m.gridDate).toBe("2026-10-30");
    expect(m.slots.length).toBeGreaterThan(0);
    expect(store.ui.importStatus?.lines).toHaveLength(1);
    expect(store.ui.importStatus?.lines[0].text).toMatch(/^2025年ベースのサンプル（架空の50名・3日間/);
    // 共同編集のロック中は読み込めない
    store.canImportCSV = () => false;
    Object.assign(store.model, createModel());
    actions.loadSample();
    expect(alert).toHaveBeenCalledWith("共同編集中のため、CSVの読み込みは管理者だけができます。");
    expect(store.model.availability).toHaveLength(0);
  });

  it("auto-assigns with a toast, and asks before replacing", () => {
    actions.loadSample();
    actions.runAutoAssign();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.ui.toast?.message).toBe("自動割当しました。空いている枠はオレンジ色で表示されます");
    actions.runAutoAssign();
    expect(confirm).toHaveBeenCalledWith("いまの割当を置き換えて、自動割当をやり直しますか？");
  });

  it("picks from the picker and undoes", () => {
    actions.loadSample();
    const key = flattened(store.model).find((x) => x.role === "レジ")!.key;
    actions.openPicker(key);
    expect(store.ui.picker?.key).toBe(key);
    const before = JSON.stringify(store.model.assignments);
    const name = store.model.availability.find((a) => a.date === store.model.gridDate)!.name;
    actions.pickName(name);
    expect(store.ui.picker).toBeNull();
    if (store.lastChange) {
      expect(store.ui.toast?.action?.label).toBe("元に戻す");
      actions.undoLastChange();
      expect(store.ui.toast?.message).toBe("元に戻しました");
      expect(Object.values(store.model.assignments).filter(Boolean)).toEqual(Object.values(JSON.parse(before)).filter(Boolean));
    }
  });

  it("toast hides after 3.5s (7s with an action); sticky stays", () => {
    store.showToast("a");
    vi.advanceTimersByTime(3499);
    expect(store.ui.toastVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.ui.toastVisible).toBe(false);
    store.showToast("b", false, { label: "x", run: () => {} });
    vi.advanceTimersByTime(6999);
    expect(store.ui.toastVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.ui.toastVisible).toBe(false);
    store.showToast("c", true);
    vi.advanceTimersByTime(60000);
    expect(store.ui.toastVisible).toBe(true);
  });

  it("Esc closes picker, then moving, then counts, audit, fullscreen", () => {
    actions.loadSample();
    actions.runAutoAssign();
    store.setUi({ shiftFocus: true });
    actions.toggleAudit();
    const key = flattened(store.model).find((x) => store.model.assignments[x.key])!.key;
    actions.openPicker(key);
    actions.escape();
    expect(store.ui.picker).toBeNull();
    actions.openPicker(key);
    actions.startMove();
    expect(store.ui.movingKey).toBe(key);
    expect(store.ui.toastVisible).toBe(true);
    actions.escape();
    expect(store.ui.movingKey).toBeNull();
    expect(store.ui.toastVisible).toBe(false);
    expect(store.ui.auditOpen).toBe(true);
    actions.escape();
    expect(store.ui.auditOpen).toBe(false);
    expect(store.ui.shiftFocus).toBe(true);
    actions.escape();
    expect(store.ui.shiftFocus).toBe(false);
  });

  it("範囲の選択（Shift＋クリック）→「移動…」でまとめて移動（別の列・別の時間）→ 元に戻すは1回 → Esc で選択をやめる", () => {
    actions.loadSample();
    actions.runAutoAssign();
    const m = store.model,
      items = flattened(m);
    const next = (x: (typeof items)[number]) => items.find((y) => sameColumn(x, y) && y.start === plusSlot(x.start));
    const a = items.find((x) => m.assignments[x.key] && next(x))!,
      b = next(a)!;
    const dst = items.find((x) => !sameColumn(x, a) && x.date === a.date && x.start > b.start && next(x))!,
      dst2 = next(dst)!;
    const filled = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
    const before = structuredClone(m.assignments);
    // 普通のクリック（ポップアップ）が起点、Shift＋クリックで範囲。ポップアップは閉じる
    actions.openPicker(a.key);
    expect(store.ui.selection).toEqual([]);
    actions.selectTo(b.key);
    expect(store.ui.picker).toBeNull();
    expect(store.ui.selection).toEqual([a.key, b.key]);
    // 範囲の中の枠のポップアップ →「移動…」は範囲ごと
    actions.openPicker(a.key);
    expect(store.ui.selection).toEqual([a.key, b.key]);
    actions.startMove();
    expect(store.ui.toast?.message).toMatch(/2コマ を移動中/);
    actions.clickMoveTarget(dst.key);
    expect(m.assignments[dst.key]).toBe(before[a.key]);
    expect(m.assignments[dst2.key] || "").toBe(before[b.key] || "");
    expect(m.assignments[a.key] || "").toBe(before[dst.key] || "");
    expect(m.assignments[b.key] || "").toBe(before[dst2.key] || "");
    // 選択は移動先へ
    expect(store.ui.selection).toEqual([dst.key, dst2.key]);
    actions.undoShortcut();
    expect(filled(m.assignments)).toEqual(filled(before));
    actions.escape();
    expect(store.ui.selection).toEqual([]);
  });

  it("opening counts closes the audit drawer and follows the grid date; a blank bulk count does nothing", () => {
    actions.loadSample();
    actions.toggleAudit(true);
    actions.setGridDate("2026-10-31");
    actions.toggleCounts(true);
    expect(store.ui.auditOpen).toBe(false);
    expect(store.ui.countsOpen).toBe(true);
    expect(store.model.countDate).toBe("2026-10-31");
    // 空欄の一括指定は何もしない
    const before = JSON.stringify(store.model.slotCounts);
    expect(actions.changeRoleCounts("本店|||マスター", "")).toBe(false);
    expect(JSON.stringify(store.model.slotCounts)).toBe(before);
    expect(actions.changeRoleCounts("本店|||マスター", "2")).toBe(true);
  });

  it("member order: sort / move write the shared order, push, and undo from the toast (blocked after a later change)", () => {
    const m = store.model;
    m.availability = ["おの", "あべ", "いとう"].map((name) => ({ name, date: "2026-10-31", start: "10:00", end: "11:00" }));
    m.memberStatuses = { いとう: "上級生", おの: "2年目合格" };
    const push = vi.fn();
    store.onStateChange = push;
    actions.setGridDate(""); // 表示だけの変更は送らない
    expect(push).not.toHaveBeenCalled();
    actions.sortMembers("status");
    expect(allNames(m)).toEqual(["いとう", "おの", "あべ"]);
    expect(push).toHaveBeenCalled();
    expect(store.ui.toast?.message).toBe("メンバーを学年順に並べ替えました");
    actions.moveMemberTo("あべ", ["いとう", "おの", "あべ"], 0);
    expect(allNames(m)).toEqual(["あべ", "いとう", "おの"]);
    expect(store.ui.toast?.message).toBe("あべ を 1 / 3 番目に移動しました");
    store.ui.toast?.action?.run();
    expect(allNames(m)).toEqual(["いとう", "おの", "あべ"]);
    expect(store.ui.toast?.message).toBe("元に戻しました");
    // その後に（共同編集の相手などが）変えていれば戻さない
    actions.sortMembers("kana");
    const undo = store.ui.toast?.action;
    m.memberOrder = { ...m.memberOrder, おの: 0 };
    undo?.run();
    expect(store.ui.toast?.message).toBe("その後に変更があったため元に戻せません");
    expect(allNames(m)).toEqual(["おの", "あべ", "いとう"]);
  });
});
