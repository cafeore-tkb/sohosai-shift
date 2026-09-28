// 凡例と操作ヘルプ（? キー・ステータスバーの「? ヘルプ」・シフト表の下の凡例の「ヘルプ」）。開閉は store の ui.helpOpen。
// 位置：押したボタン（[data-help-anchor]）の上。キーボードで開いたときは、見えている [data-help-anchor] のうち
// シフト表の凡例のもの → ステータスバーのもの の順。どれも見えなければ（スマホ）下からのシートになる。
// 操作ヘルプは旧版の文言がもと。手で移動した割当・条件を変えた割当を外さない決まり（どの枠へも移動・範囲の移動・条件外）に合わせて直した。
// 利用者向けの手順書（README_共有手順.txt）と内容をそろえること。

import { actions, useUi } from "../../store";
import { CarChip, CloseButton, Drip, Icon, Kbd, KbdHint, MOD_KEY, Mark, Popover, Swatch } from "../components";
import type { SwatchKind } from "../components";
import styles from "./HelpPopover.module.css";

export const HELP_POPOVER_ID = "helpPopover";

/** 開いている位置の基準（押したボタン → 見えている凡例のボタン → ステータスバー） */
function helpAnchor(): HTMLElement | null {
  const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0 && !el.closest("[hidden]");
  const active = document.activeElement;
  if (active?.closest("[data-help-anchor]") && visible(active)) return active.closest<HTMLElement>("[data-help-anchor]");
  const all = [...document.querySelectorAll("[data-help-anchor]")].filter(visible);
  return all.find((x) => x.closest("main")) ?? all[0] ?? null;
}

const HELP_TIPS: readonly string[] = [
  "役職別では、行が30分ごとの時間、列が役職の各番目（ドリッパー1st〜6th、リベロ1〜3 など）で、1セルに1人です。斜線は不要な時間で、押すと必要人数を設定できます。",
  "枠をクリックすると担当者を選べます。「空いている人」と「別の枠で勤務中の人」に分かれ、名前で絞り込めます（↑↓で選んでEnter）。「長さ」は標準1時間（この枠と次の枠）で、30分〜最大に変えられます。",
  "名前をドラッグすると、どの枠へでも移動できます（30分のセルごと。日・時間・役職を問わず、人がいれば入れ替え）。緑の枠は条件に合う移動先で、それ以外に置くと重複・勤務できない時間・条件外の色で表示されます。スマホ・タブレットは長押ししてからドラッグ。表の端に近づけると自動でスクロールします。",
  "Shift＋クリック（または Shift＋↑↓）で、同じ列の続いた時間をまとめて選べます。選んだセルをドラッグ（または「移動…」・M）すると、時間のずれを保ったまま移動先の列へまとめて移動し、そこにいた人は元の時間へ入れ替わります。移動先の列に枠のない時間があるときは移動しません。Esc で選択をやめます。",
  "割当や移動のあとに出る「元に戻す」（または ⌘Z／Ctrl+Z）で、直前の操作を取り消せます（範囲の移動も1回で戻ります）。",
  "名前は姓だけを表示しています（同じ姓の人は名の1文字目まで）。マウスを重ねるとフルネームと勤務時間が出ます。「フルネーム」をオンにすると全員フルネームで表示します。",
  "ドリッパーの名前の右はアイスの可否（○ 1杯・2杯とも／1・2 その杯数のみ／H アイス不可）。時間の列の「車N」は、その日の参加者のうち、その時間にシフトに入っていない車持ちの人数です（勤務可能時間は見ません。0人は赤）。",
  "個人別では、列がメンバー、行が時間で、各セルにその人の担当が出ます。担当のセルを押すと変更できます。",
  "メンバーの並び順（個人別の列・勤務可能表の行・勤務状況チェック・印刷）は「メンバー」タブで変えられます：「学年順」「五十音順」「所属店舗順」で全員を並べ替え、行の左のつまみ（⠿）をドラッグ（スマホは長押ししてから）するか、つまみで Alt+↑↓ を押すと1人ずつ動かせます。検索・絞り込み中は、見えている隣の人の前後へ入ります。並び順は共同編集の全員で共有され、「元に戻す」で戻せます。",
  "メンバー情報・役職ルールを変更しても割当は外れず、条件に合わなくなった割当は「条件外」（青緑の点・≠）で表示されます。必要人数を減らしたときは、なくなった枠の割当だけが外れます。勤務可能表の ○／— を変えても割当は外れず、勤務できない時間に入っている人は紫の斜線で表示されます。",
];

const LEGEND: readonly [SwatchKind, string, string][] = [
  ["open", "空き", "・未割当の枠（クリックで担当者を選ぶ）"],
  ["none", "候補なし", "・条件に合う人がいない枠"],
  ["dislike", "苦手な役職", "に入っている"],
  ["conflict", "重複", "・同じ人が同じ時間に別の枠にも入っている"],
  ["off", "勤務できない時間", "に入っている"],
  ["unfit", "条件外", "・所属店舗・ステータス・車の条件に合わない人が入っている（手で移動した枠など）"],
  ["na", "不要な時間", "（押すと必要人数を設定）"],
];

export function HelpPopover() {
  const open = useUi((u) => u.helpOpen);
  const close = () => actions.toggleHelp(false);
  return (
    <Popover
      open={open}
      onClose={close}
      anchor={helpAnchor}
      placement="top-end"
      label="凡例と操作ヘルプ"
      id={HELP_POPOVER_ID}
      className={styles.pop}
      sheetWithoutAnchor
    >
      <h3 className={styles.h}>
        <Icon name="help" />
        凡例
        <CloseButton className={styles.close} onClick={close} />
      </h3>
      <dl className={styles.kv}>
        {LEGEND.map(([kind, term, rest]) => (
          <div key={kind} className={styles.row}>
            <dt>
              <Swatch kind={kind} />
            </dt>
            <dd>
              <b>{term}</b>
              {rest}
            </dd>
          </div>
        ))}
        <div className={styles.row}>
          <dt>
            <Mark kind="want" />
          </dt>
          <dd>
            <b>やりたい役職</b>に入っている（続きの行では省略）
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.busy}>
            <Icon name="alert" size={14} />
          </dt>
          <dd>
            <b>別の枠で勤務中</b>（担当者を選ぶ画面）
          </dd>
        </div>
        <div className={styles.row}>
          <dt>
            <Swatch kind="stint" />
          </dt>
          <dd>
            <b>同じ人の続き</b>・左の線でつながった行は同じ人。2行目からは名前を細字で表示
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.drips}>
            <Drip kind="both" text="○" />
            <Drip kind="ice" text="1" />
            <Drip kind="ice" text="2" />
            <Drip kind="hot" text="H" />
          </dt>
          <dd>
            <b>ドリッパーの名前の右</b>：○ アイス1杯・2杯とも／1・2 その杯数のみ／H アイス不可
          </dd>
        </div>
        <div className={styles.row}>
          <dt>
            <CarChip n={0} />
          </dt>
          <dd>
            <b>車N</b>：その時間にシフトに入っていない車持ちの人数（0人は赤）
          </dd>
        </div>
      </dl>
      <p className={styles.hint}>名前をクリックで変更・ドラッグで移動・Shift＋クリックで範囲を選ぶ ／ 行：時間帯・列：役職</p>
      <hr className={styles.hr} />
      <h3 className={styles.h}>操作ヘルプ</h3>
      <ol className={styles.tips}>
        {HELP_TIPS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <hr className={styles.hr} />
      <h3 className={styles.h}>キーボード</h3>
      <dl className={styles.keys}>
        <dt>
          <span className={styles.range} aria-hidden="true">
            <Kbd>1</Kbd>–<Kbd>5</Kbd>
          </span>
          <span className="sr-only">1〜5 キー</span>
        </dt>
        <dd>タブを切り替え（文字の入力中は効きません）</dd>
        <dt>
          <Keys keys={["←", "→", "↑", "↓"]} label="矢印キー" />
        </dt>
        <dd>シフト表の中で枠を移動（↵・Space で担当者を選ぶ）</dd>
        <dt>
          <Keys keys={["M"]} label="M キー" />
        </dt>
        <dd>選んでいる枠の人を移動（役職別の表。移動先へ矢印で進んで ↵、Esc で取り消し。緑＝条件に合う枠）</dd>
        <dt>
          <Keys keys={["Shift", "↑", "↓"]} label="Shift＋上下の矢印キー" />
        </dt>
        <dd>同じ列の範囲を選ぶ（M・ドラッグでまとめて移動）</dd>
        <dt>
          <Keys keys={["Delete"]} label="Delete キー" />
        </dt>
        <dd>選んでいる枠から外す（元に戻せます）</dd>
        <dt>
          <Keys keys={["↑", "↓", "↵"]} label="上下の矢印キーと Enter キー" />
        </dt>
        <dd>担当者を選ぶ画面で候補を選ぶ・決定</dd>
        <dt>
          <Keys keys={[MOD_KEY, "Z"]} label={`${MOD_KEY === "⌘" ? "Command" : MOD_KEY}＋Z キー`} />
        </dt>
        <dd>元に戻す</dd>
        <dt>
          <Keys keys={["F"]} label="F キー" />
        </dt>
        <dd>全画面（Esc で戻る）</dd>
        <dt>
          <Keys keys={["/"]} label="スラッシュ キー" />
        </dt>
        <dd>検索欄へ</dd>
        <dt>
          <Keys keys={["?"]} label="はてな（?）キー" />
        </dt>
        <dd>このヘルプ</dd>
        <dt>
          <Keys keys={["Esc"]} label="Esc キー" />
        </dt>
        <dd>閉じる・移動をやめる・範囲の選択をやめる・全画面を終える</dd>
      </dl>
    </Popover>
  );
}

/** キーの一覧の見出し：キーキャップは読み上げない（KbdHint）ので、読み上げ用のキーの名前を添える */
function Keys({ keys, label }: { keys: readonly string[]; label: string }) {
  return (
    <>
      <KbdHint keys={keys} />
      <span className="sr-only">{label}</span>
    </>
  );
}
