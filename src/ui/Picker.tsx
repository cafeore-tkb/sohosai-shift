// 担当者ポップアップ（#picker）：候補（空いている人／別の枠で勤務中）・名前の絞り込み・長さ・外す・移動
// - いまの担当の行に、その枠の注意（重複・勤務できない時間・条件外・苦手）を出す。候補は条件に合う人だけ（手で移動すればどの枠にも置ける）
// - 選んでいる範囲（Shift＋クリック）の中の枠なら「移動…」は範囲ごと（行に「選択中 Nコマ」）
// - 位置は旧版と同じ決まり：枠の下に出し、入らなければ上、どちらにも入らなければ広いほうに出して高さを縮める
//   （縮めると候補がほとんど見えないときは枠の横）。範囲はアプリバーの下からステータスバーの上まで（全画面中は画面いっぱい）。
//   枠を指す三角（caret）を付ける
// - 幅 640px 以下と、高さ 560px 以下（横向きのスマホ）は下からのシート（つまみ・スクリム。つまみを下へ引くと閉じる）
// - Tab は中で回す。開いたら検索欄へフォーカス（タッチの端末ではキーボードが出ないように、シートそのものへ）
// - 外側を押したら閉じる（App）。スクリムは #picker の中なので、押しても下の表には届かない（押すと閉じるだけ）
// - Esc は store の Esc の順（actions.escape）。↑↓ で候補、↵ で決定（検索欄から）

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  PICK_RUNS,
  SLOT,
  breakRoles,
  breakStoreOf,
  canWorkAt,
  dayName,
  dripBadge,
  eventDates,
  flattened,
  fmt,
  isPinned,
  itemLabel,
  pickerCandidates,
  prefMark,
  requirementNote,
  runTargets,
  slotChoices,
  statusShort,
  dislikes,
  unfitReasons,
} from "../domain";
import type { Audit, Candidate, DripBadge, Item, Model } from "../domain";
import { actions, store, useModel, useModelVersion, useUi } from "../store";
import { Button, Drip, Icon, IconButton, KbdHint, Mark, Pill, SearchInput, SegButton, Segmented, ShopTag, StatusTag, cx } from "./components";
import { trapTab } from "./components/focus";
import styles from "./Picker.module.css";
import { useAudit } from "./useDerived";
import { WorkloadTag } from "./WorkloadTag";

/** 「昼食へ」「休憩へ」の長さ [枠数, 表示] */
const BREAK_RUNS: readonly (readonly [number, string])[] = [
  [1, "30分"],
  [2, "1時間"],
];

const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
/** 下からのシートにする画面（Picker.module.css と同じ） */
const SHEET = "(max-width: 640px), (max-height: 560px)";
const isSheet = () => typeof matchMedia === "function" && matchMedia(SHEET).matches;
/** 枠と吹き出しのすき間・画面の端からの余白 */
const GAP = 6,
  SIDE_GAP = 12,
  EDGE = 8,
  MIN_H = 160,
  /** トーストの線：ステータスバーの上 18px のトースト置き場＋トーストの高さ（spec §4 Picker）。この下には出さない */
  TOAST_LINE = 72,
  /** 下にこれだけあいていれば下に出す（見出し・検索・長さ＋候補5人ほど） */
  BELOW_ROOM = 520;

/** 押した枠（役職別の担当者ボタン、または個人別のセル） */
function anchorOf(key: string): HTMLElement | null {
  const k = CSS.escape(key);
  return document.querySelector<HTMLElement>(`#shiftGridWrap [data-pick-slot="${k}"], #shiftGridWrap [data-pm-key="${k}"]`);
}

/** アプリバー・ステータスバーの高さ（トークン。開くたびに読むと重いので1回だけ） */
let bars: { appbar: number; statusbar: number } | null = null;
function barHeights() {
  if (!bars) {
    const cs = getComputedStyle(document.documentElement),
      px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
    bars = { appbar: px("--appbar-h"), statusbar: px("--statusbar-h") };
  }
  return bars;
}

/**
 * spec §4 Picker：下に BELOW_ROOM 以上あいていれば枠の下。なければ枠の横（右、入らなければ左）。
 * 横にも入らないとき（狭い画面）は旧版の決まり：上に入れば上、どちらにも入らなければ広いほう（高さを縮める）。
 * 上に出すときは下端を枠に合わせる（絞り込みで短くなっても枠から離れない）
 */
function placePicker(el: HTMLElement, anchor: HTMLElement): void {
  for (const p of ["left", "top", "bottom", "maxHeight"] as const) el.style[p] = "";
  el.removeAttribute("data-place");
  if (isSheet()) return;
  const focus = store.ui.shiftFocus,
    { appbar, statusbar } = barHeights();
  const topLimit = (focus ? 0 : appbar) + EDGE,
    bottomLimit = innerHeight - (focus ? 0 : statusbar) - TOAST_LINE;
  const r = anchor.getBoundingClientRect(),
    w = el.offsetWidth,
    h = el.offsetHeight,
    below = bottomLimit - r.bottom - GAP,
    above = r.top - GAP - topLimit;
  let place: "below" | "above" | "right" | "left" = h <= below ? "below" : h <= above ? "above" : below >= above ? "below" : "above";
  if (below >= Math.min(h, BELOW_ROOM)) place = "below";
  else if (r.right + SIDE_GAP + w <= innerWidth - EDGE) place = "right";
  else if (r.left - SIDE_GAP - w >= EDGE) place = "left";
  el.dataset.place = place;
  if (place === "right" || place === "left") {
    // 枠より少し上から、トーストの線まで（mockup の layout()）。枠が下のほうで高さが足りなければ上へずらす
    let top = Math.max(topLimit, r.top - 96);
    const want = Math.min(h, BELOW_ROOM);
    if (bottomLimit - top < want) top = Math.max(topLimit, bottomLimit - want);
    const maxH = bottomLimit - top;
    if (h > maxH) el.style.maxHeight = `${maxH}px`;
    el.style.top = `${top}px`;
    el.style.left = `${place === "right" ? r.right + SIDE_GAP : r.left - SIDE_GAP - w}px`;
    el.style.setProperty("--caret-y", `${Math.min(Math.max(14, r.top + r.height / 2 - top - 6), Math.min(h, maxH) - 26)}px`);
    return;
  }
  const down = place === "below",
    room = down ? below : above;
  if (h > room) el.style.maxHeight = `${Math.max(MIN_H, room)}px`;
  const left = Math.min(Math.max(EDGE, r.left - 20), innerWidth - w - EDGE);
  el.style.left = `${left}px`;
  if (down) el.style.top = `${r.bottom + GAP}px`;
  else el.style.bottom = `${innerHeight - r.top + GAP}px`;
  el.style.setProperty("--caret", `${Math.min(Math.max(14, r.left + r.width / 2 - left - 6), w - 26)}px`);
}

export function Picker() {
  const m = useModel();
  const version = useModelVersion();
  const picker = useUi((u) => u.picker);
  const pickRun = useUi((u) => u.pickRun);
  const selection = useUi((u) => u.selection);
  const audit = useAudit();
  const ref = useRef<HTMLDivElement>(null);
  const item = useMemo(() => (picker ? flattened(m).find((x) => x.key === picker.key) : undefined), [m, picker, version]);
  const lists = useMemo(() => (picker && item ? pickerCandidates(m, item, picker.q) : null), [m, item, picker, version]);
  const all = lists ? [...lists.free, ...lists.busy] : [];
  const active = Math.min(picker?.active ?? 0, Math.max(0, all.length - 1));
  const open = !!(picker && item && lists);

  // 枠がなくなったら閉じる
  useEffect(() => {
    if (picker && !item) actions.closePicker();
  }, [picker, item]);

  // 選んでいる候補を見える位置に（開くたびに候補の一覧は作り直すので、先頭から）
  useLayoutEffect(() => {
    ref.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, picker?.q, pickRun, picker?.seq]);

  // 開いたとき：位置合わせ・検索欄へフォーカス。閉じたとき：フォーカスが中にあれば押した枠へ戻す
  useLayoutEffect(() => {
    const el = ref.current;
    if (!picker || !el) return;
    const key = picker.key;
    const relayout = () => {
      const anchor = anchorOf(key);
      if (anchor) placePicker(el, anchor);
    };
    relayout();
    // タッチの端末：検索欄にフォーカスするとキーボードが出るので、ポップアップ（シート）そのものへ
    if (coarse) el.querySelector<HTMLElement>("[data-pk-panel]")?.focus({ preventScroll: true });
    else el.querySelector<HTMLInputElement>("#pkSearch")?.focus({ preventScroll: true });
    addEventListener("resize", relayout);
    return () => {
      removeEventListener("resize", relayout);
      const a = document.activeElement;
      if (el.contains(a) || (!coarse && (!a || a === document.body))) anchorOf(key)?.focus({ preventScroll: true });
    };
  }, [picker?.seq]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!picker) return;
    if (trapTab(e, e.currentTarget)) return;
    // 日本語の変換中（↵ は変換の確定、↑↓ は候補の選択）は IME に任せる
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      actions.setPickerActive(Math.max(0, Math.min(all.length - 1, active + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && (e.target as HTMLElement).id === "pkSearch") {
      e.preventDefault();
      const c = all[active];
      if (c) actions.pickName(c.name);
    }
  };

  return (
    <div
      id="picker"
      ref={ref}
      className={styles.root}
      role="dialog"
      aria-labelledby={open ? "pkTitle" : undefined}
      aria-describedby={open ? "pkSub" : undefined}
      aria-label={open ? undefined : "担当者を選ぶ"}
      hidden={!open}
      onKeyDown={onKeyDown}
    >
      {open ? <div className={styles.scrim} aria-hidden="true" onClick={actions.closePicker} /> : null}
      {open ? (
        <PickerBody
          key={picker!.seq}
          m={m}
          item={item!}
          q={picker!.q}
          free={lists!.free}
          busy={lists!.busy}
          active={active}
          pickRun={pickRun}
          audit={audit}
          range={selection.length > 1 && selection.includes(item!.key) ? selection : null}
        />
      ) : null}
    </div>
  );
}

/** いまの担当の注意（表のセルの色と同じ優先順。苦手は重ねて出す） */
function currentIssues(m: Model, item: Item, name: string, audit: Audit): { tone: "danger" | "off" | "unfit" | "dislike"; text: string; title?: string }[] {
  const out: { tone: "danger" | "off" | "unfit" | "dislike"; text: string; title?: string }[] = [];
  if (audit.conflicts.has(item.key)) out.push({ tone: "danger", text: "重複", title: "同じ時間に別の枠にも入っています" });
  if (!canWorkAt(m, name, item)) out.push({ tone: "off", text: "勤務できない時間", title: "勤務可能表では × の時間です" });
  const unfit = unfitReasons(m, name, item);
  if (unfit.length) out.push({ tone: "unfit", text: "条件外", title: `この枠の条件に合いません（${unfit.join("・")}）` });
  if (dislikes(m, name, item.role)) out.push({ tone: "dislike", text: "苦手" });
  return out;
}

/** シートのつまみ・見出しを下へ引くと閉じる（スマホ） */
function useSheetDrag() {
  const drag = useRef<{ id: number; y: number; dy: number; el: HTMLElement } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!isSheet() || e.button !== 0 || (e.target as Element).closest("button,input")) return;
    const el = e.currentTarget.closest<HTMLElement>(`.${styles.panel}`);
    if (!el) return;
    drag.current = { id: e.pointerId, y: e.clientY, dy: 0, el };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dy = Math.max(0, e.clientY - d.y);
    d.el.style.transform = d.dy ? `translateY(${d.dy}px)` : "";
    d.el.style.transition = "none";
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    d.el.style.transition = "";
    if (d.dy > 80) actions.closePicker();
    else d.el.style.transform = "";
  };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}

function DripOf({ badge }: { badge: DripBadge | null }) {
  if (!badge) return null;
  return <Drip kind={badge.all ? "both" : badge.cls === "hot" ? "hot" : "ice"} text={badge.text} title={badge.title} />;
}

function PickerBody({
  m,
  item,
  q,
  free,
  busy,
  active,
  pickRun,
  audit,
  range,
}: {
  m: Model;
  item: Item;
  q: string;
  free: Candidate[];
  busy: Candidate[];
  active: number;
  pickRun: number;
  audit: Audit;
  /** 選んでいる範囲（この枠を含む2つ以上）。「移動…」は範囲ごと */
  range: readonly string[] | null;
}) {
  const chosen = m.assignments[item.key] || "";
  const issues = chosen ? currentIssues(m, item, chosen, audit) : [];
  const rangeItems = range ? flattened(m).filter((x) => range.includes(x.key)).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const drag = useSheetDrag();
  const drip = !!slotChoices[item.role];
  const total = free.length + busy.length;
  // 前日準備など、その日に昼食・休憩の係があれば「昼食へ」「休憩へ」（いま入っている係は除く）
  const breaks = breakRoles.filter((r) => r !== item.role && breakStoreOf(item.date, r) !== undefined);
  return (
    <div className={styles.panel} data-pk-panel="" tabIndex={-1}>
      <div className={styles.handle} aria-hidden="true" {...drag} />
      <div className={styles.head} {...drag}>
        {item.store ? <ShopTag shop={item.store} className={styles.shop} /> : null}
        <div className={styles.headText}>
          <h2 id="pkTitle" className={styles.title}>
            {itemLabel({ ...item, store: "" })}
          </h2>
          <div id="pkSub" className={styles.sub}>{`${dayName(item.date, eventDates(m).indexOf(item.date))} ${item.start}–${item.end}${requirementNote(m, item)}`}</div>
        </div>
        <IconButton icon="x" label="閉じる（Esc）" size="sm" className={styles.close} data-pk-close="" onClick={actions.closePicker} />
      </div>
      {chosen ? (
        <div className={styles.current}>
          <span className={styles.currentLabel}>
            いまの担当<b>{chosen}</b>
          </span>
          {drip ? <DripOf badge={dripBadge(m, chosen)} /> : null}
          {issues.map((x) => (
            <Pill key={x.text} tone={x.tone} size="sm" title={x.title} className={styles.issue}>
              {x.text}
            </Pill>
          ))}
          <span className={styles.grow} />
          <Button
            size="sm"
            icon="move"
            data-pk-move=""
            title={rangeItems.length > 1 ? `選んでいる ${rangeItems.length}コマをまとめて移動` : "どの枠へも移動できます（人がいれば入れ替え）"}
            onClick={actions.startMove}
          >
            移動…
          </Button>
          <Button
            size="sm"
            icon="lock"
            data-pk-pin=""
            aria-pressed={isPinned(m, item.key)}
            title={
              isPinned(m, item.key)
                ? "固定を外す（自動割当で変わるようになります）"
                : `${rangeItems.length > 1 ? `選んでいる ${rangeItems.length}コマ` : `${chosen} が続けて入っているコマ`}を固定（自動割当で変えません）`
            }
            onClick={actions.togglePinPicked}
          >
            {isPinned(m, item.key) ? "固定を外す" : "固定"}
          </Button>
          <Button size="sm" danger data-pk-clear="" onClick={actions.clearPicked}>
            外す
          </Button>
        </div>
      ) : null}
      {chosen && breaks.length ? (
        <div className={styles.breaks} role="group" aria-label={`${chosen} を${breaks.join("・")}へ`}>
          <span className={styles.breaksLabel}>{breaks.join("・")}へ</span>
          {breaks.flatMap((role) =>
            BREAK_RUNS.map(([n, label]) => (
              <Button
                key={`${role}${n}`}
                size="sm"
                data-pk-break={`${role}|${n}`}
                title={`${chosen} を ${item.start} から${label} ${role}に入れます（同じ時間の担当からは外します）`}
                onClick={() => actions.breakPicked(role, n)}
              >
                {`${role} ${label}`}
              </Button>
            )),
          )}
        </div>
      ) : null}
      {chosen && rangeItems.length > 1 ? (
        <p className={styles.range}>
          <Icon name="grid" size={14} />
          {`選択中 ${rangeItems.length}コマ（${rangeItems[0].start}–${rangeItems[rangeItems.length - 1].end}）：「移動…」「固定」でまとめて`}
        </p>
      ) : null}
      <div className={styles.tools}>
        <SearchInput
          id="pkSearch"
          className={styles.search}
          wrapClassName={styles.searchWrap}
          placeholder="名前で絞り込み"
          aria-label="名前で絞り込み"
          aria-controls="pkList"
          aria-activedescendant={total ? `pkOpt${active}` : undefined}
          value={q}
          onChange={(e) => actions.setPickerQuery(e.target.value)}
        />
        <div className={styles.runs} title="同じ役職の次の枠にも続けて割り当てます（標準1時間。空き・条件・重複がある枠で止まります）">
          <span className={styles.runsLabel}>長さ</span>
          <Segmented label="長さ" size="sm" className={styles.runSeg}>
            {PICK_RUNS.map(([n, label]) => (
              <SegButton key={label} pressed={n === pickRun} className={styles.runBtn} data-pk-run={String(n)} onClick={() => actions.setPickRun(n)}>
                {label}
              </SegButton>
            ))}
          </Segmented>
        </div>
      </div>
      <div id="pkList" className={styles.list} role="listbox" aria-label="候補">
        {total ? (
          <>
            {free.length ? (
              <div role="group" aria-label={`空いている人 ${free.length}人`}>
                <div className={styles.sec} aria-hidden="true">
                  空いている人<em>{free.length}</em>
                </div>
                {free.map((c, i) => (
                  <PickerRow key={c.name} m={m} c={c} item={item} i={i} active={active} pickRun={pickRun} drip={drip} />
                ))}
              </div>
            ) : null}
            {busy.length ? (
              <div role="group" aria-label={`別の枠で勤務中 ${busy.length}人`}>
                <div className={cx(styles.sec, styles.secBusy)} aria-hidden="true">
                  <Icon name="alert" size={14} />
                  別の枠で勤務中<em>{busy.length}</em>
                </div>
                {busy.map((c, i) => (
                  <PickerRow key={c.name} m={m} c={c} item={item} i={free.length + i} active={active} pickRun={pickRun} drip={drip} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.empty}>
            {q ? (
              "該当するメンバーがいません"
            ) : (
              <>
                この時間・役職の条件に合うメンバーがいません
                <small>勤務可能時間・所属店舗・ステータス・ドリップ種類で絞り込んでいます。</small>
              </>
            )}
          </p>
        )}
      </div>
      <div className={styles.foot} aria-hidden="true">
        <KbdHint keys={["↑", "↓"]}>選択</KbdHint>
        <KbdHint keys={["↵"]}>決定</KbdHint>
        <KbdHint keys={["Esc"]}>閉じる</KbdHint>
        <span className={styles.grow} />
        <span className={styles.legend}>
          <span>
            <Mark kind="want" className={styles.legendMark} /> 希望
          </span>
          <span>
            <Mark kind="dislike" className={styles.legendMark} /> 苦手
          </span>
        </span>
      </div>
    </div>
  );
}

/** 「30分」「1時間」「1.5時間」 */
const runLength = (slots: number): string => {
  const min = slots * SLOT;
  return min < 60 ? `${min}分` : `${min / 60}時間`;
};

function PickerRow({
  m,
  c,
  item,
  i,
  active,
  pickRun,
  drip,
}: {
  m: Model;
  c: Candidate;
  item: Item;
  i: number;
  active: number;
  pickRun: number;
  drip: boolean;
}) {
  const busy = c.busyAt.length > 0,
    run = pickRun > 1 && !busy ? runTargets(m, item, c.name, pickRun) : null;
  const st = m.memberStatuses[c.name],
    pref = prefMark(m, c.name, item.role),
    on = i === active;
  return (
    <button
      type="button"
      id={`pkOpt${i}`}
      role="option"
      aria-selected={on}
      tabIndex={-1}
      className={cx(styles.item, busy && styles.busy, on && styles.active)}
      data-pk-name={c.name}
      data-i={i}
      onClick={() => actions.pickName(c.name)}
    >
      <span className={styles.gut}>
        {pref ? <Mark kind={pref === "★" ? "want" : "dislike"} title={pref === "★" ? "やりたい役職" : "苦手な役職"} /> : null}
      </span>
      <span className={styles.line}>
        <span className={styles.name}>{c.name}</span>
        {drip ? <DripOf badge={dripBadge(m, c.name)} /> : null}
        {statusShort[st] ? <StatusTag top={st === "上級生"}>{statusShort[st]}</StatusTag> : null}
        {/* 働ける量の目安（勤務中の人は移動なので時間は増えない。昼食・休憩は勤務時間に入らない） */}
        <WorkloadTag m={m} name={c.name} hours={c.hours + (busy || breakRoles.includes(item.role) ? 0 : 0.5)} />
      </span>
      <span className={styles.hours} title="この日の勤務時間">
        {fmt(c.hours)}
      </span>
      <span className={styles.meta}>
        {busy ? (
          <>
            <Icon name="alert" size={14} />
            <span className={styles.metaText}>
              <span className={styles.unit}>
                <b>{c.busyAt.map((x) => `${x.start}〜 ${itemLabel(x)}`).join("、")}</b> で勤務中
              </span>{" "}
              <span className={styles.unit}>→ こちらへ移動</span>
            </span>
          </>
        ) : (
          <>
            <span className={styles.unit}>{`参加 ${c.windows}`}</span>
            {run ? (
              <b className={cx(styles.unit, styles.to, run.length < pickRun && pickRun !== Infinity && styles.toShort)}>
                {`→ ${run[run.length - 1].end} まで ${runLength(run.length)}`}
              </b>
            ) : null}
          </>
        )}
      </span>
    </button>
  );
}
