// 起動：store 初期化 → React 描画 → 共同編集（sync）開始

// スタイル：トークン → 基本。コンポーネントの CSS Modules はこのあと
import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { store } from "./store";
import { startSync } from "./sync/firebase";
import { currentRoute } from "./sync/site";
import { App } from "./ui/App";
import { CalendarPage } from "./ui/calendar/CalendarPage";

declare global {
  interface Window {
    __SHIFT_DEBUG__?: { snapshot: () => unknown };
  }
}

// 回帰テスト用：Model をそのまま返す
window.__SHIFT_DEBUG__ = { snapshot: () => store.model };

const root = createRoot(document.getElementById("root")!);

// カレンダー配信の閲覧ページ（/shift、/shift/{名前}）：アプリ本体（store・共同編集）は起動しない
const route = currentRoute();
if (route.kind === "calendar") {
  document.title = "シフトをカレンダーに入れる";
  root.render(
    <StrictMode>
      <CalendarPage initialSlug={route.slug} />
    </StrictMode>,
  );
} else startApp();

function startApp() {
  flushSync(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
  store.commit({ push: false });
  startSync();
}
