// 全画面（シフト調整の focus mode）に入ったときに少しだけ出す案内「全画面表示中・Esc で戻る」（トーストとは別）。
// スマホ・タッチの端末には Esc がないので「← で戻る」（ツールバーの戻るボタン）
// 見た目の案内は aria-hidden、読み上げは role="status" の中の文（画面の見た目は変えない）

import { useEffect, useState } from "react";
import { useUi } from "../../store";
import { Icon, Kbd, useMedia } from "../components";
import styles from "./FocusHint.module.css";

/** 案内を出しておく時間（spec §6） */
const HINT_MS = 2500;

export function FocusHint() {
  const focus = useUi((u) => u.shiftFocus);
  const [show, setShow] = useState(false);
  const touch = useMedia("(max-width: 640px), (pointer: coarse)");
  useEffect(() => {
    setShow(focus);
    if (!focus) return;
    const t = setTimeout(() => setShow(false), HINT_MS);
    return () => clearTimeout(t);
  }, [focus]);
  // 読み上げ用の live region は常に DOM に置き、中身だけ出し入れする（#toast と同じ。出たときに読まれる）
  return (
    <div role="status">
      {show ? (
        <>
          <div className={styles.hint} aria-hidden="true">
            <Icon name="max" size={14} />
            {touch ? (
              <>
                全画面表示中 ・ <Icon name="back" size={14} /> で戻る
              </>
            ) : (
              <>
                全画面表示中 ・ <Kbd inverse>Esc</Kbd> で戻る
              </>
            )}
          </div>
          <span className="sr-only">{touch ? "全画面表示中。「通常表示に戻る」ボタンで戻ります" : "全画面表示中。Esc キーで戻ります"}</span>
        </>
      ) : null}
    </div>
  );
}
