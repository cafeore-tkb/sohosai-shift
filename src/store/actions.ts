// ユーザー操作（旧版のイベントハンドラ1つにつき1つ）。domain を呼び、トースト・確認・元に戻す・再描画を行う
// 文言・確認ダイアログ・副作用の順序は旧版と同じ。

import {
  AVAILABILITY_CHANGED,
  memberSortLabel,
  allNames,
  memberMovedMessage,
  memberSortedMessage,
  moveMember,
  setMemberOrder,
  sortedMembers,
  EXPORT_FILE,
  IMPORT_ADMIN_ONLY,
  PRINT_FILE,
  SAMPLE_FILE,
  SAMPLE_INTRO,
  TEMPLATE_FILE,
  UNDONE,
  UNDO_BLOCKED,
  addedMemberMessage,
  applyAvailability,
  autoAssign,
  clearAll,
  clearAssignment,
  dayName,
  decodeCsvBytes,
  eventDates,
  exportCsv,
  fixCountDateOf,
  flattened,
  hasAssignments,
  importFailedMessage,
  importSurvey,
  columnRange,
  moveAssignment,
  movingMessage,
  planMove,
  pickName as pickNameIn,
  prunedMessage,
  pruneAssignments,
  resetCounts,
  resetForSample,
  sampleCsv,
  sendToBreak,
  setMemberCar,
  setMemberDislikes,
  setMemberIce,
  setMemberStatus,
  setMemberStore,
  setMemberWants,
  setMemberWorkload,
  setRoleCounts,
  setRoleRequirement,
  setSlotCount,
  splitRuleKey,
  templateCsv,
  undoChanges,
} from "../domain";
import type { AvailabilityChanges, EditResult, GridMode, MemberSort, SortDir, View } from "../domain";
import { printShiftHtml } from "../print/printHtml";
import { ask, download, openHtmlWindow, scrollToTop, tell } from "./browser";
import { movingRange, store } from "./store";

const M = () => store.model;

// ---- 画面の切り替え ----

/** タブ・「シフト調整へ進む」 */
export function showView(view: View): void {
  M().view = view;
  store.commit({ push: false });
  scrollToTop();
}

// ---- 読み込み ----

function importAllowed(): boolean {
  if (store.canImportCSV() === false) {
    tell(IMPORT_ADMIN_ONLY);
    return false;
  }
  return true;
}

/** CSV を読み込んで結果を表示する（失敗したら Error。Model はそのまま） */
function importText(text: string, intro?: string): void {
  const { messages, warns } = importSurvey(M(), text);
  store.setUi({
    importStatus: {
      lines: [...(intro ? [intro] : messages).map((t) => ({ text: t, warn: false })), ...warns.map((t) => ({ text: t, warn: true }))],
      warn: warns.length > 0,
    },
  });
  store.commit();
  scrollToTop();
}

/** ファイル選択（fromPicker）またはドロップで CSV を読み込む */
export async function importFile(file: File, fromPicker: boolean): Promise<void> {
  if (!importAllowed()) return;
  try {
    importText(decodeCsvBytes(await file.arrayBuffer()));
  } catch (err) {
    const e = err as Error;
    tell(fromPicker ? importFailedMessage(e) : e.message);
  }
}

/** 2025年ベースのサンプル（50名）を読み込む */
export function loadSample(): void {
  if (!importAllowed()) return;
  resetForSample(M());
  importText(sampleCsv(), SAMPLE_INTRO);
}

// ---- 割当 ----

export function runAutoAssign(): void {
  if (hasAssignments(M()) && !ask("いまの割当を置き換えて、自動割当をやり直しますか？")) return;
  autoAssign(M());
  store.commit();
  store.showToast("自動割当しました。空いている枠はオレンジ色で表示されます");
}

export function clearAssignments(): void {
  if (hasAssignments(M()) && !ask("すべての割当をクリアしますか？（元に戻せません）")) return;
  clearAll(M());
  store.commit();
}

/** 手動編集の結果を反映（旧 finishChange） */
function finish(r: EditResult | null): void {
  if (!r) return;
  store.commit();
  if (!r.ok) return store.showToast(r.message);
  if (!r.changes.length) return;
  store.lastChange = r.changes;
  store.showToast(r.message, false, { label: "元に戻す", run: undoLastChange });
  store.flashKeys(r.changes.map((c) => c[1]));
}

/** 直前の割当の変更を元に戻す */
export function undoLastChange(): void {
  const c = store.lastChange;
  store.lastChange = null;
  if (!c) return;
  const message = undoChanges(M(), c);
  store.commit();
  store.showToast(message);
  store.flashKeys(c.map((x) => x[1]));
}

/** ⌘Z／Ctrl+Z（入力中でなく、戻せる変更があるときだけ呼ぶ） */
export function undoShortcut(): void {
  store.hideToast();
  undoLastChange();
}

// ---- シフト表の表示 ----

export function setGridDate(date: string): void {
  M().gridDate = date;
  store.commit({ push: false });
}
export function setGridStore(s: string): void {
  M().gridStore = s;
  store.commit({ push: false });
}
export function setGridMode(mode: GridMode): void {
  closePicker();
  M().gridMode = mode;
  store.commit({ push: false });
}
export function setFullNames(on: boolean): void {
  M().fullNames = on;
  store.commit({ push: false });
}
export function toggleFullscreen(): void {
  store.setUi({ shiftFocus: !store.ui.shiftFocus });
}

// ---- 担当者ポップアップ ----

/**
 * 担当者ポップアップを開く（押した枠の key。位置合わせは UI が key から枠を探して行う）。
 * 選んでいる範囲の中の枠なら範囲はそのまま（「移動…」で範囲ごと動かせる）、外なら範囲を消して、その枠を Shift＋クリックの起点にする
 */
export function openPicker(key: string): void {
  if (!flattened(M()).some((x) => x.key === key)) return;
  clearTargets();
  store.hideToast();
  const u = store.ui,
    keep = u.selection.length > 1 && u.selection.includes(key);
  store.setUi({ picker: { key, q: "", active: 0, seq: store.nextSeq() }, ...(keep ? {} : { selection: [], selAnchor: key }) });
}
export function closePicker(): void {
  if (!store.ui.picker) return;
  store.setUi({ picker: null });
}
export function setPickerQuery(q: string): void {
  const p = store.ui.picker;
  if (p) store.setUi({ picker: { ...p, q, active: 0 } });
}
export function setPickerActive(active: number): void {
  const p = store.ui.picker;
  if (p) store.setUi({ picker: { ...p, active } });
}
export function setPickRun(n: number): void {
  store.setUi({ pickRun: n });
}
/** 候補を選ぶ */
export function pickName(name: string): void {
  const p = store.ui.picker;
  if (!p) return;
  const exists = flattened(M()).some((x) => x.key === p.key);
  closePicker();
  if (!exists) return;
  finish(pickNameIn(M(), p.key, name, store.ui.pickRun));
}
/** 「外す」 */
export function clearPicked(): void {
  const p = store.ui.picker;
  if (!p) return;
  closePicker();
  finish(clearAssignment(M(), p.key));
}
/** 「昼食へ」「休憩へ」：いまの担当をその時間から length 枠その係へ（同じ時間の枠からは外す） */
export function breakPicked(role: string, length: number): void {
  const p = store.ui.picker;
  if (!p) return;
  closePicker();
  finish(sendToBreak(M(), p.key, role, length));
}
/** 「移動…」：移動先をクリックで選ぶモード（ポップアップの枠が選んでいる範囲の中なら範囲ごと） */
export function startMove(): void {
  const p = store.ui.picker;
  if (!p) return;
  const name = M().assignments[p.key];
  closePicker();
  store.setUi({ movingKey: p.key, moveMode: "moving" });
  store.showToast(movingMessage(name, movingRange(store.ui).length), true, undefined, "move");
}

// ---- 範囲の選択（役職別の表。Shift＋クリック・Shift＋↑↓）----

/**
 * Shift＋クリック：起点（最後に普通にクリックした枠・前の範囲の起点）から key までの同じ列の枠を選ぶ。
 * 起点がない・列が違うときは key だけを選んで、そこを起点にする。担当者ポップアップは閉じる
 */
export function selectTo(key: string): void {
  const u = store.ui,
    anchor = u.selAnchor;
  const range = anchor ? columnRange(M(), anchor, key) : [];
  closePicker();
  if (range.length > 1) store.setUi({ selection: range });
  else if (flattened(M()).some((x) => x.key === key)) store.setUi({ selection: [key], selAnchor: key });
}
/**
 * Shift＋↑↓：いまのセル from が選んでいる範囲の中なら範囲の起点から、外なら from を起点に、to まで選ぶ。列が違えば何もしない
 */
export function extendSelection(from: string, to: string): void {
  const u = store.ui,
    anchor = u.selAnchor && u.selection.includes(from) ? u.selAnchor : from;
  const range = columnRange(M(), anchor, to);
  if (range.length < 2 && anchor !== to) return;
  closePicker();
  store.setUi({ selection: range, selAnchor: anchor });
}
/** 範囲の選択をやめる（Esc・普通のクリック） */
export function clearSelection(): void {
  if (!store.ui.selection.length) return;
  store.setUi({ selection: [] });
}

// ---- 移動（クリック・ドラッグ）----

/** 移動中の表示をやめる */
export function clearTargets(): void {
  if (store.ui.movingKey === null && !store.ui.moveMode) return;
  store.setUi({ movingKey: null, moveMode: "" });
}
/**
 * from（つかんだ枠）を to へ移す。range は動かす範囲（from を含む同じ列の枠。省くと from だけ）。
 * 範囲ごと動いたら、選んでいる範囲も移動先へ移す（続けてずらせるように）。1つだけ動かしたときは範囲を消す
 */
export function moveTo(from: string, to: string, range: readonly string[] = [from]): void {
  const plan = range.length > 1 ? planMove(M(), from, to, range) : null;
  const r = moveAssignment(M(), from, to, range);
  if (r?.ok && plan?.ok) {
    const keys = plan.cells.map((c) => c.target!.key);
    store.setUi({ selection: keys, selAnchor: keys[0] });
  } else if (r?.ok) clearSelection();
  finish(r);
}
/** 移動モードで表をクリック：移動先（移動元以外の枠）なら移動、それ以外なら取り消し */
export function clickMoveTarget(targetKey: string | null): void {
  const from = store.ui.movingKey,
    range = movingRange(store.ui);
  clearTargets();
  if (targetKey && from) moveTo(from, targetKey, range);
  else store.hideToast();
}
/** ドラッグを始めた（選んでいる範囲の外の枠をつかんだら範囲は消す） */
export function beginDrag(key: string): void {
  closePicker();
  clearTargets();
  store.hideToast();
  const u = store.ui,
    inRange = u.selection.length > 1 && u.selection.includes(key);
  store.setUi({ movingKey: key, moveMode: "dragging", ...(inRange ? {} : { selection: [], selAnchor: key }) });
}
/** ドラッグを終えた（targetKey は離した位置の移動先） */
export function endDrag(from: string, targetKey: string | null): void {
  const range = movingRange(store.ui);
  clearTargets();
  if (targetKey) moveTo(from, targetKey, range.includes(from) ? range : [from]);
}

/** 移動モードをやめる（Esc・トースト横の「キャンセル」） */
export function cancelMove(): void {
  clearTargets();
  store.hideToast();
}

/** Esc：メニュー → ヘルプ → ポップアップ → 移動 → 範囲の選択 → 必要人数 → 勤務状況 → 全画面 の順に閉じる */
export function escape(): void {
  const u = store.ui;
  if (u.menu) return setMenu(null);
  if (u.helpOpen) return toggleHelp(false);
  if (u.picker) return closePicker();
  if (u.movingKey) return cancelMove();
  if (u.selection.length) return clearSelection();
  if (u.countsOpen) toggleCounts(false);
  else if (u.auditOpen) toggleAudit(false);
  else if (u.shiftFocus) toggleFullscreen();
}

// ---- メニュー・ヘルプ ----

/** メニュー（スマホの ⋯ など）を開く・閉じる。id は UI が決める名前、null で閉じる */
export function setMenu(id: string | null): void {
  if (store.ui.menu === id) return;
  store.setUi({ menu: id });
}

/** 凡例と操作ヘルプ（open を省くと切り替え） */
export function toggleHelp(open?: boolean): void {
  const next = open ?? !store.ui.helpOpen;
  if (next === store.ui.helpOpen) return;
  store.setUi(next ? { helpOpen: true, menu: null } : { helpOpen: false });
}

// ---- 表の中の場所を見せる（勤務状況チェックの「表で見る」など）----

/**
 * 枠 key をシフト表で見せる：シフト調整の画面・その日（「一覧」ならそのまま）・店舗の絞り込み・表示（既定は役職別）を合わせ、
 * 表にスクロールを依頼して（ui.reveal）、その枠を光らせる。枠がなければ false。
 * ドロワーは閉じない（スマホで閉じたいときは呼ぶ側で toggleAudit(false) など）
 */
export function revealSlot(key: string, { mode = "role" }: { mode?: GridMode } = {}): boolean {
  const m = M();
  const item = flattened(m).find((x) => x.key === key);
  if (!item) return false;
  closePicker();
  clearTargets();
  m.view = "shift";
  if (m.gridDate !== "all" && m.gridDate !== item.date) m.gridDate = item.date;
  if (m.gridStore && m.gridStore !== item.store) m.gridStore = "";
  m.gridMode = mode;
  store.commit({ push: false });
  store.setUi({ reveal: { kind: "slot", key, seq: store.nextSeq() } });
  store.flashKeys([key]);
  return true;
}

/** メンバーの列を個人別の表で見せる（date を省くといま表示中の日。「一覧」なら最初の日） */
export function revealPerson(name: string, date?: string): void {
  const m = M();
  closePicker();
  clearTargets();
  m.view = "shift";
  if (date && m.gridDate !== "all") m.gridDate = date;
  m.gridStore = "";
  m.gridMode = "person";
  store.commit({ push: false });
  const d = date ?? (m.gridDate === "all" ? eventDates(m)[0] : m.gridDate) ?? "";
  store.setUi({ reveal: { kind: "person", name, date: d, seq: store.nextSeq() } });
}

/** 表が ui.reveal を処理し終えた（同じ seq のときだけ消す） */
export function revealDone(seq: number): void {
  if (store.ui.reveal?.seq === seq) store.setUi({ reveal: null });
}

// ---- ドロワー ----

export function toggleAudit(open?: boolean): void {
  const active = open ?? !store.ui.auditOpen;
  store.setUi({ auditOpen: active });
  if (active) toggleCounts(false);
}

/** 旧 renderCountEditor の Model の補正 */
function refreshCountDate(): void {
  fixCountDateOf(M());
  store.commit({ push: false });
}

/** 必要人数のドロワー。focusSlot があればその日を開いて入力欄にフォーカス */
export function toggleCounts(open: boolean, focusSlot?: string): void {
  store.setUi({ countsOpen: open });
  if (!open) return;
  toggleAudit(false);
  const m = M();
  const slot = focusSlot ? m.slots.find((x) => x.id === focusSlot) : undefined;
  if (slot) m.countDate = slot.date;
  else if (m.gridDate && m.gridDate !== "all") m.countDate = m.gridDate;
  refreshCountDate();
  store.setUi({ countFocus: slot ? { slotId: slot.id, seq: store.nextSeq() } : null });
}

export function setCountDate(date: string): void {
  M().countDate = date;
  refreshCountDate();
}

/** 必要人数を変えたあと：合わなくなった割当を外して再描画 */
function applyCounts(): void {
  const removed = pruneAssignments(M());
  if (removed) store.showToast(prunedMessage(removed));
  store.commit();
}

/** 1つの時間帯の必要人数（入力欄の change） */
export function changeSlotCount(slotId: string, value: string): void {
  const slot = M().slots.find((x) => x.id === slotId);
  if (!slot) return;
  setSlotCount(M(), slot, value);
  applyCounts();
}

/** 「一括」（空欄なら何もしない）。true なら入力欄を空に戻す */
export function changeRoleCounts(key: string, value: string): boolean {
  if (value === "") return false;
  const [s, role] = splitRuleKey(key);
  setRoleCounts(M(), M().countDate, s, role, value);
  applyCounts();
  return true;
}

/** 「この日を標準に戻す」 */
export function resetDayCounts(): void {
  const m = M(),
    date = m.countDate;
  if (!date || !ask(`${dayName(date, eventDates(m).indexOf(date))} の必要人数を標準に戻しますか？`)) return;
  resetCounts(m, date);
  applyCounts();
}

// ---- 勤務可能表 ----

export function setAvailDate(date: string): void {
  M().availDate = date;
  store.commit({ push: false });
}

/** 塗り替えを反映（元に戻す付き） */
export function paintAvailability(changes: AvailabilityChanges): void {
  const m = M();
  const before = applyAvailability(m, m.availDate, changes);
  store.commit();
  const after = JSON.stringify(m.availability);
  store.showToast(AVAILABILITY_CHANGED, false, {
    label: "元に戻す",
    run: () => {
      if (JSON.stringify(m.availability) !== after) return store.showToast(UNDO_BLOCKED);
      m.availability = before;
      store.commit();
      store.showToast(UNDONE);
    },
  });
}

/** 「この日にメンバーを追加」 */
export function addAvailMember(input: string): void {
  const name = input.trim();
  if (!name) return;
  const date = M().availDate,
    extra = store.ui.availExtra;
  store.setUi({ availExtra: { ...extra, [date]: [...(extra[date] || []), name] } });
  store.showToast(addedMemberMessage(name));
}

// ---- メンバー・役職ルール ----

export function setMemberQuery(q: string): void {
  M().memberQuery = q;
  store.commit({ push: false });
}
export function setMemberFilter(v: string): void {
  M().memberStore = v;
  store.commit({ push: false });
}

/** 条件が変わる編集：外した割当があれば知らせて再描画 */
function afterPrune(removed: number): void {
  if (removed) store.showToast(prunedMessage(removed));
  store.commit();
}
export const changeMemberStatus = (name: string, status: string) => afterPrune(setMemberStatus(M(), name, status));
export const changeMemberStore = (name: string, s: string, checked: boolean) => afterPrune(setMemberStore(M(), name, s, checked));
export const changeMemberCar = (name: string, car: boolean) => afterPrune(setMemberCar(M(), name, car));
export const changeMemberIce = (name: string, ice: string) => afterPrune(setMemberIce(M(), name, ice));
export const changeRule = (key: string, status: string) => afterPrune(setRoleRequirement(M(), key, status));
export function changeMemberWants(name: string, text: string): void {
  setMemberWants(M(), name, text);
  store.commit();
}
export function changeMemberDislikes(name: string, text: string): void {
  setMemberDislikes(M(), name, text);
  store.commit();
}
/** 働ける量（"" は希望なし）。目安なので割当は外さない */
export function changeMemberWorkload(name: string, workload: string): void {
  setMemberWorkload(M(), name, workload);
  store.commit();
}

// ---- メンバーの並び順（共有。元に戻すはトーストだけ。⌘Z は割当の変更だけのまま） ----

function afterOrderChange(before: Record<string, number>, message: string): void {
  const m = M();
  store.commit();
  const after = JSON.stringify(m.memberOrder);
  store.showToast(message, false, {
    label: "元に戻す",
    run: () => {
      if (JSON.stringify(m.memberOrder) !== after) return store.showToast(UNDO_BLOCKED);
      m.memberOrder = before;
      store.commit();
      store.showToast(UNDONE);
    },
  });
}

/** 並べ替えボタン・メンバー表の列見出し：全員の並び順を書き換える */
export function sortMembers(kind: MemberSort, dir: SortDir = "asc"): void {
  const m = M();
  afterOrderChange(setMemberOrder(m, sortedMembers(m, allNames(m), kind, dir)), memberSortedMessage(memberSortLabel(kind, dir)));
}

/**
 * 1人を動かす（ドラッグ・Alt+↑↓）。visible は見えている順、to はその人を除いた visible の中の位置。
 * 検索・絞り込み中は見えている隣の人を基準にする（domain の movedOrder）
 */
export function moveMemberTo(name: string, visible: readonly string[], to: number): void {
  const m = M(),
    full = allNames(m);
  const before = moveMember(m, full, visible, name, to);
  if (!before) return;
  const now = allNames(m);
  afterOrderChange(before, memberMovedMessage(name, now.indexOf(name) + 1, now.length));
}

// ---- 書き出し ----

export const exportShiftCsv = (): void => download(EXPORT_FILE, exportCsv(M()));
export const downloadTemplate = (): void => download(TEMPLATE_FILE, templateCsv());
export const downloadSample = (): void => download(SAMPLE_FILE, sampleCsv());

/** 印刷ビュー（ポップアップが塞がれたら HTML をダウンロード） */
export function printView(): void {
  const html = printShiftHtml(M());
  store.commit();
  if (!openHtmlWindow(html)) download(PRINT_FILE, html, "text/html;charset=utf-8");
}
