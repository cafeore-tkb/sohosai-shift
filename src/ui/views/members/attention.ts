// メンバー表の「要確認」：ステータスか所属店舗が未設定の人（行に色とタグを付ける。行の並びはメンバーの並び順のまま）。Model は変えない

import type { Model } from "../../../domain";

export type AttentionTag = "ステータス未設定" | "店舗未設定";

/** その人に付けるタグ（なければ空） */
export function attentionOf(m: Model, name: string): AttentionTag[] {
  const tags: AttentionTag[] = [];
  if ((m.memberStatuses[name] || "未設定") === "未設定") tags.push("ステータス未設定");
  if (!(m.memberStores[name] || []).length) tags.push("店舗未設定");
  return tags;
}
