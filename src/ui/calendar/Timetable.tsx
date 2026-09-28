// 配信の表（シフト調整の「個人別」と同じ見た目）：行＝30分の時間、列＝メンバー（全体）または日（個人）。担当は縦につないだ枠（店舗の色）。
// cells は hours と同じ長さ（その列にない時間は null）。同じ枠の行は expandSegs で同じ配列になっているので、参照が同じなら縦につなぐ

import type { ReactNode } from "react";
import type { OverviewSeg } from "../../domain";
import { cx, shopClass } from "../components";
import s from "./Timetable.module.css";

export interface TimetableColumn {
  key: string;
  head: ReactNode;
  title?: string;
  cells: (OverviewSeg | null)[];
  /** 強調する列（前に選んだ人） */
  mine?: boolean;
}

export function Timetable({ hours, columns, label, wide }: { hours: string[]; columns: TimetableColumn[]; label: string; wide?: boolean }) {
  // span[列][行]：0 は上の枠に結合
  const span = columns.map((c) =>
    c.cells.map((x, r) => {
      if (!x || x[1] === "f" || x[1] === "n") return 1;
      if (r && c.cells[r - 1] === x) return 0;
      let n = 1;
      while (c.cells[r + n] === x) n++;
      return n;
    }),
  );
  return (
    <table className={cx(s.tt, wide && s.wide)} aria-label={label}>
      <colgroup>
        <col className={s.tc} />
        {columns.map((c) => (
          <col key={c.key} className={s.mc} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className={s.corner} scope="col">
            時間
          </th>
          {columns.map((c) => (
            <th key={c.key} scope="col" title={c.title} className={c.mine ? s.mineHead : undefined}>
              {c.head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {hours.map((h, r) => (
          <tr key={h} className={h.endsWith(":00") ? undefined : s.half}>
            <th scope="row">{h}</th>
            {columns.map((c, i) => {
              const n = span[i][r],
                x = c.cells[r];
              if (!n) return null;
              if (!x) return <td key={c.key} className={s.none} />;
              if (x[1] === "n") return <td key={c.key} className={s.na} />;
              if (x[1] === "f") return <td key={c.key} />;
              return (
                <td key={c.key} rowSpan={n > 1 ? n : undefined} title={x[2].replace(/／/g, "・")}>
                  <span className={cx(s.block, x[1] === "o" && shopClass(x[3]))} data-state={x[1] === "o" ? undefined : x[1]}>
                    {x[1] === "c" ? x[2].split("／").map((l, k) => <span key={k}>{l}</span>) : x[2]}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
