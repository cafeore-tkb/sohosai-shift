// Shift Maker の Worker（https://sohosai-shift.cafeore.workers.dev）。アプリ本体は静的ファイル（ASSETS＝dist。知らないパスは index.html＝SPA）で、
// Worker が先に受けるのは /shift/* と /robots.txt だけ（wrangler.jsonc の run_worker_first）。
//   /shift/{名前}.ics … カレンダー購読：Firestore の pubs/shift から、その人の .ics（ics.{ID}、ID は名前から求める）だけを読んで返す
//   /shift/{名前}     … 閲覧ページ（index.html。アプリが URL を見てその人を表示する）
// 秘密の値は持たない（Firestore の API キーはアプリの firebase-config.js と同じ公開の値。読めるかどうかは firestore.rules が決める）。
// 検索エンジンには載せない（robots.txt と X-Robots-Tag）

import { slugId } from "../../src/domain/calendarId";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY: string;
  /** アプリ本体（dist） */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const PUB = "shift";
const NOINDEX = { "X-Robots-Tag": "noindex, nofollow, noarchive" };
const text = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NOINDEX, ...headers } });

const FEED = /^\/shift\/([^/]+)\.ics$/;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s).normalize("NFC");
  } catch {
    return "";
  }
};

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return text("Method Not Allowed", 405, { Allow: "GET, HEAD" });
  if (url.pathname === "/robots.txt") return text("User-agent: *\nDisallow: /\n", 200, { "Cache-Control": "public, max-age=86400" });
  const m = url.pathname.match(FEED);
  // /shift/{名前}（.ics でない）は閲覧ページ
  if (!m) return url.pathname.startsWith("/shift/") ? env.ASSETS.fetch(new Request(new URL("/", url), request)) : text("Not Found", 404);
  const slug = decode(m[1]);
  if (!slug) return text("Not Found", 404);
  const id = slugId(slug);

  const q = new URLSearchParams({ "mask.fieldPaths": `ics.${id}`, key: env.FIREBASE_API_KEY });
  const res = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/pubs/${PUB}?${q}`);
  if (res.status === 404) return text("Not Found", 404);
  if (!res.ok) return text("Upstream Error", 502, { "Cache-Control": "no-store" });
  const doc = (await res.json()) as { fields?: { ics?: { mapValue?: { fields?: Record<string, { stringValue?: string }> } } } };
  const ics = doc.fields?.ics?.mapValue?.fields?.[id]?.stringValue;
  if (!ics) return text("Not Found", 404);

  return new Response(request.method === "HEAD" ? null : ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${id}.ics"; filename*=UTF-8''${encodeURIComponent(slug)}.ics`,
      // カレンダーアプリは数十分〜数時間おきに取りに来る。配信し直しは5分以内に届けばよい
      "Cache-Control": "public, max-age=300",
      ...NOINDEX,
    },
  });
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
