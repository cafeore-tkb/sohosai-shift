// 3. メンバー：ステータス・所属店舗・アイス・車・やりたい／苦手な役職の編集
// デスクトップは表、スマホ（≤640px）は同じ DOM（tr）を CSS でカードに並べ替える

import { useRef } from "react";
import type { ReactNode } from "react";
import { MEMBER_SORTS, allNames, workloadLevels, filterMembers, iceOf, iceStatuses, memberStoreCounts, sortedMembers, storeNames } from "../../../domain";
import type { Model } from "../../../domain";
import { actions, useModel, useModelVersion } from "../../../store";
import { Button, Checkbox, Chip, ChipCount, ChipGroup, IconButton, Notice, Page, SearchInput, SegButton, Segmented, Select, ShopToggle, Spacer, cx, inputClassName, useEdgeFade } from "../../components";
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
  return (
    <>
      <div className={styles.toolbar}>
        <SearchInput
          id="memberSearch"
          pageSearch
          shortcut="/"
          placeholder="氏名で検索"
          aria-label="氏名で検索"
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
              onClick={() => actions.sortMembers(s.value)}
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
              <th scope="col" className={styles.nameHead}>
                スタッフ
              </th>
              <th scope="col">ステータス</th>
              <th scope="col">所属店舗</th>
              <th scope="col">アイス</th>
              <th scope="col">車</th>
              <th scope="col" title="アンケートの「働ける量」。自動割当の目安（超えても入れることがあります）">働ける量</th>
              <th scope="col">やりたい役職</th>
              <th scope="col">苦手な役職</th>
            </tr>
          </thead>
          <tbody id="memberEditor" ref={tbody} className={styles.body}>
            {names.length ? (
              names.map((name) => <MemberRow key={name} m={m} name={name} drag={drag} />)
            ) : (
              <tr className={styles.emptyRow}>
                <td colSpan={8}>該当するメンバーがいません</td>
              </tr>
            )}
          </tbody>
        </table>
      </MemberFrame>
    </>
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
