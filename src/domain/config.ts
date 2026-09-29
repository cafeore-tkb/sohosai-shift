// 店舗・役職・日程・ステータスなどの固定設定（旧 app.js の先頭部分）

/** [役職名, 標準の必要人数] */
export type RoleDef = readonly [role: string, count: number];
/** 店舗（または係のまとまり）→ 役職の一覧 */
export type RolesByStore = Readonly<Record<string, readonly RoleDef[]>>;

export const rolesByStore: RolesByStore = {
  本店: [
    ["マスター", 1],
    ["レジ", 1],
    ["豆屋", 1],
    ["ドリッパー", 6],
    ["リベロ", 3],
    ["提供", 2],
    ["ホール", 2],
  ],
  "2号店": [
    ["レジ", 1],
    ["調理", 2],
  ],
  くれあ: [
    ["レジ", 1],
    ["調理", 1],
  ],
};

/** 特別な日（前日準備）の係。ここにない日は本番の役職（liveRoles） */
export const eventDayRoles: Readonly<Record<string, RolesByStore>> = {
  "2026-10-30": {
    準備: [
      ["店舗準備（本店）", 10],
      ["店舗準備（2号店）", 5],
      ["店舗準備（くれあ）", 5],
      ["実委からの受け取り", 3],
      ["買い出し", 2],
      ["昼食", 0],
      ["休憩", 0],
      ["最終オペ練", 0],
    ],
  },
};

/** 店舗に属する係（その店舗の所属メンバーだけが入れる） */
export const roleStore: Readonly<Record<string, string>> = {
  "店舗準備（本店）": "本店",
  "店舗準備（2号店）": "2号店",
  "店舗準備（くれあ）": "くれあ",
};
/** 車ありの人だけが入れる係 */
export const carRoles: readonly string[] = ["買い出し"];
// 美化・裏シフトは店舗に属さない係（誰でも入れる）。人数は最大値で、実際の標準人数は liveSchedule の時間帯だけ
export const liveExtraRoles: RolesByStore = {
  美化: [["美化", 3]],
  裏シフト: [["裏シフト", 2]],
};
export const liveRoles: RolesByStore = { ...rolesByStore, ...liveExtraRoles };
export const rolesForDate = (date: string): RolesByStore => eventDayRoles[date] || liveRoles;
export const groupOrder: readonly string[] = ["準備", ...Object.keys(rolesByStore), ...Object.keys(liveExtraRoles)];
export const storeNames: readonly string[] = Object.keys(rolesByStore);

export type Status = "未設定" | "未合格" | "1年目合格" | "2年目合格" | "上級生";
/** ステータスの序列。旧版と同じく文字列で引く（未知の値は undefined） */
export const statusLevels: Readonly<Record<string, number>> = {
  未設定: 0,
  未合格: 1,
  "1年目合格": 2,
  "2年目合格": 3,
  上級生: 4,
};
export const statusNames = Object.keys(statusLevels) as Status[];
export const statusShort: Readonly<Record<string, string>> = {
  上級生: "上級",
  "2年目合格": "2年",
  "1年目合格": "1年",
  未合格: "未合格",
};

export const eventDays: Readonly<Record<string, string>> = {
  "2026-10-30": "前日準備",
  "2026-10-31": "本番1日目",
  "2026-11-01": "本番2日目",
};
export const dayName = (date: string, index: number): string => eventDays[date] || `${index + 1}日目`;

// ---- 本番の時間帯ごとの標準人数（雙峰祭2025 の実際のシフト表から） ----

/** [開始, 終了（含まない）, 人数]。時刻は "HH:MM" */
export type CountWindow = readonly [start: string, end: string, count: number];
/** 役職の標準人数の時間割：windows に当たる時間はその人数、当たらない時間は outside（省略時は rolesByStore の人数） */
export interface RoleSchedule {
  outside?: number;
  windows: readonly CountWindow[];
}
export interface DaySchedule {
  /** 店舗（係のまとまり）→ 営業時間 [開始, 終了)。外の時間は標準 0 人（シフト表では「不要な時間」）。ない店舗は制限なし */
  hours: Readonly<Record<string, readonly [start: string, end: string]>>;
  /** ruleKey（"店舗|||役職"）→ 時間割。ない役職は営業時間中ずっと rolesByStore の人数 */
  roles: Readonly<Record<string, RoleSchedule>>;
}

/**
 * 本番の日の標準人数の時間割（日付 → DaySchedule）。2025 の 1日目・2日目 の表を 2026 の本番1日目・2日目に写したもの。
 * ここにない本番の日は「本番1日目」と同じ（liveScheduleFor）。前日準備（eventDayRoles の日）は時間割なし。
 * 必要人数（slotCounts）は標準との差分で保存するので、ここを変えると既存の部屋の必要人数の意味も変わる（docs/architecture.md）。
 */
export const liveSchedule: Readonly<Record<string, DaySchedule>> = {
  "2026-10-31": {
    hours: {
      本店: ["10:00", "19:00"],
      "2号店": ["10:00", "20:00"],
      くれあ: ["10:00", "20:00"],
    },
    roles: {
      "本店|||ドリッパー": { outside: 5, windows: [["12:00", "18:00", 6]] },
      "美化|||美化": {
        outside: 0,
        windows: [
          ["11:00", "12:00", 2],
          ["18:00", "19:00", 3],
        ],
      },
      "裏シフト|||裏シフト": {
        outside: 0,
        windows: [
          ["10:00", "10:30", 1],
          ["16:00", "17:00", 2],
        ],
      },
    },
  },
  "2026-11-01": {
    hours: {
      本店: ["10:00", "16:00"],
      "2号店": ["10:00", "17:00"],
      くれあ: ["10:00", "16:00"],
    },
    roles: {
      "本店|||ドリッパー": { outside: 5, windows: [["11:00", "16:00", 6]] },
      "美化|||美化": {
        outside: 0,
        windows: [
          ["11:00", "12:00", 2],
          ["16:00", "17:00", 3],
        ],
      },
      "裏シフト|||裏シフト": { outside: 0, windows: [] },
    },
  },
};
/** 時間割を使う本番の日のうち、日付が liveSchedule にないときに使う日 */
export const DEFAULT_LIVE_DAY = "2026-10-31";
/** その日の時間割（前日準備など eventDayRoles の日は null） */
export const liveScheduleFor = (date: string): DaySchedule | null =>
  eventDayRoles[date] ? null : liveSchedule[date] || liveSchedule[DEFAULT_LIVE_DAY] || null;

// ---- 働ける量（アンケートの任意の列。自動割当の目安） ----

/** 働ける量の選択肢（空＝希望なし） */
/**
 * 学年。アンケートでは B1〜B4・M1〜M2・D1〜D3 で答えてもらい、**入学年度の下2桁（在籍コード）**で覚える（年度が変わってもそのまま使える）。
 * 今年度の B1 が GRADE_BASE（雙峰祭の年の下2桁）で、学部から続けて進学したとして B2＝−1 … B4＝−3、M1＝−4、M2＝−5、D1＝−6 … D3＝−8。
 * 例（2026年度）：B1(26)〜B4(23)、M1(22)〜M2(21)、D1(20)〜D3(18)
 */
export const gradeLabels: readonly string[] = ["B1", "B2", "B3", "B4", "M1", "M2", "D1", "D2", "D3"];
export const GRADE_BASE = Number(Object.keys(eventDays)[0].slice(2, 4));
/** 在籍コード → 学年（B1〜D3。範囲外は ""） */
export const gradeOf = (code: number | undefined): string => (code === undefined ? "" : gradeLabels[GRADE_BASE - code] || "");
/** 学年 → 在籍コード（知らない学年は undefined） */
export const gradeCode = (label: string): number | undefined => {
  const i = gradeLabels.indexOf(label);
  return i < 0 ? undefined : GRADE_BASE - i;
};
/** 表示（例：「B1」。範囲外の在籍コードは「17年度」） */
export const gradeText = (code: number | undefined): string => (code === undefined ? "" : gradeOf(code) || `${code}年度`);

export const workloadLevels: readonly string[] = ["少し", "5時間程度", "いっぱい"];
/** 1日あたりの目安（時間）。いっぱい・未回答は目安なし */
export const workloadTargetHours: Readonly<Record<string, number>> = {
  少し: 3,
  "5時間程度": 5,
};

/** ドリッパーの番目違いなどをまとめた役職名（希望・苦手の判定用） */
export const roleBase = (role: string): string => (role.startsWith("ドリッパー") ? "ドリッパー" : role);
/** 希望・苦手に書ける役職名 */
export const prefRoles: readonly string[] = [
  ...new Set(
    Object.values(liveRoles)
      .flat()
      .map(([role]) => roleBase(role)),
  ),
];

export const dripTypes: readonly string[] = ["1杯ホット", "1杯アイス", "2杯ホット", "2杯アイス"];
/** 枠ごとに種類を選ぶ役職（ドリッパー） */
export const slotChoices: Readonly<
  Record<
    string,
    {
      options: readonly string[];
      placeholder: string;
      initial: (occ: number) => string;
    }
  >
> = {
  ドリッパー: {
    options: dripTypes,
    placeholder: "種類未定",
    initial: (occ) => dripTypes[occ % dripTypes.length],
  },
};
// アイスのステータス（ホットは合格した人ならできる前提）：○＝1杯・2杯とも／1杯のみ／2杯のみ／×＝アイス不可（ホットのみ）。
// 内部では対応できるドリップの一覧で持つ
export const iceStatuses: readonly string[] = ["○", "1杯のみ", "2杯のみ", "×"];
/** 未合格の人：ホットもできない（アイスの値は持たず、ステータスから決まる。memberIce） */
export const DRIP_NONE = "ドリップ不可";
/** 表示・並べ替えの順（アイスのステータスのあとにドリップ不可） */
export const iceLevels: readonly string[] = [...iceStatuses, DRIP_NONE];

/** 勤務時間に含めない係 */
export const breakRoles: readonly string[] = ["昼食", "休憩"];
/**
 * 人数の上限がない係：必要人数は設定せず、いつも空きの番目が1つ残る（入れるたびに列が増える）。
 * 自動割当では埋めず、未割当・充足率にも数えない
 */
export const openRoles: readonly string[] = ["昼食", "休憩", "最終オペ練"];
// 番目の呼び方：ドリッパーは当日の配置どおり 1st〜6th、ほかは 1・2・3
export const ordinalRoles: readonly string[] = ["ドリッパー"];
/** 画面を持つ（データがないと開けない）タブ */
export const dataViews: readonly string[] = ["availability", "members", "shift"];

export const storeClass = (store: string): string =>
  ({
    本店: "store-main",
    "2号店": "store-second",
    くれあ: "store-kurea",
    準備: "store-prep",
    美化: "store-clean",
  })[store] || "";

// 個人別の表のセル（例：本ドリ1st）
export const cellStore: Readonly<Record<string, string>> = {
  本店: "本",
  "2号店": "2号",
  くれあ: "く",
};
export const cellRole: Readonly<Record<string, string>> = {
  ドリッパー: "ドリ",
  "店舗準備（本店）": "準備本",
  "店舗準備（2号店）": "準備2号",
  "店舗準備（くれあ）": "準備く",
  実委からの受け取り: "受取",
  裏シフト: "裏",
};
/** 印刷の見出しで短くする係名 */
export const printRole: Readonly<Record<string, string>> = {
  "店舗準備（本店）": "店舗準備（本店）",
  "店舗準備（2号店）": "店舗準備（2号店）",
  "店舗準備（くれあ）": "店舗準備（くれあ）",
  実委からの受け取り: "受け取り",
};

/** 旧「ドリッパー上級生」「ドリッパー（下級生＋上級生）」（migratePositions で 1st〜6th にまとめる） */
export const OLD_DRIP: readonly [string, string] = ["ドリッパー上級生", "ドリッパー（下級生＋上級生）"];
