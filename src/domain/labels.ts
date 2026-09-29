// 枠・役職の表示用の文字列

import { buyShopOf, cellRole, cellStore, dayName, ordinalRoles, storeNames } from "./config";
import { posLabel, requiredFor } from "./rules";
import { eventDates } from "./slots";
import type { Item, Model } from "./types";

/** 例：「本店・ドリッパー 2nd」「くれあ・レジ」「買い出し」（番目は必要人数が2人以上のときだけ） */
export const itemLabel = (x: { store: string; role: string; count: number; occ?: number }): string =>
  `${storeNames.includes(x.store) ? `${x.store}・` : ""}${x.role}${Number(x.count) > 1 && x.occ !== undefined ? ` ${posLabel(x.role, x.occ)}` : ""}`;

/** 例：「本番1日目 10:30〜 本店・レジ」 */
export const slotLabel = (m: Model, x: Item): string =>
  `${dayName(x.date, eventDates(m).indexOf(x.date))} ${x.start}〜 ${itemLabel(x)}`;

/** 個人別の表のセル（例：本ドリ1st、2号調理、準備本、買100均） */
export const personCellLabel = (x: { store: string; role: string; occ: number }): string =>
  `${cellStore[x.store] || ""}${cellRole[x.role] || (buyShopOf(x.role) ? `買${buyShopOf(x.role)}` : x.role)}${ordinalRoles.includes(x.role) ? posLabel(x.role, x.occ) : ""}`;

/** 担当者ポップアップの見出しの条件（例：「・上級生のみ」「・1年目合格以上」、条件なしは ""） */
export const requirementNote = (m: Model, item: Item): string =>
  ((r) => (r === "未設定" ? "" : `・${r === "上級生" ? "上級生のみ" : `${r}以上`}`))(requiredFor(m, item));

/** 必要人数の見出しなどの注記 */
export const roleNote = (count: number): string => `標準 ${count}人`;
