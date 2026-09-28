// メンバーの並び順（共有データ memberOrder：氏名 → 番号）。
// メンバー表・勤務可能表の行・個人別の列・勤務状況チェック・印刷・「メンバーを追加」の候補は、すべて orderedNames で並べる。
// 並び順を保存していなければ五十音順（旧版と同じ）。番号のない人（あとから読み込んだ・追加した人）は後ろに五十音順。
//
// 共同編集はキーごとの差分・マージなので、1人を動かしたときは原則その人の番号だけを書き換える
// （前後の人の番号のあいだの値）。番号のない人がいる・同じ番号がある・すき間がなくなったときだけ、全員に番号を振り直す。

import { statusLevels, storeNames } from "./config";
import type { Model } from "./types";

/** 五十音順（旧版の並び） */
export const byJa = (a: string, b: string): number => a.localeCompare(b, "ja");

const rankOf = (m: Model, name: string): number | undefined => {
  const r = (m.memberOrder || {})[name];
  return typeof r === "number" && Number.isFinite(r) ? r : undefined;
};

/** 並び順どおりに並べる（新しい配列）。番号のある人が番号順、ない人はその後ろに五十音順。同じ番号は五十音順 */
export function orderedNames(m: Model, names: Iterable<string>): string[] {
  return [...new Set(names)].sort((a, b) => {
    const ra = rankOf(m, a),
      rb = rankOf(m, b);
    if (ra !== undefined && rb !== undefined) return ra - rb || byJa(a, b);
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return byJa(a, b);
  });
}

/** 並べ替えボタン */
export type MemberSort = "status" | "kana" | "store";
export const MEMBER_SORTS: readonly { value: MemberSort; label: string; title: string }[] = [
  { value: "status", label: "学年順", title: "上級生 → 2年目合格 → 1年目合格 → 未合格 → 未設定（同じなら五十音順）" },
  { value: "kana", label: "五十音順", title: "氏名の五十音順" },
  { value: "store", label: "所属店舗順", title: "本店 → 2号店 → くれあ → 店舗未設定（複数なら先の店舗。同じなら五十音順）" },
];

/** 学年順・五十音順・所属店舗順に並べた名前（Model は変えない） */
export function sortedMembers(m: Model, names: readonly string[], kind: MemberSort): string[] {
  const kana = [...new Set(names)].sort(byJa);
  if (kind === "kana") return kana;
  const key =
    kind === "status"
      ? (n: string) => -(statusLevels[m.memberStatuses[n] || "未設定"] ?? 0)
      : (n: string) => {
          const idx = (m.memberStores[n] || []).map((s) => storeNames.indexOf(s)).filter((i) => i >= 0);
          return idx.length ? Math.min(...idx) : storeNames.length;
        };
  return kana.map((n, i) => ({ n, k: key(n), i })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.n);
}

/** その並びを番号にする（1, 2, 3 …） */
export const ranksFor = (names: readonly string[]): Record<string, number> => Object.fromEntries(names.map((n, i) => [n, i + 1]));

/** 並び順を丸ごと置き換える（並べ替えボタン）。元に戻す用に前の内容を返す */
export function setMemberOrder(m: Model, names: readonly string[]): Record<string, number> {
  const before = { ...(m.memberOrder || {}) };
  m.memberOrder = ranksFor(names);
  return before;
}

/**
 * 1人を動かしたあとの並び（全員分）。
 * visible は画面に見えている順（検索・絞り込みの結果）、to はその人を除いた visible の中で入る位置（0 = 先頭）。
 * 見えている隣の人を基準にする：to の位置の人の直前へ。いちばん下なら、見えている最後の人の直後へ。
 * 見えていない人どうしの順はそのまま。
 */
export function movedOrder(full: readonly string[], visible: readonly string[], name: string, to: number): string[] {
  const rest = visible.filter((n) => n !== name),
    others = full.filter((n) => n !== name);
  if (!full.includes(name) || !rest.length) return [...full];
  const t = Math.max(0, Math.min(to, rest.length));
  const at = t < rest.length ? others.indexOf(rest[t]) : others.indexOf(rest[rest.length - 1]) + 1;
  if (at < 0) return [...full];
  return [...others.slice(0, at), name, ...others.slice(at)];
}

/** これ以上小さいすき間では割らない（全員に振り直す） */
const MIN_GAP = 1e-6;

/**
 * 並びを newOrder にする。番号のない人・同じ番号・狭すぎるすき間がなければ、動いた1人の番号だけを変える
 * （共同編集で1項目だけが送られる）。そうでなければ全員に振り直す。元に戻す用に前の内容を返す
 */
export function moveMember(m: Model, full: readonly string[], visible: readonly string[], name: string, to: number): Record<string, number> | null {
  const next = movedOrder(full, visible, name, to);
  if (next.join("\n") === full.join("\n")) return null;
  const before = { ...(m.memberOrder || {}) };
  const ranks = full.map((n) => rankOf(m, n));
  const dense = ranks.every((r) => r !== undefined) && new Set(ranks).size === ranks.length;
  const i = next.indexOf(name),
    prev = i > 0 ? rankOf(m, next[i - 1]) : undefined,
    after = i < next.length - 1 ? rankOf(m, next[i + 1]) : undefined;
  const r = prev === undefined ? (after as number) - 1 : after === undefined ? prev + 1 : (prev + after) / 2;
  if (dense && Number.isFinite(r) && (prev === undefined || r - prev > MIN_GAP) && (after === undefined || after - r > MIN_GAP)) {
    m.memberOrder = { ...m.memberOrder, [name]: r };
  } else {
    // 見えていない（今回の一覧にない）人の番号は残す
    m.memberOrder = { ...(m.memberOrder || {}), ...ranksFor(next) };
  }
  return before;
}

/** 並び順の文言 */
export const memberSortedMessage = (label: string): string => `メンバーを${label}に並べ替えました`;
export const memberMovedMessage = (name: string, to: number, total: number): string => `${name} を ${to} / ${total} 番目に移動しました`;
