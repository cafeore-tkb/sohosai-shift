// カレンダー配信の URL の名前（/shift/{名前}）と、Firestore のフィールド名に使う ID。
// Worker（worker/src/index.ts）も同じ関数で URL から ID を求めるので、ほかのモジュールを import しない

/** 文字列 → 53ビットのハッシュ（cyrb53）を16進14桁で。暗号用ではない（ID と変更の検出だけに使う） */
export function hashHex(s: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** 氏名 → URL の名前（空白を除き、URL で困る記号は _ に） */
export const nameSlug = (name: string): string => name.normalize("NFC").replace(/[\s　]+/g, "").replace(/[/?#%\\.]+/g, "_");

/** 以前の全体のシフトの URL（/shift/all。いまは /shift へ置き換える）。この名前の人は「all2」になる */
export const OVERVIEW_SLUG = "all";

/** URL の名前 → Firestore のフィールド名に使う ID（"m" + 16進14桁） */
export const slugId = (slug: string): string => `m${hashHex(slug.normalize("NFC"))}`;

/**
 * 氏名 → URL の名前。空白を除いて同じになる人がいれば2人目から「名前2」「名前3」…（並び順で決まる）。
 * 名前が同じなら配信し直しても同じ（購読の URL が変わらない）
 */
export function calendarSlugs(names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {},
    used = new Set<string>();
  for (const name of names) {
    const base = nameSlug(name) || "_";
    let slug = base;
    for (let n = 2; used.has(slug) || slug.toLowerCase() === OVERVIEW_SLUG; n++) slug = `${base}${n}`;
    used.add(slug);
    out[name] = slug;
  }
  return out;
}
