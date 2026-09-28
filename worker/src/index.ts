// Shift Maker の Worker。アプリ本体は静的ファイル（ASSETS＝dist）で、Worker が受けるのは次の2つだけ（wrangler.jsonc の run_worker_first）。
// カレンダー配信（購読）：GET /c/{キー}/{ID}.ics → Firestore の pubs/{キー} から、その人の .ics（ics.{ID}）だけを読んで返す。
// 秘密の値は持たない（Firestore の API キーはアプリの firebase-config.js と同じ公開の値。読めるかどうかは firestore.rules が決める）。
// 検索エンジンには載せない（robots.txt と X-Robots-Tag）

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY: string;
  /** アプリ本体（dist）。テストではない */
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow, noarchive" };
const text = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NOINDEX, ...headers } });

const FEED = /^\/c\/([A-Za-z0-9]{24,})\/(m[0-9a-f]{14})\.ics$/;

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return text("Method Not Allowed", 405, { Allow: "GET, HEAD" });
  if (url.pathname === "/robots.txt") return text("User-agent: *\nDisallow: /\n", 200, { "Cache-Control": "public, max-age=86400" });
  const m = url.pathname.match(FEED);
  if (!m) return text("Not Found", 404);
  const [, key, id] = m;

  const q = new URLSearchParams({ "mask.fieldPaths": `ics.${id}`, key: env.FIREBASE_API_KEY });
  const res = await fetchImpl(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/pubs/${key}?${q}`,
  );
  if (res.status === 404) return text("Not Found", 404);
  if (!res.ok) return text("Upstream Error", 502, { "Cache-Control": "no-store" });
  const doc = (await res.json()) as { fields?: { ics?: { mapValue?: { fields?: Record<string, { stringValue?: string }> } } } };
  const ics = doc.fields?.ics?.mapValue?.fields?.[id]?.stringValue;
  if (!ics) return text("Not Found", 404);

  return new Response(request.method === "HEAD" ? null : ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${id}.ics"`,
      // カレンダーアプリは数十分〜数時間おきに取りに来る。配信し直しは5分以内に届けばよい
      "Cache-Control": "public, max-age=300",
      ...NOINDEX,
    },
  });
}

export default {
  // run_worker_first の外（アプリ本体）は通常ここへ来ないが、来たら静的ファイルに渡す
  fetch: (request: Request, env: Env) => {
    const path = new URL(request.url).pathname;
    return env.ASSETS && !path.startsWith("/c/") && path !== "/robots.txt" ? env.ASSETS.fetch(request) : handle(request, env);
  },
};
