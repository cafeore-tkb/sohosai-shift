import { describe, expect, it } from "vitest";
import { namesOn } from "./availability";
import { personMatrix } from "./cells";
import { buildPublication } from "./ical";
import { expandSegs, shiftOverview } from "./overview";
import { eventDates } from "./slots";
import { autoModel } from "../test/fixtures";

describe("配信の表（シフト調整の個人別と同じ形）", () => {
  it("日ごと・参加者ごとの縦の並びは行をすべて覆い、個人別の表と同じ中身", () => {
    const m = autoModel(),
      days = shiftOverview(m);
    expect(days.map((d) => d.date)).toEqual(eventDates(m));
    for (const d of days) {
      const names = namesOn(m, d.date),
        pm = personMatrix(m, d.date, names);
      expect(d.people.map((p) => p.name)).toEqual(names);
      expect(d.hours).toEqual(pm.hours);
      d.cols.forEach((segs, i) => {
        const rows = expandSegs(segs);
        expect(rows).toHaveLength(d.hours.length);
        rows.forEach((s, r) => {
          const c = pm.cols[i][r];
          expect(s[2]).toBe(c.label);
          if (!c.label) expect(s[1]).toBe(c.cls === "na" ? "n" : "f");
        });
        // 担当の枠には店舗が付く（昼食・休憩・重なりは付かない）
        for (const s of segs) if (s[1] === "o" && s[2].includes("・")) expect(s[3]).not.toBe("");
      });
    }
  });

  it("配信の中身に JSON で入り、digest にも効く", () => {
    const m = autoModel(),
      pub = buildPublication(m, { stamp: new Date(), version: "v" });
    expect(JSON.parse(pub.overview)).toEqual(shiftOverview(m));
    const key = Object.keys(m.assignments).find((k) => m.assignments[k])!;
    delete m.assignments[key];
    expect(buildPublication(m, { stamp: new Date(), version: "v" }).digest).not.toBe(pub.digest);
  });
});
