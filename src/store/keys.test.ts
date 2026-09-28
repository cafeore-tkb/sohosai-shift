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

describe("isTypingTarget", () => {
  it("文字の input・select・textarea は入力中、checkbox・button は違う", () => {
    expect(isTypingTarget(el("INPUT", { type: "text" }))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "number" }))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("DIV", { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("handleKeyDown", () => {
  it("1–5 はタブ（データがなければ 読み込み・役職ルール だけ）", () => {
    const body = el("BODY");
    expect(handleKeyDown(key("4"), body)).toBe(true);
    expect(store.model.view).toBe("rules");
    expect(handleKeyDown(key("5"), body)).toBe(false); // データなし → シフト調整は開けない
    actions.loadSample();
    expect(handleKeyDown(key("3"), body)).toBe(true);
    expect(store.model.view).toBe("members");
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
  });

  it("F は シフト調整 の全画面、? はヘルプ（開閉）", () => {
    const body = el("BODY");
    expect(handleKeyDown(key("f"), body)).toBe(false); // データなし
    actions.loadSample();
    expect(store.model.view).toBe("shift");
    handleKeyDown(key("f"), body);
    expect(store.ui.shiftFocus).toBe(true);
    handleKeyDown(key("F"), body);
    expect(store.ui.shiftFocus).toBe(false);
    handleKeyDown(key("?", { shiftKey: true }), body);
    expect(store.ui.helpOpen).toBe(true);
    handleKeyDown(key("?", { shiftKey: true }), body);
    expect(store.ui.helpOpen).toBe(false);
  });

  it("担当者ポップアップ・移動中は 1–5・F・? を無視する", () => {
    actions.loadSample();
    actions.openPicker(flattened(store.model)[0].key);
    expect(handleKeyDown(key("1"), el("BODY"))).toBe(false);
    expect(handleKeyDown(key("?"), el("BODY"))).toBe(false);
    expect(store.model.view).toBe("shift");
  });

  it("ドロワー・ヘルプ・ダイアログの中にフォーカスがあると 1–5・F は効かない（? は効く）", () => {
    actions.loadSample();
    const inDrawer = el("BUTTON", { closest: (sel: string) => (sel.includes("[data-overlay]") ? {} : null) });
    expect(handleKeyDown(key("3"), inDrawer)).toBe(false);
    expect(handleKeyDown(key("f"), inDrawer)).toBe(false);
    expect(store.model.view).toBe("shift");
    expect(store.ui.shiftFocus).toBe(false);
    expect(handleKeyDown(key("?"), inDrawer)).toBe(true);
    expect(store.ui.helpOpen).toBe(true);
  });

  it("共同編集のダイアログが開いているときの Esc はダイアログだけ（下のドロワーは閉じない）", () => {
    actions.loadSample();
    actions.toggleAudit(true);
    store.setShare({ dialogOpen: true });
    handleKeyDown(key("Escape"), el("BODY"));
    expect(store.ui.auditOpen).toBe(true);
    store.setShare({ dialogOpen: false });
    handleKeyDown(key("Escape"), el("BODY"));
    expect(store.ui.auditOpen).toBe(false);
  });

  it("変換中の Esc（isComposing・keyCode 229）は何も閉じない（変換の取り消しだけ）", () => {
    actions.loadSample();
    actions.toggleAudit(true);
    handleKeyDown(key("Escape", { isComposing: true }), el("INPUT", { type: "search" }));
    handleKeyDown(key("Escape", { keyCode: 229 }), el("INPUT", { type: "search" }));
    expect(store.ui.auditOpen).toBe(true);
    handleKeyDown(key("Escape"), el("BODY"));
    expect(store.ui.auditOpen).toBe(false);
  });

  it("⋯ メニューが開いている間は 1–5 などが効かない（? は効く）", () => {
    actions.loadSample();
    actions.setMenu("shift");
    const view = store.model.view;
    expect(handleKeyDown(key("1"), el("BODY"))).toBe(false);
    expect(store.model.view).toBe(view);
    expect(handleKeyDown(key("?"), el("BODY"))).toBe(true);
  });

  it("Esc はメニュー → ヘルプ → 全画面 の順に閉じる（preventDefault しない）", () => {
    actions.loadSample();
    actions.toggleFullscreen();
    actions.toggleHelp(true);
    actions.setMenu("appbar");
    const esc = key("Escape");
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
    expect(store.ui.flash?.keys.has(changed![0][1])).toBe(true);
  });
});

describe("flash / reveal", () => {
  it("割当の変更と元に戻すは変わった枠を光らせ、FLASH_MS のあと消える", () => {
    actions.loadSample();
    const k = flattened(store.model)[0].key;
    actions.openPicker(k);
    actions.pickName(store.model.availability[0].name);
    const keys = store.lastChange!.map((c) => c[1]);
    expect([...store.ui.flash!.keys]).toEqual(keys);
    vi.advanceTimersByTime(900);
    expect(store.ui.flash).toBe(null);
    actions.undoLastChange();
    expect([...store.ui.flash!.keys]).toEqual(keys);
  });

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
  });

  it("「一覧」表示中の revealSlot は日付を変えない", () => {
    actions.loadSample();
    actions.setGridDate("all");
    const item = flattened(store.model)[5];
    actions.revealSlot(item.key);
    expect(store.model.gridDate).toBe("all");
  });
});
