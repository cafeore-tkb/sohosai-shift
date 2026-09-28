// クラス名をつなぐ（false・undefined・"" は捨てる）
export const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
