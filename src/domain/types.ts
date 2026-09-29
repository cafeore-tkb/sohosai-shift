// Model = 旧版の `state` と同じ形（キー名・値の意味・空文字と削除の区別まで同じ）。
// 共同編集の Firestore ドキュメントもこの形に依存するので変えないこと。

/** 勤務可能時間（1件＝1人・1日・連続した時間帯）。時刻は "HH:MM" */
export interface Availability {
  name: string;
  date: string;
  start: string;
  end: string;
}

/** シフト枠（1つの日付・店舗・役職・30分）。count 人分の Item に展開される */
export interface Slot {
  id: string;
  date: string;
  store: string;
  role: string;
  start: string;
  end: string;
  count: number;
}

/** 1人分の枠。key = `${slot.id}-${occ}`（occ は 0 始まりの番目） */
export interface Item extends Slot {
  occ: number;
  key: string;
}

export interface Settings {
  /** 30 なら 30 分刻みへの移行済み */
  slotMinutes?: number;
  /** 1 ならドリッパー 1st〜6th への移行済み */
  positions?: number;
  [k: string]: unknown;
}

export type GridMode = "role" | "person";
export type View = "import" | "availability" | "members" | "rules" | "shift";

export interface Model {
  availability: Availability[];
  /** 派生キャッシュ（slotCounts から作る）。並び順に意味がある */
  slots: Slot[];
  /** item.key → 氏名。"" は「外した」（キーは残る） */
  assignments: Record<string, string>;
  /**
   * 固定したコマ：item.key → 固定したときの担当者。いまの割当と同じ名前のあいだだけ有効（isPinned。人を替えたら外れる）。
   * 自動割当はこのコマを変えない。旧版は知らないので無視する
   */
  pinnedSlots: Record<string, string>;
  memberStatuses: Record<string, string>;
  memberStores: Record<string, string[]>;
  memberWants: Record<string, string[]>;
  memberDislikes: Record<string, string[]>;
  /** 対応できるドリップの一覧（例：["1杯ホット","2杯ホット","1杯アイス"]）。未設定は削除 */
  memberDrips: Record<string, string[]>;
  memberCars: Record<string, boolean>;
  /** 氏名 → 働ける量（"少し"・"5時間程度"・"いっぱい"。未回答は削除）。自動割当の目安。旧版は知らないので無視する */
  memberWorkload: Record<string, string>;
  /** 氏名 → ふりがな（ひらがな。五十音順に使う。未回答は削除）。旧版は知らないので無視する */
  memberKana: Record<string, string>;
  /** 氏名 → 在籍コード（入学年度の下2桁。学年は config の gradeOf。未回答は削除）。旧版は知らないので無視する */
  memberGrade: Record<string, number>;
  /** 氏名 → 並び順の番号（小さいほど先。メンバー表・勤務可能表・個人別・印刷の並び。ない人は後ろに五十音順）。旧版は知らないので無視する */
  memberOrder: Record<string, number>;
  /** item.key → ドリップの種類 */
  slotTypes: Record<string, string>;
  /** slot.id → 必要人数（標準と同じなら削除） */
  slotCounts: Record<string, number>;
  /** 旧形式の「この番目は不要」。migrateBlanks で必要人数に畳み込んで空にする */
  slotBlanks: Record<string, unknown>;
  settings: Settings;
  /** ruleKey / posKey → 最低ステータス */
  roleRequirements: Record<string, string>;
  gridDate: string;
  gridStore: string;
  gridMode: GridMode;
  countDate: string;
  fullNames: boolean;
  /** 手で動かしたコマをすべて固定する（シフト調整の「動かしたら固定」。このブラウザだけ） */
  pinMoved: boolean;
  availDate: string;
  memberQuery: string;
  memberStore: string;
  view: View;
}

/** 共同編集で共有するマップ */
export const SHARED_MAPS = [
  "assignments",
  "pinnedSlots",
  "slotTypes",
  "slotCounts",
  "slotBlanks",
  "settings",
  "roleRequirements",
  "memberStatuses",
  "memberStores",
  "memberWants",
  "memberDislikes",
  "memberDrips",
  "memberCars",
  "memberOrder",
  "memberWorkload",
  "memberKana",
  "memberGrade",
] as const;
export type SharedMap = (typeof SHARED_MAPS)[number];
