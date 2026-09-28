// シフト枠（slots）の生成・展開・必要人数と、旧データの移行処理

import { OLD_DRIP, liveScheduleFor, rolesForDate, slotChoices } from "./config";
import { dripsForIce } from "./parse";
import { posKey, ruleKey } from "./rules";
import { SLOT, hmToMin, plusSlot, toHM, toMin } from "./time";
import type { Item, Model, Slot } from "./types";

/** 日付・店舗・役職・開始時刻から決まる枠の id（どの端末でも同じになるハッシュ） */
export function slotId(date: string, store: string, role: string, start: string): string {
  const str = `${date}|${store}|${role}|${start}`;
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return "s" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** 1つの枠を人数分の Item に展開する */
export const itemsOf = (slot: Slot): Item[] =>
  Array.from({ length: Math.max(0, Number(slot.count) || 0) }, (_, i) => ({
    ...slot,
    occ: i,
    key: `${slot.id}-${i}`,
  }));

/** すべての枠を1人分ずつに展開（slots の順） */
export function flattened(m: Model): Item[] {
  return m.slots.flatMap(itemsOf);
}

/** シフトを作る日付（勤務可能時間にある日付の先頭3日） */
export const eventDates = (m: Model): string[] => [...new Set(m.availability.map((a) => a.date))].sort().slice(0, 3);

/** その日の表の行（30分ごとの開始時刻）。勤務可能時間の最初〜最後 */
export function hoursForDate(m: Model, date: string): string[] {
  const entries = m.availability.filter((a) => a.date === date);
  if (!entries.length) return [];
  const first = Math.floor(Math.min(...entries.map((a) => hmToMin(a.start))) / SLOT) * SLOT,
    last = Math.ceil(Math.max(...entries.map((a) => hmToMin(a.end))) / SLOT) * SLOT;
  return Array.from({ length: Math.max(0, (last - first) / SLOT) }, (_, i) => toHM(first + i * SLOT));
}

/** 表示する時間・役職の枠がなければ作る（必要人数は slotCounts か標準） */
export function ensureGridSlots(m: Model, date: string, hours: readonly string[]): void {
  const at = (store: string, role: string, start: string) => `${store}\u0000${role}\u0000${start}`;
  const have = new Set(m.slots.filter((s) => s.date === date).map((s) => at(s.store, s.role, s.start)));
  for (const hour of hours) {
    for (const [store, roles] of Object.entries(rolesForDate(date))) {
      for (const [role, count] of roles) {
        if (!have.has(at(store, role, hour))) {
          const id = slotId(date, store, role, hour);
          m.slots.push({
            id,
            date,
            store,
            role,
            start: hour,
            end: plusSlot(hour),
            count: m.slotCounts[id] ?? defaultCount(date, store, role, hour, count),
          });
          have.add(at(store, role, hour));
        }
      }
    }
  }
}

/** 移行処理をしてから、すべての日の枠をそろえる */
export function ensureAllSlots(m: Model): void {
  migrateHalfHours(m);
  migratePositions(m);
  eventDates(m).forEach((date) => ensureGridSlots(m, date, hoursForDate(m, date)));
  migrateBlanks(m);
}

/** 役職の人数（rolesForDate の値。時間割のある役職ではその日の最大）。時間ごとの標準は defaultCount */
export const baseCount = (date: string, store: string, role: string): number =>
  (rolesForDate(date)[store] || []).find(([r]) => r === role)?.[1] ?? 0;

/**
 * 標準の必要人数。start（"HH:MM"）を渡すと本番の時間割（config の liveSchedule）どおり：
 * 店舗の営業時間外は 0、時間割のある役職（ドリッパー 6th は昼だけ・美化・裏シフト）はその時間帯の人数。
 * start を省くと時間によらない人数（baseCount）
 */
export function defaultCount(date: string, store: string, role: string, start?: string, base?: number): number {
  const n = base ?? baseCount(date, store, role),
    day = start === undefined ? null : liveScheduleFor(date);
  if (!day || start === undefined) return n;
  const open = day.hours[store];
  if (open && (start < open[0] || start >= open[1])) return 0;
  const rs = day.roles[ruleKey(store, role)];
  if (!rs) return n;
  const w = rs.windows.find(([s, e]) => s <= start && start < e);
  return w ? w[2] : (rs.outside ?? n);
}

/** その枠の標準の必要人数（時間割どおり） */
export const slotDefault = (slot: { date: string; store: string; role: string; start: string }): number =>
  defaultCount(slot.date, slot.store, slot.role, slot.start);

/** 必要人数を変える（標準と同じなら slotCounts から消す）。入力値は数値に丸める */
export function setSlotCount(m: Model, slot: Slot, value: unknown): void {
  slot.count = Math.max(0, Math.floor(Number(value) || 0));
  if (slot.count === slotDefault(slot)) delete m.slotCounts[slot.id];
  else m.slotCounts[slot.id] = slot.count;
}

/**
 * 必要人数の「一括」：その日・役職の、標準が 1人以上の時間帯（営業時間内・美化などの時間帯）。
 * 営業時間外など標準 0 人の時間帯はそのまま（その日ずっと標準 0 人の役職なら、すべての時間帯）
 */
export function setRoleCounts(m: Model, date: string, store: string, role: string, value: unknown): void {
  const all = m.slots.filter((x) => x.date === date && x.store === store && x.role === role),
    open = all.filter((x) => slotDefault(x) > 0);
  (open.length ? open : all).forEach((x) => setSlotCount(m, x, value));
}

/** その日の必要人数をすべて標準に戻す */
export function resetCounts(m: Model, date: string): void {
  m.slots.filter((x) => x.date === date).forEach((x) => setSlotCount(m, x, slotDefault(x)));
}

/** 必要人数の「一括」入力のキー（ruleKey と同じ形）を店舗・役職に戻す */
export const splitRuleKey = (key: string): [store: string, role: string] => {
  const [store, role] = key.split("|||");
  return [store, role];
};

/** 同じ日付・店舗・役職・開始時刻の枠 */
export const findSlot = (m: Model, date: string, store: string, role: string, start: string): Slot | undefined =>
  m.slots.find((s) => s.date === date && s.store === store && s.role === role && s.start === start);

// 同じ役職の前（dir=-1）／次（dir=1）の枠の各番目
export function slotAtOffset(m: Model, item: Item, dir: number): Item[] {
  const start = dir > 0 ? item.end : toHM(toMin(item.start) - SLOT);
  const slot = findSlot(m, item.date, item.store, item.role, start);
  return slot ? itemsOf(slot) : [];
}

// 1時間のまとまりの相方（:00 の枠なら次、:30 の枠なら前）で、同じ人が入っている枠
export function partnerOf(m: Model, item: Item, name: string): { item: Item; dir: number } | null {
  const dir = toMin(item.start) % 60 === 0 ? 1 : -1,
    occs = slotAtOffset(m, item, dir),
    p = [occs[item.occ], ...occs].find((x) => x && m.assignments[x.key] === name);
  return p ? { item: p, dir } : null;
}

/** ドリッパーの枠のドリップ種類（未設定なら番目で決まる初期値）。種類のない役職は "" */
export const slotType = (m: Model, item: { role: string; key: string; occ: number }): string => {
  const c = slotChoices[item.role];
  if (!c) return "";
  const t = m.slotTypes[item.key];
  return t === undefined ? c.initial(item.occ) : t;
};

// ---- 旧データの移行 ----

type KeyedMap = Record<string, unknown>;

/** 1時間枠 → 30分枠："HH:00" の枠の割当などを "HH:30" の枠にも写す */
export function migrateHalfHours(m: Model): void {
  if (m.settings.slotMinutes === SLOT) return;
  const byId: Record<string, { date: string; store: string; role: string; half: string }> = {};
  for (const date of eventDates(m))
    for (const [store, roles] of Object.entries(rolesForDate(date)))
      for (const [role] of roles)
        for (let h = 0; h < 24; h++) {
          const start = `${String(h).padStart(2, "0")}:00`;
          byId[slotId(date, store, role, start)] = {
            date,
            store,
            role,
            half: slotId(date, store, role, `${String(h).padStart(2, "0")}:30`),
          };
        }
  const map = (k: "assignments" | "slotTypes" | "slotBlanks" | "slotCounts"): KeyedMap => m[k];
  const has = (k: "assignments" | "slotTypes" | "slotBlanks" | "slotCounts") => Object.keys(map(k)).length > 0;
  if ((["assignments", "slotTypes", "slotBlanks", "slotCounts"] as const).some(has)) {
    for (const k of ["assignments", "slotTypes", "slotBlanks"] as const)
      for (const [key, v] of Object.entries({ ...map(k) })) {
        const i = key.lastIndexOf("-"),
          info = byId[key.slice(0, i)];
        if (!info) continue;
        const target = `${info.half}-${key.slice(i + 1)}`;
        if (map(k)[target] === undefined || map(k)[target] === "") map(k)[target] = v;
      }
    for (const [id, v] of Object.entries({ ...m.slotCounts }))
      if (byId[id] && m.slotCounts[byId[id].half] === undefined) m.slotCounts[byId[id].half] = v;
  }
  m.settings.slotMinutes = SLOT;
  m.slots = [];
}

// 旧「ドリッパー上級生（2）」＋「ドリッパー（下級生＋上級生）（4）」を「ドリッパー」1st〜6th にまとめる（上級生の枠は 1st と最後へ）。あわせて未合格の人のアイスを × に
export function migratePositions(m: Model): void {
  if (m.settings.positions) return;
  const rr = m.roleRequirements,
    k = (r: string) => ruleKey("本店", r),
    top = rr[k(OLD_DRIP[0])] || "上級生";
  rr[k("ドリッパー")] ??= rr[k(OLD_DRIP[1])] || "1年目合格";
  for (const date of eventDates(m))
    for (let t = 0; t < 24 * 60; t += SLOT) {
      const start = toHM(t),
        [sup, mix] = OLD_DRIP.map((r) => slotId(date, "本店", r, start)),
        id = slotId(date, "本店", "ドリッパー", start),
        sc = m.slotCounts[sup] ?? 2,
        mc = m.slotCounts[mix] ?? 4;
      const order: [string, number][] = [
        ...(sc ? [[sup, 0] as [string, number]] : []),
        ...Array.from({ length: mc }, (_, i) => [mix, i] as [string, number]),
        ...Array.from({ length: Math.max(0, sc - 1) }, (_, i) => [sup, i + 1] as [string, number]),
      ];
      for (const map of ["assignments", "slotTypes"] as const)
        order.forEach(([old, i], p) => {
          const v = m[map][`${old}-${i}`];
          if (v !== undefined && !m[map][`${id}-${p}`]) m[map][`${id}-${p}`] = v;
          delete m[map][`${old}-${i}`];
        });
      if ((sup in m.slotCounts || mix in m.slotCounts) && !(id in m.slotCounts) && sc + mc !== 6)
        m.slotCounts[id] = sc + mc;
      delete m.slotCounts[sup];
      delete m.slotCounts[mix];
    }
  rr[posKey("本店", "ドリッパー", 0)] ??= top;
  rr[posKey("本店", "ドリッパー", 5)] ??= top;
  OLD_DRIP.forEach((r) => delete rr[k(r)]);
  for (const [name, st] of Object.entries(m.memberStatuses))
    if (st === "未合格") m.memberDrips[name] = dripsForIce("×");
  m.settings.positions = 1;
  m.slots = [];
}

/** 旧形式の「この番目は不要」（slotBlanks）を、番目を詰めて必要人数を減らす形に直す */
export function migrateBlanks(m: Model): void {
  const keys = Object.keys(m.slotBlanks);
  if (!keys.length) return;
  const bySlot: Record<string, Set<number>> = {};
  for (const k of keys) {
    const i = k.lastIndexOf("-");
    if (!m.assignments[k]) (bySlot[k.slice(0, i)] ??= new Set()).add(Number(k.slice(i + 1)));
  }
  for (const [id, blank] of Object.entries(bySlot)) {
    const slot = m.slots.find((s) => s.id === id);
    if (!slot) continue;
    const keep = Array.from({ length: Number(slot.count) || 0 }, (_, i) => i).filter((i) => !blank.has(i)),
      moved = keep.map(
        (i) =>
          [
            m.assignments[`${id}-${i}`],
            slotChoices[slot.role] ? slotType(m, { role: slot.role, key: `${id}-${i}`, occ: i }) : undefined,
          ] as const,
      );
    for (let i = 0; i < (Number(slot.count) || 0); i++) {
      delete m.assignments[`${id}-${i}`];
      delete m.slotTypes[`${id}-${i}`];
    }
    moved.forEach(([a, t], i) => {
      if (a) m.assignments[`${id}-${i}`] = a;
      if (t !== undefined) m.slotTypes[`${id}-${i}`] = t;
    });
    setSlotCount(m, slot, keep.length);
  }
  m.slotBlanks = {};
}
