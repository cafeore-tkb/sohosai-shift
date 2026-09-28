import { describe, expect, it } from "vitest";
import { createModel } from "../../../domain";
import { attentionOf } from "./attention";

describe("members attention", () => {
  const m = createModel();
  m.memberStatuses = { 佐藤: "上級生", 鈴木: "未設定", 高橋: "1年目合格" };
  m.memberStores = { 佐藤: ["本店"], 鈴木: ["2号店"], 高橋: [] };

  it("tags missing status (absent or 未設定) and missing shops", () => {
    expect(attentionOf(m, "佐藤")).toEqual([]);
    expect(attentionOf(m, "鈴木")).toEqual(["ステータス未設定"]);
    expect(attentionOf(m, "高橋")).toEqual(["店舗未設定"]);
    expect(attentionOf(m, "田中")).toEqual(["ステータス未設定", "店舗未設定"]);
  });
});
