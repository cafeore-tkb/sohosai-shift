// アプリの状態：Model（共有されるデータ＋画面の状態。旧版の `state`）と、UI だけの状態（旧版のモジュール変数）。
// Model は1つのオブジェクトを直接書き換え、commit() で旧 render() と同じ補正をしてから再描画を通知する。

import { DEFAULT_PICK_RUN, createModel, refreshDerived } from "../domain";
import type { Change, Model } from "../domain";

/** 担当者ポップアップ */
export interface PickerState {
  /** 選んでいる枠の key */
  key: string;
  /** 名前の絞り込み */
  q: string;
  /** キーボードで選んでいる候補の番号 */
  active: number;
  /** 開くたびに変わる番号（位置合わせ・フォーカスのやり直し用） */
  seq: number;
}

/** 読み込み結果の欄（#importStatus） */
export interface ImportStatus {
  lines: { text: string; warn: boolean }[];
  warn: boolean;
}

export interface ToastAction {
  label: string;
  run: () => void;
}
export interface Toast {
  /** 表示のたびに変わる（中身を作り直す key） */
  id: number;
  message: string;
  action?: ToastAction;
  /** 見た目の種類。"move"＝移動中（紙色・緑の枠。ドックに「キャンセル」も出る） */
  variant?: "move";
}

/** 光らせる枠（割当の変更・元に戻す・表で見る）。seq は光らせるたびに変わる */
export interface FlashState {
  keys: ReadonlySet<string>;
  seq: number;
}

/**
 * 表の中の場所を見せる依頼（revealSlot / revealPerson）。
 * 表（シフト調整の grid）は描画後にこれを見てスクロールし、終わったら actions.revealDone(seq) を呼ぶ
 */
export type RevealRequest =
  | { kind: "slot"; key: string; seq: number }
  | { kind: "person"; name: string; date: string; seq: number };

/** 開いているメニュー（スマホの ⋯ など。同時に1つ）。名前は UI が決める（"appbar"・"shift" など） */
export type MenuId = string;

/** 共有ダイアログの中身（sync が決める） */
export type ShareDialogContent =
  | { kind: "disabled" }
  | { kind: "loading" }
  | { kind: "login"; inRoom: boolean }
  | { kind: "start"; email: string; starting: boolean }
  | {
      kind: "room";
      email: string;
      url: string;
      admins: string[];
      owner: string;
      isAdmin: boolean;
      updatedBy: string;
      /** 最終更新の日時（ja-JP の表記）。なければ "" */
      when: string;
      calendar: CalendarShare;
    };

/** カレンダー配信（個人TT）の状態 */
export interface CalendarShare {
  /** メンバーに配る共通リンク（まだ一度も配信していなければ ""） */
  url: string;
  /** いま配信中の内容（止めている・未配信なら null）。digest が今の Model と違えば未配信の変更あり */
  published: { by: string; when: string; digest: string } | null;
  publishing: boolean;
}

/** 共同編集の表示（sync が setShare で更新する） */
export interface ShareState {
  /** ヘッダーの状態表示。null なら「オフライン対応」 */
  badge: { kind: string; text: string } | null;
  /** フッターの文言。null なら既定 */
  footerNote: string | null;
  /** CSV の読み込みが管理者だけに制限されているときの案内。null なら制限なし */
  importLock: string | null;
  dialogOpen: boolean;
  /** ダイアログの中身（一度も開いていなければ null） */
  dialog: ShareDialogContent | null;
}

/** 共有ダイアログの操作（sync が登録する） */
export interface ShareActions {
  open(): void;
  close(): void;
  signIn(): void;
  signOut(): void;
  start(): void;
  leave(): void;
  /** いまの内容でカレンダーを配信する（管理者） */
  publish(): void;
  /** カレンダーの配信を止める（管理者） */
  unpublish(): void;
  addAdmin(email: string): void;
  removeAdmin(email: string): void;
}

export interface UiState {
  share: ShareState;
  picker: PickerState | null;
  /** 何枠続けて入れるか（開き直しても保つ。Infinity＝入れられる限り） */
  pickRun: number;
  /** 移動中の枠（ポップアップの「移動…」またはドラッグ）。つかんだ枠。選んでいる範囲に入っていれば範囲ごと動く（movingRange） */
  movingKey: string | null;
  /**
   * 役職別の表で選んでいる範囲（同じ列の続いた枠の key、時間順）。Shift＋クリック・Shift＋↑↓ で作り、
   * 普通のクリック（範囲の外）・Esc で消える。範囲の中の枠をドラッグ・「移動…」・M すると範囲ごと移動する
   */
  selection: string[];
  /** Shift＋クリックで範囲を広げる起点（最後に普通にクリックした枠など。見た目には出さない） */
  selAnchor: string | null;
  /** "moving"＝クリックで移動先を選ぶ、"dragging"＝ドラッグ中（body のクラス） */
  moveMode: "" | "moving" | "dragging";
  /** 勤務可能表を塗っている最中 */
  painting: boolean;
  /** 勤務可能表に手で追加したメンバー（日付ごと。○を付けるまではこの画面だけ） */
  availExtra: Record<string, string[]>;
  auditOpen: boolean;
  countsOpen: boolean;
  /** 必要人数のドロワーで、開いたときにフォーカスする枠 */
  countFocus: { slotId: string; seq: number } | null;
  /** シフト調整の全画面表示 */
  shiftFocus: boolean;
  importStatus: ImportStatus | null;
  /** 最後に出したトースト（非表示でも中身は残す） */
  toast: Toast | null;
  toastVisible: boolean;
  /** 光らせている枠（--dur-flash のあと自動で null） */
  flash: FlashState | null;
  /** 表の中の場所を見せる依頼（表が処理したら null） */
  reveal: RevealRequest | null;
  /** 凡例と操作ヘルプのポップアップ */
  helpOpen: boolean;
  /** 開いているメニュー（null＝なし） */
  menu: MenuId | null;
}

const initialUi = (): UiState => ({
  share: { badge: null, footerNote: null, importLock: null, dialogOpen: false, dialog: null },
  picker: null,
  pickRun: DEFAULT_PICK_RUN,
  movingKey: null,
  selection: [],
  selAnchor: null,
  moveMode: "",
  painting: false,
  availExtra: {},
  auditOpen: false,
  countsOpen: false,
  countFocus: null,
  shiftFocus: false,
  importStatus: null,
  toast: null,
  toastVisible: false,
  flash: null,
  reveal: null,
  helpOpen: false,
  menu: null,
});

/** 枠を光らせる時間（tokens.css の --dur-flash と同じ） */
export const FLASH_MS = 900;

export interface CommitOptions {
  /**
   * 共同編集へ送信する（旧 window.onStateChange）。既定は true。
   * false は表示だけの変更（タブ・日付・絞り込みなど）で、共有データから作る派生データ（dataVersion）は作り直さない
   */
  push?: boolean;
}

export class Store {
  model: Model = createModel();
  ui: UiState = initialUi();
  /** commit のたびに増える（Model を使う表示の再描画用） */
  version = 0;
  /** 共有データが変わったときだけ増える（勤務状況チェックなど、共有データから作る派生データの作り直し用） */
  dataVersion = 0;
  /** ⌘Z／「元に戻す」で取り消す直前の割当の変更 */
  lastChange: Change[] | null = null;
  /** 共同編集への送信（sync が設定する） */
  onStateChange: (() => void) | null = null;
  /** CSV を読み込めるか（共同編集中は管理者だけ。sync が差し替える） */
  canImportCSV: () => boolean = () => true;
  /** 必要人数を入力中か（入力中は countDate を補正しない。UI が差し替える） */
  isEditingCounts: () => boolean = () => false;
  /** 共有ダイアログの操作（sync が登録する） */
  shareActions: ShareActions | null = null;

  private listeners = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  private toastSeq = 0;
  private seq = 0;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  /** 旧 render()：Model を補正して再描画し、共同編集へ送る */
  commit({ push = true }: CommitOptions = {}): void {
    refreshDerived(this.model, { fixCountDate: !this.isEditingCounts() });
    if (push) this.dataVersion++;
    this.version++;
    this.emit();
    if (push) this.onStateChange?.();
  }

  /** 共有データを commit せずに書き換えた（共同編集の受信を保留したとき）。次の描画で派生データを作り直す */
  dataChanged(): void {
    this.dataVersion++;
  }

  /** UI だけの状態を変える */
  setUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  /** 共同編集の表示を変える */
  setShare(patch: Partial<ShareState>): void {
    this.setUi({ share: { ...this.ui.share, ...patch } });
  }

  nextSeq(): number {
    return ++this.seq;
  }

  // ---- 枠を光らせる ----
  /** keys の枠を FLASH_MS だけ光らせる（前の光はやめる）。空なら何もしない */
  flashKeys(keys: Iterable<string>): void {
    const set = new Set(keys);
    if (!set.size) return;
    clearTimeout(this.flashTimer);
    this.setUi({ flash: { keys: set, seq: this.nextSeq() } });
    this.flashTimer = setTimeout(() => this.setUi({ flash: null }), FLASH_MS);
  }

  // ---- トースト ----
  showToast(message: string, sticky = false, action?: ToastAction, variant?: Toast["variant"]): void {
    clearTimeout(this.toastTimer);
    this.setUi({ toast: { id: ++this.toastSeq, message, action, variant }, toastVisible: true });
    if (!sticky) this.toastTimer = setTimeout(() => this.setUi({ toastVisible: false }), action ? 7000 : 3500);
  }
  hideToast(): void {
    clearTimeout(this.toastTimer);
    if (this.ui.toastVisible) this.setUi({ toastVisible: false });
  }

  /** 入力中・ドラッグ中など、描き直すと操作が途切れる状態か（共同編集の受信で使う） */
  isInteracting(): boolean {
    const u = this.ui;
    return !!u.movingKey || u.moveMode === "dragging" || !!u.picker || u.painting;
  }
}

export const store = new Store();

/** 移動中に動かす枠：つかんだ枠が選んでいる範囲（2つ以上）に入っていれば範囲、そうでなければつかんだ枠だけ（移動中でなければ []） */
export function movingRange(u: Pick<UiState, "movingKey" | "selection">): string[] {
  if (!u.movingKey) return [];
  return u.selection.length > 1 && u.selection.includes(u.movingKey) ? u.selection : [u.movingKey];
}
