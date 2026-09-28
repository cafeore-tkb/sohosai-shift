// 店舗 → 色のクラス（global.css の .s-honten など。--sc 線・点 / --sb 地 / --si 文字 を決める）

const SHOP_CLASS: Readonly<Record<string, string>> = {
  本店: "s-honten",
  "2号店": "s-nigo",
  くれあ: "s-crea",
  美化: "s-bika",
  準備: "s-prep",
};

/** 店舗名（本店・2号店・くれあ・美化・準備）の色クラス。知らない店舗・"" は s-none */
export const shopClass = (store: string | null | undefined): string => (store && SHOP_CLASS[store]) || "s-none";
