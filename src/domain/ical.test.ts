import { describe, expect, it } from "vitest";
import { allNames } from "./audit";
import { buildPublication, calendarIds, importIcs, memberEvents, personIcs, publicationDigest, utcStamp } from "./ical";
import { flattened } from "./slots";
import { autoModel } from "../test/fixtures";

const opts = { stamp: new Date("2026-10-28T03:00:00Z"), version: "10/28 12:00 配信版" };
// 折り返しを戻して1行ずつ
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("個人TTのカレンダー", () => {
  it("ID は名前だけで決まり、重ならず、URL とフィールド名に使える", () => {
    const a = calendarIds(["山田 太郎", "佐藤 花子"]);
    expect(calendarIds(["佐藤 花子", "山田 太郎"])).toEqual(a);
    expect(Object.values(a).every((id) => /^m[0-9a-f]{14}$/.test(id))).toBe(true);
    expect(new Set(Object.values(a)).size).toBe(2);
  });

  it("予定はその人の担当を時間順につなぎ、日本時間を UTC で書く", () => {
    const m = autoModel(),
      name = allNames(m).find((n) => memberEvents(m, n).length >= 2)!,
      events = memberEvents(m, name);
    const mine = flattened(m).filter((x) => m.assignments[x.key] === name);
    // 30分の枠の合計と、予定の長さの合計が同じ
    const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    expect(events.reduce((t, e) => t + minutes(e.end) - minutes(e.start), 0)).toBe(mine.length * 30);
    expect(events.map((e) => e.date + e.start)).toEqual([...events.map((e) => e.date + e.start)].sort());
    expect(utcStamp("2026-10-31", "10:00")).toBe("20261031T010000Z");
    expect(utcStamp("2026-10-31", "08:30")).toBe("20261030T233000Z");
  });

  it(".ics は RFC 5545 の形（CRLF・75オクテットで折り返し・エスケープ・UID は配信し直しても同じ）", () => {
    const events = [
      { date: "2026-10-31", start: "10:00", end: "11:30", summary: "本店・ホール 1" },
      { date: "2026-10-31", start: "12:00", end: "12:30", summary: "昼食" },
      { date: "2026-10-31", start: "12:00", end: "12:30", summary: "昼食" },
      { date: "2026-11-01", start: "09:00", end: "10:00", summary: "a,b;c\\d".repeat(20) },
    ];
    const ics = personIcs("m0123", "山田 太郎", events, opts);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const lines = unfold(ics);
    expect(lines).toContain("X-WR-CALNAME:雙峰祭シフト（山田 太郎）");
    expect(lines).toContain("DTSTART:20261031T010000Z");
    expect(lines).toContain("DTEND:20261031T023000Z");
    expect(lines).toContain(`SUMMARY:${"a\\,b\\;c\\\\d".repeat(20)}`);
    expect(lines).toContain("DESCRIPTION:雙峰祭シフト（10/28 12:00 配信版）");
    const uids = lines.filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(4);
    expect(unfold(personIcs("m0123", "山田 太郎", events, { stamp: new Date(), version: "別の版" })).filter((l) => l.startsWith("UID:"))).toEqual(uids);
    // 折り返しは文字の途中で切らない
    expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(ics))).toBe(ics);
  });

  it("ファイルで取り込む用は、カレンダー全体の指定だけを外す（予定は同じ）", () => {
    const ics = personIcs("m1", "山田", [{ date: "2026-10-31", start: "10:00", end: "11:00", summary: "本店・レジ" }], opts);
    const imp = importIcs(ics);
    expect(imp).not.toMatch(/X-WR-CALNAME|REFRESH-INTERVAL|X-PUBLISHED-TTL|METHOD/);
    expect(imp.slice(imp.indexOf("BEGIN:VEVENT"))).toBe(ics.slice(ics.indexOf("BEGIN:VEVENT")));
    expect(imp.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
  });

  it("配信の中身：全員分、digest は予定が変わったときだけ変わる", () => {
    const m = autoModel(),
      pub = buildPublication(m, opts);
    expect(pub.members.map((x) => x.name)).toEqual(allNames(m));
    for (const { id, name } of pub.members) {
      expect(pub.events[id]).toEqual(memberEvents(m, name));
      expect(pub.ics[id]).toContain(`雙峰祭シフト（${name}）`);
    }
    expect(pub.digest).toBe(publicationDigest(m));
    expect(buildPublication(m, { stamp: new Date(), version: "x" }).digest).toBe(pub.digest);
    const key = Object.keys(m.assignments).find((k) => m.assignments[k])!;
    delete m.assignments[key];
    expect(publicationDigest(m)).not.toBe(pub.digest);
  });
});
