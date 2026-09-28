import { describe, expect, it, vi } from "vitest";
import { slugId } from "../../src/domain/calendarId";
import { handle } from "./index";

const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
const ID = slugId("山田太郎");
const doc = { fields: { ics: { mapValue: { fields: { [ID]: { stringValue: ICS } } } } } };
const assets = vi.fn(async (req: Request) => new Response(`asset ${new URL(req.url).pathname}`, { status: 200 }));
const env = { FIREBASE_PROJECT_ID: "proj", FIREBASE_API_KEY: "apikey", ASSETS: { fetch: assets } };

function firestore(status: number, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(body), { status }));
}
const at = (path: string, f: typeof fetch = firestore(200, doc), method = "GET") =>
  handle(new Request(`https://cal.example${path}`, { method }), env, f);

describe("Worker", () => {
  it("/shift/{名前}.ics はその人の .ics だけを pubs/shift から読んで text/calendar で返す（検索エンジンには載せない）", async () => {
    const f = firestore(200, doc);
    const res = await at(`/shift/${encodeURIComponent("山田太郎")}.ics`, f);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(await res.text()).toBe(ICS);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/projects/proj/databases/(default)/documents/pubs/shift");
    expect(url.searchParams.getAll("mask.fieldPaths")).toEqual([`ics.${ID}`]);
    expect(url.searchParams.get("key")).toBe("apikey");
    // 濁点が分解された URL でも同じ人
    expect((await at(`/shift/${encodeURIComponent("山田太郎".normalize("NFD"))}.ics`)).status).toBe(200);
    // HEAD は本文なし
    const head = await at(`/shift/${encodeURIComponent("山田太郎")}.ics`, firestore(200, doc), "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("/shift/{名前} は閲覧ページ（index.html）", async () => {
    const res = await at(`/shift/${encodeURIComponent("山田太郎")}`);
    expect(await res.text()).toBe("asset /");
  });

  it("配信を止めた・いない人は 404、Firestore のエラーは 502、robots.txt は全部お断り", async () => {
    expect((await at(`/shift/${encodeURIComponent("山田太郎")}.ics`, firestore(404))).status).toBe(404);
    expect((await at(`/shift/${encodeURIComponent("佐藤花子")}.ics`)).status).toBe(404);
    expect((await at(`/shift/${encodeURIComponent("山田太郎")}.ics`, firestore(403))).status).toBe(502);
    const never = vi.fn() as unknown as typeof fetch;
    expect((await at("/shift/%E0%A4%A.ics", never)).status).toBe(404);
    expect((await at("/c/x/y.ics", never)).status).toBe(404);
    expect(never).not.toHaveBeenCalled();
    expect((await at(`/shift/x.ics`, firestore(200, doc), "POST")).status).toBe(405);
    expect(await (await at("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
  });
});
