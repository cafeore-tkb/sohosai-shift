import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModel, flattened } from "../domain";
import * as actions from "./actions";
import { handleKeyDown, isTypingTarget } from "./keys";
import { store } from "./store";

/** keydown の代わり（修飾キーは既定 false） */
function key(k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean; keyCode: number }> = {}) {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods, preventDefault: vi.fn() };
}
/** activeElement の代わり */
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as Element;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { scrollTo: vi.fn(), confirm: vi.fn(() => true), alert: vi.fn(), open: vi.fn(() => null) });
  Object.assign(store.model, createModel());
  store.ui = { ...store.ui, picker: null, movingKey: null, selection: [], selAnchor: null, moveMode: "", shiftFocus: false, helpOpen: false, menu: null, toast: null, toastVisible: false };
  store.lastChange = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("handleKeyDown", () => {
  it("1–5 はタブ（データがなければ 読み込み・役職ルール だけ）、F は全画面、? はヘルプ", () => {
    const body = el("BODY");
    expect(handleKeyDown(key("4"), body)).toBe(true);
    expect(store.model.view).toBe("rules");
    expect(handleKeyDown(key("5"), body)).toBe(false); // データなし → シフト調整は開けない
    actions.loadSample();
    expect(handleKeyDown(key("3"), body)).toBe(true);
    expect(store.model.view).toBe("members");
    actions.showView("shift");
    handleKeyDown(key("f"), body);
    expect(store.ui.shiftFocus).toBe(true);
    handleKeyDown(key("F"), body);
    expect(store.ui.shiftFocus).toBe(false);
    handleKeyDown(key("?", { shiftKey: true }), body);
    expect(store.ui.helpOpen).toBe(true);
    handleKeyDown(key("?", { shiftKey: true }), body);
    expect(store.ui.helpOpen).toBe(false);
  });

  it("文字の入力中・修飾キー・変換中・Shift+数字では効かない", () => {
    actions.loadSample();
    actions.showView("import");
    expect(handleKeyDown(key("5"), el("INPUT", { type: "text" }))).toBe(false);
    expect(handleKeyDown(key("5"), el("SELECT"))).toBe(false);
    expect(handleKeyDown(key("5", { metaKey: true }), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("5", { altKey: true }), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("5", { isComposing: true }), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("5", { shiftKey: true }), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("f"), el("INPUT", { type: "search" }))).toBe(false);
    expect(handleKeyDown(key("?"), el("TEXTAREA"))).toBe(false);
    expect(store.model.view).toBe("import");
    // checkbox（フルネームのスイッチなど）にフォーカスがあっても効く
    expect(handleKeyDown(key("5"), el("INPUT", { type: "checkbox" }))).toBe(true);
    expect(store.model.view).toBe("shift");
    expect([el("INPUT", { type: "number" }), el("DIV", { isContentEditable: true }), el("BUTTON"), null].map(isTypingTarget)).toEqual([true, true, false, false]);
  });

  it("担当者ポップアップ・⋯ メニュー・ドロワーの中では 1–5・F が効かない（? はメニュー・ドロワーでは効く）", () => {
    actions.loadSample();
    actions.openPicker(flattened(store.model)[0].key);
    expect(handleKeyDown(key("1"), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("?"), el("BODY"))).toBe(false);
    actions.escape();
    actions.setMenu("shift");
    expect(handleKeyDown(key("1"), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("?"), el("BODY"))).toBe(true);
    actions.setMenu(null);
    actions.toggleHelp(false);
    const inDrawer = el("BUTTON", { closest: (sel: string) => (sel.includes("[data-overlay]") ? {} : null) });
    expect(handleKeyDown(key("3"), inDrawer)).toBe(false);
    expect(handleKeyDown(key("f"), inDrawer)).toBe(false);
    expect(store.model.view).toBe("shift");
    expect(store.ui.shiftFocus).toBe(false);
    expect(handleKeyDown(key("?"), inDrawer)).toBe(true);
    expect(store.ui.helpOpen).toBe(true);
  });

  it("Esc は共同編集のダイアログ → メニュー → ヘルプ → 全画面 の順に閉じる（変換中は何も閉じない・preventDefault しない）", () => {
    actions.loadSample();
    actions.toggleFullscreen();
    actions.toggleHelp(true);
    actions.setMenu("appbar");
    store.setShare({ dialogOpen: true });
    const esc = key("Escape");
    handleKeyDown(esc, el("BODY"));
    expect(store.ui.menu).toBe("appbar");
    store.setShare({ dialogOpen: false });
    handleKeyDown(key("Escape", { isComposing: true }), el("INPUT", { type: "search" }));
    handleKeyDown(key("Escape", { keyCode: 229 }), el("INPUT", { type: "search" }));
    expect(store.ui.menu).toBe("appbar");
    expect(handleKeyDown(esc, el("BODY"))).toBe(false);
    expect(store.ui.menu).toBe(null);
    expect(store.ui.helpOpen).toBe(true);
    handleKeyDown(esc, el("BODY"));
    expect(store.ui.helpOpen).toBe(false);
    expect(store.ui.shiftFocus).toBe(true);
    handleKeyDown(esc, el("BODY"));
    expect(store.ui.shiftFocus).toBe(false);
    expect(esc.preventDefault).not.toHaveBeenCalled();
  });

  it("⌘Z／Ctrl+Z は旧版と同じ：戻せる変更があり、input・textarea の外なら元に戻す（select の中でも効く）", () => {
    actions.loadSample();
    const k = flattened(store.model)[0].key;
    actions.openPicker(k);
    actions.pickName(store.model.availability[0].name);
    const changed = store.lastChange;
    expect(handleKeyDown(key("z", { metaKey: true }), el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(store.lastChange).toBe(changed);
    const z = key("z", { ctrlKey: true });
    expect(handleKeyDown(z, el("SELECT"))).toBe(true);
    expect(z.preventDefault).toHaveBeenCalled();
    expect(store.lastChange).toBe(null);
    // 元に戻した枠を光らせ、FLASH_MS のあと消える
    expect([...store.ui.flash!.keys]).toEqual(changed!.map((c) => c[1]));
    vi.advanceTimersByTime(900);
    expect(store.ui.flash).toBe(null);
  });
});

describe("reveal", () => {
  it("revealSlot はシフト調整・その日・役職別に合わせ、表に依頼を出して光らせる", () => {
    actions.loadSample();
    const item = flattened(store.model).find((x) => x.date !== store.model.gridDate && x.store === "2号店")!;
    actions.showView("members");
    actions.setGridStore("本店");
    actions.setGridMode("person");
    expect(actions.revealSlot(item.key)).toBe(true);
    const m = store.model;
    expect([m.view, m.gridDate, m.gridStore, m.gridMode]).toEqual(["shift", item.date, "", "role"]);
    const req = store.ui.reveal!;
    expect(req).toMatchObject({ kind: "slot", key: item.key });
    expect(store.ui.flash!.keys.has(item.key)).toBe(true);
    actions.revealDone(req.seq + 1); // 古い／違う依頼の完了では消えない
    expect(store.ui.reveal).toBe(req);
    actions.revealDone(req.seq);
    expect(store.ui.reveal).toBe(null);
    expect(actions.revealSlot("no-such-key")).toBe(false);
    // 「一覧」表示中は日付を変えない
    actions.setGridDate("all");
    actions.revealSlot(item.key);
    expect(store.model.gridDate).toBe("all");
  });
});
