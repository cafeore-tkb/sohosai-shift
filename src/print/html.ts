// 印刷 HTML の部品（旧版の文字列と同じ形）

import { carFreeAt, carTitle, dripBadge } from "../domain/cells";
import { posTag } from "../domain/rules";
import type { Model } from "../domain/types";

export function esc(v: unknown): string {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c as "&"],
  );
}

// 記号：○（全部）／青字1・2（その杯数のみ）／赤字H（アイス不可＝ホットのみ）
export function dripBadgeHtml(m: Model, name: string): string {
  const b = dripBadge(m, name);
  if (!b) return "";
  if (b.all) return `<b class="drip-mark all" title="${b.title}">○</b>`;
  return `<b class="drip-mark" title="${b.title}"><span class="${b.cls}">${b.text}</span></b>`;
}

/** 時間の下の「車N」（車持ちが1人もいなければ常に ""） */
export function carCellHtml(m: Model, date: string): (h: string) => string {
  const freeAt = carFreeAt(m, date);
  if (!freeAt) return () => "";
  return (h) => {
    const free = freeAt(h);
    return `<span class="car ${free.length ? "" : "zero"}" title="${esc(carTitle(free))}">車${free.length}</span>`;
  };
}

/** 番目の見出しの条件（「上級」「1年↑」など） */
export function posTagHtml(m: Model, store: string, role: string, i: number): string {
  const t = posTag(m, store, role, i);
  return t ? `<small>${t}</small>` : "";
}
