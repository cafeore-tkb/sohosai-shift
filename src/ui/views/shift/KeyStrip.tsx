// 表の下に固定の凡例（KeyStrip）。旧版の凡例の項目すべて＋候補なし・重複・条件外・不要・同じ人の続き。
// 最後のヒントが #gridLegend（行／列の説明）。右端の「ヘルプ ?」で凡例と操作ヘルプ（layout/HelpPopover）を開く。

import { useRef } from "react";
import type { GridMode } from "../../../domain";
import { actions, useUi } from "../../../store";
import { Button, Drip, Icon, Mark, Swatch, cx, useEdgeFade } from "../../components";
import type { SwatchKind } from "../../components";
import { HELP_POPOVER_ID } from "../../layout/HelpPopover";
import s from "./KeyStrip.module.css";

const ROLE_KEYS: readonly [SwatchKind, string][] = [
  ["open", "空き"],
  ["none", "候補なし"],
  ["dislike", "苦手な役職"],
  ["conflict", "重複"],
  ["off", "勤務できない時間"],
  ["unfit", "条件外"],
];

const PERSON_SHOPS = ["本店", "2号店", "くれあ", "美化", "裏シフト", "準備"];

export function KeyStrip({ mode, note }: { mode: GridMode; note: string }) {
  const helpOpen = useUi((u) => u.helpOpen);
  // 入りきらないとき（狭い画面）は横にスクロール。続きのある端をぼかす
  const itemsRef = useRef<HTMLDivElement>(null);
  useEdgeFade(itemsRef);
  return (
    <div className={s.strip} role="region" aria-label="凡例">
      <div className={s.items} ref={itemsRef}>
        {mode === "person" ? (
          <>
            {PERSON_SHOPS.map((shop) => (
              <span key={shop} className={s.key}>
                <Swatch kind="shop" shop={shop} />
                {shop}
              </span>
            ))}
            <span className={s.key}>
              <Swatch kind="brk" />
              昼食・休憩
            </span>
            <span className={s.sep} aria-hidden="true" />
            <span className={s.key}>
              <Swatch kind="conflict" />
              重複
            </span>
            <span className={s.key}>
              <Swatch kind="off" />
              勤務できない時間
            </span>
            <span className={s.key} title="所属店舗・ステータス・車の条件に合わない割当（未合格のドリッパーも）">
              <Swatch kind="unfit" />
              条件外
            </span>
            <span className={s.key}>
              <Swatch kind="na" />
              参加していない時間
            </span>
            <span className={s.sep} aria-hidden="true" />
          </>
        ) : (
          <>
            {ROLE_KEYS.map(([kind, label]) => (
              <span key={kind} className={s.key}>
                <Swatch kind={kind} />
                {label}
              </span>
            ))}
            <span className={s.key} title="不要な時間（押すと必要人数を設定）">
              <Swatch kind="na" />
              不要
            </span>
            <span className={s.key}>
              <Mark kind="want" />
              やりたい役職
            </span>
            <span className={s.key}>
              <span className={s.busy}>
                <Icon name="alert" size={14} />
              </span>
              別の枠で勤務中
            </span>
            <span className={s.key}>
              <Swatch kind="stint" />
              同じ人の続き
            </span>
            <span className={cx(s.sep, s.wide)} aria-hidden="true" />
            <span className={cx(s.key, s.wide)} title="ドリッパーの名前の右：○ アイス1杯・2杯とも／1・2 その杯数のみ／H アイス不可（ホットのみ）／× ドリップ不可（未合格）">
              アイス
              <Drip kind="both" text="○" />
              両方
              <Drip kind="ice" text="1" />
              <Drip kind="ice" text="2" />
              のみ
              <Drip kind="hot" text="H" />
              不可
            </span>
            <span className={cx(s.hint, s.hintMouse)}>クリックで変更・ドラッグで移動・Shift＋クリックで範囲</span>
            <span className={cx(s.hint, s.hintTouch)}>タップで変更・長押ししてドラッグで移動</span>
          </>
        )}
        <span id="gridLegend" className={s.hint}>
          {note}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon="help"
        kbd="?"
        className={s.help}
        data-help-anchor=""
        aria-haspopup="dialog"
        aria-expanded={helpOpen}
        aria-controls={HELP_POPOVER_ID}
        aria-label="凡例と操作ヘルプ"
        title="凡例と操作ヘルプ（?）"
        onClick={() => actions.toggleHelp()}
      >
        ヘルプ
      </Button>
    </div>
  );
}
