// メンバーの並び順（共有データ memberOrder：氏名 → 番号）。
// メンバー表・勤務可能表の行・個人別の列・勤務状況チェック・印刷・「メンバーを追加」の候補は、すべて orderedNames で並べる。
// 並び順を保存していなければ五十音順（旧版と同じ）。番号のない人（あとから読み込んだ・追加した人）は後ろに五十音順。
//
// 共同編集はキーごとの差分・マージなので、1人を動かしたときは原則その人の番号だけを書き換える
// （前後の人の番号のあいだの値）。番号のない人がいる・同じ番号がある・すき間がなくなったときだけ、全員に番号を振り直す。

import { iceLevels, statusLevels, storeNames, workloadLevels } from "./config";
import { memberIce } from "./rules";
import type { Model } from "./types";

/** 五十音順（旧版の並び：氏名の文字どおり） */
export const byJa = (a: string, b: string): number => a.localeCompare(b, "ja");

/** 読み（ふりがながあればふりがな、なければ氏名。空白は除く） */
export const readingOf = (m: Model, name: string): string => (m.memberKana?.[name] || name).replace(/[\s\u3000]+/g, "");
/** 読みの五十音順（同じ読みなら氏名の順） */
export const byReading =
  (m: Model) =>
  (a: string, b: string): number =>
    byJa(readingOf(m, a), readingOf(m, b)) || byJa(a, b);

const rankOf = (m: Model, name: string): number | undefined => {
  const r = (m.memberOrder || {})[name];
  return typeof r === "number" && Number.isFinite(r) ? r : undefined;
};

/** 並び順どおりに並べる（新しい配列）。番号のある人が番号順、ない人はその後ろに五十音順（ふりがながあれば読みで）。同じ番号は五十音順 */
export function orderedNames(m: Model, names: Iterable<string>): string[] {
  const kana = byReading(m);
  return [...new Set(names)].sort((a, b) => {
    const ra = rankOf(m, a),
      rb = rankOf(m, b);
    if (ra !== undefined && rb !== undefined) return ra - rb || kana(a, b);
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return kana(a, b);
  });
}

/** 並べ替え（ツールバーのボタンと、メンバー表の列見出し） */
export type MemberSort = "grade" | "status" | "kana" | "store" | "ice" | "car" | "work" | "want" | "dislike";
export type SortDir = "asc" | "desc";
export const MEMBER_SORTS: readonly { value: MemberSort; label: string; title: string }[] = [
  { value: "grade", label: "学年順", title: "D3 → … → M1 → B4 → … → B1 → 学年未回答（同じなら五十音順）" },
  { value: "kana", label: "五十音順", title: "ふりがなの五十音順（ふりがながなければ氏名）" },
  { value: "status", label: "ステータス順", title: "上級生 → 2年目合格 → 1年目合格 → 未合格 → 未設定（同じなら五十音順）" },
  { value: "store", label: "所属店舗順", title: "本店 → 2号店 → くれあ → 店舗未設定（複数なら先の店舗。同じなら五十音順）" },
];
/** 列見出しで並べ替えたときの呼び名（トースト） */
export const MEMBER_SORT_LABELS: Readonly<Record<MemberSort, string>> = {
  grade: "学年順",
  kana: "五十音順",
  status: "ステータス順",
  store: "所属店舗順",
  ice: "アイス順",
  car: "車あり順",
  work: "働ける量順",
  want: "やりたい役職順",
  dislike: "苦手な役職順",
};
export const memberSortLabel = (kind: MemberSort, dir: SortDir = "asc"): string => MEMBER_SORT_LABELS[kind] + (dir === "desc" ? "（逆順）" : "");

/** 並べ替えのキー。unset（未設定・未入力）は向きに関わらずいちばん後ろ */
type SortKey = { unset: boolean; k: number | string };

function sortKeyOf(m: Model, kind: Exclude<MemberSort, "kana">): (n: string) => SortKey {
  const text = (v: string[] | undefined): SortKey => {
    const t = (v || []).join("、");
    return { unset: !t, k: t };
  };
  switch (kind) {
    case "grade":
      // 上の学年から（在籍コードが小さいほど上）
      return (n) => {
        const c = m.memberGrade?.[n];
        return { unset: typeof c !== "number", k: typeof c === "number" ? c : 0 };
      };
    case "status":
      return (n) => {
        const lv = statusLevels[m.memberStatuses[n] || "未設定"] ?? 0;
        return { unset: !lv, k: -lv };
      };
    case "store":
      return (n) => {
        const idx = (m.memberStores[n] || []).map((s) => storeNames.indexOf(s)).filter((i) => i >= 0);
        return { unset: !idx.length, k: idx.length ? Math.min(...idx) : 0 };
      };
    case "ice":
      return (n) => {
        const i = iceLevels.indexOf(memberIce(m, n));
        return { unset: i < 0, k: i };
      };
    case "car":
      return (n) => ({ unset: false, k: m.memberCars[n] ? 0 : 1 });
    case "work":
      // いっぱい → 5時間程度 → 少し → 未回答
      return (n) => {
        const i = workloadLevels.indexOf(m.memberWorkload[n] || "");
        return { unset: i < 0, k: -i };
      };
    case "want":
      return (n) => text(m.memberWants[n]);
    case "dislike":
      return (n) => text(m.memberDislikes[n]);
  }
}

const cmpKey = (a: number | string, b: number | string): number =>
  typeof a === "number" && typeof b === "number" ? a - b : byJa(String(a), String(b));

/** 並べ替えた名前（Model は変えない）。同じなら五十音順（ふりがながあれば読みで）。desc は逆順（未設定・未入力は後ろのまま） */
export function sortedMembers(m: Model, names: readonly string[], kind: MemberSort, dir: SortDir = "asc"): string[] {
  const kana = [...new Set(names)].sort(byReading(m));
  if (kind === "kana") return dir === "desc" ? kana.reverse() : kana;
  const key = sortKeyOf(m, kind),
    sign = dir === "desc" ? -1 : 1;
  return kana
    .map((n, i) => ({ n, key: key(n), i }))
    .sort((a, b) => Number(a.key.unset) - Number(b.key.unset) || sign * cmpKey(a.key.k, b.key.k) || a.i - b.i)
    .map((x) => x.n);
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
