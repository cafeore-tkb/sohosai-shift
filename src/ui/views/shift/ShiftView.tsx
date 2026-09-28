// 5. シフト調整（spec §2・§4）：ツールバー → 表の枠（#shiftGridWrap の中だけがスクロール）→ 凡例（KeyStrip）。
// 表は役職別（RoleGrid）か個人別（PersonMatrix）、「一覧」なら日ごとのブロックを縦に並べる。
// 押す・ドラッグ・キーボードの受け付けはここ（動きは store の actions）。表で見る（useReveal）もここ1か所。

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import type { FocusEvent, MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { dayGrid, dayLabel, dayName, eventDates, fillOf, flattened, gridView, personNamesFor } from "../../../domain";
import type { Model } from "../../../domain";
import { actions, store, useModel, useModelVersion, useReveal, useUi } from "../../../store";
import type { RevealRequest } from "../../../store";
import { Button, Fill, WorkSurface } from "../../components";
import { BrandTile } from "../../layout/BrandMark";
import { useAudit, useShortNames } from "../../useDerived";
import { clearFootprint, showFootprint } from "./footprint";
import { CELL, cellsInColumn, ensureRoving, scrollCellIntoView, setRoving, slotButtonAt } from "./gridDom";
import { KeyStrip } from "./KeyStrip";
import { Minimap } from "./Minimap";
import { PersonMatrix } from "./PersonMatrix";
import { RoleGrid } from "./RoleGrid";
import s from "./Shift.module.css";
import { ShiftToolbar } from "./ShiftToolbar";
import { useDragMove } from "./useDragMove";
import { useGridKeys } from "./useGridKeys";

const LEGEND_NOTE = { role: "行：時間帯 ／ 列：役職", person: "行：時間 ／ 列：メンバー（担当をクリックで変更）" } as const;

export const ShiftView = memo(function ShiftView({ hidden }: { hidden: boolean }) {
  const m = useModel();
  const version = useModelVersion();
  const dates = eventDates(m);
  const has = dates.length > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  /** キーボード（Enter・Space）で開いた担当者ポップアップの枠：閉じたらそのセルへフォーカスを戻す */
  const keyboardPick = useRef<string | null>(null);
  const { onPointerDown, consumeSuppressedClick } = useDragMove(wrapRef);
  const onKeyDown = useGridKeys(wrapRef);
  // 勤務状況チェックはモーダルではない：開いている間は表の枠をドロワーの左までにする（どの列もドロワーの左へスクロールできる）
  const auditOpen = useUi((u) => u.auditOpen);

  useReveal((req) => reveal(wrapRef.current, req));

  // 旧版と同じく、ページのスクロールでも担当者ポップアップを閉じる
  useEffect(() => {
    const onScroll = () => actions.closePicker();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (consumeSuppressedClick()) return;
    const u = store.ui;
    // 枠の td の余白（ボタンのまわり）を押しても、その枠のボタンを押したのと同じ（タッチの的を td いっぱいに）
    const t = slotButtonAt(e.target as HTMLElement);
    const cell = t.closest<HTMLElement>(CELL);
    if (cell && wrapRef.current) setRoving(wrapRef.current, cell);
    if (u.moveMode === "moving") return actions.clickMoveTarget(t.closest<HTMLElement>("[data-drop-ok]")?.dataset.slotKey ?? null);
    // Shift＋クリック（役職別の枠）：同じ列の範囲を選ぶ（担当者ポップアップは開かない）
    const slot = t.closest<HTMLElement>("[data-pick-slot]")?.dataset.pickSlot;
    if (e.shiftKey && slot) return actions.selectTo(slot);
    const badge = t.closest<HTMLElement>("[data-open-counts]");
    if (badge && !u.movingKey) return actions.toggleCounts(true, badge.dataset.openCounts);
    const pick = t.closest<HTMLElement>("[data-pick-slot],[data-pm-key]");
    if (pick) {
      const key = pick.dataset.pickSlot || pick.dataset.pmKey!;
      if (u.picker?.key === key) return actions.closePicker();
      keyboardPick.current = e.detail === 0 ? key : null;
      actions.openPicker(key);
    }
  };

  // キーボードで表に入ったセルが固定の見出し・時間の列・日の見出しに隠れていたら、見える位置へ（フォーカスの枠が見えるように）。
  // マウス・タッチで押したとき（:focus-visible でない）はスクロールしない（ドラッグの邪魔をしない）
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (wrapRef.current && t.matches(CELL) && t.matches(":focus-visible")) scrollCellIntoView(wrapRef.current, t);
    // 移動モード（「移動…」・M）：フォーカスした移動先に落としたときの足あと
    if (wrapRef.current && store.ui.moveMode === "moving") showFootprint(wrapRef.current, t.closest<HTMLElement>("td[data-drop-ok]"));
  };
  // 移動モード：ポインタを重ねた移動先の足あと（ドラッグ中は useDragMove が出す）
  const onPointerOver = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!wrapRef.current || store.ui.moveMode !== "moving") return;
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-drop-ok]");
    if (td) showFootprint(wrapRef.current, td);
  };

  // 表示位置のミニマップ：店舗が2つ以上ある最初の日の表で（「一覧」の先頭の前日準備は「準備」の帯だけなので、本番の日）
  let minimap = null;
  if (has && m.gridMode === "role") {
    const { viewDates, storeF } = gridView(m, dates);
    for (const d of viewDates) {
      const bands = dayGrid(m, d, storeF)?.stores ?? [];
      if (bands.length < 2) continue;
      minimap = <Minimap bands={bands} date={d} wrapRef={wrapRef} version={version} />;
      break;
    }
  }

  return (
    <WorkSurface
      hidden={hidden}
      data-view="shift"
      data-audit-open={auditOpen ? "" : undefined}
      panelOf="shift"
      className={s.surface}
    >
      <h1 id="shiftTitle" className="sr-only">
        シフト調整
      </h1>
      <ShiftToolbar m={m} dates={dates} minimap={minimap} />
      <div className={s.frame}>
        <div
          id="shiftGridWrap"
          ref={wrapRef}
          className={s.scroll}
          hidden={!has}
          data-grid-mode={m.gridMode}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onPointerOver={onPointerOver}
          onScroll={() => actions.closePicker()}
        >
          {has && !hidden ? <GridBody m={m} dates={dates} version={version} wrapRef={wrapRef} /> : null}
        </div>
        {has && m.gridMode === "role" ? <div className={s.edge} aria-hidden="true" /> : null}
        <div id="shiftGridEmpty" className={s.empty} hidden={has}>
          <BrandTile size={44} />
          <p>アンケート回答CSVを読み込んでください。</p>
          <Button variant="secondary" icon="upload" onClick={() => actions.showView("import")}>
            読み込みへ
          </Button>
        </div>
        <KeyStrip mode={m.gridMode} note={has ? LEGEND_NOTE[m.gridMode] : ""} />
      </div>
      <MovingFlag wrapRef={wrapRef} />
      <InertUnderDrawers />
      <PickerFocusReturn wrapRef={wrapRef} keyboardPick={keyboardPick} />
    </WorkSurface>
  );
});

/** 日ごとの表（「一覧」なら日の見出しをつけて縦に並べる）。Model の版が変わったときだけ描き直す */
const GridBody = memo(
  function GridBody({ m, dates, wrapRef }: { m: Model; dates: string[]; version: number; wrapRef: RefObject<HTMLElement | null> }) {
    const audit = useAudit();
    const shortNames = useShortNames();
    const all = m.gridDate === "all";
    const { viewDates, storeF } = gridView(m, dates);
    const items = flattened(m);

    // Tab で表に入れるセルを1つ残す（描き直しでセルがなくなったとき）
    useLayoutEffect(() => ensureRoving(wrapRef.current));

    const blocks = viewDates.flatMap((d) => {
      const name = dayName(d, dates.indexOf(d));
      const dayItems = items.filter((x) => x.date === d && (!storeF || x.store === storeF));
      let body = null;
      if (m.gridMode === "person") {
        const names = personNamesFor(m, d, storeF);
        if (names.length) body = <PersonMatrix m={m} date={d} dayTitle={name} names={names} audit={audit} shortNames={shortNames} />;
      } else {
        const grid = dayGrid(m, d, storeF);
        if (grid) body = <RoleGrid m={m} date={d} dayTitle={name} grid={grid} audit={audit} shortNames={shortNames} dayItems={dayItems} />;
      }
      if (!body) return [];
      if (!all) return [<div key={d}>{body}</div>];
      const f = fillOf(m, dayItems),
        open = dayItems.filter((x) => !m.assignments[x.key]).length;
      return [
        <section key={d} className={s.dayBlock} aria-label={`${name} ${dayLabel(d)}`}>
          <div className={s.dayTitle}>
            <div className={s.dayTitleIn}>
              <span>{`${name} ${dayLabel(d)}`}</span>
              {f.total ? <Fill rate={Math.round((f.filled / f.total) * 100)} /> : null}
              <small>{`未割当 ${open}`}</small>
            </div>
          </div>
          {body}
        </section>,
      ];
    });
    return blocks.length ? <>{blocks}</> : <p className={s.noSlots}>表示できる枠がありません。</p>;
  },
  (a, b) => a.version === b.version && a.m === b.m,
);

/** 移動中（クリックで移動・ドラッグ）は表に [data-moving]（緑でない枠を薄く）。表全体は描き直さない。終わったら足あとを消す */
function MovingFlag({ wrapRef }: { wrapRef: RefObject<HTMLElement | null> }) {
  const moving = useUi((u) => (u.movingKey ? u.moveMode || "moving" : ""));
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (moving) wrap.dataset.moving = moving;
    else {
      delete wrap.dataset.moving;
      clearFootprint(wrap);
    }
  }, [moving, wrapRef]);
  return null;
}

/** 画面いっぱいのシートになる大きさ（Drawer と同じ）。そのときドロワーは Tab を中で回すので、ここでは何もしない */
const DRAWER_SHEET = "(max-width: 640px), (max-height: 560px)";

/**
 * ドロワー（必要人数・勤務状況チェック）はモーダルではない（旧版と同じ）が、開いている間、その下に完全に隠れた
 * ツールバー・凡例のボタンには Tab で入らないようにする（inert。見えないところで ↵ が押されないように）。
 * 真ん中が見えているもの・表のセルはそのまま。押して操作できるものは変わらない（隠れているものはもともと押せない）
 */
function InertUnderDrawers() {
  const countsOpen = useUi((u) => u.countsOpen);
  const auditOpen = useUi((u) => u.auditOpen);
  const focus = useUi((u) => u.shiftFocus);
  const version = useModelVersion();
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('section[data-view="shift"]');
    if (!root) return;
    const marked = new Set<HTMLElement>();
    const clear = () => {
      for (const el of marked) el.inert = false;
      marked.clear();
    };
    const update = () => {
      clear();
      if (!countsOpen && !auditOpen) return;
      if (matchMedia(DRAWER_SHEET).matches) return;
      const drawers = [...document.querySelectorAll<HTMLElement>("#countDrawer, #auditDrawer")].filter((d) => !d.hidden);
      if (!drawers.length) return;
      // 開くときのアニメーション（横に少し動く）に左右されないよう、右端に付いた幅から左端を出す
      const vw = document.documentElement.clientWidth;
      const boxes = drawers.map((d) => {
        const r = d.getBoundingClientRect();
        return { left: vw - d.offsetWidth, top: r.top, bottom: r.bottom };
      });
      const focusables = root.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]");
      for (const el of focusables) {
        if (el.closest("#shiftGridWrap")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cx = (r.left + r.right) / 2,
          cy = (r.top + r.bottom) / 2;
        if (boxes.some((b) => cx >= b.left && cy >= b.top && cy <= b.bottom)) {
          el.inert = true;
          marked.add(el);
        }
      }
    };
    update();
    addEventListener("resize", update);
    return () => {
      removeEventListener("resize", update);
      clear();
    };
  }, [countsOpen, auditOpen, focus, version]);
  return null;
}

/** キーボードで開いた担当者ポップアップが閉じたら、フォーカスをそのセルへ戻す（見失わないように） */
function PickerFocusReturn({ wrapRef, keyboardPick }: { wrapRef: RefObject<HTMLElement | null>; keyboardPick: RefObject<string | null> }) {
  const open = useUi((u) => u.picker?.key ?? null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = open;
    if (open || !prev || keyboardPick.current !== prev) return;
    keyboardPick.current = null;
    const a = document.activeElement;
    if (a && a !== document.body && !a.closest("#picker")) return;
    const wrap = wrapRef.current;
    const cell = wrap?.querySelector<HTMLElement>(`[data-pick-slot="${CSS.escape(prev)}"], [data-pm-key="${CSS.escape(prev)}"] ${CELL}`);
    if (wrap && cell) {
      setRoving(wrap, cell);
      cell.focus({ preventScroll: true });
    }
  }, [open, wrapRef, keyboardPick]);
  return null;
}

/** 「表で見る」：枠（役職別）またはメンバーの列（個人別）を表の見える位置へ。見つからなければ false（次の描画でもう一度） */
function reveal(wrap: HTMLElement | null, req: RevealRequest): boolean {
  if (!wrap || wrap.hidden || !wrap.isConnected || !wrap.clientWidth) return false;
  if (req.kind === "slot") {
    const td = wrap.querySelector<HTMLElement>(`[data-slot-key="${CSS.escape(req.key)}"]`);
    if (!td) return false;
    scrollCellIntoView(wrap, td, { center: true, smooth: true });
    const cell = td.querySelector<HTMLElement>(CELL);
    if (cell) setRoving(wrap, cell);
    return true;
  }
  const table = wrap.querySelector<HTMLElement>(`table[data-grid-date="${CSS.escape(req.date)}"]`) ?? wrap.querySelector("table");
  if (!table) return false;
  const th = table.querySelector<HTMLElement>(`th[data-pm-name="${CSS.escape(req.name)}"]`);
  if (th) {
    scrollCellIntoView(wrap, th, { center: true, smooth: true });
    // Tab で表に入ったときにその人の列（最初の担当）から始まるように（担当がなければ今のまま）
    const first = cellsInColumn(wrap, th)[0];
    if (first) setRoving(wrap, first);
  }
  return true;
}

