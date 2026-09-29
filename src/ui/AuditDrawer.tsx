// 勤務状況チェック（右のドロワー。#auditDrawer / #auditClose / #assignmentAudit）
// バッジ → 直したほうがよい枠（重複・勤務できない時間・条件外・苦手な役職。「表で見る ›」で表のその枠へ）
// → やりたい役職が1つも入っていない人（「個人別で見る ›」）→ 1人ずつの勤務時間

import { useMemo } from "react";
import type { ReactNode } from "react";
import { allNames, auditIssues, auditRow, dayName, eventDates, fmt, surname } from "../domain";
import type { AuditIssue } from "../domain";
import { actions, useModel, useUi } from "../store";
import { Drawer, Icon, Pill, Swatch } from "./components";
import type { SwatchKind } from "./components";
import styles from "./AuditDrawer.module.css";
import { useAudit, useAuditSummary } from "./useDerived";
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

function AuditContent() {
  const m = useModel();
  const audit = useAudit();
  const { missing, offs, unfits, disliked } = useAuditSummary();
  const issues = useMemo(() => auditIssues(m, audit), [m, audit]);
  // 働ける量の目安超え（WorkloadOver.tsx）
  const overs = useMemo(() => overTargetList(m, audit), [m, audit]);
  if (!m.availability.length) return <p className={styles.note}>アンケート回答CSVを読み込むと表示されます。</p>;
  const { conflicts } = audit,
    dates = eventDates(m),
    names = allNames(m),
    rows = names.map((name) => ({ name, ...auditRow(m, audit, name, dates) })),
    maxTotal = Math.max(1, ...rows.map((r) => r.total)),
    anyIssue = issues.conflicts.length || issues.offs.length || issues.unfits.length || issues.dislikes.length;
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
        {missing.length ? <Pill tone="open" size="lg">{`やりたい役職に入っていない ${missing.length}名`}</Pill> : null}
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
              lead="青緑の点の枠（≠ 付き）は、所属店舗・ステータス・車の条件に合わない人です（手で移動した枠や、あとから条件を変えた枠。割当は外れません）"
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
                <th scope="col" key={date}>
                  {dayName(date, i)}
                </th>
              ))}
              <th scope="col">合計</th>
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
                  <span className={styles.bar} style={{ width: `${Math.round((total / maxTotal) * 48)}px` }} aria-hidden="true" />
                  {fmt(total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.note}>勤務時間に昼食・休憩は含みません。「—」はその日に参加不可。</p>
      </section>
    </>
  );
}
