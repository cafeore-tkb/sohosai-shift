// 時刻・日付のヘルパー

/** シフト枠の刻み（分） */
export const SLOT = 30;

/** 分 → "HH:MM"（24時を超えたら折り返す） */
export const toHM = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "H:MM" / "HH:MM" → 分（":" で区切る版。旧版の plusSlot・hoursForDate・applyAvailability と同じ） */
export const hmToMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** "HH:MM" → 分（先頭2文字と4文字目以降で読む版。旧版の toMin と同じ） */
export const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** 30分後の時刻 */
export const plusSlot = (t: string): string => toHM(hmToMin(t) + SLOT);

/** 例：10月31日(土) */
export const dayLabel = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });

/** 例：10/31(土) */
export const shortDay = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });

/** 勤務時間の表示（例：3h、2.5h） */
export const fmt = (h: number): string => `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
