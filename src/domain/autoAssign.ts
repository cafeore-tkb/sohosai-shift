// 自動割当

import { breakRoles, openRoles, statusLevels } from "./config";
import { autoRules } from "./autoRules";
import { available, decided, dislikes, levelOf, requiredFor, wants, type SlotLike } from "./rules";
import { ensureAllSlots, flattened, slotAtOffset } from "./slots";
import { SLOT, toMin } from "./time";
import type { Availability, Item, Model } from "./types";
import { workloadTarget } from "./workload";

const groupBy = <T,>(list: readonly T[], key: (t: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const t of list) {
    const k = key(t);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(t);
  }
  return out;
};

/** 連続の上限のこの時間（分）前からは、空いている人がいれば交代する */
const HANDOFF = 60;

/** 1人あたりの時間に上限がある役職（autoRules の masterHours） */
export const isMasterSlot = (x: SlotLike): boolean => x.store === "本店" && x.role === "マスター";

export interface AutoAssignResult {
  /** 入れる人はいたが、続けて入るのが上限（maxRunHours）を超えるので空けた枠の数 */
  runBlocked: number;
}

/**
 * いまの割当を捨てて、すべての枠を自動で割り当てる（Model を書き換える）。
 * 時間順に、条件の厳しい番目から埋める。決まり（autoRules）：
 * - 続けて入るのは maxRunHours まで（超える割当はしない＝入れる人がいなければ空ける）
 * - 以下は目安（ほかに入れる人がいなければ超えても入れる）。優先の順に：
 *   1. マスターは1人 masterHours まで。その日のマスターを全員その時間までで埋めきれないときだけ masterHours ずつ上げる（全員が同じくらいになる）
 *   2. その日の勤務時間は、勤務可能時間の availPercent % まで（働ける量＝memberWorkload の目安があれば、それとの少ないほう）
 *   3. 直前の30分に入っている人を続けて入れる（同じ役職なら なお優先）。連続の上限の最後の1時間は、空いている人がいれば交代
 *   4. 同じ人を次の30分にも続けて入れられるなら2枠まとめて入れる
 */
export function autoAssign(m: Model): AutoAssignResult {
  let runBlocked = 0;
  const rules = autoRules(m),
    maxRun = rules.maxRunHours * 60,
    workload: Record<string, number> = {},
    /** "氏名|日付" → その日に入れた枠の数（昼食・休憩を除く。30分＝1） */
    daily: Record<string, number> = {},
    /** "氏名|日付" → その日に入れたマスターの枠の数 */
    masterUsed: Record<string, number> = {},
    booked: Record<string, Item[]> = {};
  const dk = (name: string, date: string) => `${name}|${date}`;
  m.assignments = {};
  ensureAllSlots(m);
  const free = (name: string, x: Item) =>
    !(booked[name] || []).some((b) => b.date === x.date && x.start < b.end && b.start < x.end);
  /** x も入れたときの、x を含む続けての勤務（分） */
  const runWith = (name: string, x: Item) => {
    const mine = (booked[name] || []).filter((b) => b.date === x.date && !breakRoles.includes(b.role));
    let s = toMin(x.start),
      e = toMin(x.end),
      grew = true;
    while (grew) {
      grew = false;
      for (const b of mine) {
        if (toMin(b.end) === s) (s = toMin(b.start)), (grew = true);
        if (toMin(b.start) === e) (e = toMin(b.end)), (grew = true);
      }
    }
    return e - s;
  };
  const runOk = (name: string, x: Item) => !maxRun || runWith(name, x) <= maxRun;

  // 勤務可能時間の長さ（30分の数）から、その日の上限（枠の数）
  const availSlots: Record<string, number> = {};
  for (const [k, spans] of groupBy(m.availability, (a) => dk(a.name, a.date))) {
    let total = 0,
      end = -1;
    for (const a of spans.sort((p, q) => p.start.localeCompare(q.start))) {
      const s = Math.max(toMin(a.start), end),
        e = toMin(a.end);
      if (e > s) (total += e - s), (end = e);
    }
    availSlots[k] = Math.floor(total / SLOT);
  }
  const dailyCap = (name: string, date: string) => {
    const t = workloadTarget(m, name);
    let cap = t === null ? Infinity : t * 2;
    // 1時間（2枠）より短くはしない
    if (rules.availPercent) cap = Math.min(cap, Math.max(2, Math.floor(((availSlots[dk(name, date)] || 0) * rules.availPercent) / 100)));
    return cap;
  };

  // 条件の厳しい番目（上級生枠など）から先に埋め、ほかの番目ではその条件を満たす人をなるべく温存する
  const lv = (x: SlotLike) => statusLevels[requiredFor(m, x)],
    items = flattened(m)
      // 人数の上限がない係（昼食・休憩など）は手で入れる
      .filter((x) => !openRoles.includes(x.role))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || lv(b) - lv(a));

  // マスターの1人あたりの上限（日ごと・枠の数）：masterHours で埋めきれるならそのまま、足りなければ masterHours ずつ上げる
  const masterCap: Record<string, number> = {};
  if (rules.masterHours) {
    const step = rules.masterHours * 2;
    for (const [date, its] of groupBy(items.filter(isMasterSlot), (x) => x.date)) {
      const reach: Record<string, Set<string>> = {};
      for (const x of its) for (const a of available(m, x)) (reach[a.name] ??= new Set()).add(x.start);
      const can = Object.values(reach).map((s) => s.size),
        most = Math.max(0, ...can);
      let cap = step;
      while (cap < most && can.reduce((sum, n) => sum + Math.min(n, cap), 0) < its.length) cap += step;
      masterCap[date] = cap;
    }
  }
  const masterFull = (name: string, x: Item) =>
    isMasterSlot(x) && masterCap[x.date] !== undefined && (masterUsed[dk(name, x.date)] || 0) >= masterCap[x.date];

  // 次の枠（同じ役職・同じ番目を優先）にも続けて入れられるか
  const pairOf = (x: Item, name: string) => {
    const occs = slotAtOffset(m, x, 1);
    return [occs[x.occ], ...occs].find(
      (y) =>
        y &&
        !decided(m, y.key) &&
        free(name, y) &&
        (!maxRun || runWith(name, x) + SLOT <= maxRun) &&
        available(m, y).some((a) => a.name === name),
    );
  };
  const book = (t: Item, name: string) => {
    m.assignments[t.key] = name;
    (booked[name] ??= []).push(t);
    workload[name] = (workload[name] || 0) + 1;
    if (!breakRoles.includes(t.role)) daily[dk(name, t.date)] = (daily[dk(name, t.date)] || 0) + 1;
    if (isMasterSlot(t)) masterUsed[dk(name, t.date)] = (masterUsed[dk(name, t.date)] || 0) + 1;
  };

  for (const x of items) {
    if (decided(m, x.key)) continue;
    const open = available(m, x).filter((a) => free(a.name, x)),
      candidates = [...new Map(open.filter((a) => runOk(a.name, x)).map((a) => [a.name, a] as const)).values()];
    const strict = Math.max(0, ...Array.from({ length: Number(x.count) || 0 }, (_, i) => lv({ ...x, occ: i }))),
      spare = (a: Availability) => Number(strict > lv(x) && levelOf(m, a.name) >= strict);
    const pairs = new Map(candidates.map((a) => [a.name, pairOf(x, a.name)]));
    const over = (a: Availability) => Number((daily[dk(a.name, x.date)] || 0) >= dailyCap(a.name, x.date));
    // 直前の30分に入っている（2＝同じ店舗・役職、1＝別の役職）。ただし連続の上限の最後の1時間は続きを優先しない
    // （空いている人がいれば交代する。休憩の時間がずれて、全員が上限で一斉に抜けて空くのを防ぐ）
    const cont = (a: Availability) => {
      const prev = (booked[a.name] || []).find((b) => b.date === x.date && b.end === x.start && !breakRoles.includes(b.role));
      if (!prev || (maxRun && runWith(a.name, x) > maxRun - HANDOFF)) return 0;
      return prev.store === x.store && prev.role === x.role ? 2 : 1;
    };
    const score = (a: Availability) => (workload[a.name] || 0) - (wants(m, a.name, x.role) ? 1 : 0);
    candidates.sort(
      (a, b) =>
        spare(a) - spare(b) ||
        Number(masterFull(a.name, x)) - Number(masterFull(b.name, x)) ||
        over(a) - over(b) ||
        cont(b) - cont(a) ||
        Number(!!pairs.get(b.name)) - Number(!!pairs.get(a.name)) ||
        Number(dislikes(m, a.name, x.role)) - Number(dislikes(m, b.name, x.role)) ||
        score(a) - score(b),
    );
    const c = candidates[0];
    if (!c) {
      if (open.length) runBlocked++;
      continue;
    }
    book(x, c.name);
    // マスターの上限に届いたら、続きは次の人へ
    const y = pairs.get(c.name);
    if (y && !decided(m, y.key) && runOk(c.name, y) && !masterFull(c.name, y)) book(y, c.name);
  }
  return { runBlocked };
}
