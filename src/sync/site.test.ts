import { afterEach, describe, expect, it, vi } from "vitest";
import { isOutdated } from "./site";

declare const __BUILD_ID__: string;

// 公開中の index.html：インラインの JS に正規表現の文字列そのものが入っているのと同じ形にする
const page = (id: string) =>
  `<html><head><script>const r=/<meta name="shift-build" content="([a-z0-9]+)"/;</script>\n<meta name="shift-build" content="${id}" />\n</head></html>`;

describe("開きっぱなしの古い版の検出（配信の前）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("公開中の index.html の版と、この画面の版を比べる（正規表現の文字列には当たらない）", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(page(__BUILD_ID__))));
    expect(await isOutdated()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(page("zz9newer"))));
    expect(await isOutdated()).toBe(true);
  });

  it("確かめられないとき（通信エラー・版の印がない・file://）は古いとみなさない", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await isOutdated()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>")));
    expect(await isOutdated()).toBe(false);
    const f = vi.fn();
    vi.stubGlobal("location", { protocol: "file:" });
    vi.stubGlobal("fetch", f);
    expect(await isOutdated()).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
