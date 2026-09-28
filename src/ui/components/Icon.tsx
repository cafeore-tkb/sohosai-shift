// アイコン（線画 1.75px・16/20px・aria-hidden）。1つのインライン SVG スプライト（<IconSprite/> を App で1回だけ描く）を <use> で参照する
// 形は .migration/design/final/mockup.src.html のスプライトと同じ。

import styles from "./Icon.module.css";

/** スプライトの中身（viewBox 0 0 24 24 の path など） */
const PATHS = {
  "users": `<path d="M16 20v-1.5a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V20"/><circle cx="9.2" cy="7.5" r="3.6"/><path d="M21.5 20v-1.5a4 4 0 0 0-3-3.9"/><path d="M15.5 4a3.6 3.6 0 0 1 0 7"/>`,
  "printer": `<path d="M6.5 9V3.5h11V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6.5 14h11v6.5h-11z"/>`,
  "download": `<path d="M12 3.5v11.5"/><path d="m7 10.5 5 5 5-5"/><path d="M4.5 20.5h15"/>`,
  "upload": `<path d="M12 20.5V9"/><path d="m7 13.5 5-5 5 5"/><path d="M4.5 3.5h15"/>`,
  "sparkle": `<path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>`,
  "sliders": `<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>`,
  "check-list": `<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.5 1.5L7.5 5"/><path d="m3.5 12 1.5 1.5 2.5-2.5"/><path d="m3.5 18 1.5 1.5 2.5-2.5"/>`,
  "trash": `<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>`,
  "max": `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  "more": `<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>`,
  "search": `<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>`,
  "x": `<path d="M6 6l12 12M18 6 6 18"/>`,
  "chev": `<path d="m6 9 6 6 6-6"/>`,
  "arrow": `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  "undo": `<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`,
  "grid": `<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17"/>`,
  "person": `<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>`,
  "help": `<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17h.01"/>`,
  "link": `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  "copy": `<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>`,
  "doc": `<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z"/><path d="M14 3.5v5h5"/>`,
  "cal": `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>`,
  "shield": `<path d="M12 3.5l7 2.8v5.5c0 4.3-2.9 7.3-7 8.7-4.1-1.4-7-4.4-7-8.7V6.3z"/><path d="m9 12 2.2 2.2L15.5 10"/>`,
  "alert": `<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.8h.01"/>`,
  "info": `<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>`,
  "check": `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  "move": `<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>`,
  "plus": `<path d="M12 5v14M5 12h14"/>`,
  "reset": `<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>`,
  "leave": `<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M9 8l-4 4 4 4M5 12h10"/>`,
  "cloud": `<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18.5z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>`,
  "bean": `<ellipse cx="12" cy="12" rx="6" ry="8.8" transform="rotate(38 12 12)"/><path d="M8.2 17.2c2.8-1.6 2-5.4 7.6-10.4"/>`,
  "cup": `<path d="M4 9.5h12.5v4.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16.5 11h1.8a2.4 2.4 0 0 1 0 4.8h-1.8"/><path d="M8 3.5c-.8 1 .8 1.8 0 3M12 3.5c-.8 1 .8 1.8 0 3"/>`,
  "filter": `<path d="M4 5.5h16l-6.2 7.2v5.6l-3.6 1.7v-7.3z"/>`,
  "car": `<path d="M5 16.5v-5l2-5h10l2 5v5"/><path d="M3.5 11.5h17v5h-17z"/><circle cx="7.5" cy="14" r=".6"/><circle cx="16.5" cy="14" r=".6"/><path d="M5.5 16.5v2M18.5 16.5v2"/>`,
  "lock": `<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>`,
  "star": `<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>`,
  "back": `<path d="M19 12H5M11 6l-6 6 6 6"/>`,
  "chev-r": `<path d="m9 6 6 6-6 6"/>`,
  "login": `<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/><path d="M14 8l4 4-4 4M18 12H8"/>`,
  "grip": `<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>`,
  "sort": `<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M13 6h8M13 12h6M13 18h4"/>`,
} as const;

export type IconName = keyof typeof PATHS;

/** アプリに1回だけ置く SVG スプライト（<symbol id="i-…">） */
export function IconSprite() {
  const html = (Object.keys(PATHS) as IconName[])
    .map((k) => `<symbol id="i-${k}" viewBox="0 0 24 24">${PATHS[k]}</symbol>`)
    .join("");
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs dangerouslySetInnerHTML={{ __html: html }} />
    </svg>
  );
}

export interface IconProps {
  name: IconName;
  /** 14（sm）・16（既定）・20（lg） */
  size?: 14 | 16 | 20;
  className?: string;
}

/** 装飾用のアイコン（常に aria-hidden。意味はボタンの文言か aria-label で伝える） */
export function Icon({ name, size = 16, className }: IconProps) {
  const cls = [styles.icon, size === 20 ? styles.lg : size === 14 ? styles.sm : "", className].filter(Boolean).join(" ");
  return (
    <svg className={cls} aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}
