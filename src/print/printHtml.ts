// 印刷ビュー（別ウィンドウに書き出す自己完結 HTML）。旧版とバイト単位で同じ HTML を作る

import { allNames, assignmentAudit, type Audit } from "../domain/audit";
import { namesOn } from "../domain/availability";
import { personMatrix, personSegments } from "../domain/cells";
import { dayName, printRole, roleBase, rolesForDate, slotChoices, storeClass } from "../domain/config";
import { buildShortNames } from "../domain/names";
import { decided, posLabel } from "../domain/rules";
import { ensureAllSlots, eventDates, findSlot, flattened, hoursForDate } from "../domain/slots";
import { dayLabel, fmt, shortDay } from "../domain/time";
import type { Model } from "../domain/types";
import { carCellHtml, dripBadgeHtml, esc, posTagHtml } from "./html";
import { PRINT_SCRIPT, PRINT_STYLE } from "./printAssets";

type ShortNames = Readonly<Record<string, string>>;
type Head = (title: string, meta: string) => string;

const printName = (shortNames: ShortNames, n: string) =>
  `<span class="s">${esc(shortNames[n] || n)}</span><span class="f">${esc(n)}</span>`;

/** 印刷のシフト表（1日分。行：時間、列：役職の各番目） */
export function printDayTable(m: Model, date: string, shortNames: ShortNames): string {
  const hours = hoursForDate(m, date),
    carCell = carCellHtml(m, date),
    find = (store: string, role: string, h: string) => findSlot(m, date, store, role, h);
  const groups = Object.entries(rolesForDate(date)),
    cols: { store: string; role: string; i: number; first: boolean }[] = [];
  for (const [store, roles] of groups)
    for (const [role] of roles) {
      const max = Math.max(0, ...hours.map((h) => Number(find(store, role, h)?.count) || 0));
      for (let i = 0; i < max; i++) {
        cols.push({ store, role, i, first: !cols.length || cols[cols.length - 1].store !== store });
      }
    }
  if (!cols.length) return '<p class="meta">必要な枠がありません。</p>';
  const heads = groups
    .map(([store]): [string, number] => [store, cols.filter((c) => c.store === store).length])
    .filter(([, n]) => n);
  const roleGroups: { store: string; role: string; first: boolean; cols: typeof cols }[] = [];
  cols.forEach((c) => {
    const g = roleGroups[roleGroups.length - 1];
    if (g && g.store === c.store && roleBase(g.role) === roleBase(c.role)) g.cols.push(c);
    else roleGroups.push({ store: c.store, role: c.role, first: c.first, cols: [c] });
  });
  return `<table class="grid ${cols.length > 22 ? "dense" : ""}" style="--rowh:${Math.min(10, Math.floor((140 / Math.max(1, hours.length)) * 10) / 10)}mm"><colgroup><col class="tc">${cols.map(() => "<col>").join("")}</colgroup><thead><tr><th rowspan="3" class="time">時間</th>${heads.map(([store, n]) => `<th colspan="${n}" class="first ${storeClass(store)}">${esc(store)}</th>`).join("")}</tr><tr>${roleGroups.map((g) => `<th class="${g.first ? "first" : ""} ${storeClass(g.store)} role" ${g.cols.length > 1 ? `colspan="${g.cols.length}"` : 'rowspan="2"'}>${esc(roleBase(g.role) === "ドリッパー" ? "ドリッパー" : printRole[g.role] || g.role)}</th>`).join("")}</tr><tr>${roleGroups
    .filter((g) => g.cols.length > 1)
    .flatMap((g) =>
      g.cols.map(
        (c) =>
          `<th class="num ${c.first ? "first" : ""} ${storeClass(c.store)} role">${posLabel(c.role, c.i)}${posTagHtml(m, c.store, c.role, c.i)}</th>`,
      ),
    )
    .join("")}</tr></thead><tbody>${hours
    .map(
      (h) =>
        `<tr class="${h.endsWith(":00") ? "hour" : ""} ${Number(h.slice(0, 2)) % 2 ? "band" : ""}"><th class="time">${h.endsWith(":00") ? h : `<small>${h}</small>`}${carCell(h)}</th>${cols
          .map((c) => {
            const sl = find(c.store, c.role, h),
              cls = c.first ? "first" : "";
            if (!sl || c.i >= sl.count) return `<td class="na ${cls}"></td>`;
            const key = `${sl.id}-${c.i}`,
              n = m.assignments[key];
            return `<td class="${n ? "" : "open"} ${cls}">${n ? printName(shortNames, n) + (slotChoices[c.role] ? dripBadgeHtml(m, n) : "") : ""}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

/** 個人別の表（列：メンバー、行：時間、セル：担当）の HTML。label はメンバーの見出し */
export function personMatrixHtml(
  m: Model,
  date: string,
  names: readonly string[],
  audit: Audit,
  label: (n: string) => string,
): string {
  const { hours, cols, span } = personMatrix(m, date, names);
  return `<table class="pm"><thead><tr><th class="pm-corner">時間</th>${names.map((n) => `<th title="${esc(n)}（${fmt(audit.hours[n]?.[date] || 0)}）">${esc(label(n))}<small>${fmt(audit.hours[n]?.[date] || 0)}</small></th>`).join("")}</tr></thead><tbody>${hours
    .map(
      (h, r) =>
        `<tr class="${h.endsWith(":00") ? "hour" : "half"}"><th>${h.endsWith(":00") ? h : `<small>${h}</small>`}</th>${cols
          .map((col, i) => {
            const n = span[i][r];
            if (!n) return "";
            const c = col[r];
            return `<td class="${c.cls}"${n > 1 ? ` rowspan="${n}"` : ""}${c.key ? ` data-pm-key="${c.key}" title="${esc(`${names[i]}：${c.label}`)}"` : ""}>${esc(c.label)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

// 印刷の個人別シフト（列：メンバー、行：時間）。1ページに収まるよう人数を均等に分ける
function personSheets(m: Model, date: string, title: string, audit: Audit, head: Head, shortNames: ShortNames, cls = "") {
  const names = namesOn(m, date),
    n = Math.ceil(names.length / 22),
    size = Math.ceil(names.length / Math.max(1, n)),
    pages: string[][] = [];
  for (let i = 0; i < names.length; i += size) pages.push(names.slice(i, i + size));
  const rowh = Math.min(9, Math.floor((165 / Math.max(1, hoursForDate(m, date).length)) * 10) / 10);
  return pages
    .map(
      (list, p) =>
        `<div class="sheet ${cls}">${head(`${title}${pages.length > 1 ? `（${p + 1}/${pages.length}）` : ""}`, '列：メンバー ／ 行：時間　色＝担当（<b class="key store-main">本店</b><b class="key store-second">2号店</b><b class="key store-kurea">くれあ</b><b class="key store-clean">美化</b><b class="key store-prep">準備</b>）　灰色＝参加できない時間　空欄＝担当なし<br>勤務時間に昼食・休憩は含みません')}${personMatrixHtml(m, date, list, audit, (n) => shortNames[n] || n).replace('<table class="pm">', `<table class="pm" style="--rowh:${rowh}mm">`)}</div>`,
    )
    .join("");
}

// 印刷の個人TT：日ごとに、1ページ最大22人
function printTimetables(m: Model, dates: readonly string[], audit: Audit, head: Head, shortNames: ShortNames) {
  return dates
    .map(
      (date, index) =>
        `<section class="ttday" data-d="${date}">${personSheets(m, date, `${esc(dayName(date, index))}　${esc(dayLabel(date))}　個人TT`, audit, head, shortNames)}</section>`,
    )
    .join("");
}

export interface PrintOptions {
  /** 「出力：」の日時（省略時は現在時刻を ja-JP で） */
  stamp?: string;
}

/**
 * 印刷ビューの HTML。旧版と同じく、先に ensureAllSlots(m) を行う（Model の slots が作られる）。
 */
export function printShiftHtml(m: Model, { stamp: stampText }: PrintOptions = {}): string {
  ensureAllSlots(m);
  const shortNames = buildShortNames(m);
  const dates = eventDates(m),
    audit = assignmentAudit(m),
    items = flattened(m),
    stamp = esc(stampText ?? new Date().toLocaleString("ja-JP"));
  const current = dates.includes(m.gridDate) ? m.gridDate : dates[0] || "";
  const head: Head = (title, meta) =>
    `<header class="dh"><div><p class="eyebrow">イベントシフト</p><h2>${title}</h2></div><p class="meta">${meta}<br><small>出力：${stamp}</small></p></header>`;
  const legend =
    '<p class="legend">黒塗り＝その時間は配置なし　空欄＝未割当　時間の下の「車N」＝シフトに入っていない車持ちの人数（0人は赤）　名前の右（ドリッパーのアイス）：<b class="drip-mark all">○</b>1杯・2杯とも　<b class="drip-mark"><span class="ice">1</span></b>1杯のみ　<b class="drip-mark"><span class="ice">2</span></b>2杯のみ　<b class="drip-mark"><span class="hot">H</span></b>アイス不可</p>';
  const days = dates
    .map((date, index) => {
      const title = `${esc(dayName(date, index))}　${esc(dayLabel(date))}`,
        dayItems = items.filter((x) => x.date === date),
        open = dayItems.filter((x) => !decided(m, x.key)).length;
      return `<section class="day" data-d="${date}"><div class="sheet">${head(title, `必要 ${dayItems.length}枠 ／ 割当済み ${dayItems.length - open}枠${open ? ` ／ <b class="warn">未割当 ${open}枠</b>` : ""}`)}${legend}${printDayTable(m, date, shortNames)}</div>${personSheets(m, date, `${title}　個人別シフト`, audit, head, shortNames, "people")}</section>`;
    })
    .join("");
  const names = allNames(m);
  const people = names
    .map((name) => {
      let total = 0;
      const cells = dates
        .map((date) => {
          if (!m.availability.some((a) => a.name === name && a.date === date)) return '<td class="off">—</td>';
          const segs = personSegments(m, name, date),
            h = audit.hours[name]?.[date] || 0;
          total += h;
          return segs.length
            ? `<td>${segs.map((sg) => `<div>${sg.start}–${sg.end}　${esc(sg.label)}</div>`).join("")}<div class="hours">${fmt(h)}</div></td>`
            : '<td class="off">割当なし</td>';
        })
        .join("");
      return `<tr><th>${esc(name)}</th>${cells}<td class="total">${fmt(total)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>シフト</title><meta name="color-scheme" content="light"><style>${PRINT_STYLE}</style></head><body data-day="${current}" data-mode="shift" class="${m.fullNames ? "full" : ""}"><div class="toolbar"><div class="modes"><button data-mode="shift">シフト表</button><button data-mode="tt">個人TT</button></div><div class="days">${dates.map((d, i) => `<button data-pick="${d}" data-label="${esc(dayName(d, i))}">${esc(dayName(d, i))} ${esc(shortDay(d))}</button>`).join("")}${dates.length > 1 ? '<button data-pick="all" data-label="全日程">すべての日</button>' : ""}</div><label><input type="checkbox" id="fullName" ${m.fullNames ? "checked" : ""}>フルネーム</label><label class="shift-only"><input type="checkbox" id="withPeople" checked>個人別シフトも印刷</label><button class="primary" onclick="print()">🖨 印刷する</button><button onclick="window.close();setTimeout(()=>{this.textContent='⌘W／Ctrl+W で閉じてください'},300)">閉じる</button><span class="note shift-only">選んだ日だけが印刷されます（A4横）。1ページ目がシフト表、2ページ目以降が個人別シフト（列：メンバー、行：時間）です。PDFにする場合は印刷画面で「PDFに保存」を選んでください。</span><span class="note tt-only">選んだ日の個人TTです（A4横、1ページ最大22人）。列がメンバー、行が時間で、各セルに担当を表示します。</span></div>${days || '<div class="sheet"><p>出力できるシフトがありません。</p></div>'}${names.length ? `<div class="sheet people-all">${head("全日程　個人別シフト", "勤務時間に昼食・休憩は含みません。「—」はその日に参加不可。")}<table><thead><tr><th>氏名</th>${dates.map((date, i) => `<th>${esc(dayName(date, i))}</th>`).join("")}<th>合計</th></tr></thead><tbody>${people}</tbody></table></div>` : ""}${printTimetables(m, dates, audit, head, shortNames)}<script>${PRINT_SCRIPT}</script></body></html>`;
}

