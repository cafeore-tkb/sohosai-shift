// 個人別の表（列：メンバー、行：時間、セル：その人の担当。担当のブロックを押すと変更）。
// 見出しは名字・勤務時間・時間の棒。担当は縦に結合したブロック（店舗の色）、昼食・休憩、重複（役職ごとに1行）、時間外（斜線）。

import { memo, useRef } from "react";
import type { Audit, Model } from "../../../domain";
import { cx, shopClass } from "../../components";
import { useCellUi, useRestartFlash } from "./cellUi";
import { hourTitle, personTable } from "./gridModel";
import type { PersonCell, PersonColumn } from "./gridModel";
import s from "./PersonMatrix.module.css";

export interface PersonMatrixProps {
  m: Model;
  date: string;
  dayTitle: string;
  names: string[];
  audit: Audit;
  shortNames: Record<string, string>;
}

export function PersonMatrix({ m, date, dayTitle, names, audit, shortNames }: PersonMatrixProps) {
  const t = personTable(m, date, names, audit, shortNames);
  return (
    <table className={s.pm} role="grid" aria-label={`${dayTitle} 個人別シフト`} data-grid-date={date}>
      <colgroup>
        <col className={s.tc} />
        {t.columns.map((c) => (
          <col key={c.name} className={s.mc} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className={s.corner} scope="col">
            時間
          </th>
          {t.columns.map((c) => (
            <Head key={c.name} col={c} max={t.maxHours} />
          ))}
        </tr>
      </thead>
      <tbody>
        {t.hours.map((h, r) => (
          <tr key={h} className={h.endsWith(":00") ? undefined : s.half}>
            <th scope="row" title={hourTitle(h)}>
              {h}
            </th>
            {t.rows[r].map((c, i) => (c.kind === "skip" ? null : <PmCell key={i} cell={c} />))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Head({ col, max }: { col: PersonColumn; max: number }) {
  return (
    <th scope="col" data-pm-name={col.name} title={`${col.name}（この日 ${col.hoursText}）`}>
      <span className={s.name}>{col.short}</span>
      <span className={s.hours}>{col.hoursText}</span>
      <span className={s.bar} aria-hidden="true">
        <i style={{ width: `${max ? (col.hours / max) * 100 : 0}%` }} />
      </span>
    </th>
  );
}

type ShownCell = Exclude<PersonCell, { kind: "skip" }>;
/** 表示が同じなら描き直さない（Model の版が変わっても、変わったセルだけ） */
const sameCell = (a: ShownCell, b: ShownCell) =>
  a.kind === "block" && b.kind === "block"
    ? a.key === b.key && a.span === b.span && a.state === b.state && a.shop === b.shop && a.label === b.label && a.aria === b.aria
    : a.kind === b.kind;

const PmCell = memo(
  function PmCell({ cell }: { cell: ShownCell }) {
    if (cell.kind !== "block") return <td className={cell.kind === "na" ? s.na : undefined} />;
    return <Block cell={cell} />;
  },
  (a, b) => sameCell(a.cell, b.cell),
);

/** 担当のブロック。選択中・光りは自分の分だけ store から読む（ポップアップの開閉で表全体を描き直さない） */
function Block({ cell }: { cell: Extract<PersonCell, { kind: "block" }> }) {
  const ui = useCellUi(cell.key);
  const ref = useRef<HTMLButtonElement>(null);
  useRestartFlash(ref, ui.flash);
  return (
    <td rowSpan={cell.span > 1 ? cell.span : undefined} data-pm-key={cell.key} title={cell.title}>
      <button
        ref={ref}
        type="button"
        className={cx(s.block, cell.state === "on" && shopClass(cell.shop), ui.picking && s.picking, ui.flash ? s.flash : undefined)}
        data-pm-state={cell.state === "on" ? undefined : cell.state}
        data-cell=""
        tabIndex={-1}
        aria-label={cell.aria}
      >
        {cell.state === "conflict"
          ? cell.lines.map((l, i) => <span key={i}>{l}</span>)
          : cell.state === "off"
            ? `× ${cell.label}`
            : cell.state === "unfit"
              ? `≠ ${cell.label}`
              : cell.label}
      </button>
    </td>
  );
}
