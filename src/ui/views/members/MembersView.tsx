// 3. メンバー：ふりがな・学年・ステータス・所属店舗・アイス・車・やりたい／苦手な役職の編集
// デスクトップは表、スマホ（≤640px）は同じ DOM（tr）を CSS でカードに並べ替える

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { MEMBER_SORTS, MEMBER_SORT_LABELS, allNames, gradeLabels, gradeOf, gradeText, workloadLevels, filterMembers, iceOf, iceStatuses, memberStoreCounts, sortedMembers, storeNames } from "../../../domain";
import type { MemberSort, Model, SortDir } from "../../../domain";
import { actions, useModel, useModelVersion } from "../../../store";
import { Button, Checkbox, Chip, ChipCount, ChipGroup, Icon, IconButton, Notice, Page, SearchInput, SegButton, Segmented, Select, ShopToggle, Spacer, cx, inputClassName, useEdgeFade } from "../../components";
import { ChangeInput, StatusOptions, releaseFocus } from "../../components/inputs";
import { attentionOf } from "./attention";
import { useMemberDrag } from "./useMemberDrag";
import styles from "./Members.module.css";

export function MembersView({ hidden }: { hidden: boolean }) {
  return (
    <Page
      hidden={hidden}
      panelOf="members"
      step={3}
      title="メンバーのステータス"
      description="アンケート回答から自動反映しています。ここで修正すると割当候補にすぐ反映されます。"
      id="memberPanel"
      data-view="members"
    >
      <MembersContent />
    </Page>
  );
}

const FILTER_LABEL = (v: string) => (v === "" ? "すべて" : v === "none" ? "店舗未設定" : v);

function MembersContent() {
  const m = useModel();
  // 行はメンバーの並び順（共有の memberOrder。勤務可能表・個人別・印刷と同じ）。要確認の行は色とタグで示す
  const all = allNames(m);
  const allKey = all.join("\n");
  const names = filterMembers(m, all, m.memberQuery, m.memberStore);
  const tbody = useRef<HTMLTableSectionElement>(null);
  const drag = useMemberDrag(tbody, names);
  const counts = memberStoreCounts(m, all);
  const needFix = all.filter((n) => attentionOf(m, n).length).length;
  // 最後に押した並べ替え。並び順がまだそのままなら、その列見出しに向きを出す（もう一度押すと逆順）
  const [lastSort, setLastSort] = useState<{ kind: MemberSort; dir: SortDir } | null>(null);
  const active = lastSort && all.length > 1 && sortedMembers(m, all, lastSort.kind, lastSort.dir).join("\n") === allKey ? lastSort : null;
  const sortBy = (kind: MemberSort, dir: SortDir) => {
    setLastSort({ kind, dir });
    actions.sortMembers(kind, dir);
  };
  const head = (kind: MemberSort) => ({ kind, dir: active?.kind === kind ? active.dir : null, onSort: sortBy });
  return (
    <>
      <div className={styles.toolbar}>
        <SearchInput
          id="memberSearch"
          pageSearch
          shortcut="/"
          placeholder="氏名・ふりがなで検索"
          aria-label="氏名・ふりがなで検索"
          wrapClassName={styles.search}
          value={m.memberQuery}
          onChange={(e) => actions.setMemberQuery(e.target.value)}
        />
        <ChipGroup label="所属店舗で絞り込み" id="memberStoreFilter" className={styles.chips}>
          {counts.map((c) => (
            <Chip
              key={c.value}
              pressed={c.value === m.memberStore}
              data-member-filter={c.value}
              shop={storeNames.includes(c.value) ? c.value : undefined}
              attentionDot={c.value === "none"}
              count={<ChipCount tone={c.value === "none" && c.count > 0 ? "hot" : undefined}>{c.count}</ChipCount>}
              onClick={() => actions.setMemberFilter(c.value)}
            >
              {FILTER_LABEL(c.value)}
            </Chip>
          ))}
        </ChipGroup>
        <Segmented label="並べ替え" size="sm" className={styles.sorts}>
          {MEMBER_SORTS.map((s) => (
            <SegButton
              key={s.value}
              data-member-sort={s.value}
              pressed={sortedMembers(m, all, s.value).join("\n") === allKey}
              title={`${s.title}。並び順は共有され、勤務可能表・個人別・印刷にも反映されます`}
              onClick={() => sortBy(s.value, "asc")}
            >
              {s.label}
            </SegButton>
          ))}
        </Segmented>
        <Spacer />
        <span id="memberShown" className={cx(styles.shown, "num")} aria-live="polite">
          {names.length === all.length ? (
            <>
              <b>{all.length}</b>名を表示
            </>
          ) : (
            <>
              <b>{names.length}</b>
              {` / ${all.length}名を表示`}
            </>
          )}
          {needFix ? (
            <>
              <span className={styles.sep} aria-hidden="true">
                ・
              </span>
              要確認 <b className={styles.hot}>{needFix}</b>名
            </>
          ) : null}
        </span>
      </div>
      {needFix > 0 && (
        <Notice tone="warn" className={styles.needNotice} role="status">
          <span>
            要確認のメンバーが <b className="num">{needFix}</b>名 います（ステータスか所属店舗が未設定）
          </span>
          <Button size="sm" variant="secondary" onClick={() => actions.setMemberFilter(m.memberStore === "attention" ? "" : "attention")}>
            {m.memberStore === "attention" ? "すべて表示に戻す" : "要確認の人だけ表示"}
          </Button>
        </Notice>
      )}
      <MemberFrame>
        <table className={styles.mt}>
          {/* 列の幅は固定（絞り込み・検索で行が変わっても列が横に動かない） */}
          <colgroup>
            <col className={styles.colName} />
            <col className={styles.colKana} />
            <col className={styles.colGrade} />
            <col className={styles.colStatus} />
            <col className={styles.colStores} />
            <col className={styles.colIce} />
            <col className={styles.colCar} />
            <col className={styles.colWork} />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <SortHead {...head("kana")} className={styles.nameHead}>
                スタッフ
              </SortHead>
              <th scope="col" title="五十音順はふりがなで並びます（ふりがながない人は氏名）">
                ふりがな
              </th>
              <SortHead {...head("grade")}>
                学年
              </SortHead>
              <SortHead {...head("status")}>
                ステータス
              </SortHead>
              <SortHead {...head("store")}>
                所属店舗
              </SortHead>
              <SortHead {...head("ice")}>
                アイス
              </SortHead>
              <SortHead {...head("car")}>
                車
              </SortHead>
              <SortHead {...head("work")} note="アンケートの「働ける量」。自動割当の目安（超えても入れることがあります）">
                働ける量
              </SortHead>
              <SortHead {...head("want")}>
                やりたい役職
              </SortHead>
              <SortHead {...head("dislike")}>
                苦手な役職
              </SortHead>
            </tr>
          </thead>
          <tbody id="memberEditor" ref={tbody} className={styles.body}>
            {names.length ? (
              names.map((name) => <MemberRow key={name} m={m} name={name} drag={drag} />)
            ) : (
              <tr className={styles.emptyRow}>
                <td colSpan={10}>該当するメンバーがいません</td>
              </tr>
            )}
          </tbody>
        </table>
      </MemberFrame>
    </>
  );
}

/** 列見出し：押すとその列で並べ替え（もう一度押すと逆順）。並び順は共有 */
function SortHead({
  kind,
  dir,
  onSort,
  note,
  className,
  children,
}: {
  kind: MemberSort;
  dir: SortDir | null;
  onSort: (kind: MemberSort, dir: SortDir) => void;
  note?: string;
  className?: string;
  children: ReactNode;
}) {
  const next: SortDir = dir === "asc" ? "desc" : "asc";
  return (
    <th scope="col" className={className} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
      <button
        type="button"
        className={cx(styles.sortHead, dir && styles.sorted)}
        data-member-col-sort={kind}
        title={`${note ? `${note}\n` : ""}${MEMBER_SORT_LABELS[kind]}${next === "desc" ? "の逆" : ""}に並べ替え。並び順は共有され、勤務可能表・個人別・印刷にも反映されます`}
        onClick={() => onSort(kind, next)}
      >
        {children}
        <Icon name="chev" size={14} className={cx(styles.sortIcon, dir === "desc" && styles.sortDesc)} />
      </button>
    </th>
  );
}

/** 表の枠（中でスクロール）。横に続きがあるとき（タブレット）は右端をぼかす（左の名前の列は固定なのでぼかさない） */
function MemberFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeFade(ref, { start: false });
  return (
    <div className={styles.frame} ref={ref}>
      {children}
    </div>
  );
}

/** 変更を反映してから、その欄のフォーカスを外す（旧版は表を作り直していたので外れた） */
function commit(el: HTMLElement, run: () => void): void {
  run();
  releaseFocus(el);
}

function MemberRow({ m, name, drag }: { m: Model; name: string; drag: ReturnType<typeof useMemberDrag> }) {
  const version = useModelVersion();
  const stores = m.memberStores[name] || [];
  const status = m.memberStatuses[name] || "未設定";
  const ice = iceOf(m.memberDrips[name]);
  const tags = attentionOf(m, name);
  return (
    <tr className={cx(tags.length > 0 && styles.needsFix)} data-member-row={name}>
      <th scope="row" className={styles.name}>
        <IconButton
          icon="grip"
          size="sm"
          className={styles.handle}
          data-member-handle={name}
          label={`${name} の並び順を変える（ドラッグ、または Alt+↑／↓）`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          onPointerDown={drag.onPointerDown(name)}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onKeyDown={drag.onKeyDown(name)}
          onContextMenu={(e) => e.preventDefault()}
        />
        <span className={styles.nameText}>{name}</span>
        {tags.length > 0 && (
          <span className={styles.needTags}>
            {tags.map((t) => (
              <span key={t} className={styles.needTag}>
                {t}
              </span>
            ))}
          </span>
        )}
      </th>
      <td className={styles.kana}>
        <ChangeInput
          className={inputClassName({ size: "sm" }, styles.kanaInput)}
          data-member-kana={name}
          aria-label={`${name} のふりがな`}
          value={m.memberKana[name] || ""}
          resetKey={version}
          placeholder="ふりがな"
          onCommit={(el) => commit(el, () => actions.changeMemberKana(name, el.value))}
        />
      </td>
      <td className={styles.grade}>
        <Select
          data-member-grade={name}
          aria-label={`${name} の学年`}
          title={typeof m.memberGrade[name] === "number" ? `${m.memberGrade[name]}年度入学` : undefined}
          tone={gradeOf(m.memberGrade[name]) ? "default" : "unset"}
          wrapClassName={styles.gradeSelect}
          value={gradeOf(m.memberGrade[name]) || (typeof m.memberGrade[name] === "number" ? "other" : "")}
          onChange={(e) => e.currentTarget.value !== "other" && commit(e.currentTarget, () => actions.changeMemberGrade(name, e.currentTarget.value))}
        >
          <option value="">学年</option>
          {gradeLabels.map((g) => (
            <option key={g}>{g}</option>
          ))}
          {typeof m.memberGrade[name] === "number" && !gradeOf(m.memberGrade[name]) ? <option value="other">{gradeText(m.memberGrade[name])}</option> : null}
        </Select>
      </td>
      <td className={styles.status}>
        <Select
          data-member={name}
          aria-label={`${name} のステータス`}
          tone={status === "未設定" ? "unset" : "default"}
          wrapClassName={styles.statusSelect}
          value={status}
          onChange={(e) => commit(e.currentTarget, () => actions.changeMemberStatus(name, e.currentTarget.value))}
        >
          <StatusOptions />
        </Select>
      </td>
      <td className={styles.stores}>
        <span className={styles.toggles} role="group" aria-label={`${name} の所属店舗`}>
          {storeNames.map((s) => (
            <ShopToggle
              key={s}
              shop={s}
              data-member-store={name}
              value={s}
              aria-label={`${name} ${s}`}
              checked={stores.includes(s)}
              onChange={(e) => commit(e.currentTarget, () => actions.changeMemberStore(name, s, e.currentTarget.checked))}
            />
          ))}
        </span>
      </td>
      <td className={styles.ice}>
        <span className={styles.cellLabel} aria-hidden="true">
          アイス
        </span>
        <Select
          data-member-ice={name}
          aria-label={`${name} のアイス`}
          tone={ice ? "default" : "unset"}
          wrapClassName={styles.iceSelect}
          value={ice}
          onChange={(e) => commit(e.currentTarget, () => actions.changeMemberIce(name, e.currentTarget.value))}
        >
          <option value="">未設定</option>
          {iceStatuses.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </td>
      <td className={styles.car}>
        <Checkbox
          data-member-car={name}
          aria-label={`${name} 車あり`}
          checked={!!m.memberCars[name]}
          onChange={(e) => commit(e.currentTarget, () => actions.changeMemberCar(name, e.currentTarget.checked))}
          label={
            <span aria-hidden="true">
              <span className="m-only">車</span>あり
            </span>
          }
        />
      </td>
      <td className={styles.work}>
        <span className={styles.cellLabel} aria-hidden="true">
          働ける量
        </span>
        <Select
          data-member-workload={name}
          aria-label={`${name} の働ける量`}
          tone={m.memberWorkload[name] ? "default" : "unset"}
          wrapClassName={styles.workSelect}
          value={m.memberWorkload[name] || ""}
          onChange={(e) => commit(e.currentTarget, () => actions.changeMemberWorkload(name, e.currentTarget.value))}
        >
          <option value="">未回答</option>
          {workloadLevels.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </td>
      <td className={styles.want}>
        <label className={styles.pref}>
          <span className={styles.cellLabel}>やりたい役職</span>
          <ChangeInput
            className={inputClassName({ size: "sm" }, styles.prefInput)}
            data-member-want={name}
            aria-label={`${name} のやりたい役職`}
            value={(m.memberWants[name] || []).join("、")}
            resetKey={version}
            placeholder="例：レジ、ホール"
            onCommit={(el) => commit(el, () => actions.changeMemberWants(name, el.value))}
          />
        </label>
      </td>
      <td className={styles.dislike}>
        <label className={styles.pref}>
          <span className={styles.cellLabel}>苦手な役職</span>
          <ChangeInput
            className={inputClassName({ size: "sm" }, styles.prefInput)}
            data-member-dislike={name}
            aria-label={`${name} の苦手な役職`}
            value={(m.memberDislikes[name] || []).join("、")}
            resetKey={version}
            placeholder="なし"
            onCommit={(el) => commit(el, () => actions.changeMemberDislikes(name, el.value))}
          />
        </label>
      </td>
    </tr>
  );
}
