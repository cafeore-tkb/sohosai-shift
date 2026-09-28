// テスト用の小さな Model（出荷コードからは使わない）
import { autoAssign, createModel, findSlot, importSurvey, refreshDerived, resetForSample, sampleCsv, type Item, type Model } from "../domain";

/** サンプル（50名・3日）を読み込んだ Model */
export function sampleModel(): Model {
  const m = createModel();
  resetForSample(m);
  importSurvey(m, sampleCsv());
  refreshDerived(m);
  return m;
}

/** サンプル＋自動割当 */
export function autoModel(): Model {
  const m = sampleModel();
  autoAssign(m);
  refreshDerived(m);
  return m;
}

export const D = "2026-10-31";

/** 本番1日目の 10:00〜12:00 に A・B・C の3人（全員 本店・上級生） */
export function tinyModel(): Model {
  const m = createModel();
  for (const name of ["A", "B", "C"]) {
    m.availability.push({ name, date: D, start: "10:00", end: "12:00" });
    m.memberStatuses[name] = "上級生";
    m.memberStores[name] = ["本店"];
  }
  refreshDerived(m);
  return m;
}

/** 本店の役職の枠（1人分） */
export function item(m: Model, role: string, start: string, occ = 0, store = "本店", date = D): Item {
  const s = findSlot(m, date, store, role, start);
  if (!s) throw Error(`枠がない：${store} ${role} ${start}`);
  return { ...s, occ, key: `${s.id}-${occ}` };
}
