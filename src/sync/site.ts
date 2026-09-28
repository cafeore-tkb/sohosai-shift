// 公開サイト（https://sohosai-shift.cafeore.workers.dev）の URL と画面の対応。
//   /                … ローカル（このブラウザだけで動く。共同編集なし）
//   /edit            … 本番の共同編集の部屋（window.SHIFT_SITE.room。編集できるのは登録した人だけ＝firestore.rules）
//   /shift           … カレンダー配信の名前の一覧、/shift/{名前} … その人のページ、/shift/{名前}.ics … 購読（Worker）
// 古いリンク（#room={本番の部屋} と #cal=…）は新しい URL へ置き換える。file://（オフライン配布）と部屋の設定がないときは今までどおり

declare global {
  interface Window {
    /** 本番の部屋の ID（firebase-config.js）。なければ /edit と /shift は使わない */
    SHIFT_SITE?: { room?: string };
  }
}

/** カレンダー配信のパスと、Firestore の配信ドキュメントの ID（pubs/shift） */
export const CALENDAR_PATH = "shift";

export type Route = { kind: "app" } | { kind: "room" } | { kind: "calendar"; slug: string };

const onWeb = () => /^https?:$/.test(location.protocol);
export const siteRoom = (): string => (onWeb() && window.SHIFT_SITE?.room) || "";

/** いまの URL の画面。古いリンクは置き換えてから返す */
export function currentRoute(): Route {
  if (!onWeb()) return { kind: "app" };
  const room = siteRoom(),
    hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has("cal")) {
    history.replaceState(null, "", `/${CALENDAR_PATH}`);
    return { kind: "calendar", slug: "" };
  }
  if (room && hash.get("room") === room) history.replaceState(null, "", "/edit");
  const path = location.pathname.replace(/\/+$/, "");
  if (room && path === "/edit") return { kind: "room" };
  const m = path.match(new RegExp(`^/${CALENDAR_PATH}(?:/([^/]+))?$`));
  if (m) return { kind: "calendar", slug: m[1] ? safeDecode(m[1]) : "" };
  return { kind: "app" };
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s).normalize("NFC");
  } catch {
    return s;
  }
};

export const editUrl = () => `${location.origin}/edit`;
export const calendarUrl = (slug = "") => `${location.origin}/${CALENDAR_PATH}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
