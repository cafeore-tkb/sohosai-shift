// 画面全体（アプリの枠）：アプリバー（タブ・スマホでは下のタブバー）→ ページ → ステータスバー、
// その上に重なるもの（ドロワー・担当者ポップアップ・ヘルプ・共同編集のダイアログ・トースト・全画面の案内）。
// 各タブの中身は views/。ページの入れ物は components の <Page>（タブ 1–4）と <WorkSurface>（タブ 5）。

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { actions, handleKeyDown, store, useModel, useUi } from "../store";
import { AuditDrawer } from "./AuditDrawer";
import { IconSprite, panelIdOf } from "./components";
import { CountsDrawer } from "./CountsDrawer";
import { AppBar } from "./layout/AppBar";
import { FocusHint } from "./layout/FocusHint";
import { HelpPopover } from "./layout/HelpPopover";
import styles from "./layout/Shell.module.css";
import { StatusBar } from "./layout/StatusBar";
import { ToastDock } from "./layout/ToastDock";
import { Picker } from "./Picker";
import { ShareDialog } from "./ShareDialog";
import { AvailabilityView } from "./views/availability/AvailabilityView";
import { ImportView } from "./views/import/ImportView";
import { MembersView } from "./views/members/MembersView";
import { RulesView } from "./views/rules/RulesView";
import { ShiftView } from "./views/shift/ShiftView";

export function App() {
  return (
    <>
      <IconSprite />
      <BodyState />
      <GlobalKeys />
      <AppBar />
      <Main />
      <StatusBar />
      <AuditDrawer />
      <CountsDrawer />
      <ShareDialog />
      <Picker />
      <HelpPopover />
      <ToastDock />
      <FocusHint />
    </>
  );
}

const Imp = memo(ImportView),
  Avail = memo(AvailabilityView),
  Members = memo(MembersView),
  Rules = memo(RulesView);

/** ページ（表示中のタブだけ見せる。ほかは hidden で残す） */
function Main() {
  const view = useModel().view;
  usePanelFocus(view);
  return (
    <main className={styles.main} data-view={view}>
      <Imp hidden={view !== "import"} />
      <Avail hidden={view !== "availability"} />
      <Members hidden={view !== "members"} />
      <Rules hidden={view !== "rules"} />
      <ShiftView hidden={view !== "shift"} />
    </main>
  );
}

/**
 * タブが替わったとき、フォーカスが消えた（body）か隠れたページの中に残っていたら（1–5 キー・「シフト調整へ進む」など）、
 * 新しいページ（role=tabpanel）へ移す：次の Tab がそのページに入り、読み上げもページ名を伝える。
 * タブを押したとき（フォーカスはタブ）は動かさない。tabindex は移すときだけ付け、外れたら消す（押しても本文にフォーカスが残らない）
 */
function usePanelFocus(view: string) {
  const prev = useRef(view);
  useEffect(() => {
    if (prev.current === view) return;
    prev.current = view;
    const a = document.activeElement as HTMLElement | null;
    const lost = !a || a === document.body || !a.isConnected || !!a.closest("[hidden]") || !a.getClientRects().length;
    if (!lost) return;
    const panel = document.getElementById(panelIdOf(view));
    if (!panel || panel.hidden) return;
    panel.tabIndex = -1;
    panel.addEventListener("blur", () => panel.removeAttribute("tabindex"), { once: true });
    panel.focus({ preventScroll: true });
  }, [view]);
}

/**
 * body のクラスと data-view：is-focus（全画面。アプリバー・ステータスバーを隠す）、
 * is-painting（勤務可能表の塗り替え中）・is-dragging（シフト表のドラッグ中）はカーソルの形だけ。
 */
function BodyState() {
  const view = useModel().view;
  const focus = useUi((u) => u.shiftFocus);
  const painting = useUi((u) => u.painting);
  const dragging = useUi((u) => u.moveMode === "dragging");
  useLayoutEffect(() => {
    const b = document.body;
    b.dataset.view = view;
    b.classList.toggle("is-focus", focus);
    b.classList.toggle("is-painting", painting);
    b.classList.toggle("is-dragging", dragging);
  }, [view, focus, painting, dragging]);
  return null;
}

/** キーボード（⌘Z・Esc・1–5・F・?・/ は store/keys.ts）と、担当者ポップアップの外を押したら閉じる */
function GlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => void handleKeyDown(e);
    const onPointerDown = (e: PointerEvent) => {
      if (store.ui.picker && !(e.target as Element).closest?.("#picker,[data-pick-slot]")) actions.closePicker();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
  return null;
}
