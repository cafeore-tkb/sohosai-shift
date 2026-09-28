// 勤務状況チェックの「目安超え」（働ける量の目安を超えて割り当てられている人・日）。
// AuditDrawer から見た目のクラスと「個人別で見る」のボタンを受け取って描くだけ（判定は domain/workload.ts の overTargets）

import type { ReactNode } from "react";
import { fmt, overTargets } from "../domain";
import type { Audit, Model, OverTarget } from "../domain";
import { Pill } from "./components";

/** 目安超えの一覧（メンバーの並び・日付順） */
export const overTargetList = (m: Model, audit: Audit): OverTarget[] => overTargets(m, audit);

/** バッジ（0件なら出さない） */
export function WorkloadOverBadge({ list }: { list: OverTarget[] }) {
  if (!list.length) return null;
  return (
    <Pill
      tone="warn"
      size="lg"
      data-over-target-count={list.length}
    >{`働ける量の目安超え ${new Set(list.map((x) => x.name)).size}名`}</Pill>
  );
}

/** 一覧のセクション（0件なら出さない） */
export function WorkloadOverSection({
  list,
  classes,
  link,
}: {
  list: OverTarget[];
  classes: { sec: string; h3: string; list: string; text: string };
  link: (x: OverTarget) => ReactNode;
}) {
  if (!list.length) return null;
  return (
    <section className={classes.sec} aria-labelledby="auditWorkload" data-audit-workload="">
      <h3 id="auditWorkload" className={classes.h3}>
        働ける量の目安を超えている人
        <Pill tone="neutral">{`${list.length}件`}</Pill>
      </h3>
      <ul className={classes.list}>
        {list.map((x) => (
          <li key={`${x.name}|${x.date}`}>
            <b>{x.name}</b>
            <span className={classes.text}>{`${x.day} ${fmt(x.hours)}（${x.level}：目安 ${fmt(x.target)}）`}</span>
            {link(x)}
          </li>
        ))}
      </ul>
    </section>
  );
}
