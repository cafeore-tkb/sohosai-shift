// 自動割当の決まり（役職ルールの画面で変える。共同編集では settings に入れて共有する）

import type { Model } from "./types";

/**
 * - masterHours：マスターは1人この時間まで（その日のマスターを全員この時間までで埋めきれないときだけ、この時間ずつ増やす）。0＝制限なし
 * - availPercent：その日の勤務時間は、勤務可能時間のこの割合まで（目安。ほかに入れる人がいなければ超える）。0＝制限なし
 * - maxRunHours：続けて入るのはこの時間まで（超える割当はしない）。0＝制限なし
 */
export interface AutoRules {
  masterHours: number;
  availPercent: number;
  maxRunHours: number;
}
export type AutoRuleKey = keyof AutoRules;

export const AUTO_RULE_DEFAULTS: Readonly<AutoRules> = { masterHours: 1, availPercent: 80, maxRunHours: 3 };

/** settings のキー（旧版は知らないキーを読まない・書かない） */
const settingKey: Readonly<Record<AutoRuleKey, string>> = {
  masterHours: "autoMasterHours",
  availPercent: "autoAvailPercent",
  maxRunHours: "autoMaxRunHours",
};

/** 入力できる値（時間は30分刻み、割合は整数の %） */
export function normalizeAutoRule(key: AutoRuleKey, value: number): number | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  if (key === "availPercent") return Math.min(100, Math.round(value));
  return Math.round(value * 2) / 2;
}

export function autoRules(m: Model): AutoRules {
  const out = { ...AUTO_RULE_DEFAULTS };
  for (const key of Object.keys(settingKey) as AutoRuleKey[]) {
    const v = m.settings[settingKey[key]];
    if (typeof v === "number") out[key] = normalizeAutoRule(key, v) ?? out[key];
  }
  return out;
}

/** 決まりを変える（標準と同じなら settings から消す）。読めない値なら false */
export function setAutoRule(m: Model, key: AutoRuleKey, value: number): boolean {
  const v = normalizeAutoRule(key, value);
  if (v === undefined) return false;
  if (v === AUTO_RULE_DEFAULTS[key]) delete m.settings[settingKey[key]];
  else m.settings[settingKey[key]] = v;
  return true;
}
