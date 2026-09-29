// 表のセルに出すデータ（アプリのシフト表と印刷で共用。HTML は作らない）

import type { Audit } from "./audit";
import { DRIP_NONE, breakRoles, ordinalRoles, roleStore, slotChoices, storeClass, storeNames } from "./config";
import { namesOn } from "./availability";
import { displayName } from "./names";
import { available, canWorkAt, dislikes, memberIce, posLabel, prefMark, unfitReasons } from "./rules";
import { fmt } from "./time";
import { flattened, hoursForDate } from "./slots";
import { plusSlot } from "./time";
import { personCellLabel } from "./labels";
import type { Item, Model } from "./types";

// ---- ドリッパーのアイス（名前の右の記号）----

export interface DripBadge {
  /** アイスのステータス（○／1杯のみ／2杯のみ／×／ドリップ不可） */
  ice: string;
  /** ツールチップ（例：「アイス：1杯のみ」） */
  title: string;
  /** true なら全部できる（灰色の ○） */
  all: boolean;
  /** 記号：○／1／2／H／×（ドリップ不可） */
  text: string;
  /** 記号の色："" | "ice"（青）| "hot"（赤） */
  cls: "" | "ice" | "hot";
}

// 記号：○（全部）／青字1・2（その杯数のみ）／赤字H（アイス不可＝ホットのみ）／赤字×（ドリップ不可＝未合格）
export function dripBadge(m: Model, name: string): DripBadge | null {
  const ice = memberIce(m, name);
  if (!ice) return null;
  if (ice === DRIP_NONE) return { ice, title: `${DRIP_NONE}（未合格）`, all: false, text: "×", cls: "hot" };
  const title = `アイス：${ice}`;
  if (ice === "○") return { ice, title, all: true, text: "○", cls: "" };
  return { ice, title, all: false, text: ice === "×" ? "H" : ice[0], cls: ice === "×" ? "hot" : "ice" };
}

// ---- 役職別の表の1人分の枠（旧 slotItemHtml のデータ）----

export interface SlotCell {
  /** 担当者（未割当は ""） */
  chosen: string;
  /** 条件に合う人の勤務可能時間の件数（0 なら「候補なし」） */
  candidates: number;
  /** 勤務可能表では × の時間に入っている */
  off: boolean;
  /** 条件外の理由（所属店舗・ステータス・車。条件に合っていれば []） */
  unfit: string[];
  /** 色分け：conflict / off / unfit / dislike / filled / empty / none（優先順：重複 → 勤務できない時間 → 条件外 → 苦手） */
  kind: "conflict" | "off" | "unfit" | "dislike" | "filled" | "empty" | "none";
  /** 名前の前の記号：× ／ ★ ／ △ ／ "" */
  mark: string;
  /** 表示：担当者の表示名、または「空き」「候補なし」 */
  label: string;
  /** ツールチップ */
  tip: string;
  /** 読み上げ用 */
  ariaLabel: string;
  /** ドリッパーの枠ならアイスの記号 */
  drip: DripBadge | null;
}

export function slotCell(m: Model, item: Item, audit: Audit, shortNames: Readonly<Record<string, string>>): SlotCell {
  const chosen = m.assignments[item.key] || "",
    choices = available(m, item);
  const off = !!chosen && !canWorkAt(m, chosen, item);
  const unfit = chosen ? unfitReasons(m, chosen, item) : [];
  const kind: SlotCell["kind"] = audit.conflicts.has(item.key)
    ? "conflict"
    : off
      ? "off"
      : unfit.length
        ? "unfit"
        : chosen && dislikes(m, chosen, item.role)
          ? "dislike"
          : chosen
            ? "filled"
            : choices.length
              ? "empty"
              : "none";
  const mark = chosen ? (off ? "×" : prefMark(m, chosen, item.role)) : "";
  const label = chosen ? displayName(chosen, m.fullNames, shortNames) : choices.length ? "空き" : "候補なし";
  const tip = chosen
    ? `${chosen}（${fmt(audit.hours[chosen]?.[item.date] || 0)}）${off ? "：勤務可能表では × の時間です" : ""}${unfit.length ? `：条件外（${unfit.join("・")}）` : ""}：クリックで変更、ドラッグで移動`
    : choices.length
      ? `候補 ${choices.length}人：クリックして選択`
      : "条件に合うメンバーがいません";
  return {
    chosen,
    candidates: choices.length,
    off,
    unfit,
    kind,
    mark,
    label,
    tip,
    ariaLabel: `${item.start} ${item.role}：${chosen || "未割当"}`,
    drip: chosen && slotChoices[item.role] ? dripBadge(m, chosen) : null,
  };
}

// ---- 車（時間の下の「車N」）----

// その日の参加者のうち、その時間にどの枠にも入っていない車持ち（勤務可能時間は見ない）
// 車持ちが1人もいなければ null（表示しない）
export function carFreeAt(m: Model, date: string): ((h: string) => string[]) | null {
  if (!Object.values(m.memberCars).some(Boolean)) return null;
  const busy = new Set(
    flattened(m)
      .filter((x) => x.date === date && m.assignments[x.key])
      .map((x) => `${m.assignments[x.key]}|${x.start}`),
  );
  return (h) => namesOn(m, date).filter((n) => m.memberCars[n] && !busy.has(`${n}|${h}`));
}

/** 「車N」のツールチップ */
export const carTitle = (free: readonly string[]): string =>
  free.length ? `シフトに入っていない車持ち：${free.join("、")}` : "シフトに入っていない車持ちがいません";

// ---- 個人別の表（列：メンバー、行：時間、セル：担当）----

export interface PersonCell {
  label: string;
  /** conflict（重複）/ off（勤務可能時間外）/ brk（昼食・休憩）/ "on store-xxx" / free（空き）/ na（参加できない） */
  cls: string;
  /** 担当があればその枠の key（先頭） */
  key?: string;
}

export interface PersonMatrix {
  hours: string[];
  /** cols[メンバー][行] */
  cols: PersonCell[][];
  /** span[メンバー][行]：0 は上のセルに結合、1 以上は縦に結合する行数 */
  span: number[][];
}

export function personMatrix(m: Model, date: string, names: readonly string[]): PersonMatrix {
  const hours = hoursForDate(m, date),
    at: Record<string, Item[]> = {};
  for (const x of flattened(m))
    if (x.date === date && m.assignments[x.key]) (at[`${m.assignments[x.key]}|${x.start}`] ??= []).push(x);
  const cols = names.map((name) => {
    const attend = m.availability.filter((a) => a.name === name && a.date === date);
    return hours.map((h): PersonCell => {
      const xs = at[`${name}|${h}`] || [];
      if (xs.length)
        return {
          label: xs.map(personCellLabel).join("／"),
          cls:
            xs.length > 1
              ? "conflict"
              : !attend.some((a) => a.start <= h && a.end >= plusSlot(h))
                ? "off"
                : breakRoles.includes(xs[0].role)
                  ? "brk"
                  : `on ${storeClass(roleStore[xs[0].role] || xs[0].store)}`,
          key: xs[0].key,
        };
      return { label: "", cls: attend.some((a) => a.start <= h && a.end >= plusSlot(h)) ? "free" : "na" };
    });
  });
  const span = cols.map((col) =>
    col.map((c, i) => {
      if (c.label && i && col[i - 1].label === c.label && col[i - 1].cls === c.cls) return 0;
      let n = 1;
      if (c.label) while (col[i + n] && col[i + n].label === c.label && col[i + n].cls === c.cls) n++;
      return n;
    }),
  );
  return { hours, cols, span };
}

// ---- 印刷の「全日程 個人別シフト」：その日の担当を時間順につなげる ----

export function personSegments(m: Model, name: string, date: string): { start: string; end: string; label: string }[] {
  const items = flattened(m)
    .filter((x) => x.date === date && m.assignments[x.key] === name)
    .sort((a, b) => a.start.localeCompare(b.start));
  const label = (x: Item) =>
    `${storeNames.includes(x.store) ? `${x.store}・` : ""}${x.role}${ordinalRoles.includes(x.role) ? ` ${posLabel(x.role, x.occ)}` : ""}`;
  const segs: { start: string; end: string; label: string }[] = [];
  for (const x of items) {
    const last = segs[segs.length - 1];
    if (last && last.end === x.start && last.label === label(x)) last.end = x.end;
    else segs.push({ start: x.start, end: x.end, label: label(x) });
  }
  return segs;
}
