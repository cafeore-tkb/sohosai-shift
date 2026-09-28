// 読み込み結果のカード（#importStatus、aria-live）：読み込み完了＋件数、✓／⚠ の一覧、「メンバー」タブで修正できます、
// シフト調整へ進む（data-goto="shift"）、次の一歩の案内。文言は domain（importSurvey・SAMPLE_INTRO）が決めたものをそのまま出す

import { useMemo } from "react";
import { IMPORT_WARN_NOTE, hasAssignments } from "../../../domain";
import { actions, store, useModelVersion, useUi } from "../../../store";
import { Button, Card, Icon, Pill, Spacer } from "../../components";
import styles from "./ImportView.module.css";

export function ImportResult() {
  const status = useUi((u) => u.importStatus);
  // 見出しの件数は読み込んだ時点のもの（結果が変わったときだけ数え直す）
  const head = useMemo(() => {
    const av = store.model.availability;
    return `${new Set(av.map((x) => x.name)).size}名・${av.length}件の勤務可能時間`;
  }, [status]);
  const warns = status ? status.lines.filter((l) => l.warn).length : 0;

  return (
    <Card id="importStatus" className={styles.result} aria-live="polite" hidden={!status}>
      {status ? (
        <>
          <div className={styles.resultHead}>
            <Pill tone="ok" size="lg">
              <Icon name="check" size={14} />
              読み込み完了
            </Pill>
            <h2 className={styles.resultTitle}>{head}</h2>
            {warns ? (
              <Pill tone="warn" size="lg" className={styles.push}>
                {`確認が必要 ${warns}件`}
              </Pill>
            ) : null}
          </div>
          <ul className={styles.lines}>
            {status.lines.map((l, i) => (
              <li key={i} className={l.warn ? styles.isWarn : styles.isOk}>
                <Icon name={l.warn ? "alert" : "check"} />
                <span>{l.warn ? <WarnText text={l.text} /> : l.text}</span>
              </li>
            ))}
          </ul>
          <div className={styles.resultFoot}>
            {status.warn ? (
              <>
                <small>{IMPORT_WARN_NOTE}</small>
                <Button variant="ghost" size="sm" icon="users" onClick={() => actions.showView("members")}>
                  メンバーを開く
                </Button>
              </>
            ) : null}
            <Spacer />
            <Button variant="primary" iconEnd="arrow" data-goto="shift" onClick={() => actions.showView("shift")}>
              シフト調整へ進む
            </Button>
          </div>
          <NextHint />
        </>
      ) : null}
    </Card>
  );
}

/** 「ステータスを判別できなかった回答：三浦悠（先輩）」→ 説明は警告の色、値（名前など）は本文の色の太字 */
function WarnText({ text }: { text: string }) {
  const i = text.indexOf("：");
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i + 1)}
      <b>{text.slice(i + 1)}</b>
    </>
  );
}

/** まだ割当がなければ、次にすること（自動割当）を案内する */
function NextHint() {
  const version = useModelVersion();
  const assigned = useMemo(() => hasAssignments(store.model), [version]);
  if (assigned) return null;
  return (
    <p className={styles.nextHint}>
      次は
      <b>
        <Icon name="sparkle" size={14} />
        自動割当
      </b>
      でたたき台を作れます
    </p>
  );
}
