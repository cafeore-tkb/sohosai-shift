import { dataViews } from "./config";
import { posKey, ruleKey } from "./rules";
import { ensureAllSlots, eventDates } from "./slots";
import type { Model } from "./types";

/** 旧版の起動直後の state（役職ルールの初期値を含む） */
export function createModel(): Model {
  const m: Model = {
    availability: [],
    slots: [],
    assignments: {},
    memberStatuses: {},
    memberStores: {},
    memberWants: {},
    memberDislikes: {},
    memberDrips: {},
    memberCars: {},
    memberWorkload: {},
    memberKana: {},
    memberGrade: {},
    memberOrder: {},
    slotTypes: {},
    slotCounts: {},
    slotBlanks: {},
    pinnedSlots: {},
    settings: {},
    roleRequirements: {},
    gridDate: "",
    gridStore: "",
    gridMode: "role",
    countDate: "",
    fullNames: false,
    pinMoved: false,
    availDate: "",
    memberQuery: "",
    memberStore: "",
    view: "import",
  };
  m.roleRequirements[ruleKey("本店", "マスター")] = "上級生";
  m.roleRequirements[ruleKey("本店", "ドリッパー")] = "1年目合格";
  m.roleRequirements[posKey("本店", "ドリッパー", 0)] = "上級生";
  m.roleRequirements[posKey("本店", "ドリッパー", 5)] = "上級生";
  return m;
}

export interface RefreshOptions {
  /** 必要人数の入力中（ドロワー内にフォーカス）は countDate を補正しない（旧版の renderCountEditor と同じ） */
  fixCountDate?: boolean;
}

/**
 * 旧版の render() が Model に対して行っていた副作用（描画以外）をまとめたもの。
 * 1. 日付があれば gridDate を補正（"all" はそのまま）し ensureAllSlots（移行処理を含む）
 * 2. availDate・countDate の補正
 * 3. データがないのに availability/members/shift を表示していたら view = "import"
 */
export function refreshDerived(m: Model, { fixCountDate = true }: RefreshOptions = {}): void {
  const dates = eventDates(m);
  if (dates.length) {
    if (m.gridDate !== "all" && !dates.includes(m.gridDate)) m.gridDate = dates[0];
    // 旧版は描画のたびに2回（表と必要人数）呼んでいたが、2回目は何も変えないので1回でよい
    ensureAllSlots(m);
    if (!dates.includes(m.availDate)) m.availDate = dates[0];
  }
  if (!m.availability.length && dataViews.includes(m.view)) m.view = "import";
  if (dates.length && fixCountDate) fixCountDateOf(m);
}

/** 必要人数のドロワーで表示する日（countDate）が日付にないなら先頭の日にする */
export function fixCountDateOf(m: Model): void {
  const dates = eventDates(m);
  if (dates.length && !dates.includes(m.countDate)) m.countDate = dates[0];
}

/** 割当が1つでもあるか（自動割当・クリアの確認を出すかどうか） */
export const hasAssignments = (m: Model): boolean => Object.values(m.assignments).some(Boolean);
