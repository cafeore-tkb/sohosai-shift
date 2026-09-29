// 共同編集で共有するデータ（availability と SHARED_MAPS）の読み書き。送受信・差分・マージは sync の仕事
// slots は必要人数（slotCounts）から作る派生キャッシュなので、共有データを変えたらここで合わせる

import { BUY_SHOPS_KEY, slotDefault } from "./slots";
import { SHARED_MAPS } from "./types";
import type { Availability, Model, SharedMap } from "./types";

/** 共有マップ（キー → 値）。値の形はマップごとに違うので unknown として扱う */
export const sharedMap = (m: Model, k: SharedMap): Record<string, unknown> => m[k] as Record<string, unknown>;

/** 部屋の内容で共有データを置き換える（枠は必要人数から作り直す。データがあれば読み込み画面からシフト調整へ） */
export function replaceShared(m: Model, availability: Availability[], maps: Record<SharedMap, Record<string, unknown>>): void {
  m.availability = availability;
  for (const k of SHARED_MAPS) Object.assign(m, { [k]: maps[k] });
  m.slots = [];
  if (m.availability.length && m.view === "import") m.view = "shift";
}

/** 共有マップの1項目を変える（undefined は削除）。必要人数なら作ってある枠の人数も合わせる。買い出し先なら枠を作り直す */
export function applySharedChange(m: Model, k: SharedMap, key: string, value: unknown): void {
  const map = sharedMap(m, k);
  if (value === undefined) delete map[key];
  else map[key] = value;
  // 買い出し先が変わったら、枠を係の一覧から作り直す（refreshDerived）
  if (k === "settings" && key === BUY_SHOPS_KEY) m.slots = [];
  if (k === "slotCounts") {
    const slot = m.slots.find((s) => s.id === key);
    if (slot) slot.count = value === undefined ? slotDefault(slot) : (value as number);
  }
}
