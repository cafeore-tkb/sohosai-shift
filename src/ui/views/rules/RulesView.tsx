// 4. 役職ルール：役職ごと・番目ごとの最低ステータス
// デスクトップは表（見出しはアプリバーの下に固定）、スマホ（≤640px）は同じ DOM を役職ごとのカードに並べる

import type { ChangeEvent } from "react";
import { carRoles, eventDayRoles, eventDays, liveRoles, posKey, posLabel, roleStore, ruleKey, shortDay, statusNames } from "../../../domain";
import type { Model, RolesByStore } from "../../../domain";
import { actions, useModel } from "../../../store";
import { Disclosure, Page, Select, ShopTag, cx } from "../../components";
import { StatusOptions, releaseFocus } from "../../components/inputs";
import styles from "./Rules.module.css";

const LADDER = ["未合格", "1年目合格", "2年目合格", "上級生"];

function Ladder() {
  return (
    <ol className={styles.ladder} aria-label="ステータスの順序（左ほど低い）">
      {LADDER.map((s, i) => (
        <li key={s}>
          {i ? (
            <i aria-hidden="true" className={styles.lt}>
              ‹
            </i>
          ) : null}
          <span className={styles[`step${i}`]}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

interface Group {
  key: string;
  day: string;
  dates: string;
  roles: RolesByStore;
  live: boolean;
}

export function RulesView({ hidden }: { hidden: boolean }) {
  const m = useModel();
  const liveDates = Object.keys(eventDays).filter((d) => !eventDayRoles[d]);
  const groups: Group[] = [
    ...Object.entries(eventDayRoles).map(([date, roles]) => ({ key: date, day: eventDays[date] || date, dates: shortDay(date), roles, live: false })),
    { key: "live", day: "本番", dates: liveDates.map(shortDay).join("・"), roles: liveRoles, live: true },
  ];
  return (
    <Page
      hidden={hidden}
      panelOf="rules"
      step={4}
      title="役職ごとの担当条件"
      description="各役職を担当するのに必要な最低ステータスを設定します。"
      aside={<Ladder />}
      data-view="rules"
    >
      <Disclosure label="番目ごとの条件（当日の配置）について" className={styles.disclosure}>
        <div className={styles.explain}>
          {"2人以上の役職は、1人目・2人目…の番目ごとに最低ステータスを設定できます（役職の条件と厳しいほうが使われます）。ドリッパーは 1st〜6th で、初期値は 1st・6th が上級生です。シフト表・印刷の列はこの番目どおりなので、そのまま当日の配置表として使えます。"}
          <br />
          {"ステータスが未合格の人は、アイスが自動で × になります。"}
        </div>
      </Disclosure>
      <div className={styles.card}>
        <table className={styles.rt}>
          <thead>
            <tr>
              <th scope="col" className={styles.colShop}>
                店舗
              </th>
              <th scope="col" className={styles.colRole}>
                役職
              </th>
              <th scope="col" className={styles.colMin}>
                担当に必要な最低ステータス
              </th>
              <th scope="col">番目ごと（本番の当日配置）</th>
            </tr>
          </thead>
          <tbody id="roleRuleEditor">
            {groups.map((g) => [
              <tr key={g.key} className={styles.group}>
                <th scope="colgroup" colSpan={4}>
                  {g.day}
                  <span className={styles.groupDates}>{g.dates}</span>
                </th>
              </tr>,
              ...Object.entries(g.roles).flatMap(([store, roles]) =>
                roles.map(([role, def]) => {
                  const k = ruleKey(store, role),
                    v = m.roleRequirements[k] || "未設定";
                  const notes = [carRoles.includes(role) ? "車ありのみ" : "", roleStore[role] ? `${roleStore[role]}所属のみ` : ""].filter(Boolean);
                  return (
                    <tr key={`${g.key}|${store}|${role}`} className={styles.row}>
                      <td className={styles.shop}>
                        <ShopTag shop={store} />
                      </td>
                      <th scope="row" className={styles.role}>
                        {role}
                        {notes.map((n) => (
                          <span key={n} className={styles.note}>
                            {n}
                          </span>
                        ))}
                      </th>
                      <td className={styles.min}>
                        <span className={styles.cellLabel} aria-hidden="true">
                          最低ステータス
                        </span>
                        <Select
                          data-rule={k}
                          aria-label={`${store} ${role} の最低ステータス`}
                          tone={v !== "未設定" ? "set" : "default"}
                          wrapClassName={styles.minSelect}
                          value={v}
                          onChange={onRuleChange}
                        >
                          <StatusOptions forRule />
                        </Select>
                      </td>
                      <td className={styles.pos}>{g.live ? <PosRules m={m} store={store} role={role} def={def} /> : <None />}</td>
                    </tr>
                  );
                }),
              ),
            ])}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

function None() {
  return (
    <span className={styles.none} aria-label="番目ごとの条件なし">
      —
    </span>
  );
}

function onRuleChange(e: ChangeEvent<HTMLSelectElement>) {
  const el = e.currentTarget;
  actions.changeRule(el.dataset.rule!, el.value);
  // 旧版は表を作り直していたので、フォーカスが外れた（共同編集の受信・⌘Z を止めない）
  releaseFocus(el);
}

/** PositionSelect の選択肢の短い表示（値は StatusOptions と同じ） */
const POS_LABEL: Readonly<Record<string, string>> = { 未設定: "—", "1年目合格": "1年目↑", "2年目合格": "2年目↑" };

// 2人以上の役職は番目ごとに最低ステータスを設定できる（表示する番目の数は、標準か必要人数の多いほう）
function PosRules({ m, store, role, def }: { m: Model; store: string; role: string; def: number }) {
  const n = Math.max(def, ...m.slots.filter((s) => s.store === store && s.role === role).map((s) => Number(s.count) || 0));
  if (n < 2) return <None />;
  return (
    <div className={styles.posrow} role="group" aria-label={`${store} ${role} の番目ごとの最低ステータス`}>
      {Array.from({ length: n }, (_, i) => {
        const k = posKey(store, role, i),
          v = m.roleRequirements[k] || "未設定",
          label = posLabel(role, i);
        return (
          <label key={i} className={cx(styles.possel, v !== "未設定" && styles.isSet)} title={`${role} ${label}：${v === "未設定" ? "条件なし" : `${v}以上`}`}>
            <b>{label}</b>
            <select data-rule={k} aria-label={`${store} ${role} ${label} の最低ステータス`} value={v} onChange={onRuleChange}>
              {statusNames.map((s) => (
                <option key={s} value={s}>
                  {POS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
