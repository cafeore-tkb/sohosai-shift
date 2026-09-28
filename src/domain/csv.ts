// CSV の読み書き

/** CSV を行×セルに分ける（"" のエスケープ、CRLF 対応。セルは trim、空行は捨てる） */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** 1行分（必要なセルだけ "" で囲む） */
export const csvLine = (row: readonly string[]): string =>
  row.map((v) => (/[",\n]/.test(v) ? `"${String(v).replaceAll('"', '""')}"` : v)).join(",");

/** 1行分（すべてのセルを "" で囲む。シフトの書き出し用） */
export const csvLineQuoted = (row: readonly unknown[]): string =>
  row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");

/** CSV ファイルのバイト列を文字列に（UTF-8 として読めなければ Shift_JIS） */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift-jis").decode(bytes);
  }
}
