// アンケート回答 CSV を作るページ（/mock）：CSV を読み込んで、表で直して、同じ形式でダウンロードする（試用データの作成・手直し用）。
// アプリ本体（store・共同編集）は起動しない。データはこのブラウザの中だけ（下書きは localStorage）で、どこにも送らない

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  addSurveyMember,
  dayName,
  decodeCsvBytes,
  emptySurvey,
  eventDays,
  gradeCode,
  gradeLabels,
  gradeOf,
  iceOf,
  iceStatuses,
  importFailedMessage,
  readSurvey,
  removeSurveyMember,
  renameSurveyMember,
  sampleCsv,
  setMemberCar,
  setMemberDislikes,
  setMemberGrade,
  setMemberIce,
  setMemberKana,
  setMemberStatus,
  setMemberStore,
  setMemberWants,
  setMemberWorkload,
  setSpans,
  shortDay,
  spansText,
  statusNames,
  storeNames,
  surveyCsv,
  surveyDates,
  workloadLevels,
} from "../../domain";
import type { SurveyDoc } from "../../domain";
import { download } from "../../store/browser";
import { Button, Checkbox, IconButton, IconSprite, Notice, SearchInput, Select, ShopToggle, cx, inputClassName } from "../components";
import { ChangeInput, StatusOptions, releaseFocus } from "../components/inputs";
import styles from "./MockPage.module.css";

const DRAFT_KEY = "shift-mock-draft";
const FILE_NAME = "survey_mock.csv";

const loadDraft = (): SurveyDoc => {
  try {
    const text = localStorage.getItem(DRAFT_KEY);
    if (text) return readSurvey(text);
  } catch {
    /* 下書きがなければ空から */
  }
  return emptySurvey();
};
const saveDraft = (d: SurveyDoc) => {
  try {
    if (d.names.length) localStorage.setItem(DRAFT_KEY, surveyCsv(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 保存できなくても使える */
  }
};

const norm = (s: string) => s.normalize("NFKC").replace(/\s/g, "");
/** アイスの短い表示（アプリのドリッパーの記号と同じ） */
const iceMark = (ice: string) => (ice === "×" ? "H" : ice ? ice[0] : "未設定");

export function MockPage() {
  const [doc, setDoc] = useState(loadDraft);
  const [, setVersion] = useState(0);
  const [warns, setWarns] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  /** 変更して描き直し、下書きに残す */
  const edit = (run: (d: SurveyDoc) => unknown) => {
    const r = run(doc);
    saveDraft(doc);
    setVersion((v) => v + 1);
    return r;
  };
  const load = (text: string) => {
    if (doc.names.length && !confirm("いまの内容を捨てて読み込みますか？")) return;
    try {
      const next = readSurvey(text);
      saveDraft(next);
      setDoc(next);
      setWarns(next.warns);
      setQuery("");
    } catch (e) {
      alert(importFailedMessage(e as Error));
    }
  };
  const loadFile = async (f: File | undefined) => {
    if (f) load(decodeCsvBytes(await f.arrayBuffer()));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files[0]);
  };
  const addMember = () => {
    const name = prompt("追加するメンバーの氏名");
    if (name === null) return;
    if (!edit((d) => addSurveyMember(d, name))) alert("空の名前・同じ名前のメンバーは追加できません。");
    else setQuery("");
  };
  const clear = () => {
    if (!confirm("すべてのメンバーを消して空にしますか？")) return;
    const next = emptySurvey();
    saveDraft(next);
    setDoc(next);
    setWarns([]);
  };

  const dates = surveyDates(doc);
  const q = norm(query);
  const names = q ? doc.names.filter((n) => norm(n).includes(q) || norm(doc.m.memberKana[n] || "").includes(q)) : doc.names;

  return (
    <div
      className={styles.shell}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <IconSprite />
      <div className={styles.top}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Shift Maker</p>
          <h1 className={styles.title}>アンケート回答 CSV を作る</h1>
          <p className={styles.lead}>
            CSV を読み込んで表で直し、同じ形式でダウンロードします（アプリの「読み込み」にそのまま入れられます）。
            データはこのブラウザの中だけで扱い、どこにも送りません。途中の内容はこのブラウザに残ります。
          </p>
        </header>
        <div className={styles.toolbar}>
          <Button id="mockOpen" icon="upload" onClick={() => file.current?.click()}>
            CSV を読み込む
          </Button>
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              void loadFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <Button id="mockSample" variant="ghost" icon="doc" onClick={() => load(sampleCsv())}>
            サンプルを読み込む
          </Button>
          <Button id="mockAdd" variant="ghost" icon="plus" onClick={addMember}>
            メンバーを追加
          </Button>
          {doc.names.length ? (
            <Button id="mockClear" variant="ghost" icon="trash" onClick={clear}>
              空にする
            </Button>
          ) : null}
          <span className={styles.spacer} />
          <Button id="mockDownload" variant="primary" icon="download" disabled={!doc.names.length} onClick={() => download(FILE_NAME, surveyCsv(doc))}>
            CSV をダウンロード
          </Button>
        </div>
        {warns.length ? (
          <Notice tone="warn" className={styles.notice}>
            <span>
              {warns.map((w) => (
                <span key={w} className={styles.warn}>
                  {w}
                </span>
              ))}
            </span>
          </Notice>
        ) : null}
        {doc.names.length ? (
          <div className={styles.summary}>
            <SearchInput
              id="mockSearch"
              placeholder="氏名・ふりがなで検索"
              aria-label="氏名・ふりがなで検索"
              wrapClassName={styles.search}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <Summary doc={doc} />
          </div>
        ) : null}
      </div>

      {doc.names.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.mt} id="mockTable">
            <thead>
              <tr>
                <th scope="col" className={styles.nameHead}>
                  氏名
                </th>
                <th scope="col">ふりがな</th>
                <th scope="col">学年</th>
                <th scope="col">ステータス</th>
                <th scope="col">所属店舗</th>
                <th scope="col">アイス</th>
                <th scope="col">車</th>
                <th scope="col">働ける量</th>
                <th scope="col">やりたい役職</th>
                <th scope="col">苦手な役職</th>
                {dates.map((date, i) => (
                  <th key={date} scope="col" title="例：10-14 16:30-20（空欄は不参加）">
                    {eventDays[date] || dayName(date, i)}
                    <small className={styles.headDate}>{shortDay(date)}</small>
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">削除</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <Row key={name} doc={doc} name={name} dates={dates} edit={edit} />
              ))}
              {!names.length ? (
                <tr>
                  <td colSpan={11 + dates.length} className={styles.empty}>
                    該当するメンバーがいません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={cx(styles.drop, dragging && styles.dropOn)}>
          <p>CSV をここにドロップするか、「CSV を読み込む」「サンプルを読み込む」から始めてください。</p>
          <p className={styles.meta}>アンケート回答の CSV（アプリの「読み込み」と同じ形式。Attendar の出欠表も可）を読み込めます。</p>
        </div>
      )}
    </div>
  );
}

/** ステータス・アイスの人数 */
function Summary({ doc }: { doc: SurveyDoc }) {
  const count = (f: (n: string) => string) => {
    const out: Record<string, number> = {};
    for (const n of doc.names) out[f(n)] = (out[f(n)] || 0) + 1;
    return out;
  };
  const st = count((n) => doc.m.memberStatuses[n] || "未設定"),
    ice = count((n) => iceOf(doc.m.memberDrips[n]));
  return (
    <p className={cx(styles.meta, "num")} id="mockSummary">
      <b>{doc.names.length}</b>名
      <span className={styles.sep}>・</span>
      {statusNames
        .filter((s) => st[s])
        .map((s) => `${s} ${st[s]}`)
        .join("／")}
      <span className={styles.sep}>・</span>
      アイス{" "}
      {[...iceStatuses, ""]
        .filter((s) => ice[s])
        .map((s) => `${iceMark(s)} ${ice[s]}`)
        .join("／")}
    </p>
  );
}

function Row({ doc, name, dates, edit }: { doc: SurveyDoc; name: string; dates: string[]; edit: (run: (d: SurveyDoc) => unknown) => unknown }) {
  const { m } = doc;
  const stores = m.memberStores[name] || [];
  const status = m.memberStatuses[name] || "未設定";
  const ice = iceOf(m.memberDrips[name]);
  const grade = gradeOf(m.memberGrade[name]);
  /** 確定した欄は変更を反映してからフォーカスを外す */
  const set = (el: HTMLElement, run: () => unknown) => {
    edit(run);
    releaseFocus(el);
  };
  return (
    <tr data-mock-row={name}>
      <th scope="row" className={styles.name}>
        <ChangeInput
          className={inputClassName({ size: "sm" }, styles.nameInput)}
          aria-label={`${name} の氏名`}
          value={name}
          onCommit={(el) => {
            if (!edit((d) => renameSurveyMember(d, name, el.value)) && el.value.trim() !== name) {
              alert("空の名前・同じ名前のメンバーにはできません。");
              el.value = name;
            }
            releaseFocus(el);
          }}
        />
      </th>
      <td>
        <ChangeInput
          className={inputClassName({ size: "sm" }, styles.kanaInput)}
          aria-label={`${name} のふりがな`}
          value={m.memberKana[name] || ""}
          placeholder="ふりがな"
          onCommit={(el) => set(el, () => setMemberKana(m, name, el.value))}
        />
      </td>
      <td>
        <Select
          aria-label={`${name} の学年`}
          tone={grade ? "default" : "unset"}
          wrapClassName={styles.gradeSelect}
          value={grade}
          onChange={(e) => set(e.currentTarget, () => setMemberGrade(m, name, gradeCode(e.currentTarget.value)))}
        >
          <option value="">学年</option>
          {gradeLabels.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
      </td>
      <td>
        <Select
          aria-label={`${name} のステータス`}
          tone={status === "未設定" ? "unset" : "default"}
          wrapClassName={styles.statusSelect}
          value={status}
          onChange={(e) => set(e.currentTarget, () => setMemberStatus(m, name, e.currentTarget.value))}
        >
          <StatusOptions />
        </Select>
      </td>
      <td>
        <span className={styles.toggles} role="group" aria-label={`${name} の所属店舗`}>
          {storeNames.map((s) => (
            <ShopToggle
              key={s}
              shop={s}
              aria-label={`${name} ${s}`}
              checked={stores.includes(s)}
              onChange={(e) => set(e.currentTarget, () => setMemberStore(m, name, s, e.currentTarget.checked))}
            />
          ))}
        </span>
      </td>
      <td>
        <Select
          aria-label={`${name} のアイス`}
          tone={ice ? "default" : "unset"}
          wrapClassName={styles.iceSelect}
          value={ice}
          onChange={(e) => set(e.currentTarget, () => setMemberIce(m, name, e.currentTarget.value))}
        >
          <option value="">未設定</option>
          {iceStatuses.map((v) => (
            <option key={v} value={v}>
              {v === "○" ? v : `${v}（${iceMark(v)}）`}
            </option>
          ))}
        </Select>
      </td>
      <td>
        <Checkbox
          aria-label={`${name} 車あり`}
          checked={!!m.memberCars[name]}
          onChange={(e) => set(e.currentTarget, () => setMemberCar(m, name, e.currentTarget.checked))}
          label="あり"
        />
      </td>
      <td>
        <Select
          aria-label={`${name} の働ける量`}
          tone={m.memberWorkload[name] ? "default" : "unset"}
          wrapClassName={styles.workSelect}
          value={m.memberWorkload[name] || ""}
          onChange={(e) => set(e.currentTarget, () => setMemberWorkload(m, name, e.currentTarget.value))}
        >
          <option value="">未回答</option>
          {workloadLevels.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </td>
      <td>
        <ChangeInput
          className={inputClassName({ size: "sm" }, styles.prefInput)}
          aria-label={`${name} のやりたい役職`}
          value={(m.memberWants[name] || []).join("、")}
          placeholder="例：レジ、ホール"
          onCommit={(el) => set(el, () => setMemberWants(m, name, el.value))}
        />
      </td>
      <td>
        <ChangeInput
          className={inputClassName({ size: "sm" }, styles.prefInput)}
          aria-label={`${name} の苦手な役職`}
          value={(m.memberDislikes[name] || []).join("、")}
          placeholder="なし"
          onCommit={(el) => set(el, () => setMemberDislikes(m, name, el.value))}
        />
      </td>
      {dates.map((date) => (
        <td key={date}>
          <ChangeInput
            className={inputClassName({ size: "sm", mono: true }, styles.spanInput)}
            aria-label={`${name} の ${shortDay(date)} の勤務可能時間`}
            value={spansText(doc, name, date)}
            placeholder="不参加"
            onCommit={(el) => {
              if (!edit((d) => setSpans(d, name, date, el.value))) {
                alert("時間を読めませんでした。「10-14 16:30-20」のように、開始-終了を空白で区切って入れてください。");
                el.value = spansText(doc, name, date);
              }
              releaseFocus(el);
            }}
          />
        </td>
      ))}
      <td>
        <IconButton
          icon="trash"
          size="sm"
          label={`${name} を削除`}
          onClick={() => confirm(`${name} を削除しますか？`) && edit((d) => removeSurveyMember(d, name))}
        />
      </td>
    </tr>
  );
}
