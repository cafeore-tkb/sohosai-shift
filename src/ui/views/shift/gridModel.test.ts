import { describe, expect, it } from "vitest";
import { assignmentAudit, buildShortNames, dayGrid, flattened, gridCell } from "../../../domain";
import { autoModel, D } from "../../../test/fixtures";
import { personTable, roleHead, roleRows, runPositions } from "./gridModel";
import { auditBadge, dayOptions, monthDay, shortDayName, storeOptions } from "./toolbarModel";

describe("runPositions", () => {
  it("marks start / mid / end of equal neighbours and leaves singles and nulls alone", () => {
    expect(runPositions(["a", "a", "a", "b", null, null, "c", "c"])).toEqual(["start", "mid", "end", null, null, null, "start", "end"]);
  });
});

describe("roleRows", () => {
  const m = autoModel();
  // 2025年ベースのサンプルは自動割当で全部埋まるので、空きの続きを作る（本店・レジ 10:00〜11:00）
  for (const x of flattened(m).filter((x) => x.date === D && x.store === "本店" && x.role === "レジ" && x.start < "11:00"))
    m.assignments[x.key] = "";
  const audit = assignmentAudit(m),
    short = buildShortNames(m);
  const grid = dayGrid(m, D, "")!;
  const rows = roleRows(m, D, grid, audit, short);

  it("has one row per 30 minutes and one cell per column, in the legacy key order", () => {
    expect(rows.length).toBe(grid.hours.length);
    for (const r of rows) expect(r.cells.length).toBe(grid.cols.length);
    // 旧版の表と同じ枠のキー・同じ順（行 × 列）
    const keys = rows.flatMap((r) => r.cells.flatMap((c) => (c.kind === "item" ? [c.key] : [])));
    const legacy = grid.hours.flatMap((h) => grid.cols.flatMap((c) => gridCell(grid, c, h).item?.key ?? []));
    expect(keys).toEqual(legacy);
  });

  it("joins one person's consecutive rows into a stint, and consecutive 空き rows into one box", () => {
    for (let ci = 0; ci < grid.cols.length; ci++)
      for (let r = 1; r < rows.length; r++) {
        const up = rows[r - 1].cells[ci],
          c = rows[r].cells[ci];
        if (c.kind !== "item" || up.kind !== "item" || c.state !== "filled" || c.flag || up.flag) continue;
        const same = m.assignments[c.key] === m.assignments[up.key];
        expect(c.stint === "mid" || c.stint === "end").toBe(same);
        if (same) {
          expect(c.cont).toBe(true);
          expect(c.drip).toBeNull();
          expect(c.mark).not.toBe("want");
        }
      }
    // 続いた空きは1つの箱にまとめ、ラベルは1回だけ
    let seen = 0;
    for (let ci = 0; ci < grid.cols.length; ci++)
      for (let r = 1; r < rows.length; r++) {
        const up = rows[r - 1].cells[ci],
          c = rows[r].cells[ci];
        if (c.kind === "item" && up.kind === "item" && c.state === "open" && up.state === "open") {
          seen++;
          expect(c.box === "mid" || c.box === "end").toBe(true);
          expect(c.label).toBe("");
        }
      }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("roleHead / personTable / toolbar", () => {
  const m = autoModel();
  const audit = assignmentAudit(m),
    short = buildShortNames(m);

  it("counts open slots per shop band; builds merged person blocks", () => {
    const grid = dayGrid(m, D, "")!;
    const items = flattened(m).filter((x) => x.date === D);
    const head = roleHead(m, grid, items);
    expect(head.bands.map((b) => b.store)).toEqual(grid.stores.map(([s]) => s));
    for (const b of head.bands) expect(b.open).toBe(items.filter((x) => x.store === b.store && !m.assignments[x.key]).length);
    expect(head.groups.reduce((n, g) => n + g.span, 0)).toBe(grid.cols.length);
    // 個人別：続いた割当を1つのブロックにして、最初の枠のキーを持つ
    const names = Object.keys(audit.hours).slice(0, 5);
    const t = personTable(m, D, names, audit, short);
    const blocks = t.rows.flat().filter((c) => c.kind === "block");
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) if (b.kind === "block") expect(m.assignments[b.key]).toBeTruthy();
  });

  it("条件外の割当：役職別のセルは flag unfit・≠、個人別のブロックは unfit", () => {
    const m2 = autoModel();
    const x = flattened(m2).find((y) => y.date === D && y.store === "本店" && m2.assignments[y.key])!;
    const name = m2.assignments[x.key];
    m2.memberStores[name] = (m2.memberStores[name] || []).filter((s) => s !== "本店");
    const a2 = assignmentAudit(m2);
    const cell = roleRows(m2, D, dayGrid(m2, D, "")!, a2, buildShortNames(m2))
      .flatMap((r) => r.cells)
      .find((c) => c.kind === "item" && c.key === x.key);
    if (cell?.kind !== "item") throw Error("no cell");
    if (!a2.conflicts.has(x.key)) {
      expect(cell.flag).toBe("unfit");
      expect(cell.mark).toBe("unfit");
      expect(cell.aria).toContain("条件外（所属店舗）");
    }
    const t = personTable(m2, D, [name], a2, buildShortNames(m2));
    expect(t.rows.flat().some((c) => c.kind === "block" && c.state === "unfit")).toBe(!a2.conflicts.has(x.key));
  });

  it("labels days and shops like the legacy toolbar", () => {
    const days = dayOptions(m, ["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(days.map((d) => d.short)).toEqual(["準備", "1日目", "2日目", "一覧"]);
    expect(days[1].sub).toBe("10/31");
    expect(monthDay("2026-11-01")).toBe("11/1");
    expect(shortDayName("本番2日目")).toBe("2日目");
    m.gridDate = D;
    const st = storeOptions(m, ["2026-10-30", D, "2026-11-01"]);
    expect(st.options[0]).toMatchObject({ value: "", label: "すべての店舗" });
    expect(auditBadge(2, 2, 0, 15)).toEqual({ text: "重複 2・時間外 2・希望外 15", total: 19, title: "重複 2枠・勤務できない時間 2枠・やりたい役職に入っていない 15名" });
    expect(auditBadge(0, 1, 3, 0)).toEqual({ text: "時間外 1・条件外 3", total: 4, title: "勤務できない時間 1枠・条件外 3枠" });
  });
});
