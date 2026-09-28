// 自動割当

import { breakRoles, openRoles, statusLevels } from "./config";
import { available, decided, dislikes, levelOf, requiredFor, wants, type SlotLike } from "./rules";
import { ensureAllSlots, flattened, slotAtOffset } from "./slots";
import type { Availability, Item, Model } from "./types";
import { workloadTarget } from "./workload";

/**
 * いまの割当を捨てて、すべての枠を自動で割り当てる（Model を書き換える）。
 * 時間順に、条件の厳しい番目から埋める。同じ人を次の30分にも続けて入れられるなら優先して2枠まとめて入れる。
 * 働ける量（memberWorkload）の目安がある人は、その日の目安に届いたら後回しにする（ほかに入れる人がいなければ超えても入れる）。
 */
export function autoAssign(m: Model): void {
  const workload: Record<string, number> = {},
    /** "氏名|日付" → その日に入れた枠の数（昼食・休憩を除く。30分＝1） */
    daily: Record<string, number> = {},
    booked: Record<string, Item[]> = {};
  m.assignments = {};
  ensureAllSlots(m);
  const free = (name: string, x: Item) =>
    !(booked[name] || []).some((b) => b.date === x.date && x.start < b.end && b.start < x.end);
  // 次の枠（同じ役職・同じ番目を優先）にも続けて入れられるか
  const pairOf = (x: Item, name: string) => {
    const occs = slotAtOffset(m, x, 1);
    return [occs[x.occ], ...occs].find(
      (y) => y && !decided(m, y.key) && free(name, y) && available(m, y).some((a) => a.name === name),
    );
  };
  // 条件の厳しい番目（上級生枠など）から先に埋め、ほかの番目ではその条件を満たす人をなるべく温存する
  const lv = (x: SlotLike) => statusLevels[requiredFor(m, x)],
    items = flattened(m)
      // 人数の上限がない係（昼食・休憩など）は手で入れる
      .filter((x) => !openRoles.includes(x.role))
      .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || lv(b) - lv(a),
    );
  for (const x of items) {
    if (decided(m, x.key)) continue;
    const candidates = [
      ...new Map(
        available(m, x)
          .filter((a) => free(a.name, x))
          .map((a) => [a.name, a] as const),
      ).values(),
    ];
    const strict = Math.max(0, ...Array.from({ length: Number(x.count) || 0 }, (_, i) => lv({ ...x, occ: i }))),
      spare = (a: Availability) => Number(strict > lv(x) && levelOf(m, a.name) >= strict);
    const pairs = new Map(candidates.map((a) => [a.name, pairOf(x, a.name)]));
    // その日の目安（働ける量）に届いている人は後回し
    const over = (a: Availability) => {
      const t = workloadTarget(m, a.name);
      return Number(t !== null && (daily[`${a.name}|${x.date}`] || 0) >= t * 2);
    };
    const score = (a: Availability) => (workload[a.name] || 0) - (wants(m, a.name, x.role) ? 1 : 0);
    candidates.sort(
      (a, b) =>
        spare(a) - spare(b) ||
        over(a) - over(b) ||
        Number(!!pairs.get(b.name)) - Number(!!pairs.get(a.name)) ||
        Number(dislikes(m, a.name, x.role)) - Number(dislikes(m, b.name, x.role)) ||
        score(a) - score(b),
    );
    const c = candidates[0];
    if (!c) continue;
    for (const t of [x, pairs.get(c.name)].filter((t): t is Item => Boolean(t))) {
      m.assignments[t.key] = c.name;
      (booked[c.name] ??= []).push(t);
      workload[c.name] = (workload[c.name] || 0) + 1;
      if (!breakRoles.includes(t.role)) daily[`${c.name}|${t.date}`] = (daily[`${c.name}|${t.date}`] || 0) + 1;
    }
  }
}
