// 買い出し先（100均・トライアルなど）の追加・名前変更・削除（役職ルールの画面。settings の buyShops で共有する）
//
// 前日準備の「買い出し」を、行き先ごとの係「買い出し（100均）」に分ける（誰でも入れる。車ありの人は行き先ごとに1人以上）。
// 係の名前が枠の id・役職ルールのキーに入るので、名前を変えるときは割当・固定・必要人数・役職ルールを新しい名前へ写す。
// 最初の買い出し先を足すときは「買い出し」を、最後の買い出し先を消すときはその行き先を「買い出し」に戻す（割当を引き継ぐ）。

import { BUY_ROLE, buyRole, eventDayRoles, liveRoles, rolesForDate } from "./config";
import { ruleKey } from "./rules";
import { BUY_SHOPS_KEY, buyShops, eventDates, slotId } from "./slots";
import { SLOT, toHM } from "./time";
import type { Model } from "./types";

/** 買い出し先の名前の長さの上限 */
export const BUY_SHOP_MAX = 20;

export interface BuyShopResult {
  ok: boolean;
  message: string;
}

const fail = (message: string): BuyShopResult => ({ ok: false, message });

/** 買い出し先の名前を整える（前後の空白を取り、続いた空白を1つに） */
export const normalizeBuyShop = (text: string): string => text.replace(/\s+/g, " ").trim();

/** 使えない名前ならその理由（使えるなら ""）。current は名前を変える前の名前 */
export function buyShopNameError(m: Model, name: string, current?: string): string {
  if (!name) return "買い出し先の名前を入れてください";
  if (name.length > BUY_SHOP_MAX) return `買い出し先の名前は${BUY_SHOP_MAX}文字までです`;
  if (name.includes("|")) return "買い出し先の名前に「|」は使えません";
  if (name !== current && buyShops(m).includes(name)) return `買い出し先「${name}」はもうあります`;
  return "";
}

/** 買い出しの係がある店舗（係のまとまり。前日準備の「準備」） */
const buyStores = (): string[] => [
  ...new Set(
    [...Object.values(eventDayRoles), liveRoles].flatMap((roles) =>
      Object.entries(roles)
        .filter(([, list]) => list.some(([r]) => r === BUY_ROLE))
        .map(([store]) => store),
    ),
  ),
];

/** 係 from の枠の id → 係 to の枠の id（買い出しのある日・店舗の、1日のすべての30分） */
function slotIdMap(m: Model, from: string, to: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const date of eventDates(m))
    for (const [store, roles] of Object.entries(rolesForDate(date)))
      if (roles.some(([r]) => r === BUY_ROLE))
        for (let t = 0; t < 24 * 60; t += SLOT) {
          const start = toHM(t);
          out.set(slotId(date, store, from, start), slotId(date, store, to, start));
        }
  return out;
}

/** 番目ごとのキー（`${slot.id}-${occ}`）のマップで、ids にある枠のキーを移す（to が undefined なら消す）。消した・移した値を返す */
function moveKeys(map: Record<string, unknown>, ids: Map<string, string>, drop: boolean): unknown[] {
  const moved: unknown[] = [];
  for (const key of Object.keys(map)) {
    const i = key.lastIndexOf("-"),
      to = ids.get(key.slice(0, i));
    if (to === undefined) continue;
    moved.push(map[key]);
    if (!drop) map[`${to}${key.slice(i)}`] = map[key];
    delete map[key];
  }
  return moved;
}

/** 役職ルール（役職・番目）のキーを移す（drop なら消す） */
function moveRules(m: Model, from: string, to: string, drop: boolean): void {
  for (const store of buyStores()) {
    const pre = ruleKey(store, from);
    for (const k of Object.keys(m.roleRequirements))
      if (k === pre || k.startsWith(`${pre}|||`)) {
        if (!drop) m.roleRequirements[ruleKey(store, to) + k.slice(pre.length)] = m.roleRequirements[k];
        delete m.roleRequirements[k];
      }
  }
}

/** 係 from の割当・固定・必要人数・役職ルールを係 to へ写す（drop なら消す）。消した割当（担当者あり）の数を返す */
function moveRole(m: Model, from: string, to: string, drop = false): number {
  const ids = slotIdMap(m, from, to);
  const assigned = moveKeys(m.assignments, ids, drop).filter(Boolean).length;
  moveKeys(m.pinnedSlots, ids, drop);
  moveKeys(m.slotTypes, ids, drop);
  for (const [a, b] of ids)
    if (a in m.slotCounts) {
      if (!drop) m.slotCounts[b] = m.slotCounts[a];
      delete m.slotCounts[a];
    }
  moveRules(m, from, to, drop);
  // 枠は係の一覧から作り直す（refreshDerived）
  m.slots = [];
  return drop ? assigned : 0;
}

function setShops(m: Model, shops: readonly string[]): void {
  if (shops.length) m.settings[BUY_SHOPS_KEY] = [...shops];
  else delete m.settings[BUY_SHOPS_KEY];
  m.slots = [];
}

/** 買い出し先を足す。最初の1つなら、いまの「買い出し」の割当などをその行き先へ引き継ぐ */
export function addBuyShop(m: Model, text: string): BuyShopResult {
  const name = normalizeBuyShop(text),
    error = buyShopNameError(m, name);
  if (error) return fail(error);
  const shops = buyShops(m);
  if (!shops.length) moveRole(m, BUY_ROLE, buyRole(name));
  setShops(m, [...shops, name]);
  return {
    ok: true,
    message: shops.length
      ? `買い出し先「${name}」を追加しました`
      : `買い出し先「${name}」を追加しました（いままでの買い出しの割当は「${name}」に入ります）`,
  };
}

/** 買い出し先の名前を変える（割当などはそのまま新しい名前の係へ） */
export function renameBuyShop(m: Model, from: string, text: string): BuyShopResult {
  const shops = buyShops(m),
    name = normalizeBuyShop(text);
  if (!shops.includes(from)) return fail(`買い出し先「${from}」がありません`);
  if (name === from) return { ok: true, message: "" };
  const error = buyShopNameError(m, name, from);
  if (error) return fail(error);
  moveRole(m, buyRole(from), buyRole(name));
  setShops(
    m,
    shops.map((s) => (s === from ? name : s)),
  );
  return { ok: true, message: `買い出し先「${from}」を「${name}」に変えました` };
}

/** 買い出し先に入っている割当（担当者あり）の数 */
export function buyShopAssigned(m: Model, shop: string): number {
  const ids = slotIdMap(m, buyRole(shop), buyRole(shop));
  return Object.entries(m.assignments).filter(([key, name]) => name && ids.has(key.slice(0, key.lastIndexOf("-")))).length;
}

/** 買い出し先を消す（割当・必要人数なども消す）。最後の1つなら「買い出し」に戻す（割当は残る） */
export function removeBuyShop(m: Model, shop: string): BuyShopResult {
  const shops = buyShops(m);
  if (!shops.includes(shop)) return fail(`買い出し先「${shop}」がありません`);
  const rest = shops.filter((s) => s !== shop);
  if (!rest.length) {
    moveRole(m, buyRole(shop), BUY_ROLE);
    setShops(m, []);
    return { ok: true, message: `買い出し先「${shop}」を削除しました（割当は行き先を分けない買い出しに戻ります）` };
  }
  const removed = moveRole(m, buyRole(shop), buyRole(shop), true);
  setShops(m, rest);
  return {
    ok: true,
    message: `買い出し先「${shop}」を削除しました${removed ? `（割当 ${removed} 枠を外しました）` : ""}`,
  };
}
