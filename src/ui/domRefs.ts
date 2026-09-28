// 動きのために位置を読む要素（見た目のクラス名では探さない）

import { createRef } from "react";

/**
 * 画面の上に固定されている帯（アプリバー。スマホでもアプリバーは上）。名前は旧版のタブバーのなごり。
 * ドラッグの自動スクロールと、表の見出しの固定（旧画面）で「画面の上の端」に使う
 */
export const tabBarRef = createRef<HTMLElement>();
