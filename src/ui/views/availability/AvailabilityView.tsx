// 2. 勤務可能表：日別・時間別の ○／—。セルをクリック（ドラッグでまとめて）して塗り替える

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { addableNames, boardNames, canAt, dayLabel, dayName, eventDates, hoursForDate, peopleOn, shortDay } from "../../../domain";
import { actions, store, useModel, useUi } from "../../../store";
import { Button, Icon, Notice, Page, Pill, SegButton, Segmented, Spacer, Tip, cx, inputClassName } from "../../components";
import { releaseFocus } from "../../components/inputs";
import styles from "./Availability.module.css";
import { usePaint, usePaintTip } from "./usePaint";
import type { TipStore } from "./usePaint";

/** ほかのタブへ移っても残すもの（表示中でないあいだは中身を描画しないため）：表のスクロールと、追加の欄の書きかけ */
interface Kept {
  left: number;
  top: number;
  draft: string;
}

export function AvailabilityView({ hidden }: { hidden: boolean }) {
  const kept = useRef<Kept>({ left: 0, top: 0, draft: "" });
  return (
    <Page
      hidden={hidden}
      panelOf="availability"
      wide
      step={2}
      title="日別・時間別の勤務可能者"
      description="○ が勤務可能な時間帯です。その日に参加できる人だけを表示しています。"
      id="availabilityPanel"
      data-view="availability"
    >
      {hidden ? <AvailabilityShell /> : <AvailabilityContent kept={kept.current} />}
    </Page>
  );
}

function AvailabilityShell() {
  return (
    <>
      <div id="availDates" hidden></div>
      <div id="availabilityBoard" hidden></div>
    </>
  );
}

/** 「10/31(土)」→「10/31」（曜日は title の日付に入れる） */
const monthDay = (d: string) => shortDay(d).replace(/\(.*\)$/, "");

function AvailabilityContent({ kept }: { kept: Kept }) {
  const m = useModel();
  const extra = useUi((u) => u.availExtra);
  const { onPointerDown, tips } = usePaint();
  // 表示し直したとき、前のスクロール位置に戻す
  const wrapRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      el.scrollLeft = kept.left;
      el.scrollTop = kept.top;
    },
    [kept],
  );
  const dates = eventDates(m);
  if (!dates.length) return <AvailabilityShell />;
  const date = dates.includes(m.availDate) ? m.availDate : dates[0];
  const hours = hoursForDate(m, date),
    names = boardNames(m, date, extra[date] || []),
    all = addableNames(m, names);
  const can = (name: string, h: string) => canAt(m, date, name, h);
  return (
    <>
      <div className={styles.toolbar}>
        <Segmented label="日付" id="availDates" className={styles.days}>
          {dates.map((d, i) => (
            <SegButton
              key={d}
              pressed={d === date}
              data-avail-date={d}
              title={dayLabel(d)}
              sub={monthDay(d)}
              badge={
                <Pill tone="neutral" size="sm" className="num">
                  {`${peopleOn(m, d).length}名`}
                </Pill>
              }
              aria-label={`${dayName(d, i)} ${peopleOn(m, d).length}名`}
              onClick={() => actions.setAvailDate(d)}
            >
              <span className={styles.dayFull}>{dayName(d, i)}</span>
              <span className={styles.dayShort} aria-hidden="true">
                {dayName(d, i).replace(/^(本番|前日)/, "")}
              </span>
            </SegButton>
          ))}
        </Segmented>
        <Spacer />
        <AddMemberForm names={all} kept={kept} />
      </div>
      <Notice tone="info" className={styles.hint}>
        セルをクリック（ドラッグでまとめて）すると ○／— を切り替えられます。ここを変えてもシフトの割当は外れません（勤務できない時間に入っている人は、シフト調整で色が付きます）。
        <span className={styles.touchHint}>指では、長押ししてからなぞるとまとめて塗れます（そのまま動かすとスクロール）。</span>
      </Notice>
      <div
        id="availabilityBoard"
        className={styles.frame}
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onKeyDown={onCellKey}
        onScroll={(e) => {
          kept.left = e.currentTarget.scrollLeft;
          kept.top = e.currentTarget.scrollTop;
        }}
      >
        <table className={styles.av} aria-label={`${dayName(date, dates.indexOf(date))}の勤務可能時間`}>
          <thead>
            <tr>
              <th scope="col" className={styles.who}>
                スタッフ<span className={styles.whoCount}>{`（${names.length}名）`}</span>
              </th>
              {hours.map((h) => (
                <th key={h} scope="col" className={h.endsWith(":00") ? styles.isHour : styles.isHalf}>
                  {h}
                </th>
              ))}
            </tr>
            <tr className={styles.countRow}>
              <th scope="row" className={styles.who}>
                勤務可能人数
              </th>
              {hours.map((h) => (
                <th key={h} className={cx("num", h.endsWith(":00") && styles.isHour)}>
                  <b>{names.filter((n) => can(n, h)).length}</b>人
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name, r) => (
              <tr key={name}>
                <th scope="row" className={styles.who}>
                  {name}
                </th>
                {hours.map((h, c) => {
                  const yes = can(name, h);
                  return (
                    <td
                      key={h}
                      className={cx(yes ? styles.isYes : styles.isNo, h.endsWith(":00") && styles.isHour)}
                      data-av-name={name}
                      data-av-h={h}
                      tabIndex={r === 0 && c === 0 ? 0 : -1}
                      aria-label={`${name} ${h} ${yes ? "勤務可能" : "勤務不可"}`}
                    >
                      {yes ? "○" : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaintTipLayer tips={tips} />
    </>
  );
}

/**
 * キーボード：矢印でセルを移動（ロービングの tabindex）、Enter / Space でそのセルを切り替える
 * （マウスで 1 セルだけ塗ったのと同じ paintAvailability。元に戻す付きのトースト）
 */
function onCellKey(e: KeyboardEvent<HTMLElement>) {
  const td = (e.target as HTMLElement).closest<HTMLTableCellElement>("td[data-av-name][data-av-h]");
  if (!td || e.metaKey || e.ctrlKey || e.altKey) return;
  const row = td.parentElement as HTMLTableRowElement;
  let next: Element | null | undefined = null;
  if (e.key === "ArrowRight") next = td.nextElementSibling;
  else if (e.key === "ArrowLeft") next = td.previousElementSibling;
  else if (e.key === "ArrowDown") next = row.nextElementSibling?.children[td.cellIndex];
  else if (e.key === "ArrowUp") next = row.previousElementSibling?.children[td.cellIndex];
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const name = td.dataset.avName!,
      h = td.dataset.avH!;
    const m = store.model;
    actions.paintAvailability({ [name]: { [h]: !canAt(m, m.availDate, name, h) } });
    return;
  } else return;
  e.preventDefault();
  if (next instanceof HTMLElement && next.matches("td[data-av-name]")) {
    td.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  }
}

/** 塗っている途中の吹き出し（ポインタの近く。表とは別に描き直す） */
function PaintTipLayer({ tips }: { tips: TipStore }) {
  const tip = usePaintTip(tips);
  if (!tip) return null;
  return (
    <Tip className={cx(styles.paintTip, tip.above && styles.paintTipAbove)} style={{ left: tip.left, top: tip.top }} caretX={tip.caretX}>
      {`${tip.value ? "○" : "—"} にする（${tip.count}セル）・離すと確定`}
    </Tip>
  );
}

/** 「この日にメンバーを追加」 */
function AddMemberForm({ names, kept }: { names: string[]; kept: Kept }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      id="availAdd"
      className={styles.addForm}
      onSubmit={(e) => {
        e.preventDefault();
        const el = input.current!;
        if (!el.value.trim()) return;
        actions.addAvailMember(el.value);
        el.value = kept.draft = "";
        // 旧版は追加のたびに表を作り直していたので、入力欄からフォーカスが外れた（共同編集の受信・⌘Z を止めない）
        releaseFocus(el);
      }}
    >
      <label className={styles.addField}>
        <Icon name="plus" className={styles.addIcon} />
        <span className="sr-only">この日にメンバーを追加</span>
        <input
          id="availAddName"
          ref={input}
          className={inputClassName({}, styles.addInput)}
          list="availAddList"
          placeholder="この日にメンバーを追加（名前）"
          autoComplete="off"
          defaultValue={kept.draft}
          onInput={(e) => (kept.draft = e.currentTarget.value)}
        />
      </label>
      <datalist id="availAddList">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <Button type="submit" variant="secondary">
        追加
      </Button>
    </form>
  );
}
