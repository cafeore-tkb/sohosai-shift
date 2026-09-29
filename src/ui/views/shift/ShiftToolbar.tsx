// シフト調整のツールバー（spec §2・§5）。1つの DOM を CSS の order で並べ替える：
//  - PC 1行目：日付 ─ 割当をクリア │ 必要人数を設定・勤務状況チェック・自動割当（primary は1つだけ）
//  - PC 2行目：店舗 │ 役職別/個人別・フルネーム ─ 表示位置・全画面
//  - スマホ：上の帯（この日の未割当）→ 日付 → 自動割当＋アイコン（必要人数・チェック・全画面・⋯）→ 役職別/個人別＋店舗
// ⋯ メニュー（Overflow）は PC ではその場に並び、スマホでは #clearBtn・#fullNameToggle をそのまま中に入れる（同じ要素）。
// Tab の順は PC の見た目の順（1行目 → 2行目：店舗 → 役職別/個人別 → フルネーム → 表示位置 → 全画面）。
// そのため #fullNameToggle は PC では役職別/個人別の後ろ、スマホでは ⋯ の中に置く（どちらか一方だけを描く）。

import { Fragment, useRef, useState } from "react";
import type { ReactNode } from "react";
import { pinnedCount } from "../../../domain";
import type { Model } from "../../../domain";
import { actions, store, useUi } from "../../../store";
import { Button, Chip, ChipCount, ChipGroup, Fill, Icon, Meter, Overflow, Pill, SegButton, SegSep, Segmented, Switch, cx, useEdgeFade, useMedia } from "../../components";
import { DEFAULT_FOOTER_NOTE } from "../../layout/StatusBar";
import { useAudit, useAuditSummary, useStats } from "../../useDerived";
import { auditBadge, dayOptions, storeOptions, viewSummary } from "./toolbarModel";
import s from "./Toolbar.module.css";

export interface ShiftToolbarProps {
  m: Model;
  dates: string[];
  /** 表示位置のミニマップ（役職別で店舗が2つ以上のときだけ） */
  minimap: ReactNode;
}

export function ShiftToolbar({ m, dates, minimap }: ShiftToolbarProps) {
  const focus = useUi((u) => u.shiftFocus);
  const menuOpen = useUi((u) => u.menu === "shift");
  const countsOpen = useUi((u) => u.countsOpen);
  const auditOpen = useUi((u) => u.auditOpen);
  const audit = useAudit();
  const { missing, offs, unfits } = useAuditSummary();
  const days = dayOptions(m, dates);
  const stores = storeOptions(m, dates);
  const badge = auditBadge(audit.conflicts.size, offs.length, unfits.length, missing.length);
  const phone = useMedia("(max-width: 640px)");
  // 641〜1240px は3行（A：日付 ─ 全画面、B：役職別/個人別・フルネーム ─ クリア│人数・チェック・自動割当、C：店舗 ─ 表示位置）。
  // Tab の順を見た目の順に合わせるため、全画面と役職別/個人別・フルネームはその幅では前の位置に描く
  const tablet = useMedia("(max-width: 1240px) and (min-width: 641px)");
  // スマホでは日付と「役職別/個人別＋店舗」の行が横にスクロールする：続きのある端をぼかす
  const datesRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEdgeFade(datesRef, { enabled: phone });
  useEdgeFade(filtersRef, { enabled: phone });
  // フルネームと「動かしたら固定」（同じ場所に並べる）
  const fullName = (
    <>
      <Switch
        id="fullNameToggle"
        checked={!!m.fullNames}
        onChange={(e) => actions.setFullNames(e.target.checked)}
        label="フルネーム"
        wrapClassName={s.fullName}
      />
      <Switch
        id="pinMovedToggle"
        checked={!!m.pinMoved}
        onChange={(e) => actions.setPinMoved(e.target.checked)}
        label="動かしたら固定"
        title="オンのあいだ、手で入れた・動かしたコマをすべて固定します（自動割当で変えません）。オフでも、動かしたあとの「固定」で固定できます"
        wrapClassName={s.fullName}
      />
    </>
  );
  const pins = pinnedCount(m);

  const modes = (
    <Segmented label="表示の切り替え" size="sm" id="gridModes" className={s.modes}>
      <SegButton pressed={m.gridMode === "role"} data-grid-mode="role" icon="grid" onClick={() => actions.setGridMode("role")}>
        役職別
      </SegButton>
      <SegButton pressed={m.gridMode === "person"} data-grid-mode="person" icon="person" onClick={() => actions.setGridMode("person")}>
        個人別
      </SegButton>
    </Segmented>
  );
  const fullscreen = (
    <Button
      id="fullscreenBtn"
      variant={focus ? "secondary" : "ghost"}
      size="sm"
      icon={focus ? "back" : "max"}
      iconOnly="640"
      kbd={focus ? "Esc" : undefined}
      title={focus ? "通常表示に戻る（Esc）" : "全画面（F／Esc で戻る）"}
      className={cx(s.fullscreen, focus && s.fullscreenBack)}
      onClick={actions.toggleFullscreen}
    >
      {focus ? "← 通常表示に戻る" : "全画面"}
    </Button>
  );

  return (
    <div className={s.toolbar} data-all={m.gridDate === "all" ? "" : undefined}>
      {dates.length ? <MobileSummary m={m} dates={dates} /> : null}

      <div className={s.dates} ref={datesRef}>
        <Segmented label="日付" id="gridDates" className={s.dateSeg}>
          {days.map((d) => (
            <Fragment key={d.value}>
              {d.value === "all" ? <SegSep /> : null}
              <SegButton
                pressed={m.gridDate === d.value}
                data-grid-date={d.value}
                title={d.title}
                sub={d.sub || undefined}
                hideSubAt="1400"
                badge={d.rate === null ? undefined : <Fill rate={d.rate} />}
                onClick={() => actions.setGridDate(d.value)}
              >
                <span className={s.dayFull}>{d.label}</span>
                <span className={s.dayShort}>{d.short}</span>
              </SegButton>
            </Fragment>
          ))}
        </Segmented>
      </div>

      <span className={s.grow1} aria-hidden="true" />
      {tablet ? fullscreen : null}
      {tablet ? modes : null}
      {tablet ? fullName : null}

      <Overflow
        menuId="shiftMore"
        open={menuOpen}
        onOpenChange={(o) => actions.setMenu(o ? "shift" : null)}
        label="その他（割当をクリア・フルネーム・凡例と操作ヘルプ）"
        triggerVariant="secondary"
        className={s.more}
      >
        <Button
          id="clearBtn"
          variant="ghost"
          danger
          icon="trash"
          shortLabel="クリア"
          shortAt="1279"
          title="すべての割当をクリア（固定も外れます。確認あり・元に戻せません）"
          className={s.clear}
          onClick={actions.clearAssignments}
        >
          割当をクリア
        </Button>
        {pins ? (
          <button type="button" className={s.helpItem} id="clearPinsBtn" onClick={actions.clearAllPins}>
            <Icon name="lock" />
            {`固定をすべて外す（${pins}コマ）`}
          </button>
        ) : null}
        {phone ? fullName : null}
        <button type="button" className={s.helpItem} onClick={() => actions.toggleHelp(true)}>
          <Icon name="help" />
          凡例と操作ヘルプ
        </button>
      </Overflow>

      <span className={cx(s.sep, s.sep1)} aria-hidden="true" />

      <Button
        id="countsBtn"
        icon="sliders"
        shortLabel="人数"
        shortAt="1279"
        iconOnly="640"
        title="必要人数を設定"
        aria-expanded={countsOpen}
        aria-controls="countDrawer"
        className={s.counts}
        onClick={() => actions.toggleCounts(!store.ui.countsOpen)}
      >
        必要人数を設定
      </Button>

      <Button
        id="auditBtn"
        icon="check-list"
        title={badge.title ? `勤務状況チェック（${badge.title}）` : "勤務状況チェック"}
        aria-label={badge.text ? `勤務状況チェック（${badge.text}）` : "勤務状況チェック"}
        aria-expanded={auditOpen}
        aria-controls="auditDrawer"
        className={s.audit}
        onClick={() => actions.toggleAudit()}
      >
        <span className={s.auditText}>勤務状況チェック</span>
        <Pill tone="danger" id="auditBadge" className={s.auditPill} hidden={!badge.total}>
          <span className={s.pillFull}>{badge.text}</span>
          <span className={s.pillShort}>{badge.total}</span>
        </Pill>
      </Button>

      <Button id="autoBtn" variant="primary" icon="sparkle" title="自動割当（いまの割当は確認のうえ置き換え）" className={s.auto} onClick={actions.runAutoAssign}>
        自動割当
      </Button>

      <span className={s.break} aria-hidden="true" />

      <div className={s.filters} ref={filtersRef}>
        {stores.options.length ? (
          <ChipGroup label="店舗で絞り込み" id="gridStores" className={s.chips}>
            {stores.options.map((o) => (
              <Chip
                key={o.value}
                pressed={stores.current === o.value}
                shop={o.value || undefined}
                data-grid-store={o.value}
                count={o.open ? <ChipCount tone="hot">{`未割当 ${o.open}`}</ChipCount> : <ChipCount tone="ok" />}
                onClick={() => actions.setGridStore(o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </ChipGroup>
        ) : (
          <div id="gridStores" className={s.chips} hidden />
        )}
        {stores.options.length ? <span className={cx(s.sep, s.sep2)} aria-hidden="true" /> : null}
        {tablet ? null : modes}
        {phone || tablet ? null : fullName}
      </div>

      <span className={s.grow2} aria-hidden="true" />
      {minimap}

      {tablet ? null : fullscreen}
    </div>
  );
}

/** スマホの上の帯：この日の未割当・重複・充足率・内訳（全体の数とフッターの文言） */
function MobileSummary({ m, dates }: { m: Model; dates: string[] }) {
  const audit = useAudit();
  const stats = useStats();
  const note = useUi((u) => u.share.footerNote);
  const [open, setOpen] = useState(false);
  const v = viewSummary(m, dates, audit);
  const num = (n: number) => n.toLocaleString("ja-JP");
  return (
    <div className={cx(s.msum, "m-only")}>
      <div className={s.msumRow}>
        <span className={cx(s.msumStat, v.open > 0 && s.isOpen)}>
          {v.all ? "未割当" : "この日の未割当"}
          <b>{num(v.open)}</b>
        </span>
        {v.conflicts ? (
          <span className={cx(s.msumStat, s.isConflict)}>
            重複<b>{num(v.conflicts)}</b>
          </span>
        ) : null}
        <span className={s.msumMeter} title="充足率">
          <Meter value={v.rate} width={56} />
          <b>{`${v.rate}%`}</b>
        </span>
        <button type="button" className={s.msumToggle} aria-expanded={open} aria-controls="shiftSummaryMore" onClick={() => setOpen(!open)}>
          <Icon name="chev" size={14} />
          内訳
        </button>
      </div>
      <div id="shiftSummaryMore" className={s.msumMore} hidden={!open}>
        <dl>
          <div>
            <dt>スタッフ</dt>
            <dd>{num(stats.staff)}</dd>
          </div>
          <div>
            <dt>必要枠</dt>
            <dd>{num(stats.slots)}</dd>
          </div>
          <div>
            <dt>割当済み</dt>
            <dd>{num(stats.filled)}</dd>
          </div>
          <div className={stats.open > 0 ? s.isOpen : undefined}>
            <dt>未割当</dt>
            <dd>{num(stats.open)}</dd>
          </div>
          <div className={stats.conflicts > 0 ? s.isConflict : undefined}>
            <dt>重複</dt>
            <dd>{num(stats.conflicts)}</dd>
          </div>
          <div>
            <dt>充足率</dt>
            <dd>{`${stats.rate}%`}</dd>
          </div>
        </dl>
        <p className={s.msumNote}>
          <Icon name={note ? "cloud" : "lock"} size={14} />
          {note ?? DEFAULT_FOOTER_NOTE}
        </p>
      </div>
    </div>
  );
}
