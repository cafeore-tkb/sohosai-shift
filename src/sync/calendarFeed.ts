// カレンダー配信の閲覧ページ（/shift、/shift/{名前}）が読むデータ。ログインしないので Firebase の SDK は使わず、Firestore の REST API で pubs/shift を読む。
// 購読の URL（/shift/{名前}.ics）は同じサイトの Worker が返す

import type { CalEvent } from "../domain";
import { CALENDAR_PATH } from "./site";

export interface PubSummary {
  title: string;
  publishedAt: Date | null;
  members: { id: string; name: string; slug: string }[];
}

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};

/** Firestore の REST の値 → JS の値 */
export function fromRest(v: RestValue | undefined): unknown {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue!);
  if ("arrayValue" in v) return (v.arrayValue!.values || []).map(fromRest);
  if ("mapValue" in v) return fromRestFields(v.mapValue!.fields);
  return null;
}
export const fromRestFields = (fields: Record<string, RestValue> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields || {}).map(([k, x]) => [k, fromRest(x)]));

export const validId = (id: string): boolean => /^m[0-9a-f]{14}$/.test(id);

/** pubs/shift の一部のフィールドを読む。ドキュメントがない（配信を止めた）ときは null */
async function readPub(fieldPaths: string[]): Promise<Record<string, unknown> | null> {
  const { projectId, apiKey } = window.FIREBASE_CONFIG || {};
  if (!projectId) throw new Error("Firebase の設定（firebase-config.js）がありません");
  const q = new URLSearchParams();
  for (const f of fieldPaths) q.append("mask.fieldPaths", f);
  if (apiKey) q.set("key", apiKey);
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/pubs/${CALENDAR_PATH}?${q}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
  return fromRestFields(((await res.json()) as { fields?: Record<string, RestValue> }).fields);
}

export async function fetchPub(): Promise<PubSummary | null> {
  const d = await readPub(["title", "publishedAt", "members"]);
  if (!d) return null;
  return {
    title: (d.title as string) || "シフト",
    publishedAt: d.publishedAt instanceof Date ? d.publishedAt : null,
    members: ((d.members as PubSummary["members"]) || []).filter((x) => x && validId(x.id) && x.name && x.slug),
  };
}

/** 1人分の予定と .ics（購読用のまま。取り込み用は importIcs で変える） */
export async function fetchMember(id: string): Promise<{ events: CalEvent[]; ics: string } | null> {
  if (!validId(id)) return null;
  const d = await readPub([`events.${id}`, `ics.${id}`]);
  const ics = (d?.ics as Record<string, string> | undefined)?.[id];
  if (!ics) return null;
  return { events: ((d!.events as Record<string, CalEvent[]> | undefined)?.[id] || []) as CalEvent[], ics };
}

/** 購読の URL（同じサイトの Worker：/shift/{名前}.ics） */
export function feedUrls(slug: string): { https: string; webcal: string; google: string } {
  const https = `${location.origin}/${CALENDAR_PATH}/${encodeURIComponent(slug)}.ics`,
    webcal = https.replace(/^https?:/, "webcal:");
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}
