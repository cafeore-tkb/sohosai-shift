// シフト表に出す短い名前（名字。かぶる人は下の名前の頭を足す）

import type { Model } from "./types";

/** 名字の推定：空白があれば前半、なければ先頭の漢字（最大3文字）、それ以外は先頭2文字（「々」なら3文字） */
export function surname(name: string): string {
  const s = name.normalize("NFKC").trim(),
    parts = s.split(/\s+/);
  if (parts.length > 1) return parts[0];
  const m = s.match(/^[一-鿿々ヶ]+/);
  if (m && m[0].length < s.length) return m[0].slice(0, 3);
  return s.slice(0, s[1] === "々" ? 3 : 2);
}

/** 氏名 → 短い名前（参加者全員ぶん） */
export function buildShortNames(m: Model): Record<string, string> {
  const groups: Record<string, string[]> = {},
    flat = (n: string) => n.normalize("NFKC").replace(/\s+/g, "");
  const shortNames: Record<string, string> = {};
  [...new Set(m.availability.map((a) => a.name))].forEach((n) => (groups[surname(n)] ??= []).push(n));
  for (const [base, list] of Object.entries(groups)) {
    for (let k = 0; k <= 12; k++) {
      const labels = list.map((n) => (k ? flat(n).slice(0, base.length + k) : base));
      if (new Set(labels).size === labels.length || k === 12) {
        list.forEach((n, i) => (shortNames[n] = new Set(labels).size === labels.length ? labels[i] : n));
        break;
      }
    }
  }
  return shortNames;
}

/** 表示名（フルネーム表示なら氏名のまま） */
export const displayName = (name: string, fullNames: boolean, shortNames: Readonly<Record<string, string>>): string =>
  fullNames ? name : shortNames[name] || name;
