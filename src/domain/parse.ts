// アンケート回答・入力欄の値を読むパーサー

import { dripTypes, prefRoles, statusLevels, storeNames } from "./config";

/** ステータスを判別する。判別できなければ ""（「未設定」も ""） */
export function parseStatus(v: unknown): string {
  const s = String(v ?? "")
    .normalize("NFKC")
    .replace(/\s/g, "");
  if (!s) return "";
  if (s !== "未設定" && s in statusLevels) return s;
  if (/未合格|不合格/.test(s)) return "未合格";
  if (/上級/.test(s)) return "上級生";
  if (/2年目?合格/.test(s)) return "2年目合格";
  if (/1年目?合格/.test(s)) return "1年目合格";
  return "";
}

const LIST_SEP = /[,、，・\/;；|｜\n]+/;

/** 役職の希望・苦手（例：「ドリッパー、レジ」）。部分一致も拾う。roles は prefRoles の順 */
export function parseRoles(v: unknown): { roles: string[]; unknown: string[] } {
  const parts = String(v ?? "")
    .normalize("NFKC")
    .split(LIST_SEP)
    .map((x) => x.trim())
    .filter(Boolean);
  const roles = new Set<string>(),
    unknown: string[] = [];
  for (const part of parts) {
    const hit = prefRoles.filter((r) => part === r || part.includes(r) || (part.length >= 2 && r.includes(part)));
    hit.forEach((r) => roles.add(r));
    if (!hit.length) unknown.push(part);
  }
  return { roles: prefRoles.filter((r) => roles.has(r)), unknown };
}

/** 所属店舗（例：「本店, くれあ」）。stores は店舗の定義順 */
export function parseStores(v: unknown): {
  stores: string[];
  unknown: string[];
} {
  const known = storeNames;
  const parts = String(v ?? "")
    .normalize("NFKC")
    .split(LIST_SEP)
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    stores: known.filter((k) => parts.includes(k)),
    unknown: parts.filter((x) => !known.includes(x)),
  };
}

/** 旧形式のドリップ列挙（例：「1杯ホット, 2杯アイス」） */
export function parseDrips(v: unknown): string[] {
  const found = new Set<string>();
  for (const m of String(v ?? "")
    .normalize("NFKC")
    .matchAll(/([12])\s*杯\s*分?\s*[(（・/\s-]*\s*(ホット|アイス|hot|ice)/gi))
    found.add(`${m[1]}杯${/^(ホット|hot)$/i.test(m[2]) ? "ホット" : "アイス"}`);
  return dripTypes.filter((t) => found.has(t));
}

/** 対応ドリップの一覧 → アイスのステータス（未設定は ""） */
export const iceOf = (d: readonly string[] | undefined | null): string => {
  if (!d) return "";
  const i1 = d.includes("1杯アイス"),
    i2 = d.includes("2杯アイス");
  return i1 && i2 ? "○" : i1 ? "1杯のみ" : i2 ? "2杯のみ" : "×";
};

/** アイスのステータス → 対応ドリップの一覧（ホットは全員できる） */
export const dripsForIce = (ice: string): string[] => [
  "1杯ホット",
  "2杯ホット",
  ...(ice === "○" || ice === "1杯のみ" ? ["1杯アイス"] : []),
  ...(ice === "○" || ice === "2杯のみ" ? ["2杯アイス"] : []),
];

// CSVの値を読む。旧形式（「1杯ホット, 2杯アイス」のような列挙）も読める。判別できなければ undefined
export function parseIce(v: unknown): string | undefined {
  const s = String(v ?? "")
    .normalize("NFKC")
    .trim();
  if (!s) return "";
  if (/ホット|hot/i.test(s) || /1\s*杯[^,、]*[,、・/].*2\s*杯|2\s*杯[^,、]*[,、・/].*1\s*杯/.test(s))
    return iceOf(parseDrips(s));
  if (/^(○|◯|〇|o|可|両方|全部|すべて|全て)$/i.test(s)) return "○";
  if (/×|✕|^x$|不可|なし|無し|できない/i.test(s)) return "×";
  if (/1\s*杯/.test(s)) return "1杯のみ";
  if (/2\s*杯/.test(s)) return "2杯のみ";
  return undefined;
}

/** 車の有無。空なら undefined、判別できなければ undefined */
export function parseCar(v: unknown): boolean | undefined {
  const s = String(v ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (/いいえ|なし|無し?$|持って(い)?ない|×|^no$|^n$|^false$|^0$/.test(s)) return false;
  if (/はい|あり|有り?|持って(い)?る|○|◯|^yes$|^y$|^true$|^1$/.test(s)) return true;
  return undefined;
}

/**
 * 働ける量（少し／5時間程度／いっぱい）。空・「希望なし」などは ""（目安なし）、判別できなければ undefined。
 * 時間の数（「2時間」「4h」「6」）は 3時間以下→少し、7時間未満→5時間程度、それ以上→いっぱい
 */
export function parseWorkload(v: unknown): string | undefined {
  const s = String(v ?? "")
    .normalize("NFKC")
    .replace(/\s/g, "")
    .toLowerCase();
  if (!s || /^(-|ー|―|なし|無し|特になし|希望なし|未定|どれでも|おまかせ|お任せ)$/.test(s)) return "";
  if (
    /いっぱい|いくらでも|たくさん|沢山|多め|多く|多い|何時間でも|なんでも|制限なし|上限なし|無制限|全部|フル|max|lots/.test(
      s,
    )
  )
    return "いっぱい";
  if (/少し|すこし|少なめ|少ない|ちょっと|ちょこっと|短め|短い|few|little/.test(s)) return "少し";
  if (/程度|くらい|ぐらい|普通|ふつう|ほどほど|そこそこ|中くらい|半日/.test(s) && !/\d/.test(s)) return "5時間程度";
  const n = s.match(/\d+(\.\d+)?/);
  if (n) {
    const h = Number(n[0]);
    return h <= 3 ? "少し" : h < 7 ? "5時間程度" : "いっぱい";
  }
  return undefined;
}

/** 時刻 → "HH:MM"（読めなければ ""） */
export function normTime(v: unknown): string {
  const m = String(v ?? "")
    .normalize("NFKC")
    .match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/** 日付 → "YYYY-MM-DD"（読めなければ ""） */
export function normDate(v: unknown): string {
  const m = String(v ?? "")
    .normalize("NFKC")
    .match(/(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

/** 見出しの比較用（小文字・空白と _ - を除く） */
export function normKey(v: unknown): string {
  return String(v)
    .toLowerCase()
    .replace(/[\s_\-]/g, "");
}

/** Attendar の日時（"2026-10-31 10:00"） */
export function timePart(value: unknown): { date: string; time: string } | null {
  const m = String(value)
    .trim()
    .match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : null;
}
