// 入力部品：TextInput / SearchInput / Select / Checkbox / Switch / ShopToggle
// どれも本物の <input>・<select> を使う（change・checked の意味と data-* はそのまま。rest は入力要素に渡す）

import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./Field.module.css";
import { Icon } from "./Icon";
import { Kbd } from "./Kbd";
import { shopClass } from "./shop";

export interface InputLook {
  /** sm 30px（表の中）/ md 32px / lg 40px。スマホでは 44px・16px になる */
  size?: "sm" | "md" | "lg";
  /** 等幅（共有リンクなど） */
  mono?: boolean;
}

/** 入力欄のクラス（ChangeInput など、自前の <input> に見た目だけ付けるとき） */
export const inputClassName = ({ size = "md", mono }: InputLook = {}, extra?: string): string =>
  cx(styles.input, size !== "md" && styles[size], mono && styles.mono, extra);

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & InputLook & { ref?: Ref<HTMLInputElement> };

export function TextInput({ size, mono, className, ...rest }: TextInputProps) {
  return <input className={inputClassName({ size, mono }, className)} {...rest} />;
}

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  size?: "sm" | "md" | "lg";
  /** 右端に出すショートカット（"/"）。入力中・入力ありなら隠す */
  shortcut?: string;
  /**
   * ページの検索欄（/ キーでフォーカスする対象。data-page-search を付ける）。
   * 表示中のページで最初に見つかったものにフォーカスする
   */
  pageSearch?: boolean;
  /** 外側の <label> のクラス（幅の指定など） */
  wrapClassName?: string;
  ref?: Ref<HTMLInputElement>;
}

export function SearchInput({ size, shortcut, pageSearch, wrapClassName, className, ...rest }: SearchInputProps) {
  return (
    <label className={cx(styles.search, wrapClassName)}>
      <Icon name="search" className={styles.searchIcon} />
      <input
        type="search"
        autoComplete="off"
        className={inputClassName({ size }, className)}
        {...(pageSearch ? { "data-page-search": "" } : {})}
        {...rest}
      />
      {shortcut ? (
        <span className={styles.searchKbd} aria-hidden="true">
          <Kbd>{shortcut}</Kbd>
        </span>
      ) : null}
    </label>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** unset＝未設定（点線・薄い）、set＝既定から変えた（撫子の地＋濃い撫子の文字。枠は変えない） */
  tone?: "default" | "unset" | "set";
  /** 外側の <span> のクラス（幅の指定など） */
  wrapClassName?: string;
  ref?: Ref<HTMLSelectElement>;
}

/** ネイティブの <select>（矢印は CSS で描く） */
export function Select({ tone = "default", wrapClassName, className, children, ...rest }: SelectProps) {
  return (
    <span className={cx(styles.selectWrap, wrapClassName)}>
      <select className={cx(styles.select, tone !== "default" && styles[tone], className)} {...rest}>
        {children}
      </select>
    </span>
  );
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** 横に出す文字（なければ aria-label を付けること） */
  label?: ReactNode;
  /** 外側の <label> のクラス */
  wrapClassName?: string;
  ref?: Ref<HTMLInputElement>;
};

/** チェックボックス（本物の checkbox。rest の id・data-*・onChange は input に付く） */
export function Checkbox({ label, wrapClassName, className, ...rest }: CheckProps) {
  return (
    <label className={cx(styles.check, wrapClassName)}>
      <input type="checkbox" className={className} {...rest} />
      <span className={styles.box} aria-hidden="true" />
      {label}
    </label>
  );
}

/** スイッチ（本物の checkbox。フルネームなど） */
export function Switch({ label, wrapClassName, className, ...rest }: CheckProps) {
  return (
    <label className={cx(styles.switch, wrapClassName)}>
      <input type="checkbox" role="switch" className={className} {...rest} />
      <span className={styles.track} aria-hidden="true" />
      {label}
    </label>
  );
}

/** 店舗のトグル（本物の checkbox を店舗の色の丸いボタンに見せる。所属店舗） */
export function ShopToggle({ shop, label, wrapClassName, className, ...rest }: CheckProps & { shop: string }) {
  return (
    <label className={cx(styles.stog, shopClass(shop), wrapClassName)}>
      <input type="checkbox" className={className} {...rest} />
      <span className={styles.stogDot} aria-hidden="true" />
      {label ?? shop}
    </label>
  );
}
