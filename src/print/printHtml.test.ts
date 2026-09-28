import { describe, expect, it } from "vitest";
import { createModel } from "../domain";
import { autoModel, item, tinyModel } from "../test/fixtures";
import { esc } from "./html";
import { printShiftHtml } from "./printHtml";

describe("printShiftHtml", () => {
  it("データがなければ「出力できるシフトがありません」、esc", () => {
    const html = printShiftHtml(createModel(), { stamp: "x" });
    expect(html).toContain('<body data-day="" data-mode="shift" class="">');
    expect(html).toContain("出力できるシフトがありません。");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.endsWith("</script></body></html>")).toBe(true);
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(esc(null)).toBe("");
  });

  it("日ごとのシフト表・個人別シフト・個人TT（memberOrder の順）", () => {
    const m = autoModel();
    const html = printShiftHtml(m, { stamp: "2026/10/30 9:00:00" });
    expect(html).toContain("<small>出力：2026/10/30 9:00:00</small>");
    expect(html.match(/<section class="day"/g)?.length).toBe(3);
    expect(html.match(/<section class="ttday"/g)?.length).toBe(3);
    expect(html).toContain('<button data-pick="all" data-label="全日程">すべての日</button>');
    expect(html).toContain("全日程　個人別シフト");
    // 同じ Model なら同じ HTML
    expect(printShiftHtml(m, { stamp: "2026/10/30 9:00:00" })).toBe(html);
    // メンバーの並び順（memberOrder）で個人別・全日程の順が変わる
    const html0 = printShiftHtml(m, { stamp: "x" });
    const names = [...new Set(m.availability.map((a) => a.name))].sort((a, b) => a.localeCompare(b, "ja"));
    const [first, last] = [names[0], names[names.length - 1]];
    const tail = (h: string) => h.slice(h.indexOf("全日程　個人別シフト"));
    expect(tail(html0).indexOf(esc(first))).toBeLessThan(tail(html0).indexOf(esc(last)));
    m.memberOrder = { [last]: 1 };
    const html1 = printShiftHtml(m, { stamp: "x" });
    expect(tail(html1).indexOf(esc(last))).toBeLessThan(tail(html1).indexOf(esc(first)));
  });

  it("ensureAllSlots を行い、名前をエスケープする", () => {
    const m = tinyModel();
    m.slots = [];
    m.availability.push({ name: "<b>&", date: "2026-10-31", start: "10:00", end: "11:00" });
    m.memberStores["<b>&"] = ["本店"];
    const html0 = printShiftHtml(m, { stamp: "x" });
    expect(m.slots.length).toBeGreaterThan(0);
    m.assignments[item(m, "レジ", "10:00").key] = "<b>&";
    m.fullNames = true;
    const html = printShiftHtml(m, { stamp: "x" });
    expect(html).not.toBe(html0);
    expect(html).toContain('<span class="f">&lt;b&gt;&amp;</span>');
    expect(html).toContain('class="full"');
  });
});
