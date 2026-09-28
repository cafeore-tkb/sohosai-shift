// メンバー・役職ルールの編集（旧版の memberEditor / roleRuleEditor の change 処理）
// 割当の条件が変わる操作も割当は外さない（合わなくなった割当は「条件外」として表示）。念のため pruneAssignments で
// 枠がなくなった割当だけを片付け、外した数を返す（0 より大きければ prunedMessage を表示）

import { storeNames } from "./config";
import { dripsForIce, parseKana, parseRoles } from "./parse";
import { pruneAssignments } from "./prune";
import type { Model } from "./types";

/** ステータスを変える（未合格ならアイス × に） */
export function setMemberStatus(m: Model, name: string, status: string): number {
  m.memberStatuses[name] = status;
  if (status === "未合格") m.memberDrips[name] = dripsForIce("×");
  return pruneAssignments(m);
}

/** 所属店舗のチェックを付ける／外す */
export function setMemberStore(m: Model, name: string, store: string, checked: boolean): number {
  const stores = m.memberStores[name] || [];
  m.memberStores[name] = checked ? [...new Set([...stores, store])] : stores.filter((s) => s !== store);
  return pruneAssignments(m);
}

/** やりたい役職（入力欄の文字列） */
export function setMemberWants(m: Model, name: string, text: string): void {
  m.memberWants[name] = parseRoles(text).roles;
}

/** 苦手な役職（入力欄の文字列） */
export function setMemberDislikes(m: Model, name: string, text: string): void {
  m.memberDislikes[name] = parseRoles(text).roles;
}

/** 車の有無 */
export function setMemberCar(m: Model, name: string, car: boolean): number {
  m.memberCars[name] = car;
  return pruneAssignments(m);
}

/** 働ける量（"少し"・"5時間程度"・"いっぱい"。"" なら希望なし＝削除）。目安なので割当は外さない */
export function setMemberWorkload(m: Model, name: string, workload: string): void {
  if (workload) m.memberWorkload[name] = workload;
  else delete m.memberWorkload[name];
}

/** ふりがな（"" なら削除。カタカナはひらがなに） */
export function setMemberKana(m: Model, name: string, text: string): void {
  const k = parseKana(text);
  if (k) m.memberKana[name] = k;
  else delete m.memberKana[name];
}

/** 学年（在籍コード。undefined なら削除） */
export function setMemberGrade(m: Model, name: string, code: number | undefined): void {
  if (code === undefined) delete m.memberGrade[name];
  else m.memberGrade[name] = code;
}

/** アイスのステータス（"" なら未設定＝削除） */
export function setMemberIce(m: Model, name: string, ice: string): number {
  if (ice) m.memberDrips[name] = dripsForIce(ice);
  else delete m.memberDrips[name];
  return pruneAssignments(m);
}

/** 役職ルール（ruleKey / posKey → 最低ステータス。「条件なし」は "未設定"） */
export function setRoleRequirement(m: Model, key: string, status: string): number {
  m.roleRequirements[key] = status;
  return pruneAssignments(m);
}

const norm = (v: string) => v.normalize("NFKC").replace(/\s/g, "");

/** 要確認：ステータスか所属店舗が未設定の人 */
export const needsAttention = (m: Model, name: string): boolean =>
  (m.memberStatuses[name] || "未設定") === "未設定" || !(m.memberStores[name] || []).length;

/** メンバー一覧の絞り込み（名前・ふりがなの検索〈カタカナでも〉・店舗。"none" は店舗未設定、"attention" は要確認） */
export function filterMembers(m: Model, all: readonly string[], query: string, store: string): string[] {
  const q = norm(query),
    qk = parseKana(query).replace(/\s/g, ""),
    storesOf = (n: string) => m.memberStores[n] || [];
  return all.filter(
    (n) =>
      (!q || norm(n).includes(q) || (!!qk && norm(m.memberKana?.[n] || "").includes(qk))) &&
      (!store ||
        (store === "none"
          ? !storesOf(n).length
          : store === "attention"
            ? needsAttention(m, n)
            : storesOf(n).includes(store))),
  );
}

/** 店舗の絞り込みボタンの人数（すべて・各店舗・店舗未設定） */
export function memberStoreCounts(m: Model, all: readonly string[]): { value: string; count: number }[] {
  const storesOf = (n: string) => m.memberStores[n] || [];
  return [
    { value: "", count: all.length },
    ...storeNames.map((s) => ({ value: s, count: all.filter((n) => storesOf(n).includes(s)).length })),
    { value: "none", count: all.filter((n) => !storesOf(n).length).length },
  ];
}
