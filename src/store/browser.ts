// ブラウザの機能（ダウンロード・印刷ウィンドウ・確認ダイアログ）。旧版と同じ方法で行う

/** ファイルをダウンロードさせる（<a download> + Blob URL） */
export function download(name: string, text: string, type = "text/csv;charset=utf-8"): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 印刷ビューを別ウィンドウに書き出す。ポップアップが塞がれたら false */
export function openHtmlWindow(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/** ページの先頭へスクロール（画面の切り替え・読み込みのあと） */
export const scrollToTop = (): void => window.scrollTo(0, 0);

/** ブラウザ標準の確認ダイアログ */
export const ask = (message: string): boolean => window.confirm(message);
/** ブラウザ標準の警告ダイアログ */
export const tell = (message: string): void => window.alert(message);

/**
 * 表示中のページの検索欄（[data-page-search]）にフォーカスする（/ キー）。見つかれば true。
 * 隠れているページ（hidden の section の中）や表示されていない要素は選ばない
 */
export function focusPageSearch(): boolean {
  const el = [...document.querySelectorAll<HTMLInputElement>("[data-page-search]")].find(
    (x) => !x.disabled && !x.closest("[hidden]") && x.getClientRects().length > 0,
  );
  if (!el) return false;
  el.focus();
  el.select?.();
  return true;
}
