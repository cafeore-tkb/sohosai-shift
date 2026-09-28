// 入力部品：ネイティブの change で確定する入力欄と、ステータスの選択肢

import { useEffect, useLayoutEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { statusNames } from "../../domain";

type ChangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  /** 表示する値（Model の値） */
  value: string;
  /** ネイティブの change（入力を確定したとき）。1文字ごとには呼ばない */
  onCommit: (el: HTMLInputElement) => void;
  /** これが変わるたびに表示を value に戻す（旧版は再描画のたびに作り直していた）。省略時は value が変わったときだけ */
  resetKey?: unknown;
};

/** 確定（change）したときだけ反映する入力欄。入力中の文字は React で管理しない */
export function ChangeInput({ value, onCommit, resetKey, ...rest }: ChangeInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current!;
    const h = () => commit.current(el);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current!;
    if (el.value !== value) el.value = value;
  }, [value, resetKey]);
  return <input ref={ref} defaultValue={value} {...rest} />;
}

/**
 * 確定した入力欄・選択肢からフォーカスを外す。旧版は確定のたびにその部分を作り直していたので、フォーカスは外れていた。
 * 残したままだと共同編集の受信（入力中は待つ）と ⌘Z（入力欄では効かない）が止まったままになる。
 * Tab などで別の欄へ移ったあと（すでにフォーカスがない）なら何もしない。
 */
export function releaseFocus(el: HTMLElement): void {
  if (document.activeElement === el) el.blur();
}

/** ステータスの選択肢。forRule：true なら「未設定」を「条件なし」、文字列ならその文字で表示 */
export function StatusOptions({ forRule }: { forRule?: true | string }) {
  return (
    <>
      {statusNames.map((status) => (
        <option key={status} value={status}>
          {forRule && status === "未設定" ? (forRule === true ? "条件なし" : forRule) : status}
        </option>
      ))}
    </>
  );
}
