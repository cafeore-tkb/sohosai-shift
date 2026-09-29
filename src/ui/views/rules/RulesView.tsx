// 4. 役職ルール：役職ごと・番目ごとの最低ステータス
// デスクトップは表（見出しはアプリバーの下に固定）、スマホ（≤640px）は同じ DOM を役職ごとのカードに並べる

import type { ChangeEvent } from "react";
import { AUTO_RULE_DEFAULTS, autoRules, carRoles, eventDayRoles, eventDays, liveRoles, posKey, posLabel, roleStore, ruleKey, shortDay, statusNames } from "../../../domain";
import type { AutoRuleKey, Model, RolesByStore } from "../../../domain";
import { actions, store, useModel } from "../../../store";
import { Disclosure, Page, Select, ShopTag, cx, inputClassName } from "../../components";
import { ChangeInput, StatusOptions, releaseFocus } from "../../components/inputs";
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
          {"ステータスが未合格の人はドリップ不可（ホットも不可）で、ここの条件にかかわらずドリッパーには入りません。上級生の人はアイスが自動で ○ になります。"}
        </div>
      </Disclosure>
      <AutoRulesCard m={m} />
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

interface AutoRuleRow {
  key: AutoRuleKey;
  label: string;
  before: string;
  unit: string;
  step: number;
  max?: number;
  note: string;
}
const AUTO_RULE_ROWS: readonly AutoRuleRow[] = [
  {
    key: "masterHours",
    label: "マスター",
    before: "1人 全日程で",
    unit: "時間まで",
    step: 0.5,
    note: "本番の全日程の合計です。全員この時間までで埋めきれないときだけ、この時間ずつ増やして全員に同じくらい割り振ります。",
  },
  {
    key: "dripMarked",
    label: "ドリッパーの記号",
    before: "H・1・2 のある人は各時間",
    unit: "人まで",
    step: 1,
    note: "目安です。H・1・2 は合わせて数えます。できなければ1人ずつ増やし、どこかの時間に固まらないようにします。",
  },
  {
    key: "availPercent",
    label: "1日の勤務時間",
    before: "勤務可能時間の",
    unit: "%くらいまで",
    step: 5,
    max: 100,
    note: "目安です。ほかに入れる人がいなければ超え、超えるのは上級生からです。働ける量（少し・5時間程度）の目安があれば、少ないほうを使います。",
  },
  {
    key: "maxRunHours",
    label: "連続勤務",
    before: "最長",
    unit: "時間まで",
    step: 0.5,
    note: "できるだけ続けて入れ、この時間を超えて続けては入れません（入れる人がいなければ空けます）。",
  },
];

// 自動割当の決まり（settings。共同編集で共有する）。0 か空欄で制限なし
function AutoRulesCard({ m }: { m: Model }) {
  const rules = autoRules(m);
  return (
    <section className={styles.auto} aria-labelledby="autoRulesTitle">
      <h2 id="autoRulesTitle" className={styles.autoTitle}>
        自動割当の決まり
        <span className={styles.autoSub}>0 か空欄で制限なし</span>
      </h2>
      <dl className={styles.autoList}>
        {AUTO_RULE_ROWS.map((r) => {
          const v = rules[r.key],
            changed = v !== AUTO_RULE_DEFAULTS[r.key];
          return (
            <div key={r.key} className={styles.autoRow}>
              <dt>{r.label}</dt>
              <dd className={styles.autoValue}>
                <label className={cx(styles.autoField, changed && styles.isSet)}>
                  <span>{r.before}</span>
                  <ChangeInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={r.max}
                    step={r.step}
                    data-auto-rule={r.key}
                    aria-label={`${r.label}（${r.before}〇${r.unit}）`}
                    className={inputClassName({ size: "sm" }, styles.autoInput)}
                    value={v ? String(v) : ""}
                    placeholder="なし"
                    onCommit={onAutoRuleCommit}
                  />
                  <span>{r.unit}</span>
                </label>
                {changed ? <span className={styles.autoDefault}>{`標準 ${AUTO_RULE_DEFAULTS[r.key]}`}</span> : null}
              </dd>
              <dd className={styles.autoNote}>{r.note}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function onAutoRuleCommit(el: HTMLInputElement) {
  const key = el.dataset.autoRule as AutoRuleKey,
    text = el.value.trim();
  actions.changeAutoRule(key, text === "" ? 0 : Number(text));
  // 読めない値・丸めた値は、いまの決まりに戻して見せる
  const v = autoRules(store.model)[key];
  el.value = v ? String(v) : "";
  releaseFocus(el);
}
