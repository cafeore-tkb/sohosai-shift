// 誰がどの枠に入れるか（役職ルール・所属・車・勤務可能時間）と、希望・苦手

import { DRIP_NONE, carRoles, ordinalRoles, roleBase, roleMinStatus, roleStore, statusLevels, statusShort, storeNames } from "./config";
import { iceOf } from "./parse";
import type { Availability, Model } from "./types";

/** 役職ルールのキー（例："本店|||マスター"） */
export const ruleKey = (store: string, role: string): string => `${store}|||${role}`;
// 番目ごとの条件（例：ドリッパー1st・6thは上級生）。役職の条件と厳しいほうを使う
export const posKey = (store: string, role: string, occ: number): string => `${ruleKey(store, role)}|||${occ}`;

/** 枠の条件を調べるのに必要な項目 */
export interface SlotLike {
  store: string;
  role: string;
  occ?: number;
}
/** 時間を持つ枠 */
export interface TimedLike extends SlotLike {
  date: string;
  start: string;
  end: string;
}

export const levelOf = (m: Model, name: string): number => statusLevels[m.memberStatuses[name] || "未設定"];

/** 役職ルールで選べる最低ステータスの下限（ない役職は "未設定"＝条件なしから） */
export const roleFloor = (store: string, role: string): string => roleMinStatus[ruleKey(store, role)] || "未設定";

/** その枠（番目）に必要な最低ステータス（役職の条件・番目の条件・下限の厳しいもの） */
export function requiredFor(m: Model, slot: SlotLike): string {
  const a = m.roleRequirements[ruleKey(slot.store, slot.role)] || "未設定",
    b = slot.occ === undefined ? "未設定" : m.roleRequirements[posKey(slot.store, slot.role, slot.occ)] || "未設定";
  return [a, b, roleFloor(slot.store, slot.role)].reduce((x, y) => ((statusLevels[y] ?? 0) > (statusLevels[x] ?? 0) ? y : x));
}

// 番目の呼び方：ドリッパーは当日の配置どおり 1st〜6th、ほかは 1・2・3
export const posLabel = (role: string, i: number): string =>
  ordinalRoles.includes(role) ? ["1st", "2nd", "3rd"][i] || `${i + 1}th` : String(i + 1);

/**
 * 見出し用：番目の条件が役職の条件より厳しいときだけ短い文字（「上級」「1年↑」など）。それ以外は ""。
 * 旧版はこれを <small> で囲んで表示していた。
 */
export const posTag = (m: Model, store: string, role: string, i: number): string => {
  const r = requiredFor(m, { store, role, occ: i });
  return r !== requiredFor(m, { store, role }) && r !== "未設定"
    ? r === "上級生"
      ? "上級"
      : `${statusShort[r]}↑`
    : "";
};

/** その人のアイス（○／1杯のみ／2杯のみ／×、未合格は DRIP_NONE、未設定は ""） */
export const memberIce = (m: Model, name: string): string =>
  m.memberStatuses[name] === "未合格" ? DRIP_NONE : iceOf(m.memberDrips[name]);

/** 車が必要な係に車なしの人は入れない */
export function fitsChoice(m: Model, name: string, item: SlotLike): boolean {
  return !(carRoles.includes(item.role) && m.memberCars[name] !== true);
}

// 時間以外の条件（所属店舗・ステータス〈番目ごと〉・車）
export function fitsSlot(m: Model, name: string, slot: SlotLike): boolean {
  const store = storeNames.includes(slot.store) ? slot.store : roleStore[slot.role];
  return (
    (!store || (m.memberStores[name] || []).includes(store)) &&
    levelOf(m, name) >= statusLevels[requiredFor(m, slot)] &&
    fitsChoice(m, name, slot)
  );
}

/**
 * fitsSlot を満たさない理由（「所属店舗」「ステータス」「車」。満たしていれば []）。
 * 手で移動した割当や、あとから条件を変えた割当は外さずに「条件外」として表示する（表のツールチップ・担当者ポップアップ）
 */
export function unfitReasons(m: Model, name: string, slot: SlotLike): string[] {
  const store = storeNames.includes(slot.store) ? slot.store : roleStore[slot.role];
  const out: string[] = [];
  if (store && !(m.memberStores[name] || []).includes(store)) out.push("所属店舗");
  if (levelOf(m, name) < statusLevels[requiredFor(m, slot)]) out.push("ステータス");
  if (!fitsChoice(m, name, slot)) out.push("車");
  return out;
}

/** 勤務可能時間に入っているか（条件は見ない） */
export const canWorkAt = (m: Model, name: string, slot: TimedLike): boolean =>
  m.availability.some((a) => a.name === name && a.date === slot.date && a.start <= slot.start && a.end >= slot.end);

/** その枠に入れる人の勤務可能時間（1人が複数件のこともある） */
export function available(m: Model, slot: TimedLike): Availability[] {
  return m.availability.filter(
    (a) => a.date === slot.date && a.start <= slot.start && a.end >= slot.end && fitsSlot(m, a.name, slot),
  );
}

export const decided = (m: Model, key: string): boolean => !!m.assignments[key];

export const wants = (m: Model, name: string, role: string): boolean =>
  (m.memberWants[name] || []).includes(roleBase(role));
export const dislikes = (m: Model, name: string, role: string): boolean =>
  (m.memberDislikes[name] || []).includes(roleBase(role));
/** ★＝やりたい、△＝苦手 */
export const prefMark = (m: Model, name: string, role: string): string =>
  wants(m, name, role) ? "★" : dislikes(m, name, role) ? "△" : "";
