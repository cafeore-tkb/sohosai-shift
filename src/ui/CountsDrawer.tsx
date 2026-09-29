// 必要人数の設定（右の広いドロワー。#countDrawer / #countClose / #countReset / #countDates / #countEditor）
// 日付ごと・役職×30分の人数（number、ネイティブの change で確定）。「一括」でその役職の全時間帯。
// 標準から変えた欄は撫子、0人（シフト表では「不要な時間」）は斜線。
// 標準は時間ごと（config の liveSchedule：店舗の営業時間・ドリッパー 6th は昼だけ・美化・裏シフトの時間帯）

import { useLayoutEffect, useRef } from "react";
import {
  dayName,
  defaultCount,
  liveScheduleFor,
  eventDates,
  openRoles,
  findSlot,
  hoursForDate,
  plusSlot,
  rolesOn,
  ruleKey,
  shortDay,
} from "../domain";
import type { Model } from "../domain";
import { actions, store, useModel, useUi } from "../store";
import { Button, Drawer, KbdHint, Notice, SegButton, Segmented, ShopTag, cx } from "./components";
import { ChangeInput } from "./components/inputs";
import styles from "./CountsDrawer.module.css";

// 入力中（フォーカスがドロワー内）は countDate を補正しない（旧 render と同じ）
store.isEditingCounts = () => !!document.getElementById("countDrawer")?.contains(document.activeElement);

export function CountsDrawer() {
  const open = useUi((u) => u.countsOpen);
  const focus = useUi((u) => u.countFocus);
  const m = useModel();
  const ref = useRef<HTMLDivElement>(null);
  const dates = eventDates(m);

  // 不要な時間のセルから開いたとき：その枠の入力欄へ
  useLayoutEffect(() => {
    if (!open || !focus) return;
    const input = ref.current?.querySelector<HTMLInputElement>(`[data-count-slot="${CSS.escape(focus.slotId)}"]`);
    if (input) {
      input.scrollIntoView({ block: "center", inline: "center" });
      input.focus();
      input.select();
    }
  }, [open, focus]);

  const date = dates.includes(m.countDate) ? m.countDate : dates[0];
  return (
    <Drawer
      open={open}
      onClose={() => actions.toggleCounts(false)}
      title="必要人数の設定"
      icon="sliders"
      id="countDrawer"
      closeId="countClose"
      wide
      bodyClassName={styles.body}
      headExtra={
        <>
          <Segmented label="日付" size="sm" id="countDates" className={styles.dates}>
            {dates.map((d, i) => (
              <SegButton
                key={d}
                pressed={d === date}
                data-count-date={d}
                sub={shortDay(d).replace(/\(.\)$/, "")}
                title={dayName(d, i)}
                onClick={() => actions.setCountDate(d)}
              >
                {dayName(d, i)}
              </SegButton>
            ))}
          </Segmented>
          <span className={styles.grow} />
          <Button
            id="countReset"
            size="sm"
            icon="reset"
            shortLabel="標準に戻す"
            shortAt="1023"
            title="この日の必要人数を標準に戻します（確認あり）"
            onClick={actions.resetDayCounts}
          >
            この日を標準に戻す
          </Button>
        </>
      }
      footer={
        <>
          <span className={styles.key}>
            <span className={cx(styles.ci, styles.changed, styles.keyCi)} aria-hidden="true">
              1
            </span>
            標準から変更した時間帯
          </span>
          <span className={styles.key}>
            <span className={cx(styles.ci, styles.zero, styles.keyCi)} aria-hidden="true">
              0
            </span>
            0人＝シフト表では「不要な時間」（斜線）
          </span>
          <span className={styles.grow} />
          <span className={styles.keys} aria-hidden="true">
            <KbdHint keys={["Tab"]}>次の欄</KbdHint>
            <KbdHint keys={["↵"]}>確定</KbdHint>
          </span>
        </>
      }
    >
      <Notice tone="info" className={styles.note}>
        変更はすぐシフト表に反映されます。「一括」に入力すると、その役職の標準が1人以上の時間帯（営業時間内・美化などの時間帯）をまとめて変更します。人数を減らすと、はみ出した枠の割当は外れます。
      </Notice>
      <div id="countEditor" ref={ref} className={styles.frame}>
        {dates.length ? (
          <CountTable m={m} date={date} />
        ) : (
          <p className={styles.empty}>アンケート回答CSVを読み込むと設定できます。</p>
        )}
      </div>
    </Drawer>
  );
}

function CountTable({ m, date }: { m: Model; date: string }) {
  const hours = hoursForDate(m, date);
  return (
    <table className={styles.ct}>
      <thead>
        <tr>
          <th scope="col">役職</th>
          <th
            scope="col"
            className={styles.bulkHead}
            title="標準が1人以上の時間帯をまとめて設定（営業時間外などはそのまま）"
          >
            一括
          </th>
          {hours.map((h) => {
            const hour = h.endsWith(":00");
            return (
              <th key={h} scope="col" className={hour ? styles.isHour : undefined} title={`${h}–${plusSlot(h)}`}>
                {hour ? `${Number(h.slice(0, 2))}時` : ":30"}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {Object.entries(rolesOn(m, date)).flatMap(([s, roles]) => {
          // 店舗の営業時間（時間割。外の時間は標準 0＝不要な時間）。表の時間がすべて営業時間内なら出さない
          const open = liveScheduleFor(date)?.hours[s],
            inOpen = (h: string) => !open || (h >= open[0] && h < open[1]),
            openNote =
              open && hours.some((h) => !inOpen(h)) ? `営業 ${open[0]}–${open[1]}（ほかの時間は標準 0人）` : "";
          return [
            <tr key={s} className={styles.group}>
              <th colSpan={hours.length + 2} scope="colgroup">
                <ShopTag shop={s} />
                {openNote ? <small className={styles.openNote}>{openNote}</small> : null}
              </th>
            </tr>,
            ...roles.map(([role, base]) => {
              // 人数の上限がない係は必要人数を設定しない（割当に合わせて列が増える）
              if (openRoles.includes(role))
                return (
                  <tr key={`${s}|${role}`}>
                    <th scope="row" className={styles.role} title="入れるたびに列が増えます">
                      <b>{role}</b>
                      <small>上限なし</small>
                    </th>
                    <td className={styles.bulk}></td>
                    <td colSpan={hours.length} className={styles.unlimited}>
                      人数の上限なし（何人でも入れられます）
                    </td>
                  </tr>
                );
              // 時間ごとの標準（営業時間外は 0。見出しの幅は営業時間内だけで見る）
              const defs = new Map(hours.map((h) => [h, defaultCount(date, s, role, h, base)] as const)),
                shown = hours.filter(inOpen).map((h) => defs.get(h) ?? base),
                lo = shown.length ? Math.min(...shown) : base,
                hi = shown.length ? Math.max(...shown) : base,
                varies = lo !== hi,
                note = varies ? `標準 ${lo}〜${hi}人` : `標準 ${lo}人`;
              return (
                <tr key={`${s}|${role}`}>
                  <th
                    scope="row"
                    className={styles.role}
                    title={varies ? `${note}（時間帯で変わります。標準に戻すと時間帯ごとの人数になります）` : note}
                  >
                    <b>{role}</b>
                    <small>{note}</small>
                  </th>
                  <td className={styles.bulk}>
                    <ChangeInput
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="—"
                      aria-label={`${s} ${role} 一括`}
                      title="標準が1人以上の時間帯をまとめて設定（営業時間外などはそのまま）"
                      className={cx(styles.ci, styles.ciBulk)}
                      data-count-all={ruleKey(s, role)}
                      value=""
                      onCommit={(el) => {
                        if (actions.changeRoleCounts(ruleKey(s, role), el.value)) el.value = "";
                      }}
                    />
                  </td>
                  {hours.map((h) => {
                    const sl = findSlot(m, date, s, role, h);
                    const hour = h.endsWith(":00");
                    if (!sl) return <td key={h} className={hour ? styles.isHour : undefined}></td>;
                    const id = sl.id,
                      n = Number(sl.count),
                      def = defs.get(h) ?? base;
                    return (
                      <td key={h} className={hour ? styles.isHour : undefined}>
                        <ChangeInput
                          type="number"
                          min="0"
                          inputMode="numeric"
                          aria-label={`${s} ${role} ${h}–${plusSlot(h)}`}
                          title={n !== def ? `標準 ${def}人` : undefined}
                          data-count-slot={id}
                          value={String(sl.count)}
                          className={cx(styles.ci, n !== def && styles.changed, n === 0 && styles.zero)}
                          onCommit={(el) => {
                            actions.changeSlotCount(id, el.value);
                            const now = store.model.slots.find((x) => x.id === id);
                            if (now) el.value = String(now.count);
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            }),
          ];
        })}
      </tbody>
    </table>
  );
}
