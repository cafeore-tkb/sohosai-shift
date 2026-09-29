// シフト表に描くデータ（DOM・React に触らない）。役職別の表の行・セル（続き・まとまり）と、個人別の表の列。
// 判定そのもの（重複・時間外・条件外・苦手・候補なし・車）は domain（slotCell・carFreeAt・personMatrix）。ここはそれを見た目の単位に並べ替えるだけ。

import {
  carFreeAt,
  carTitle,
  displayName,
  flattened,
  fmt,
  gridCell,
  isPinned,
  openRoles,
  personMatrix,
  plusSlot,
  posLabel,
  posTag,
  requiredFor,
  roleNote,
  slotCell,
  statusShort,
  storeNames,
  unfitReasons,
  wants,
} from "../../../domain";
import type { Audit, DayGrid, DripBadge, Item, Model } from "../../../domain";

/** 見出しの条件の札（「上級」「1年↑」。条件なしなら ""）：posTag と同じ書き方 */
const requirementTag = (r: string): string => (r === "未設定" ? "" : r === "上級生" ? "上級" : `${statusShort[r]}↑`);

/** 縦に続くまとまりの中の位置（null＝1行だけ） */
export type RunPos = "start" | "mid" | "end" | null;

/** 同じ値が縦に続く区間での位置。key が null の行はつながらない */
export function runPositions(keys: readonly (string | null)[]): RunPos[] {
  return keys.map((k, i) => {
    if (k === null) return null;
    const up = i > 0 && keys[i - 1] === k,
      dn = i < keys.length - 1 && keys[i + 1] === k;
    return up && dn ? "mid" : up ? "end" : dn ? "start" : null;
  });
}

/** 列の左の線：店舗の境目（太い）・役職のまとまりの境目・なし */
export type Edge = "shop" | "group" | "";

/** セルの注意の色（優先順：重複 → 勤務できない時間 → 条件外 → 苦手。slotCell の kind） */
export type CellFlag = "dislike" | "conflict" | "off" | "unfit";
export type CellMark = "want" | "dislike" | "off" | "unfit" | "conflict" | null;

/** 役職別の表の1セル */
export type RoleCell =
  | { kind: "void"; edge: Edge; sig: string }
  | { kind: "na"; edge: Edge; slotId: string; aria: string; sig: string }
  | {
      kind: "item";
      edge: Edge;
      key: string;
      state: "filled" | "open" | "none";
      flag: CellFlag | null;
      mark: CellMark;
      label: string;
      /** 同じ人の続き・まとまりの2行目以降（名前を細字、★・ドリップは省く） */
      cont: boolean;
      stint: RunPos;
      box: RunPos;
      drip: DripBadge | null;
      /** 固定したコマ（自動割当で変えない。鍵のしるし） */
      pinned: boolean;
      title: string;
      aria: string;
      sig: string;
    };

export interface RoleRow {
  hour: string;
  half: boolean;
  /** 「車N」（車持ちがいなければ null） */
  car: { n: number; title: string } | null;
  cells: RoleCell[];
  /** 行の描き直しの判定用 */
  sig: string;
}

export interface HeadColumn {
  label: string;
  tag: string;
  edge: Edge;
}
export interface HeadGroup {
  label: string;
  /** 1列だけの役職（見出しの2・3行目をつなげる）なら番目の条件のタグ */
  tag: string;
  title: string;
  span: number;
  single: boolean;
  edge: Edge;
}
export interface ShopBand {
  store: string;
  span: number;
  open: number;
  edge: Edge;
}
export interface RoleHead {
  bands: ShopBand[];
  groups: HeadGroup[];
  /** 3行目（番目）。1列だけの役職は含まない */
  positions: HeadColumn[];
  sig: string;
}

const edgeOf = (grid: DayGrid, i: number): Edge => {
  const c = grid.cols[i],
    p = grid.cols[i - 1];
  if (!p) return "";
  return p.store !== c.store ? "shop" : c.gstart ? "group" : "";
};

/** 見出し（店舗の帯・役職・番目）。open は店舗ごとの未割当（担当者のいない枠） */
export function roleHead(m: Model, grid: DayGrid, dayItems: readonly Item[]): RoleHead {
  const bands: ShopBand[] = grid.stores.map(([store, span]) => ({
    store,
    span,
    open: dayItems.filter((x) => x.store === store && !m.assignments[x.key]).length,
    edge: "",
  }));
  bands.forEach((b, i) => (b.edge = i ? "shop" : ""));
  let col = 0;
  const groups: HeadGroup[] = [],
    positions: HeadColumn[] = [];
  for (const g of grid.heads) {
    const first = col,
      single = g.cols.length === 1;
    groups.push({
      label: g.base === "ドリッパー" ? "ドリッパー" : g.role,
      // 1列だけの役職（マスターなど）は見出しが1つなので、役職の条件（番目の条件と厳しいほう）をそこに出す
      tag: single ? requirementTag(requiredFor(m, { store: g.store, role: g.cols[0].role, occ: g.cols[0].occ })) : "",
      title: openRoles.includes(g.role) ? "人数の上限なし（入れるたびに列が増えます）" : roleNote(g.count),
      span: g.cols.length,
      single,
      edge: edgeOf(grid, first),
    });
    if (!single)
      g.cols.forEach((c, j) =>
        positions.push({ label: posLabel(c.role, c.occ), tag: posTag(m, c.store, c.role, c.occ), edge: edgeOf(grid, first + j) }),
      );
    col += g.cols.length;
  }
  const sig = JSON.stringify([bands, groups, positions]);
  return { bands, groups, positions, sig };
}

/** 1日分の役職別の表の行 */
export function roleRows(m: Model, date: string, grid: DayGrid, audit: Audit, shortNames: Readonly<Record<string, string>>): RoleRow[] {
  const freeAt = carFreeAt(m, date);
  const { hours, cols } = grid;
  // 列ごとに縦に見る：まず各セルのデータ、次に続き（同じ人）とまとまり（同じ状態）
  const raw = cols.map((c, ci) => {
    const edge = edgeOf(grid, ci);
    return hours.map((hour) => {
      const { slot, item } = gridCell(grid, c, hour);
      if (!item) return { edge, slot, item: null, cell: null };
      return { edge, slot, item, cell: slotCell(m, item, audit, shortNames) };
    });
  });
  const colCells: RoleCell[][] = raw.map((col) => {
    const stintKeys = col.map(({ cell }) => (cell && cell.kind === "filled" ? cell.chosen : null));
    const boxKeys = col.map(({ cell }) => {
      if (!cell) return null;
      if (cell.kind === "empty") return "open";
      if (cell.kind === "none") return "none";
      if (cell.kind === "filled") return null;
      return `${cell.kind}:${cell.chosen}`;
    });
    const stints = runPositions(stintKeys),
      boxes = runPositions(boxKeys);
    return col.map(({ edge, slot, item, cell }, r): RoleCell => {
      if (!item || !cell) {
        if (!slot) return { kind: "void", edge, sig: `v${edge}` };
        const aria = `${where(slot.store, slot.role, null, slot.start)} 不要な時間（クリックで必要人数を設定）`;
        return { kind: "na", edge, slotId: slot.id, aria, sig: `n${edge}${slot.id}` };
      }
      const box = boxes[r],
        stint = box ? null : stints[r];
      const cont = box === "mid" || box === "end" || stint === "mid" || stint === "end";
      const state = cell.chosen ? "filled" : cell.kind === "empty" ? "open" : "none";
      const flag: CellFlag | null =
        cell.kind === "conflict" || cell.kind === "off" || cell.kind === "unfit" || cell.kind === "dislike" ? cell.kind : null;
      const want = !!cell.chosen && wants(m, cell.chosen, item.role);
      const mark: CellMark = flag ?? (want && !cont ? "want" : null);
      const place = where(item.store, item.role, Number(item.count) > 1 ? item.occ : null, item.start);
      const hours = audit.hours[cell.chosen]?.[item.date] || 0;
      const pinned = isPinned(m, item.key);
      let title: string, aria: string;
      if (cell.chosen) {
        const unfitText = cell.unfit.length ? `条件外（${cell.unfit.join("・")}）` : "";
        const extra =
          flag === "off"
            ? "（勤務できない時間）"
            : flag === "unfit"
              ? `（${unfitText}）`
              : flag === "dislike"
                ? "（苦手な役職）"
                : flag === "conflict"
                  ? "（重複）"
                  : want
                    ? "（やりたい役職）"
                    : "";
        aria = `${place}：${cell.chosen}${extra}${pinned ? "（固定）" : ""}`;
        title = `${cell.chosen}・この日 ${fmt(hours).replace(/h$/, "時間")}${flag === "off" ? "：勤務可能表では × の時間です" : ""}${unfitText ? `：${unfitText}` : ""}${pinned ? "\n固定（自動割当で変えません）" : ""}`;
      } else {
        aria = `${place}：${cell.label}`;
        title = cell.tip;
      }
      const drip = cont ? null : cell.drip;
      const label = state !== "filled" && cont ? "" : cell.label;
      const sig = [state, flag, mark, label, cont, stint, box, drip?.text, drip?.cls, pinned, title, aria, edge, item.key].join("|");
      return { kind: "item", edge, key: item.key, state, flag, mark, label, cont, stint, box, drip, pinned, title, aria, sig };
    });
  });
  return hours.map((hour, r) => {
    const free = freeAt ? freeAt(hour) : null;
    const car = free ? { n: free.length, title: carTitle(free) } : null;
    const cells = colCells.map((col) => col[r]);
    return { hour, half: !hour.endsWith(":00"), car, cells, sig: `${hour}|${car?.n}|${car?.title}|${cells.map((c) => c.sig).join("/")}` };
  });
}

/** 読み上げの場所（例：本店 ドリッパー 2nd 11:30） */
function where(store: string, role: string, occ: number | null, start: string): string {
  return `${storeNames.includes(store) ? `${store} ` : ""}${role}${occ === null ? "" : ` ${posLabel(role, occ)}`} ${start}`;
}

/** 時間の見出しのツールチップ（10:00–10:30） */
export const hourTitle = (hour: string): string => `${hour}–${plusSlot(hour)}`;

// ---- 個人別の表 ----

/** 旧版の店舗のクラス名 → 店舗名（個人別のブロックの色） */
const SHOP_OF_CLASS: Readonly<Record<string, string>> = {
  "store-main": "本店",
  "store-second": "2号店",
  "store-kurea": "くれあ",
  "store-prep": "準備",
  "store-clean": "美化",
};

export type PersonState = "on" | "brk" | "conflict" | "off" | "unfit";

export type PersonCell =
  | { kind: "skip" }
  | { kind: "free" | "na" }
  | {
      kind: "block";
      key: string;
      span: number;
      state: PersonState;
      /** on のときの店舗（色） */
      shop: string;
      /** 表示（重複なら役職ごとに1行） */
      lines: string[];
      label: string;
      title: string;
      aria: string;
    };

export interface PersonColumn {
  name: string;
  short: string;
  hours: number;
  hoursText: string;
}

export interface PersonTable {
  hours: string[];
  columns: PersonColumn[];
  maxHours: number;
  /** rows[行][メンバー] */
  rows: PersonCell[][];
}

export function personTable(m: Model, date: string, names: readonly string[], audit: Audit, shortNames: Readonly<Record<string, string>>): PersonTable {
  const { hours, cols, span } = personMatrix(m, date, names);
  // 条件外（personMatrix は印刷と共用で旧版と同じ分け方なので、ここで足す）：ブロックのどれかの枠が条件外なら
  const items = new Map(flattened(m).map((x) => [x.key, x]));
  const unfitAt = (name: string, key: string | undefined) => {
    const x = key ? items.get(key) : undefined;
    return !!x && unfitReasons(m, name, x).length > 0;
  };
  const columns = names.map((name) => {
    const h = audit.hours[name]?.[date] || 0;
    return { name, short: displayName(name, m.fullNames, shortNames), hours: h, hoursText: fmt(h) };
  });
  const maxHours = Math.max(0, ...columns.map((c) => c.hours));
  const rows = hours.map((h, r) =>
    cols.map((col, i): PersonCell => {
      const n = span[i][r];
      if (!n) return { kind: "skip" };
      const c = col[r];
      if (!c.key) return { kind: c.cls === "na" ? "na" : "free" };
      const [cls, storeCls] = c.cls.split(" ");
      const unfit = (cls === "on" || cls === "brk") && col.slice(r, r + n).some((x) => unfitAt(names[i], x.key));
      const state: PersonState = cls === "conflict" ? "conflict" : cls === "off" ? "off" : unfit ? "unfit" : cls === "brk" ? "brk" : "on";
      const end = hours[r + n - 1] ? plusSlot(hours[r + n - 1]) : "";
      return {
        kind: "block",
        key: c.key,
        span: n,
        state,
        shop: state === "on" ? (SHOP_OF_CLASS[storeCls] ?? "") : "",
        lines: state === "conflict" ? c.label.split("／") : [c.label],
        label: c.label,
        title: `${names[i]}：${c.label}`,
        aria: `${names[i]} ${h}–${end} ${c.label}${state === "conflict" ? "（重複）" : state === "off" ? "（勤務できない時間）" : state === "unfit" ? "（条件外）" : ""}`,
      };
    }),
  );
  return { hours, columns, maxHours, rows };
}
