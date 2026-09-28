// アプリバー（上 52px）：ロゴ・共同編集の状態（#modeBadge）・タブ（1–5）・共同編集／印刷ビュー／CSVを書き出す。
// 「1つの DOM」（spec §5）：タブはスマホでは下のタブバーに、印刷ビュー・CSV は ⋯ メニューの中に、CSS で並べ替えるだけ。
// id の付いた要素は常に1つ。

import { useLayoutEffect } from "react";
import type { KeyboardEvent } from "react";
import { dataViews } from "../../domain";
import type { View } from "../../domain";
import { TAB_ORDER, actions, store, useModel, useUi } from "../../store";
import { Button, Icon, Overflow, Pill, panelIdOf } from "../components";
import type { IconName } from "../components";
import { tabBarRef } from "../domRefs";
import { useStats } from "../useDerived";
import styles from "./AppBar.module.css";
import { BrandTile } from "./BrandMark";
import { SyncBadge } from "./SyncBadge";

interface TabDef {
  label: string;
  /** タブレット・スマホの短い名前 */
  short: string;
  icon: IconName;
  /** スマホのアプリバーに出すページ名（読み込みはロゴのまま） */
  pageTitle?: string;
}

const TABS: Readonly<Record<View, TabDef>> = {
  import: { label: "読み込み", short: "読み込み", icon: "upload" },
  availability: { label: "勤務可能表", short: "勤務可能", icon: "cal", pageTitle: "勤務可能表" },
  members: { label: "メンバー", short: "メンバー", icon: "users", pageTitle: "メンバー" },
  rules: { label: "役職ルール", short: "ルール", icon: "shield", pageTitle: "役職ルール" },
  shift: { label: "シフト調整", short: "シフト", icon: "grid", pageTitle: "シフト調整" },
};

/** データがないときの鍵付きタブの説明（title。2行目は何をすれば開くか） */
const LOCKED_TAB_TITLE = "データの読み込み後に使えます\nCSVかサンプルを読み込むと 2・3・5 が開きます";

/** タブの並びの ←→・Home・End：開けるタブの間でフォーカスを動かす（Enter・Space で開く。ARIA のタブの操作） */
function onTabsKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || e.altKey || e.metaKey || e.ctrlKey) return;
  const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]:not(:disabled)")];
  if (!tabs.length) return;
  e.preventDefault();
  const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (Math.max(0, i) + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
}

export function AppBar() {
  const m = useModel();
  const has = m.availability.length > 0;
  const menuOpen = useUi((u) => u.menu === "appbar");
  const pageTitle = TABS[m.view].pageTitle;

  // 旧版の CSS（まだ移行していない画面の固定見出し）が使う --tabbar-h ＝上に固定されている帯の高さ
  useLayoutEffect(() => {
    const el = tabBarRef.current!;
    const sync = () => document.documentElement.style.setProperty("--tabbar-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className={styles.appbar} ref={tabBarRef}>
      <div className={styles.brand}>
        <BrandTile size={30} className={styles.mark} />
        <span className={styles.word} data-has-title={pageTitle ? "" : undefined}>
          <b>Shift Maker</b>
          <small>CAFEORE · 雙峰祭</small>
        </span>
        {pageTitle ? (
          <span className={styles.pageTitle} aria-hidden="true">
            {pageTitle}
          </span>
        ) : null}
        <SyncBadge />
      </div>

      <nav className={styles.tabs} role="tablist" aria-label="画面の切り替え" onKeyDown={onTabsKeyDown}>
        {TAB_ORDER.map((view, i) => (
          <Tab key={view} view={view} n={i + 1} selected={view === m.view} disabled={!has && dataViews.includes(view)} />
        ))}
      </nav>

      <div className={styles.actions}>
        <Button id="shareBtn" variant="secondary" icon="users" iconOnly="1023" className={styles.share} title="共同編集" onClick={() => store.shareActions?.open()}>
          共同編集
        </Button>
        <Overflow
          menuId="appbar"
          open={menuOpen}
          onOpenChange={(o) => actions.setMenu(o ? "appbar" : null)}
          label="その他（印刷ビュー・CSVを書き出す）"
        >
          <Button id="printExportBtn" variant="ghost" icon="printer" iconOnly="1439" title="印刷ビュー" disabled={!has} onClick={actions.printView}>
            印刷ビュー
          </Button>
          <Button id="exportBtn" variant="ghost" icon="download" iconOnly="1439" title="CSVを書き出す" disabled={!has} onClick={actions.exportShiftCsv}>
            CSVを書き出す
          </Button>
        </Overflow>
      </div>
    </header>
  );
}

function Tab({ view, n, selected, disabled }: { view: View; n: number; selected: boolean; disabled: boolean }) {
  const t = TABS[view];
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${view}`}
      className={styles.tab}
      data-tab={view}
      aria-selected={selected}
      aria-controls={panelIdOf(view)}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      title={disabled ? LOCKED_TAB_TITLE : `${t.label}（${n}）`}
      onClick={() => !disabled && actions.showView(view)}
    >
      <span className={styles.tabN} aria-hidden="true">
        {n}
      </span>
      <Icon name="lock" size={14} className={styles.tabLock} />
      <Icon name={t.icon} size={20} className={styles.tabIcon} />
      <span className={styles.full}>{t.label}</span>
      <span className={styles.short}>{t.short}</span>
      {view === "members" ? <MemberCount /> : view === "shift" ? <ShiftCounts /> : null}
    </button>
  );
}

/** メンバーの人数（#memberTabCount） */
function MemberCount() {
  const { staff } = useStats();
  return (
    <Pill id="memberTabCount" tone="neutral" size="sm" className={styles.badge} hidden={!staff}>
      {staff}
    </Pill>
  );
}

/** 未割当（#shiftTabCount、3日分の合計）と重複（1件以上のときだけ） */
function ShiftCounts() {
  const has = useModel().availability.length > 0;
  const { open, conflicts } = useStats();
  return (
    <>
      <Pill id="shiftTabCount" tone="open" size="sm" className={styles.badge} hidden={!has || !open}>
        <span className={styles.full}>未割当 </span>
        {open}
      </Pill>
      {has && conflicts ? (
        <Pill tone="danger" size="sm" className={styles.conflictBadge}>
          {`重複 ${conflicts}`}
        </Pill>
      ) : null}
    </>
  );
}
