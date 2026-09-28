// 担当者の手動編集（選択・外す・移動・入れ替え・範囲の移動）と、元に戻すための差分

import { assignmentAudit } from "./audit";
import { itemLabel, slotLabel } from "./labels";
import { available, canWorkAt, decided, dislikes, fitsSlot, wants } from "./rules";
import { findSlot, flattened, itemsOf } from "./slots";
import { SLOT, toHM, toMin } from "./time";
import type { Item, Model } from "./types";

// ---- 元に戻す ----

/** 元に戻す対象のマップ（旧版の undoMaps） */
export const undoMaps = ["assignments"] as const;
export type UndoMap = (typeof undoMaps)[number];
export type Snapshot = Record<UndoMap, Record<string, string>>;
/** [マップ, キー, 変更前, 変更後]（"" と未設定は同じ扱い） */
export type Change = [map: UndoMap, key: string, prev: string, next: string];

export const snapshotAssignments = (m: Model): Snapshot =>
  Object.fromEntries(undoMaps.map((k) => [k, { ...m[k] }])) as Snapshot;

/** 変更前のスナップショットと比べて、変わった項目（旧 finishChange の前半） */
export function diffChanges(before: Snapshot, m: Model): Change[] {
  const changed: Change[] = [];
  for (const k of undoMaps)
    for (const key of new Set([...Object.keys(before[k]), ...Object.keys(m[k])]))
      if ((before[k][key] || "") !== (m[k][key] || "")) changed.push([k, key, before[k][key] || "", m[k][key] || ""]);
  return changed;
}

/** 元に戻す。その後に変わった項目はそのまま。表示するメッセージを返す */
export function undoChanges(m: Model, changes: readonly Change[]): string {
  let skipped = 0;
  for (const [k, key, prev, next] of changes) {
    if ((m[k][key] || "") !== next) {
      skipped++;
      continue;
    }
    m[k][key] = prev;
  }
  return skipped ? `元に戻しました（その後に変更された ${skipped} 枠はそのままです）` : "元に戻しました";
}

/**
 * 操作の結果。ok なら message を「元に戻す」付きで表示（changes が空なら表示しない）、
 * ok でなければ message をそのまま表示（Model は元のまま）。
 */
export interface EditResult {
  ok: boolean;
  message: string;
  changes: Change[];
}

const done = (before: Snapshot, m: Model, message: string): EditResult => ({
  ok: true,
  message,
  changes: diffChanges(before, m),
});

// ---- 重なり・入れるかどうか ----

/** 同じ日の重なる時間に、ignore 以外の枠へ入っているか */
export const busyElsewhere = (m: Model, name: string, item: Item, ignore: readonly string[]): boolean =>
  flattened(m).some(
    (x) =>
      !ignore.includes(x.key) &&
      m.assignments[x.key] === name &&
      x.date === item.date &&
      x.start < item.end &&
      item.start < x.end,
  );

/** 条件・勤務可能時間を満たし、ほかの枠と重ならない */
export const canTake = (m: Model, name: string, item: Item, ignore: readonly string[]): boolean =>
  available(m, item).some((a) => a.name === name) && !busyElsewhere(m, name, item, ignore);

/** 同じ日の重なる時間に入っている枠（ignore 以外） */
export const overlapping = (m: Model, name: string, item: Item, ignore: readonly string[]): Item[] =>
  flattened(m).filter(
    (x) =>
      !ignore.includes(x.key) &&
      m.assignments[x.key] === name &&
      x.date === item.date &&
      x.start < item.end &&
      item.start < x.end,
  );

// ---- 移動・入れ替え ----
//
// 決まり（手動の移動。自動割当・担当者ポップアップの「長さ」とは別）：
// - 単位は30分のセル1つ。どの枠からどの枠へも移せる（日・時間・店舗・役職・番目を問わない。
//   勤務可能時間・所属・ステータス・車・同じ時間の別の枠も見ない）。移動元以外のすべての枠が移動先。
// - 移動先に人がいれば入れ替え（その人は移動元へ。条件に合わなくてもそのまま入る）。人が消えることはない。
// - 範囲の選択（同じ列＝同じ日・店舗・役職・番目の、続いた時間の枠）をまとめて動かせる：つかんだ枠が移動先の枠へ、
//   ほかの枠は時間のずれを保ったまま移動先の列へ入る。移動先の列のその時間に枠がない（不要な時間・表の外）ときは
//   動かさない（縮めない）。移動先にいた人は、空いた移動元の枠へ時間順に戻る（重なっているとき＝同じ列で
//   ずらしたときは、はみ出した分が空いた側へ回る）。
// - 移動の結果、重複・勤務できない時間・条件外になった人がいればメッセージの末尾に（…）で添える（表では色で出る）。

/** 同じ列（日付・店舗・役職・番目） */
export const sameColumn = (a: Item, b: Item): boolean =>
  a.date === b.date && a.store === b.store && a.role === b.role && a.occ === b.occ;

const colKey = (date: string, store: string, role: string, occ: number, start: string) =>
  `${date}\u0000${store}\u0000${role}\u0000${occ}\u0000${start}`;

/** 列の中の時刻 → 枠 */
function columnIndex(items: readonly Item[]): Map<string, Item> {
  return new Map(items.map((x) => [colKey(x.date, x.store, x.role, x.occ, x.start), x]));
}

const byStart = (a: Item, b: Item) => a.start.localeCompare(b.start);

/**
 * 同じ列の a から b までの枠の key（時間順。不要な時間で途切れていても、あいだの枠は含める）。
 * a がない・列が違うときは [b]、b がなければ []。Shift＋クリック・Shift＋↑↓ の範囲の選択
 */
export function columnRange(m: Model, a: string, b: string): string[] {
  const items = flattened(m),
    A = items.find((x) => x.key === a),
    B = items.find((x) => x.key === b);
  if (!B) return [];
  if (!A || !sameColumn(A, B)) return [B.key];
  const [lo, hi] = A.start <= B.start ? [A.start, B.start] : [B.start, A.start];
  return items
    .filter((x) => sameColumn(x, B) && x.start >= lo && x.start <= hi)
    .sort(byStart)
    .map((x) => x.key);
}

/** 移動する1セル */
export interface MoveCell {
  /** 移動元の枠 */
  source: Item;
  /** 移動先の開始時刻（表の外なら ""） */
  start: string;
  /** 移動先の枠（移動先の列のその時刻に枠がなければ null） */
  target: Item | null;
  /** 移動先にいて、入れ替えで移動元の側へ動く人（移動する範囲の中の枠・空きなら ""） */
  swapOut: string;
}

export interface MovePlan {
  /** つかんだ枠（移動元） */
  grab: Item;
  /** 落とした枠（つかんだ枠の移動先） */
  to: Item;
  /** 動かすセル（時間順） */
  cells: MoveCell[];
  /** すべてのセルの移動先に枠がある（false なら動かさない） */
  ok: boolean;
}

/** 範囲の選択から、つかんだ枠と同じ列の枠を時間順に（つかんだ枠が入っていなければ、つかんだ枠だけ） */
function sourcesOf(byKey: ReadonlyMap<string, Item>, grab: Item, selection: readonly string[]): Item[] {
  if (!selection.includes(grab.key)) return [grab];
  const list = [...new Set(selection)].map((k) => byKey.get(k)).filter((x): x is Item => !!x && sameColumn(x, grab));
  return list.length > 1 ? list.sort(byStart) : [grab];
}

/**
 * 移動の計画（Model は変えない）。from＝つかんだ枠、to＝落とした枠、selection＝選んでいる範囲（from を含めばまとめて動かす）。
 * 何もしないとき（同じ枠・存在しない枠・from が空）は null
 */
export function planMove(m: Model, from: string, to: string, selection: readonly string[] = []): MovePlan | null {
  if (!from || !to || from === to || !m.assignments[from]) return null;
  const items = flattened(m),
    byKey = new Map(items.map((x) => [x.key, x]));
  const grab = byKey.get(from),
    dst = byKey.get(to);
  if (!grab || !dst) return null;
  const sources = sourcesOf(byKey, grab, selection),
    srcKeys = new Set(sources.map((x) => x.key)),
    index = columnIndex(items),
    shift = toMin(dst.start) - toMin(grab.start);
  const cells = sources.map((source): MoveCell => {
    const min = toMin(source.start) + shift;
    const start = min >= 0 && min < 24 * 60 ? toHM(min) : "";
    const target = (start && index.get(colKey(dst.date, dst.store, dst.role, dst.occ, start))) || null;
    return { source, start, target, swapOut: target && !srcKeys.has(target.key) ? m.assignments[target.key] || "" : "" };
  });
  return { grab, to: dst, cells, ok: cells.every((c) => c.target) };
}

/** 計画どおりに書き換え、置いた人と枠を返す（[名前, 枠]。空きを動かした分は含めない） */
function applyPlan(m: Model, plan: MovePlan): [string, Item][] {
  const get = (k: string) => m.assignments[k] || "";
  const sources = plan.cells.map((c) => c.source),
    targets = plan.cells.map((c) => c.target!),
    srcKeys = new Set(sources.map((x) => x.key)),
    dstKeys = new Set(targets.map((x) => x.key));
  // 先に読んでから書く（範囲が重なっていても元の値を使う）
  const incoming = sources.map((x) => get(x.key));
  const vacated = sources.filter((x) => !dstKeys.has(x.key)).sort(byStart);
  const displaced = targets.filter((x) => !srcKeys.has(x.key)).sort(byStart);
  const back = displaced.map((x) => get(x.key));
  const writes: [Item, string][] = [...targets.map((x, i): [Item, string] => [x, incoming[i]]), ...vacated.map((x, i): [Item, string] => [x, back[i]])];
  for (const [x, name] of writes) if (get(x.key) !== name) m.assignments[x.key] = name; // 未設定の枠に "" は作らない
  return writes.filter(([, name]) => name).map(([x, name]) => [name, x]);
}

/** 置いた結果の注意（重複・勤務できない時間・条件外。この順で、あるものだけ） */
function placementIssues(m: Model, placed: readonly [string, Item][]): string[] {
  if (!placed.length) return [];
  const booked = new Map<string, Item[]>();
  for (const x of flattened(m)) {
    const n = m.assignments[x.key];
    if (!n) continue;
    const k = `${n}|${x.date}`;
    const list = booked.get(k);
    if (list) list.push(x);
    else booked.set(k, [x]);
  }
  let conflict = false,
    off = false,
    unfit = false;
  for (const [name, x] of placed) {
    conflict ||= (booked.get(`${name}|${x.date}`) || []).some((y) => y.key !== x.key && y.start < x.end && x.start < y.end);
    off ||= !canWorkAt(m, name, x);
    unfit ||= !fitsSlot(m, name, x);
  }
  return [conflict && "重複", off && "勤務できない時間", unfit && "条件外"].filter((x): x is string => !!x);
}

const uniq = (xs: readonly string[]) => [...new Set(xs.filter(Boolean))];

/**
 * from の担当者を to へ移す（to に人がいれば入れ替え）。selection に from が含まれていれば、その範囲（同じ列）をまとめて移す。
 * 決まりはこの節の先頭。範囲が移動先の列に入りきらなければ ok: false（Model はそのまま）。何もしないときは null。
 */
export function moveAssignment(m: Model, from: string, to: string, selection: readonly string[] = []): EditResult | null {
  const plan = planMove(m, from, to, selection);
  if (!plan) return null;
  if (!plan.ok) {
    const times = plan.cells.filter((c) => !c.target && c.start).map((c) => c.start);
    return {
      ok: false,
      message: `移動先の列には ${times.length ? `${times.join("・")} の` : "その時間の"}枠がないため、選んだ ${plan.cells.length}コマをまとめて移動できません`,
      changes: [],
    };
  }
  const before = snapshotAssignments(m),
    name = m.assignments[from];
  const names = uniq(plan.cells.map((c) => m.assignments[c.source.key] || "")),
    others = uniq(plan.cells.map((c) => c.swapOut)).filter((n) => !names.includes(n)); // 動かす人自身が戻る分は書かない
  const placed = applyPlan(m, plan);
  const issues = placementIssues(m, placed),
    note = issues.length ? `（${issues.join("・")}）` : "";
  let message: string;
  if (plan.cells.length === 1) {
    const other = others[0];
    message = other ? `${name} と ${other} を入れ替えました` : `${name} を ${slotLabel(m, plan.to)} に移動しました`;
  } else {
    const ts = plan.cells.map((c) => c.target!);
    message = `${names.join("・")} を ${ts[0].start}〜${ts[ts.length - 1].end} ${itemLabel(plan.to)} に移動${others.length ? `し、${others.join("・")} と入れ替えました` : "しました"}`;
  }
  return done(before, m, message + note);
}

/** moveAssignment(m, from, to, selection) をしたら移動先で入る枠の数（試しに数えるだけで m は変えない）。移動できないときは 0 */
export function moveSpan(m: Model, from: string, to: string, selection: readonly string[] = []): number {
  const plan = planMove(m, from, to, selection);
  return plan?.ok ? plan.cells.length : 0;
}

/** ドラッグのゴースト用：計画と、移動したら出る注意（重複・勤務できない時間・条件外）。m は変えない */
export function previewMove(
  m: Model,
  from: string,
  to: string,
  selection: readonly string[] = [],
): { plan: MovePlan; issues: string[] } | null {
  const plan = planMove(m, from, to, selection);
  if (!plan) return null;
  if (!plan.ok) return { plan, issues: [] };
  const copy = { ...m, assignments: { ...m.assignments } };
  return { plan, issues: placementIssues(copy, applyPlan(copy, plan)) };
}

/** 移動中に移動先にできる枠の key：移動元（つかんだ枠）以外のすべての枠 */
export function dropTargets(m: Model, fromKey: string): Set<string> {
  return new Set(flattened(m).flatMap((x) => (x.key === fromKey ? [] : [x.key])));
}

/**
 * 移動先のうち、条件に合う枠（緑で示す）：動かす人が全員、移動先で勤務可能時間・所属・ステータス・車の条件を満たし、
 * 同じ時間に別の枠（動かす範囲・移動先の範囲の外）に入っておらず、その枠にすでに入っているのでもない。範囲が入りきらない枠は含まない
 */
export function fitTargets(m: Model, fromKey: string, selection: readonly string[] = []): Set<string> {
  const out = new Set<string>();
  const items = flattened(m),
    byKey = new Map(items.map((x) => [x.key, x])),
    grab = byKey.get(fromKey);
  if (!grab || !m.assignments[fromKey]) return out;
  const sources = sourcesOf(byKey, grab, selection),
    srcKeys = new Set(sources.map((x) => x.key)),
    index = columnIndex(items);
  const busy = new Map<string, Item[]>();
  for (const x of items) {
    const n = m.assignments[x.key];
    if (!n || srcKeys.has(x.key)) continue;
    const k = `${n}|${x.date}`;
    const list = busy.get(k);
    if (list) list.push(x);
    else busy.set(k, [x]);
  }
  const movers = sources.map((x) => m.assignments[x.key] || "");
  const offsets = sources.map((x) => toMin(x.start) - toMin(grab.start));
  for (const dst of items) {
    if (dst.key === fromKey) continue;
    const targets: Item[] = [];
    for (const off of offsets) {
      const min = toMin(dst.start) + off;
      const t = min >= 0 && min < 24 * 60 ? index.get(colKey(dst.date, dst.store, dst.role, dst.occ, toHM(min))) : undefined;
      if (!t) break;
      targets.push(t);
    }
    if (targets.length !== sources.length) continue;
    const ignore = new Set(targets.map((x) => x.key));
    const fits = targets.every((t, i) => {
      const name = movers[i];
      if (!name) return true;
      if (m.assignments[t.key] === name) return false;
      if (!canWorkAt(m, name, t) || !fitsSlot(m, name, t)) return false;
      return !(busy.get(`${name}|${t.date}`) || []).some((y) => !ignore.has(y.key) && y.start < t.end && t.start < y.end);
    });
    if (fits) out.add(dst.key);
  }
  return out;
}

/** 移動の案内（移動中に出し続けるメッセージ）。count は動かすコマの数（2以上なら範囲） */
export const movingMessage = (name: string, count = 1): string =>
  `${count > 1 ? `${name} など ${count}コマ` : name} を移動中：移動先の枠をクリックで移動・入れ替え（緑＝条件に合う枠・Escで取消）`;

// ---- 担当者の選択（ポップアップ）----

/** 何枠続けて入れるかの標準（1時間） */
export const DEFAULT_PICK_RUN = 60 / SLOT;
/** 長さの選択肢 [枠数, 表示] */
export const PICK_RUNS: readonly (readonly [number, string])[] = [
  [1, "30分"],
  [2, "1時間"],
  [3, "1.5時間"],
  [4, "2時間"],
  [Infinity, "最大"],
];

// 「続けて入れる」：同じ店舗・役職の次の時間帯に、空き・条件・重複なしで入れる限り続けて割り当てる
export function runTargets(m: Model, item: Item, name: string, limit = Infinity): Item[] {
  const out = [item];
  let cur = item;
  while (out.length < limit) {
    const slot = findSlot(m, cur.date, cur.store, cur.role, cur.end);
    if (!slot) break;
    const occs = itemsOf(slot);
    const already = occs.find((x) => m.assignments[x.key] === name);
    if (already) {
      cur = already;
      continue;
    }
    const next = [occs[cur.occ], ...occs].find(
      (x) => x && !decided(m, x.key) && available(m, x).some((a) => a.name === name) && !busyElsewhere(m, name, x, []),
    );
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

export interface Candidate {
  name: string;
  /** 同じ時間に入っている別の枠（あれば「こちらへ移動」） */
  busyAt: Item[];
  /** この日の勤務時間 */
  hours: number;
  /** この日の参加時間（例：「10:00–15:00、16:00–18:00」） */
  windows: string;
}

/** 担当者の候補（空いている人／別の枠で勤務中の人）。q は名前の絞り込み */
export function pickerCandidates(m: Model, item: Item, q = ""): { free: Candidate[]; busy: Candidate[] } {
  const audit = assignmentAudit(m),
    chosen = m.assignments[item.key] || "",
    nq = q.normalize("NFKC").replace(/\s/g, "");
  const names = [...new Set(available(m, item).map((a) => a.name))].filter(
    (n) => n !== chosen && (!nq || n.normalize("NFKC").replace(/\s/g, "").includes(nq)),
  );
  const list = names.map((name) => ({
    name,
    busyAt: overlapping(m, name, item, [item.key]),
    hours: audit.hours[name]?.[item.date] || 0,
    windows: m.availability
      .filter((a) => a.name === name && a.date === item.date)
      .map((a) => `${a.start}–${a.end}`)
      .join("、"),
  }));
  const order = (a: Candidate, b: Candidate) =>
    Number(wants(m, b.name, item.role)) - Number(wants(m, a.name, item.role)) ||
    Number(dislikes(m, a.name, item.role)) - Number(dislikes(m, b.name, item.role)) ||
    a.hours - b.hours ||
    a.name.localeCompare(b.name, "ja");
  return { free: list.filter((x) => !x.busyAt.length).sort(order), busy: list.filter((x) => x.busyAt.length).sort(order) };
}

/**
 * 候補を選ぶ：別の枠で勤務中ならそこから移し、空いていれば pickRun 枠ぶん続けて入れる。
 * 枠がなければ null（ポップアップを閉じるだけ）。
 */
export function pickName(m: Model, key: string, name: string, pickRun: number = DEFAULT_PICK_RUN): EditResult | null {
  const item = flattened(m).find((x) => x.key === key);
  if (!item) return null;
  const busyAt = overlapping(m, name, item, [key]),
    targets = busyAt.length ? [item] : runTargets(m, item, name, pickRun);
  const before = snapshotAssignments(m);
  busyAt.forEach((x) => (m.assignments[x.key] = ""));
  targets.forEach((x) => (m.assignments[x.key] = name));
  return done(
    before,
    m,
    busyAt.length
      ? `${name} を ${busyAt.map(itemLabel).join("、")} から ${itemLabel(item)} へ移動しました`
      : `${name} を ${item.start}〜${targets[targets.length - 1].end} ${itemLabel(item)} に割り当てました`,
  );
}

/** 担当を外す（キーは "" にして残す） */
export function clearAssignment(m: Model, key: string): EditResult {
  const name = m.assignments[key];
  const before = snapshotAssignments(m);
  m.assignments[key] = "";
  return done(before, m, `${name} を外しました`);
}

/** すべての割当をクリア（旧 clearBtn） */
export function clearAll(m: Model): void {
  m.assignments = {};
  m.slotBlanks = {};
}
