// 1. 読み込み：アンケート回答 CSV の選択・ドロップ（Dropzone）、まずは試してみる（TryCard）、はじめの3ステップ、
// 読み込み結果（ImportResult・#importStatus）、共同編集中の読み込み制限（#importLock）、CSV の形式（FormatHelp）。
// 読み込み・サンプル・ダウンロードは actions を呼ぶだけ。確認・警告（alert）は actions のまま（旧版と同じ）

import { useState, useSyncExternalStore } from "react";
import type { DragEvent } from "react";
import { store, actions, useUi } from "../../../store";
import type { ImportStatus } from "../../../store";
import { Button, Card, Disclosure, Icon, Notice, Page, cx } from "../../components";
import { ImportResult } from "./ImportResult";
import styles from "./ImportView.module.css";
import { PourOver } from "./PourOver";

/** store の値を1つ選んで読む（変わったときだけ再描画） */
const useStoreValue = <T,>(select: () => T): T => useSyncExternalStore(store.subscribe, select);
const useHasData = (): boolean => useStoreValue(() => store.model.availability.length > 0);

/** いま表示している読み込み結果が、どのファイルから来たか（この画面で選んだ・落としたものだけ分かる） */
interface Source {
  name: string;
  at: Date;
  /** そのときの読み込み結果（結果が変われば＝ほかの読み込み・共同編集の受信なら、もう当てはまらない） */
  status: ImportStatus;
}

export function ImportView({ hidden }: { hidden: boolean }) {
  const has = useHasData();
  const locked = useUi((u) => u.share.importLock !== null);
  const status = useUi((u) => u.importStatus);
  const [source, setSource] = useState<Source | null>(null);

  /** 読み込みを行い、結果が新しくなったら「どのファイルか」を覚える（失敗・制限なら結果は変わらない） */
  const track = async (name: string, run: () => void | Promise<void>) => {
    const before = store.ui.importStatus;
    await run();
    const after = store.ui.importStatus;
    if (after && after !== before) setSource({ name, at: new Date(), status: after });
  };
  const current = source && source.status === status ? source : null;
  const compact = has && !locked;

  return (
    <Page
      hidden={hidden}
      panelOf="import"
      data-view="import"
      step={1}
      title="アンケート回答を読み込む"
      description="氏名・ふりがな・学年・ステータス・所属店舗・アイス・車の有無・役職の希望・働ける量・勤務可能時間をCSVから読み込みます。"
    >
      <div className={styles.grid}>
        <div className={styles.aDrop}>
          <Dropzone locked={locked} compact={compact} source={current} onFile={(f, fromPicker) => void track(f.name, () => actions.importFile(f, fromPicker))} />
          <ImportLock />
          <ImportResult />
        </div>
        <div className={styles.aTry}>
          <TryCard has={has} locked={locked} onSample={() => void track("2025年ベースのサンプル（50名）", actions.loadSample)} />
        </div>
        <div className={styles.aMain}>
          {!has || locked ? <Steps /> : null}
          <FormatHelp />
        </div>
      </div>
    </Page>
  );
}

const FIELDS = ["氏名", "ふりがな", "学年", "ステータス", "所属店舗", "アイス", "車の有無", "やりたい・苦手な役職", "働ける量", "日付・時刻"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

interface DropzoneProps {
  locked: boolean;
  /** 読み込み済み：1行のファイルの表示（「別のCSVを選択」） */
  compact: boolean;
  source: Source | null;
  onFile: (file: File, fromPicker: boolean) => void;
}

/** label[for=csvInput][data-dropzone]。押すとファイル選択、ドロップでも読み込む */
function Dropzone({ locked, compact, source, onFile }: DropzoneProps) {
  const [over, setOver] = useState(false);
  const leave = (e: DragEvent<HTMLLabelElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
  };
  return (
    <label
      className={cx(styles.dropzone, compact && styles.compact, over && styles.isOver, locked && styles.isLocked)}
      htmlFor="csvInput"
      data-dropzone=""
      title={locked ? "共同編集中のため、CSVの読み込みは管理者だけができます" : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={leave}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f, false);
      }}
    >
      <input
        id="csvInput"
        className={styles.fileInput}
        type="file"
        accept=".csv,text/csv"
        aria-describedby={locked ? "importLock" : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f, true);
        }}
      />
      {compact ? (
        <>
          <span className={styles.fileIcon}>
            <Icon name="doc" size={20} />
          </span>
          <span className={styles.dzText}>
            <span className={styles.dzTitle}>{source ? source.name : "読み込み済みのデータ"}</span>
            <span className={styles.dzSub}>
              {source ? `${stamp(source.at)} に読み込み ・ ` : ""}
              別のCSVをドロップすると回答を丸ごと置き換えます
            </span>
          </span>
          <span className={styles.fakeBtn} aria-hidden="true">
            <Icon name="upload" />
            別のCSVを選択
          </span>
        </>
      ) : (
        <>
          <PourOver />
          <span className={styles.dzText}>
            <span className={styles.dzTitle}>
              <span className="d-only">CSVファイルをここにドロップ</span>
              <span className="m-only">CSVファイルを選ぶ</span>
            </span>
            <span className={styles.dzSub}>
              Googleフォームなどの回答をCSVで書き出して、そのまま入れてください。
              <br className="d-only" />
              勤務可能表とメンバー情報が一度に抽出されます。
            </span>
            <span className={styles.fields}>
              {FIELDS.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </span>
            <span className={styles.dzActions}>
              <span className={styles.fakeBtn} aria-hidden="true">
                <Icon name="upload" />
                CSVファイルを選択
              </span>
              <span className={styles.or}>またはドラッグ＆ドロップ ・ UTF-8／Shift_JIS 対応</span>
            </span>
          </span>
        </>
      )}
    </label>
  );
}

/** 共同編集中で管理者でないときの案内（#importLock）。文は sync が決める（「…できます。（管理者：a、b）」） */
function ImportLock() {
  const lock = useUi((u) => u.share.importLock);
  const m = lock?.match(/^(.*?。)\s*(?:（(管理者：.*)）)?$/);
  return (
    <Notice tone="warn" icon="lock" id="importLock" className={styles.lock} hidden={lock === null}>
      {m ? (
        <>
          <b>{m[1]}</b>
          {m[2] ? (
            <>
              <br />
              {m[2]}
            </>
          ) : null}
        </>
      ) : (
        lock
      )}
    </Notice>
  );
}

/** まずは試してみる。データがあるときは 2025年ベースのサンプル を secondary に下げ、置き換わる注意を出す（確認ダイアログは増やさない） */
function TryCard({ has, locked, onSample }: { has: boolean; locked: boolean; onSample: () => void }) {
  return (
    <Card className={styles.try}>
      <h2 className={styles.tryTitle}>
        <Icon name="bean" />
        まずは試してみる
      </h2>
      <p className={styles.tryText}>
        雙峰祭2025 の人数・勤務可能時間・ステータス・所属をもとにした架空の50名・3日間のサンプルで、自動割当や手直しの操作感を確認できます。
      </p>
      <div className={styles.tryBtns}>
        <Button
          id="sampleBtn"
          variant={has ? "secondary" : "primary"}
          // 共同編集の鍵がかかっているとき（部屋のデータがある）も形は最初の lg のまま。色だけ使えない色にする
          size={has && !locked ? "md" : "lg"}
          icon="sparkle"
          className={cx(locked && styles.lockedBtn, !(has && !locked) && styles.tryBtnLg)}
          aria-disabled={locked || undefined}
          aria-describedby={locked ? "importLock" : has ? "sampleNote" : undefined}
          onClick={onSample}
        >
          2025年ベースのサンプルを読み込む
        </Button>
        <Button id="sampleDataBtn" icon="download" onClick={actions.downloadSample}>
          サンプルCSVをダウンロード
        </Button>
        <Button id="templateBtn" icon="doc" onClick={actions.downloadTemplate}>
          テンプレートをダウンロード
        </Button>
      </div>
      {has && !locked ? (
        <p className={styles.tryNote} id="sampleNote">
          <Icon name="info" size={14} />
          読み込むと、いまのデータはサンプルに置き換わります。
        </p>
      ) : null}
    </Card>
  );
}

const STEPS: [string, string][] = [
  ["回答を読み込む", "勤務可能表とメンバー情報がまとめて入ります。"],
  ["メンバーと役職ルールを確認", "ステータス・所属店舗・アイスの抜けを直します。"],
  ["自動割当して手直し", "空き枠をクリック、名前をドラッグして仕上げます。"],
];

/** はじめての人向けの流れ（読み込み前だけ） */
function Steps() {
  return (
    <ol className={styles.steps} aria-label="使い方">
      {STEPS.map(([title, text], i) => (
        <li key={title} className={styles.step}>
          <span className={styles.stepNo} aria-hidden="true">
            {i + 1}
          </span>
          <span>
            <b>{title}</b>
            <span>{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const FORMAT_ROWS: [string, string, string][] = [
  ["氏名", "必須", "山田 太郎"],
  ["ふりがな（任意）", "メンバーの五十音順に使います。カタカナでも可（ひらがなにそろえます）", "やまだ たろう"],
  [
    "学年（任意）",
    "B1〜B4（学部）／M1〜M2（修士）／D1〜D3（博士）。「学部1年」「修士2年」「26（入学年度）」も可。メンバーの学年順に使います（入学年度の下2桁で覚えるので、2026年度は B1＝26 … D3＝18）",
    "B2",
  ],
  ["ステータス", "未合格／1年目合格／2年目合格／上級生（未合格の人はアイス × 扱い）", "2年目合格"],
  ["所属店舗", "本店／2号店／くれあ。複数は区切って記入", "本店, くれあ"],
  [
    "アイス",
    "○（1杯・2杯とも）／1杯のみ／2杯のみ／×（アイス不可）。ホットは全員できる前提です。旧形式（1杯ホット, 2杯アイス …の列挙）も読めます",
    "1杯のみ",
  ],
  ["車の有無", "あり／なし（前日準備の買い出しは車ありの人だけ）", "あり"],
  ["やりたい役職・苦手な役職", "複数可（美化・裏シフトも可）。自動割当で、やりたい役職を優先し、苦手な役職はなるべく避けます", "レジ、ホール"],
  [
    "働ける量（任意）",
    "少し（1日 2〜3時間）／5時間程度／いっぱい。空欄は希望なし。自動割当は目安（少し＝3時間・5時間程度＝5時間／日）に届いた人を後回しにします（ほかに入れる人がいなければ超えても入れ、勤務状況チェックに「目安超え」と出ます）",
    "5時間程度",
  ],
  ["日付・開始時刻・終了時刻", "2026-10-30 や 2026/10/30、9:00 や 09:00 のどちらでも可（時刻は30分単位まで）", "2026-10-31, 10:00, 18:00"],
];

/** CSV の形式（開閉できる表） */
function FormatHelp() {
  return (
    <Card className={styles.format}>
      <Disclosure label="CSVの形式を見る">
        <p className={styles.formatText}>1人が複数日参加する場合は、日付ごとに1行ずつ記入します。見出し行の列名はおおよそ一致していれば読み込めます。</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.colName}>
                  列名
                </th>
                <th scope="col">書き方</th>
                <th scope="col" className={styles.colEx}>
                  例
                </th>
              </tr>
            </thead>
            <tbody>
              {FORMAT_ROWS.map(([a, b, c]) => (
                <tr key={a}>
                  <th scope="row">{a}</th>
                  <td>{b}</td>
                  <td>
                    <code>{c}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </Card>
  );
}
