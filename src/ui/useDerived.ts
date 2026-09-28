// 共有データが変わったときだけ1回計算する派生データ（勤務状況チェック・短い名前・サマリー・移動先）
// store.dataVersion ごとに作り直す（表示だけの commit では作り直さない）

import { assignmentAudit, buildShortNames, dislikedCount, fitTargets, offAssignments, summaryStats, unfitAssignments, wantsMissing } from "../domain";
import type { Audit, Item } from "../domain";
import { store, useModelVersion } from "../store";

function perVersion<T>(compute: () => T): () => T {
  let version = -1,
    value: T;
  return () => {
    if (version !== store.dataVersion) {
      value = compute();
      version = store.dataVersion;
    }
    return value;
  };
}

export interface AuditSummary {
  /** やりたい役職に1つも入っていない人（データがなければ空） */
  missing: ReturnType<typeof wantsMissing>;
  /** 勤務できない時間の割当 */
  offs: Item[];
  /** 条件外（所属店舗・ステータス・車）の割当 */
  unfits: Item[];
  /** 苦手な役職への割当の数 */
  disliked: number;
}

const auditOf = perVersion<Audit>(() => assignmentAudit(store.model));
const shortNamesOf = perVersion<Record<string, string>>(() => buildShortNames(store.model));
const statsOf = perVersion(() => summaryStats(store.model, auditOf()));
const summaryOf = perVersion<AuditSummary>(() => {
  const m = store.model;
  return {
    missing: m.availability.length ? wantsMissing(m) : [],
    offs: offAssignments(m),
    unfits: unfitAssignments(m),
    disliked: dislikedCount(m),
  };
});

/** 勤務状況チェック（重複・勤務時間） */
export function useAudit(): Audit {
  useModelVersion();
  return auditOf();
}

/** シフト表に出す短い名前 */
export function useShortNames(): Record<string, string> {
  useModelVersion();
  return shortNamesOf();
}

/** サマリーの数値（スタッフ・必要枠・割当済み・未割当・重複・充足率） */
export function useStats(): ReturnType<typeof summaryStats> {
  useModelVersion();
  return statsOf();
}

/** 勤務状況チェックの件数（ボタンの件数とドロワーで共有） */
export function useAuditSummary(): AuditSummary {
  useModelVersion();
  return summaryOf();
}

let fit = { version: -1, sig: "", set: new Set<string>() as ReadonlySet<string> };
/**
 * 移動先のうち条件に合う枠（緑）の key。range は動かす範囲（store の movingRange）。
 * 移動先にできるのは移動元以外のすべての枠（domain の dropTargets）なので、ここでは緑にする枠だけを数える。
 * 共有データと移動元・範囲が同じあいだは作り直さない
 */
export function dropFitFor(from: string, range: readonly string[]): ReadonlySet<string> {
  const sig = `${from}|${range.join(",")}`;
  if (fit.version !== store.dataVersion || fit.sig !== sig) fit = { version: store.dataVersion, sig, set: fitTargets(store.model, from, range) };
  return fit.set;
}
