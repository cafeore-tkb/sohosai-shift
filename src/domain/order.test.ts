import { describe, expect, it } from "vitest";
import { allNames } from "./audit";
import { addableNames, boardNames, namesOn } from "./availability";
import { personNamesFor } from "./grid";
import { createModel } from "./model";
import { moveMember, movedOrder, orderedNames, setMemberOrder, sortedMembers } from "./order";
import { applySharedChange } from "./shared";
import { SHARED_MAPS } from "./types";
import type { Model } from "./types";

const D = "2026-10-31";
function model(names: string[]): Model {
  const m = createModel();
  m.availability = names.map((name) => ({ name, date: D, start: "10:00", end: "12:00" }));
  return m;
}
// 五十音順：あべ < いとう < うえだ < えもと < おの
const kana = ["あべ", "いとう", "うえだ", "えもと", "おの"];

describe("orderedNames", () => {
  it("falls back to 五十音 order with no saved order (unchanged behaviour)", () => {
    const m = model(["おの", "あべ", "えもと", "いとう", "うえだ", "あべ"]);
    expect(allNames(m)).toEqual(kana);
    expect(namesOn(m, D)).toEqual(kana);
  });

  it("puts ranked names first by rank, unranked after them in 五十音 order, ties by 五十音", () => {
    const m = model(kana);
    m.memberOrder = { おの: 1, うえだ: 2, いとう: 2 };
    expect(orderedNames(m, kana)).toEqual(["おの", "いとう", "うえだ", "あべ", "えもと"]);
  });

  it("ignores non-numeric ranks (garbage from the room)", () => {
    const m = model(kana);
    m.memberOrder = { おの: "1" as unknown as number, えもと: Number.NaN, うえだ: 5 };
    expect(orderedNames(m, kana)).toEqual(["うえだ", "あべ", "いとう", "えもと", "おの"]);
  });

  it("is used by every member list (board, datalist, person columns)", () => {
    const m = model(kana);
    m.memberOrder = { おの: 1, あべ: 2 };
    m.memberStores = { おの: ["本店"], あべ: ["本店"], えもと: ["本店"] };
    expect(boardNames(m, D, ["かとう"])).toEqual(["おの", "あべ", "いとう", "うえだ", "えもと", "かとう"]);
    expect(addableNames(m, ["いとう"])).toEqual(["おの", "あべ", "うえだ", "えもと"]);
    expect(personNamesFor(m, D, "本店")).toEqual(["おの", "あべ", "えもと"]);
  });
});

describe("sortedMembers", () => {
  it("学年順: 上級生 > 2年目合格 > 1年目合格 > 未合格 > 未設定, then 五十音", () => {
    const m = model(kana);
    m.memberStatuses = { おの: "上級生", いとう: "1年目合格", えもと: "上級生", あべ: "未合格", うえだ: "未設定" };
    expect(sortedMembers(m, kana, "status")).toEqual(["えもと", "おの", "いとう", "あべ", "うえだ"]);
  });

  it("所属店舗順: 本店, 2号店, くれあ, none (first shop wins), then 五十音", () => {
    const m = model(kana);
    m.memberStores = { おの: ["本店"], いとう: ["くれあ", "2号店"], あべ: ["くれあ"], えもと: ["本店", "くれあ"] };
    expect(sortedMembers(m, kana, "store")).toEqual(["えもと", "おの", "いとう", "あべ", "うえだ"]);
  });

  it("列見出し：アイス・車・働ける量・役職、逆順（未設定・未入力は向きに関わらず後ろ）", () => {
    const m = model(kana);
    m.memberDrips = { おの: ["1杯アイス", "2杯アイス"], いとう: [], あべ: ["2杯アイス"] };
    expect(sortedMembers(m, kana, "ice")).toEqual(["おの", "あべ", "いとう", "うえだ", "えもと"]);
    expect(sortedMembers(m, kana, "ice", "desc")).toEqual(["いとう", "あべ", "おの", "うえだ", "えもと"]);
    m.memberCars = { えもと: true, いとう: true };
    expect(sortedMembers(m, kana, "car")).toEqual(["いとう", "えもと", "あべ", "うえだ", "おの"]);
    m.memberWorkload = { あべ: "少し", おの: "いっぱい", うえだ: "5時間程度" };
    expect(sortedMembers(m, kana, "work")).toEqual(["おの", "うえだ", "あべ", "いとう", "えもと"]);
    m.memberWants = { おの: ["ホール"], あべ: ["レジ"] };
    expect(sortedMembers(m, kana, "want")).toEqual(["おの", "あべ", "いとう", "うえだ", "えもと"]);
    m.memberDislikes = { うえだ: ["豆屋"] };
    expect(sortedMembers(m, kana, "dislike", "desc")).toEqual(["うえだ", "あべ", "いとう", "えもと", "おの"]);
    expect(sortedMembers(m, kana, "kana", "desc")).toEqual([...kana].reverse());
    m.memberStatuses = { おの: "上級生", あべ: "未合格" };
    expect(sortedMembers(m, kana, "status", "desc")).toEqual(["あべ", "おの", "いとう", "うえだ", "えもと"]);
  });

  it("五十音順 and setMemberOrder writes ranks for everyone and returns the previous map", () => {
    const m = model(kana);
    m.memberOrder = { stale: 3 };
    const before = setMemberOrder(m, sortedMembers(m, [...kana].reverse(), "kana"));
    expect(before).toEqual({ stale: 3 });
    expect(m.memberOrder).toEqual({ あべ: 1, いとう: 2, うえだ: 3, えもと: 4, おの: 5 });
  });
});

describe("movedOrder / moveMember", () => {
  it("moves within the full list", () => {
    expect(movedOrder(kana, kana, "おの", 0)).toEqual(["おの", "あべ", "いとう", "うえだ", "えもと"]);
    expect(movedOrder(kana, kana, "あべ", 4)).toEqual(["いとう", "うえだ", "えもと", "おの", "あべ"]);
    expect(movedOrder(kana, kana, "いとう", 1)).toEqual(kana);
  });

  it("while filtered, lands next to the visible neighbour; hidden members keep their places", () => {
    const visible = ["あべ", "うえだ", "おの"];
    // おの を見えている先頭（あべ の前）へ
    expect(movedOrder(kana, visible, "おの", 0)).toEqual(["おの", "あべ", "いとう", "うえだ", "えもと"]);
    // あべ を うえだ と おの のあいだ（見えている位置 1）へ：次に見えている おの の直前。いとう・えもと（見えていない）の順はそのまま
    expect(movedOrder(kana, visible, "あべ", 1)).toEqual(["いとう", "うえだ", "えもと", "あべ", "おの"]);
    // 見えている最後の人の直後へ（その後ろの見えていない人より前）
    expect(movedOrder(kana, ["あべ", "うえだ"], "あべ", 1)).toEqual(["いとう", "うえだ", "あべ", "えもと", "おの"]);
  });

  it("first move with no saved order ranks everyone", () => {
    const m = model(kana);
    const before = moveMember(m, allNames(m), allNames(m), "おの", 0);
    expect(before).toEqual({});
    expect(allNames(m)).toEqual(["おの", "あべ", "いとう", "うえだ", "えもと"]);
    expect(Object.keys(m.memberOrder).sort()).toEqual([...kana].sort());
  });

  it("later moves change only the moved member's rank (one key for co-editing)", () => {
    const m = model(kana);
    setMemberOrder(m, kana);
    const prev = { ...m.memberOrder };
    moveMember(m, allNames(m), allNames(m), "おの", 1);
    expect(allNames(m)).toEqual(["あべ", "おの", "いとう", "うえだ", "えもと"]);
    const changed = Object.keys(m.memberOrder).filter((k) => m.memberOrder[k] !== prev[k]);
    expect(changed).toEqual(["おの"]);
    moveMember(m, allNames(m), allNames(m), "あべ", 4);
    expect(allNames(m)).toEqual(["おの", "いとう", "うえだ", "えもと", "あべ"]);
  });

  it("re-ranks everyone when new (unranked) members exist or the gap runs out", () => {
    const m = model([...kana, "かとう"]);
    setMemberOrder(m, kana); // かとう は番号なし（後ろ）
    moveMember(m, allNames(m), allNames(m), "かとう", 0);
    expect(allNames(m)).toEqual(["かとう", ...kana]);
    expect(m.memberOrder.かとう).toBeDefined();
    // 同じ場所に何度も割り込んでも順は正しい
    for (let i = 0; i < 60; i++) {
      const who = i % 2 ? "あべ" : "おの";
      moveMember(m, allNames(m), allNames(m), who, 1);
      expect(allNames(m)[1]).toBe(who);
    }
  });

  it("returns null and keeps the order when nothing moves", () => {
    const m = model(kana);
    expect(moveMember(m, allNames(m), allNames(m), "いとう", 1)).toBeNull();
    expect(m.memberOrder).toEqual({});
  });
});

describe("memberOrder is shared", () => {
  it("is a shared map merged per key", () => {
    expect(SHARED_MAPS).toContain("memberOrder");
    const m = model(kana);
    setMemberOrder(m, kana);
    applySharedChange(m, "memberOrder", "おの", 0.5);
    expect(allNames(m)[0]).toBe("おの");
    applySharedChange(m, "memberOrder", "おの", undefined);
    expect(allNames(m).at(-1)).toBe("おの");
  });
});
