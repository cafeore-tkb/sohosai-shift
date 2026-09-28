import { describe, expect, it, vi } from "vitest";
import { handle } from "./index";

const env = { FIREBASE_PROJECT_ID: "proj", FIREBASE_API_KEY: "apikey" };
const KEY = "A".repeat(32),
  ID = "m0123456789abcd";
const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";

function firestore(status: number, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(body), { status }));
}
const doc = { fields: { ics: { mapValue: { fields: { [ID]: { stringValue: ICS } } } } } };

describe("カレンダー配信の Worker", () => {
  it("/c/{キー}/{ID}.ics はその人の .ics だけを Firestore から読んで text/calendar で返す（検索エンジンには載せない）", async () => {
    const f = firestore(200, doc);
    const res = await handle(new Request(`https://cal.example/c/${KEY}/${ID}.ics`), env, f);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(await res.text()).toBe(ICS);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.pathname).toBe(`/v1/projects/proj/databases/(default)/documents/pubs/${KEY}`);
    expect(url.searchParams.getAll("mask.fieldPaths")).toEqual([`ics.${ID}`]);
    expect(url.searchParams.get("key")).toBe("apikey");
    // HEAD は本文なし
    const head = await handle(new Request(`https://cal.example/c/${KEY}/${ID}.ics`, { method: "HEAD" }), env, firestore(200, doc));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("配信を止めた・いない人・形の違う URL は 404、Firestore のエラーは 502、robots.txt は全部お断り", async () => {
    const at = (path: string, f: typeof fetch = firestore(200, doc), method = "GET") => handle(new Request(`https://cal.example${path}`, { method }), env, f);
    expect((await at(`/c/${KEY}/${ID}.ics`, firestore(404))).status).toBe(404);
    expect((await at(`/c/${KEY}/m0000000000000f.ics`, firestore(200, { fields: {} }))).status).toBe(404);
    expect((await at(`/c/${KEY}/${ID}.ics`, firestore(403))).status).toBe(502);
    const never = vi.fn();
    for (const p of ["/", `/c/short/${ID}.ics`, `/c/${KEY}/${ID}`, `/c/${KEY}/../x.ics`, `/c/${KEY}/${ID}.ics/x`])
      expect((await at(p, never as unknown as typeof fetch)).status).toBe(404);
    expect(never).not.toHaveBeenCalled();
    expect((await at(`/c/${KEY}/${ID}.ics`, firestore(200, doc), "POST")).status).toBe(405);
    const robots = await at("/robots.txt");
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  });
});
