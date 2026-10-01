// 勤務状況チェック（右のドロワー。#auditDrawer / #auditClose / #assignmentAudit）
// バッジ → 直したほうがよい枠（重複・勤務できない時間・条件外・苦手な役職。「表で見る ›」で表のその枠へ）
// → やりたい役職が1つも入っていない人（「個人別で見る ›」）→ ドリップが1時間未満の人 → 1人ずつの勤務時間（日ごと・合計・ドリップ）

import { useMemo } from "react";
import type { ReactNode } from "react";
import { allNames, auditIssues, auditRow, dayName, eventDates, fmt, surname } from "../domain";
import type { AuditIssue, CarlessIssue, DripRow } from "../domain";
import { actions, useModel, useUi } from "../store";
import { Drawer, Icon, Pill, Swatch, cx } from "./components";
import type { SwatchKind } from "./components";
import styles from "./AuditDrawer.module.css";
import { useAudit, useAuditSummary, useDripRows } from "./useDerived";
import { WorkloadOverBadge, WorkloadOverSection, overTargetList } from "./WorkloadOver";

/** これより狭いと表の枠をドロワーの左に空けられない（Shift.module.css と同じ）。高さ 560px 以下はドロワーが画面いっぱい（Drawer） */
const NARROW = "(max-width: 899px), (max-height: 560px)";

export function AuditDrawer() {
  const open = useUi((u) => u.auditOpen);
  return (
    <Drawer
      open={open}
      onClose={() => actions.toggleAudit(false)}
      title="勤務状況チェック"
      icon="check-list"
      id="auditDrawer"
      closeId="auditClose"
      bodyId="assignmentAudit"
    >
      {open ? <AuditContent /> : null}
    </Drawer>
  );
}

/** スマホ・狭いタブレットではドロワーが表を覆うので、表で見せるときは閉じる */
const closeOnPhone = () => {
  if (matchMedia(NARROW).matches) actions.toggleAudit(false);
};

function LinkButton({ onClick, label, children }: { onClick: () => void; label?: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.link} aria-label={label} onClick={onClick}>
      {children}
      <Icon name="chev-r" size={14} />
    </button>
  );
}

function IssueCard({ kind, title, lead, issues }: { kind: SwatchKind; title: string; lead: string; issues: AuditIssue[] }) {
  const one = issues.length === 1;
  return (
    <div className={styles.item}>
      <Swatch kind={kind} className={styles.sw} />
      <div className={styles.itemBody}>
        <p>
          <b>{title}</b>
          {`　${lead}：`}
          {issues.map((x, i) => (
            <span key={`${x.name}|${x.date}`}>
              {i ? "、" : ""}
              <b>{x.name}</b>
              {`（${x.where}）`}
            </span>
          ))}
        </p>
        <div className={styles.links}>
          {issues.map((x) => (
            <LinkButton
              key={`${x.name}|${x.date}`}
              // 同じ人の別の日と区別できるよう、読み上げ名に日時と場所を入れる
              label={`${x.name}を表で見る（${x.where}）`}
              onClick={() => {
                actions.revealSlot(x.first);
                closeOnPhone();
              }}
            >
              {one ? "表で見る" : `${surname(x.name)}を表で見る`}
            </LinkButton>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 車ありの人がいない買い出し（時間帯ごと） */
function CarlessCard({ issues }: { issues: CarlessIssue[] }) {
  return (
    <div className={styles.item}>
      <Swatch kind="open" className={styles.sw} />
      <div className={styles.itemBody}>
        <p>
          <b>車ありがいない買い出し</b>
          {"　同じ時間の買い出しに車ありの人が1人もいません："}
          {issues.map((x, i) => (
            <span key={x.first}>
              {i ? "、" : ""}
              {`${x.where}（${x.names.join("・")}）`}
            </span>
          ))}
        </p>
        <div className={styles.links}>
          {issues.map((x) => (
            <LinkButton
              key={x.first}
              label={`表で見る（${x.where}）`}
              onClick={() => {
                actions.revealSlot(x.first);
                closeOnPhone();
              }}
            >
              {issues.length === 1 ? "表で見る" : `${x.where.split(" ").slice(1, 2).join("")}を表で見る`}
            </LinkButton>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditContent() {
  const m = useModel();
  const audit = useAudit();
  const { missing, offs, unfits, disliked } = useAuditSummary();
  const issues = useMemo(() => auditIssues(m, audit), [m, audit]);
  // 働ける量の目安超え（WorkloadOver.tsx）
  const overs = useMemo(() => overTargetList(m, audit), [m, audit]);
  // ドリップの時間（ドリッパーに入れる人は全日程で1時間以上）
  const drips = useDripRows();
  if (!m.availability.length) return <p className={styles.note}>アンケート回答CSVを読み込むと表示されます。</p>;
  const { conflicts } = audit,
    dates = eventDates(m),
    names = allNames(m),
    rows = names.map((name) => ({ name, ...auditRow(m, audit, name, dates) })),
    maxTotal = Math.max(1, ...rows.map((r) => r.total)),
    dripShort = names.filter((n) => drips[n]?.short),
    anyIssue = issues.conflicts.length || issues.offs.length || issues.unfits.length || issues.dislikes.length || issues.carless.length;
  return (
    <>
      <div className={styles.badges}>
        {conflicts.size ? (
          <Pill tone="danger" size="lg">{`重複 ${conflicts.size}枠`}</Pill>
        ) : (
          <Pill tone="ok" size="lg">
            <Icon name="check" size={14} />
            重複勤務なし
          </Pill>
        )}
        {offs.length ? <Pill tone="off" size="lg">{`勤務できない時間の割当 ${offs.length}枠`}</Pill> : null}
        {unfits.length ? <Pill tone="unfit" size="lg">{`条件外の割当 ${unfits.length}枠`}</Pill> : null}
        {disliked ? <Pill tone="dislike" size="lg">{`苦手な役職への割当 ${disliked}枠`}</Pill> : null}
        {issues.carless.length ? <Pill tone="open" size="lg">{`車ありがいない買い出し ${issues.carless.length}件`}</Pill> : null}
        {missing.length ? <Pill tone="open" size="lg">{`やりたい役職に入っていない ${missing.length}名`}</Pill> : null}
        {dripShort.length ? <Pill tone="warn" size="lg">{`ドリップ1時間未満 ${dripShort.length}名`}</Pill> : null}
        <WorkloadOverBadge list={overs} />
      </div>

      {anyIssue ? (
        <section className={styles.sec} aria-labelledby="auditFix">
          <h3 id="auditFix" className={styles.h3}>
            直したほうがよい枠
          </h3>
          {issues.conflicts.length ? (
            <IssueCard kind="conflict" title="重複" lead="赤い枠は、他店舗・他の係を含め同じ時間に重複しています" issues={issues.conflicts} />
          ) : null}
          {issues.offs.length ? (
            <IssueCard
              kind="off"
              title="勤務できない時間"
              lead="紫の斜線の枠（× 付き）は、勤務可能表で — の時間に入っている人です"
              issues={issues.offs}
            />
          ) : null}
          {issues.unfits.length ? (
            <IssueCard
              kind="unfit"
              title="条件外"
              lead="青緑の点の枠（≠ 付き）は、所属店舗・ステータスの条件に合わない人です（手で移動した枠や、あとから条件を変えた枠。割当は外れません）"
              issues={issues.unfits}
            />
          ) : null}
          {issues.dislikes.length ? (
            <IssueCard
              kind="dislike"
              title="苦手な役職"
              lead={`黄色の枠は、本人が苦手と回答した役職への割当です（${disliked}枠）`}
              issues={issues.dislikes}
            />
          ) : null}
          {issues.carless.length ? <CarlessCard issues={issues.carless} /> : null}
        </section>
      ) : null}

      {missing.length ? (
        <section className={styles.sec} aria-labelledby="auditWants">
          <h3 id="auditWants" className={styles.h3}>
            やりたい役職が1つも入っていない人
            <Pill tone="neutral">{`${missing.length}名`}</Pill>
          </h3>
          <ul className={styles.wants}>
            {missing.map((x) => (
              <li key={x.name}>
                <b>{x.name}</b>
                <span className={styles.wantText}>{`やりたい：${x.wants.join("、")}${x.none ? "（割当なし）" : ""}`}</span>
                <LinkButton
                  label={`${x.name}を個人別で見る`}
                  onClick={() => {
                    actions.revealPerson(x.name);
                    closeOnPhone();
                  }}
                >
                  個人別で見る
                </LinkButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dripShort.length ? (
        <section className={styles.sec} aria-labelledby="auditDrip">
          <h3 id="auditDrip" className={styles.h3}>
            ドリップが1時間未満の人
            <Pill tone="neutral">{`${dripShort.length}名`}</Pill>
          </h3>
          <ul className={styles.wants}>
            {dripShort.map((name) => (
              <li key={name}>
                <b>{name}</b>
                <span className={styles.wantText}>{`ドリッパーに入れるのに ${fmt(drips[name].hours)}`}</span>
                <LinkButton
                  label={`${name}を個人別で見る`}
                  onClick={() => {
                    actions.revealPerson(name);
                    closeOnPhone();
                  }}
                >
                  個人別で見る
                </LinkButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <WorkloadOverSection
        list={overs}
        classes={{ sec: styles.sec, h3: styles.h3, list: styles.wants, text: styles.wantText }}
        link={(x) => (
          <LinkButton
            label={`${x.name}を個人別で見る`}
            onClick={() => {
              actions.revealPerson(x.name, x.date);
              closeOnPhone();
            }}
          >
            個人別で見る
          </LinkButton>
        )}
      />

      <section className={styles.sec} aria-labelledby="auditHours">
        <h3 id="auditHours" className={styles.h3}>
          勤務時間
        </h3>
        <table className={styles.hours}>
          <thead>
            <tr>
              <th scope="col">スタッフ</th>
              {dates.map((date, i) => (
                <th scope="col" key={date} className={styles.dayHead}>
                  {dayName(date, i).replace(/^(本番|前日)/, "$1\n")}
                </th>
              ))}
              <th scope="col">合計</th>
              <th scope="col" title="本店のドリッパーに入っている時間（全日程）">
                ドリップ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, perDay, total }) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {perDay.map((h, i) =>
                  h === null ? (
                    <td key={i} className={styles.dash} title="その日は参加しない">
                      —
                    </td>
                  ) : (
                    <td key={i} className={h ? undefined : styles.zero}>
                      {fmt(h)}
                    </td>
                  ),
                )}
                <td className={styles.total}>
                  <span className={styles.bar} style={{ width: `${Math.round((total / maxTotal) * 28)}px` }} aria-hidden="true" />
                  {fmt(total)}
                </td>
                <DripCell row={drips[name]} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.note}>
          勤務時間に昼食・休憩は含みません。「—」はその日に参加不可。ドリップは本店のドリッパーの時間（全日程）で、合計に含まれます。ドリッパーに入れない人（未合格など）は「—」、入れるのに1時間未満の人はオレンジです。
        </p>
      </section>
    </>
  );
}

/** ドリップの時間（全日程）。入れない人は —、入れるのに1時間未満ならオレンジ */
function DripCell({ row }: { row: DripRow | undefined }) {
  if (!row?.can && !row?.hours)
    return (
      <td className={cx(styles.drip, styles.dash)} title="ドリッパーに入れない（ステータス・所属・勤務可能時間）">
        —
      </td>
    );
  return (
    <td
      className={cx(styles.drip, row.short && styles.dripShort, !row.hours && !row.short && styles.zero)}
      title={row.short ? "ドリッパーに入れるのに1時間未満" : undefined}
      data-drip-short={row.short ? "" : undefined}
    >
      {fmt(row.hours)}
    </td>
  );
}
