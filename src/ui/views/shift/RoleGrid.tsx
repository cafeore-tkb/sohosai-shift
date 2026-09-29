// 役職別のシフト表（行：30分ごとの時間、列：役職の各番目＝1セル1人）。<table role="grid">。
// 見出し3行（店舗の帯・役職・番目）と時間の列は表の中で固定（sticky）。行は memo（変わった行だけ描き直す）、
// セルの選択中・範囲の選択・移動元・移動先・光りはセルごとに store から読む（cellUi）。
// 行の data-hour（開始時刻）は、移動の足あと（footprint.ts）が枠のない時間のセルを探すのに使う。

import { memo, useRef } from "react";
import type { Audit, DayGrid, DripBadge, Item, Model } from "../../../domain";
import { CarChip, ChipCount, Drip, Mark, PosTag, cx, shopClass } from "../../components";
import { useCellUi, useRestartFlash } from "./cellUi";
import { hourTitle, roleHead, roleRows } from "./gridModel";
import type { Edge, RoleCell, RoleHead, RoleRow } from "./gridModel";
import s from "./RoleGrid.module.css";

/** ドリッパーの名前の右のアイスの記号（担当者ポップアップでも使う） */
function DripMark({ badge, className }: { badge: DripBadge | null; className?: string }) {
  if (!badge) return null;
  return <Drip kind={badge.all ? "both" : badge.cls === "hot" ? "hot" : "ice"} text={badge.text} title={badge.title} className={className} />;
}

const edgeClass = (e: Edge) => (e === "shop" ? s.isShop : e === "group" ? s.isGroup : undefined);

export interface RoleGridProps {
  m: Model;
  date: string;
  /** 読み上げ・見出し用の日の名前（本番1日目） */
  dayTitle: string;
  grid: DayGrid;
  audit: Audit;
  shortNames: Record<string, string>;
  /** その日の枠（店舗の帯の未割当） */
  dayItems: readonly Item[];
}

/** 1日分の表。行のデータは描画のたびに作る（Model の版ごと）が、変わっていない行・セルは描き直さない */
export function RoleGrid({ m, date, dayTitle, grid, audit, shortNames, dayItems }: RoleGridProps) {
  const head = roleHead(m, grid, dayItems);
  const rows = roleRows(m, date, grid, audit, shortNames);
  const hasCar = rows.some((r) => r.car);
  return (
    <table className={s.rg} role="grid" aria-label={`${dayTitle} 役職別シフト`} data-grid-date={date}>
      <colgroup>
        <col className={s.tc} />
        {grid.cols.map((_, i) => (
          <col key={i} className={s.pc} />
        ))}
      </colgroup>
      <Head head={head} hasCar={hasCar} />
      <tbody>
        {rows.map((row) => (
          <Row key={row.hour} row={row} />
        ))}
      </tbody>
    </table>
  );
}

const Head = memo(
  function Head({ head, hasCar }: { head: RoleHead; hasCar: boolean }) {
    return (
      <thead>
        <tr className={s.h1}>
          <th className={s.corner} rowSpan={3} scope="col">
            <b>時間</b>
            {hasCar ? <span className={s.cornerNote}>車＝シフト外の車持ち</span> : null}
          </th>
          {head.bands.map((b) => (
            <th key={b.store} colSpan={b.span} scope="colgroup" className={cx(s.band, shopClass(b.store), edgeClass(b.edge))} data-band={b.store}>
              <span className={s.bandLabel}>
                {b.store}
                {b.open ? <em className={s.bandOpen}>{`未割当 ${b.open}`}</em> : <ChipCount tone="ok" />}
              </span>
            </th>
          ))}
        </tr>
        <tr className={s.h2}>
          {head.groups.map((g, i) =>
            g.single ? (
              <th key={i} rowSpan={2} scope="col" className={cx(s.role, s.roleSingle, edgeClass(g.edge))} title={g.title}>
                {g.label}
                {g.tag ? <PosTag>{g.tag}</PosTag> : null}
              </th>
            ) : (
              <th key={i} colSpan={g.span} scope="colgroup" className={cx(s.role, edgeClass(g.edge))} title={g.title}>
                {g.label}
              </th>
            ),
          )}
        </tr>
        <tr className={s.h3}>
          {head.positions.map((p, i) => (
            <th key={i} scope="col" className={cx(s.pos, edgeClass(p.edge))}>
              {p.label}
              {p.tag ? <PosTag>{p.tag}</PosTag> : null}
            </th>
          ))}
        </tr>
      </thead>
    );
  },
  (a, b) => a.head.sig === b.head.sig && a.hasCar === b.hasCar,
);

const Row = memo(
  function Row({ row }: { row: RoleRow }) {
    return (
      <tr className={row.half ? s.half : undefined} data-hour={row.hour}>
        <th scope="row" className={s.time} title={hourTitle(row.hour)}>
          <span className={s.timeIn}>
            <span className={s.t}>{row.hour}</span>
            {row.car ? <CarChip n={row.car.n} title={row.car.title} className={s.car} /> : null}
          </span>
        </th>
        {row.cells.map((c, i) => (
          <Cell key={i} cell={c} />
        ))}
      </tr>
    );
  },
  (a, b) => a.row.sig === b.row.sig,
);

const Cell = memo(
  function Cell({ cell }: { cell: RoleCell }) {
    if (cell.kind === "void") return <td className={cx(s.void, edgeClass(cell.edge))} />;
    if (cell.kind === "na")
      return (
        <td className={cx(s.na, edgeClass(cell.edge))} data-open-counts={cell.slotId} title="この時間は不要（クリックで必要人数を設定）">
          <button type="button" className={s.cell} data-state="na" data-cell="" tabIndex={-1} aria-label={cell.aria} />
        </td>
      );
    return <ItemCell cell={cell} />;
  },
  (a, b) => a.cell.sig === b.cell.sig,
);

function ItemCell({ cell }: { cell: Extract<RoleCell, { kind: "item" }> }) {
  const ui = useCellUi(cell.key);
  const ref = useRef<HTMLButtonElement>(null);
  useRestartFlash(ref, ui.flash);
  return (
    <td
      className={edgeClass(cell.edge)}
      data-slot-key={cell.key}
      data-drag-source={ui.source ? "" : undefined}
      data-drop-ok={ui.dropOk ? "" : undefined}
      data-drop-fit={ui.dropFit ? "" : undefined}
      data-selected={ui.selected ? "" : undefined}
      aria-selected={ui.selected ? true : undefined}
      data-stint={cell.stint ?? undefined}
      data-box={cell.box ?? undefined}
    >
      <button
        ref={ref}
        type="button"
        className={cx(s.cell, ui.picking && s.picking, ui.flash ? s.flash : undefined)}
        data-state={cell.state}
        data-flag={cell.flag ?? undefined}
        data-cont={cell.cont ? "" : undefined}
        data-manual={cell.manual ? "" : undefined}
        data-pick-slot={cell.key}
        data-cell=""
        tabIndex={-1}
        title={cell.title}
        aria-label={cell.aria}
      >
        {cell.mark ? <Mark kind={cell.mark} className={s.mk} /> : null}
        {cell.label ? <span className={s.nm}>{cell.label}</span> : null}
        <DripMark badge={cell.drip} className={s.dripMk} />
      </button>
    </td>
  );
}
