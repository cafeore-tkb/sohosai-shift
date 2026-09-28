// ステータスバー（下 28px、固定）：全体の集計（旧版のサマリーと同じ id）・⌘Z 元に戻す・? ヘルプ・フッターの文言（#footerNote）。
// スマホでは隠れる（集計はシフト調整の上の帯、フッターの文言はその「内訳」に出す）。

import { actions, useCanUndo, useModel, useUi } from "../../store";
import { Icon, KbdHint, MOD_KEY, Meter, cx } from "../components";
import { useStats } from "../useDerived";
import { HELP_POPOVER_ID } from "./HelpPopover";
import styles from "./StatusBar.module.css";

/** 共同編集していないときのフッターの文言 */
export const DEFAULT_FOOTER_NOTE = "データはこのブラウザ内で処理されます。インターネット接続は不要です。";

const num = (n: number) => n.toLocaleString("ja-JP");

export function StatusBar() {
  const s = useStats();
  const has = useModel().availability.length > 0;
  const canUndo = useCanUndo();
  const helpOpen = useUi((u) => u.helpOpen);
  const note = useUi((u) => u.share.footerNote);
  return (
    <footer className={styles.bar} aria-label="全体の集計">
      <span className={styles.stat}>
        スタッフ<b id="staffCount">{num(s.staff)}</b>
      </span>
      <Div minor />
      <span className={cx(styles.stat, styles.minor)}>
        必要枠<b id="slotCount">{num(s.slots)}</b>
      </span>
      <Div minor />
      <span className={cx(styles.stat, styles.minor)}>
        割当済み<b id="filledCount">{num(s.filled)}</b>
      </span>
      <Div />
      <span id="openStat" className={cx(styles.stat, s.open > 0 && styles.isOpen)}>
        未割当<b id="openCount">{num(s.open)}</b>
      </span>
      <span className={styles.conflictGroup} hidden={!s.conflicts}>
        <Div />
        <span id="conflictStat" className={cx(styles.stat, styles.isConflict)}>
          重複<b id="conflictCount">{num(s.conflicts)}</b>
        </span>
      </span>
      <Div />
      <span className={styles.meter} title="充足率">
        充足率
        <Meter value={s.rate} fillId="fillBar" className={styles.track} />
        <b id="fillRate">{`${s.rate}%`}</b>
      </span>

      <span className={styles.right}>
        {has ? (
          <>
            <button
              type="button"
              className={styles.key}
              disabled={!canUndo}
              title={`直前の割当の変更を元に戻す（${MOD_KEY}Z）`}
              onClick={actions.undoShortcut}
            >
              <KbdHint keys={[MOD_KEY, "Z"]}>元に戻す</KbdHint>
            </button>
            <button
              type="button"
              className={styles.key}
              data-help-anchor=""
              aria-expanded={helpOpen}
              aria-controls={HELP_POPOVER_ID}
              title="凡例と操作ヘルプ（?）"
              onClick={() => actions.toggleHelp()}
            >
              <KbdHint keys={["?"]}>ヘルプ</KbdHint>
            </button>
            <Div />
          </>
        ) : null}
        <span id="footerNote" className={styles.note} title={note ?? DEFAULT_FOOTER_NOTE}>
          <Icon name={note ? "cloud" : "lock"} size={14} />
          <span>{note ?? DEFAULT_FOOTER_NOTE}</span>
        </span>
      </span>
    </footer>
  );
}

/** 区切り。minor は狭い画面で隠す数字（必要枠・割当済み）の前の区切り */
const Div = ({ minor }: { minor?: boolean }) => <span className={cx(styles.div, minor && styles.minor)} aria-hidden="true" />;
