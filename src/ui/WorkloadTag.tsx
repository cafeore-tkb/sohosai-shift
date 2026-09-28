// 働ける量の「目安超え」の小さな表示（担当者ポップアップの候補・勤務状況チェックで使う）。
// 判定は domain/workload.ts。目安なので警告色ではなく warn の Pill

import { OVER_TARGET_LABEL, isOverTarget, workloadTarget } from "../domain";
import type { Model } from "../domain";
import { Pill } from "./components";

/** hours（その日の勤務時間。この枠を入れたあとの値）が働ける量の目安を超えるなら「目安超え」 */
export function WorkloadTag({
  m,
  name,
  hours,
  className,
}: {
  m: Model;
  name: string;
  hours: number;
  className?: string;
}) {
  if (!isOverTarget(m, name, hours)) return null;
  const level = m.memberWorkload[name];
  return (
    <Pill
      tone="warn"
      size="sm"
      className={className}
      title={`働ける量「${level}」の目安（1日 ${workloadTarget(m, name)}時間）を超えます`}
      data-over-target=""
    >
      {OVER_TARGET_LABEL}
    </Pill>
  );
}
