// メディアクエリに合っているか（画面の幅が変わると描き直す）。
// 「1つの DOM」を保ったまま、要素の置き場所だけを幅で変えるときに使う（同じ id の要素を2つ描かない）。

import { useSyncExternalStore } from "react";

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== "function") return () => {};
      const mq = matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => typeof matchMedia === "function" && matchMedia(query).matches,
    () => false,
  );
}
