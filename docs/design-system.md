# Shift Maker デザインシステム（実装メモ）

見た目の仕様は `.migration/design/final/spec.md`（「Steel & Nadeshiko」）。ここは **実装の使い方** だけをまとめる。
部品はすべて `src/ui/components/`（CSS Modules）。views は `import { … } from "../../components"` で使う。
一覧を目で確かめるには `npx vite` を起動して `http://localhost:5173/src/ui/dev/gallery.html`（開発用。ビルドには入らない）。

## 1. トークンと約束

- `src/styles/tokens.css` … `.migration/design/final/tokens.css` を写したもの。`main.tsx` で1回だけ読む。
  あとから足したトークン（2026-09、手動の移動をどの枠へも・条件外）：`--st-unfit-*`（条件外：青緑の点＋≠。`--st-unfit-dots` は背景の点の模様）、
  `--st-drop-warn-*`（移動の足あと：置けるが条件などを破る＝スレート）、`--st-nodrop-*`（範囲が入りきらない＝赤の点線）、`--sel-range-*`（範囲の選択＝スチールの輪と薄い地）、`--ink-inverse-warn`（ゴーストの注意）。
- CSS Modules が使ってよいのは **意味のトークン** だけ（`--surface-*` `--ink-*` `--line-*` `--primary*` `--selected*` `--accent*` `--st-*` `--shop-*` `--fill-*` `--sp-*` `--r-*` `--sh-*` `--z-*` `--dur-*` `--ease-*` …）。
  `--slate-*` `--steel-*` `--nadeshiko-*` の生の色と、16進数の色は書かない（例外：白黒の半透明 `rgba(255,255,255,.x)` のオーバーレイ）。
- 色の役割（spec §1）：**スチール＝構造と操作**（primary、選択中、リンク、メーター）、**撫子＝データの強調**（★、既定から変えた値、変更のフラッシュの輪、上級タグ、eyebrow）、
  **状態の色**（空き＝橙、候補なし＝灰、苦手＝黄、重複＝赤、時間外＝紫、条件外＝青緑の点、移動先＝緑）は状態にだけ使う。コーヒー／茶色は使わない。
  セルの注意の優先順は 重複 → 勤務できない時間 → 条件外 → 苦手（1つだけ色を付ける）。
- フォーカス：`:focus-visible` は global.css で `--focus-ring`（紙色のすき間＋濃紺 2px）。表のセルなど詰まったものは `box-shadow: var(--focus-inset)`。
- 動き：`--dur-*` はモーション軽減で 0 になる。キーフレームは global.css にあり、`animation: var(--anim-fade | --anim-slidein | --anim-pop | --anim-up | --anim-pulse | --anim-flash)` で使う（CSS Modules の中で `@keyframes` を定義しない）。
  `--anim-flash`（`--dur-flash` 900ms）は「変更された枠」の光り方（背景 `--st-flash-bg`＋撫子の輪）。
- 数字：`font-variant-numeric: var(--numeric)`、またはグローバルの `.num`。
- ブレークポイント：**640px 以下＝スマホ**（`.m-only` / `.d-only` はグローバル）。ほかに 1439 / 1400 / 1320 / 1279 / 1180 / 1023（spec §5）。
- **1つの DOM**：id の付いた要素を幅ごとに2つ描かない。並べ替え・隠す・ラベルの短縮は CSS（`Button` の `shortLabel` / `iconOnly`、`Overflow`）。
- **店舗の色**：グローバルのクラス `.s-honten .s-nigo .s-crea .s-bika .s-prep .s-none` が `--sc`（線・点）`--sb`（地）`--si`（文字）を決める。
  `shopClass("本店")` → `"s-honten"`。帯・ブロック・タグは `background: var(--sb); color: var(--si); box-shadow: inset 3px 0 0 var(--sc)` のように1つのルールで全店舗に効く。
- グローバルな CSS は `tokens.css` と `global.css` だけ（旧 `style.css` / `legacy.css` はもうない）。見た目は部品・画面ごとの CSS Modules に書き、色・余白・角丸・影・動きはトークンから取る（生の hex を書かない）。
  body のクラスは `is-focus`（全画面）・`is-painting`・`is-dragging`（カーソルだけ）。CSS Modules からは `:global(body.is-focus) .x` で参照する。

## 2. 部品

| 部品 | 主な props | 例 |
|---|---|---|
| `Button` | `variant: "primary"\|"secondary"\|"ghost"`（既定 secondary）、`danger`、`size: "sm"\|"md"\|"lg"`、`icon` / `iconEnd`（IconName）、`shortLabel` + `shortAt: "1320"\|"1279"\|"1023"\|"640"`（その幅以下で短いラベル）、`iconOnly: true\|"1439"\|"1023"\|"640"`（ラベルは読み上げ用に残る）、`kbd`（末尾のキーキャップ・飾り）、`dot`（右上の赤い件数）、`ref`、ほかは `<button>` の属性（`id` `data-*` `title` `aria-*`） | `<Button id="clearBtn" variant="ghost" danger icon="trash" shortLabel="クリア" shortAt="1279" title="すべての割当をクリア（確認あり・元に戻せません）" onClick={actions.clearAssignments}>割当をクリア</Button>` |
| `IconButton` | `icon`、`label`（aria-label と title）、Button の props | `<IconButton icon="sliders" label="必要人数を設定" variant="secondary" />` |
| `CloseButton` | `<button>` の属性。Esc のキーキャップ＋×、aria-label「閉じる（Esc）」 | `<CloseButton id="countClose" onClick={…} />` |
| `Kbd` / `KbdHint` / `MOD_KEY` | `Kbd`：`inverse`（濃い地の上）。`KbdHint`：`keys: string[]`（aria-hidden）＋説明文。`MOD_KEY` は ⌘ か Ctrl。**#toast の中には置かない** | `<KbdHint keys={[MOD_KEY, "Z"]}>元に戻す</KbdHint>` |
| `Pill` | `tone: neutral\|open\|danger\|ok\|accent\|off\|unfit\|dislike\|warn`、`size: sm(18)\|md(20)\|lg(24)`、span の属性 | `<Pill tone="danger" id="auditBadge">重複 2・時間外 2</Pill>` |
| `Fill` / `fillLevel` | `rate`（%）、`level` を省くと ≥100 full・>0 part・0 empty | `<Fill rate={91} />` |
| `ShopTag` | `shop`（店舗名） | `<ShopTag shop="本店" />` |
| `StatusTag` | `top`（上級生＝撫子） | `<StatusTag top>上級</StatusTag>` |
| `PosTag` | 表の見出しの「上級」「2年↑」 | `1st<PosTag>上級</PosTag>` |
| `CarChip` | `n`（0 は赤）、`title` | `<CarChip n={0} title="…" />` |
| `Mark` | `kind: want(★)\|dislike(△)\|off(×)\|unfit(≠)\|conflict(!)` | `<Mark kind="want" />` |
| `Drip` | `kind: both\|ice\|hot`、`text`（○ / 1 / 2 / H）、`title` | `<Drip kind="ice" text="2" title="アイス2杯のみ" />` |
| `Swatch` | 凡例の見本：`kind: open\|none\|dislike\|conflict\|off\|unfit\|na\|stint\|shop\|brk`、shop のときは `shop` | `<Swatch kind="shop" shop="2号店" />` |
| `Meter` | `value`（0–100）、`width`（既定 110、スマホの帯 56）、`fillId`（#fillBar） | `<Meter value={rate} width={56} />` |
| `Segmented` + `SegButton` + `SegSep` | `Segmented`：`label`（role=group の名前）、`size: "sm"\|"md"`、`id`。`SegButton`：`pressed`、`icon`、`sub`（小さい文字）、`badge`（Fill など）、`hideSubAt="1400"`、ほかは `<button>` の属性（`data-grid-date` など） | `<Segmented label="日付" id="gridDates"><SegButton pressed data-grid-date="2026-10-31" sub="10/31" hideSubAt="1400" badge={<Fill rate={91} />} title="本番1日目 10月31日(土)">本番1日目</SegButton></Segmented>` |
| `ChipGroup` + `Chip` + `ChipCount` | `ChipGroup`：`label`、`id`。`Chip`：`pressed`（押されている＝スチールで塗った丸）、`shop`（点の色）、`attentionDot`（橙の点：店舗未設定）、`count`。`ChipCount`：`tone: "hot"`（橙の件数）\|`"ok"`（✓ 充足） | `<Chip pressed={false} shop="本店" data-grid-store="本店" count={<ChipCount tone="hot">未割当 21</ChipCount>}>本店</Chip>` |
| `Switch` / `Checkbox` | 本物の checkbox（`id` `checked` `onChange` `data-*` は input に付く）、`label`、`wrapClassName` | `<Switch id="fullNameToggle" checked={…} onChange={…} label="フルネーム" />` |
| `TextInput` | `size: sm(30)\|md(32)\|lg(40)`（スマホは 44px・16px）、`mono`、input の属性 | `<TextInput placeholder="なし" />` |
| `inputClassName(look)` | 自前の `<input>`（`ChangeInput` など）に入力欄の見た目だけ付ける | `<ChangeInput className={inputClassName({ size: "sm" })} … />` |
| `SearchInput` | `shortcut="/"`（入力が空でフォーカスがないときだけ出るキーキャップ）、`pageSearch`（`/` キーでフォーカスされる欄。`data-page-search`）、`wrapClassName` | `<SearchInput id="memberSearch" pageSearch shortcut="/" placeholder="氏名で検索" />` |
| `Select` | `tone: "default"\|"unset"`（点線・薄い）`\|"set"`（既定から変えた：撫子の地＋濃い撫子の太字。枠は変えない）、select の属性 | `<Select data-member={name} tone={status ? "default" : "unset"} value={…} onChange={…}><StatusOptions /></Select>` |
| `ShopToggle` | 所属店舗の本物の checkbox を丸いトグルに見せる。`shop`、`label`（省くと店舗名） | `<ShopToggle shop="くれあ" data-member-store={name} value="くれあ" checked={…} onChange={…} />` |
| `Icon` / `IconSprite` | `name`（下の一覧）、`size: 14\|16\|20`。いつも aria-hidden。`IconSprite` は App が1回だけ描く | `<Icon name="lock" size={14} />` |
| `Popover` | `open`、`onClose`（外側を押した）、`anchor: () => HTMLElement\|null`、`placement: top-end\|top-start\|bottom-end\|bottom-start`、`label`（role="dialog"）、`width`、`autoFocus`（既定 true、閉じたら元へ戻す）、`sheetWithoutAnchor`（基準がない・スマホでは下からのシート＋スクリム）。Esc は store の Esc の順で閉じるので、開閉の状態は store に置く | HelpPopover を参照 |
| `Overflow` | 「1つの DOM」の ⋯ メニュー：641px 以上では children をその場に並べ（display: contents）、640px 以下では ⋯ ボタンのメニューに入れる。`menuId`、`open` / `onOpenChange`（**store の `ui.menu` を使う**：`useUi(u => u.menu === "shift")` / `actions.setMenu(o ? "shift" : null)`）、`label`、`align`、`direction`、`triggerVariant` | AppBar の 印刷ビュー／CSV、シフト調整の クリア／フルネーム／ヘルプ |
| `Drawer` | `open`、`onClose`（閉じる・スクリム）、`title`、`icon`、`id` / `closeId` / `bodyId`（#auditDrawer #auditClose #assignmentAudit など）、`headExtra`、`footer`、`wide`（必要人数）、`initialFocus: "close"\|"none"`。アプリバーとステータスバーの間に出る（全画面中は画面いっぱい、スマホと横向きのスマホ＝高さ 560px 以下は全画面のシートで、safe area の内側）。閉じていても DOM は残る（hidden）。モーダルではない（Tab を中で回すのは全画面のシートのときだけ）、閉じたら元の要素へ戻る。Esc は store の順 | `<Drawer open={open} onClose={() => actions.toggleAudit(false)} title="勤務状況チェック" icon="check-list" id="auditDrawer" closeId="auditClose" bodyId="assignmentAudit">…</Drawer>` |
| `Dialog` | ネイティブ `<dialog>`（showModal）。`open`、`onClose`（Esc・背景・`[data-close]`）、`title`、`icon`、`id`、`bodyId`、`headExtra`、`footer`。見出しの × には `data-close` が付いている | `<Dialog id="shareDialog" bodyId="shareBody" title="共同編集" icon="users" open={…} onClose={…} footer={<Button data-close="">閉じる</Button>}>…</Dialog>` |
| `ToastView` / `ToastDockView` / `toastDockButtonClass` | 画面からは直接使わない（`layout/ToastDock` がこれで #toast を描く）。`ToastDockView` の `besideDrawer` は勤務状況チェックが開いている間（幅 900px 以上）、ドロワーの左の領域の中央に出す | `besideDrawer` |
| `Tip` | ポインタに付いて動く濃い吹き出し。`style`（fixed の left / top）、`caretX`、`sub` | `<Tip style={{ left, top }}>— にする（4セル）・離すと確定</Tip>` |
| `Card` | `pad`（内側の余白 18/20） | `<Card pad>…</Card>` |
| `Notice` | `tone: info\|ok\|warn`、`icon`（IconName か false） | `<Notice tone="warn" icon="lock" id="importLock">…</Notice>` |
| `Disclosure` | `label`、`open` / `onToggle`（省くと中で持つ）、`defaultOpen`。aria-expanded / aria-controls 付き | `<Disclosure label="CSVの形式を見る">…</Disclosure>` |
| `Spacer` | 残りの幅 | `<Spacer />` |
| `cx`、`shopClass` | 小さな道具（`components/focus.ts` の `trapTab` / `rememberFocus` は Drawer・Popover の中で使う） | — |

アイコン（`IconName`）：users printer download upload sparkle sliders check-list trash max more search x chev arrow undo grid person help link copy doc cal shield alert info check move plus reset leave cloud bean cup filter car lock star back chev-r login grip（並べ替えのつまみ）sort。
足りなければ `Icon.tsx` の `PATHS` に追加する（24×24、線 1.75px、`stroke="currentColor"` 前提の path）。

旧版から残っている `components/inputs.tsx` の `ChangeInput` `releaseFocus` `StatusOptions` は動きのための部品。
`ChangeInput`（ネイティブの change で確定）と `releaseFocus`（確定したらフォーカスを外す）は動きの契約なので、見た目だけ `inputClassName()` で付けて使い続ける。

## 3. レイアウト（アプリの枠）

`src/ui/App.tsx` と `src/ui/layout/`：

```
<AppBar>        上 52px（sticky）。ロゴ・#modeBadge・タブ（スマホは下のタブバー）・#shareBtn・⋯(#printExportBtn #exportBtn)
<main>          ページの場所（下にステータスバー／スマホのタブバーの高さを空ける）
  タブ 1–4:  <Page hidden step={n} title description aside wide>  中央寄せ（1240px、wide は 1400px）＋「STEP n / 5」＋ h1 ＋説明
  タブ 5:    <WorkSurface hidden>  アプリバーとステータスバーの間いっぱい（全画面中は画面いっぱい）。中の表だけがスクロールする
<StatusBar>     下 28px（fixed、スマホでは隠れる）。集計の id・⌘Z 元に戻す・? ヘルプ・#footerNote
<HelpPopover>   凡例と操作ヘルプ（ui.helpOpen）
<ToastDock>     #toast（＋移動中の「キャンセル」）
<FocusHint>     全画面に入ったときの案内
```

- 全画面：`ui.shiftFocus` のとき body に `is-focus`。アプリバー・ステータスバーは隠れ、`WorkSurface` とドロワーは画面いっぱいになる。
  `#fullscreenBtn`（シフト調整のツールバー）の文言は「全画面」↔「← 通常表示に戻る」（Esc のキーキャップは aria-hidden の飾りなら後ろに付けてよい）。
- ヘルプ：開くのは `actions.toggleHelp()`。位置の基準は **`data-help-anchor` を付けたボタン**（押したもの → 見えている `main` の中のもの → ステータスバー）。
  シフト表の凡例（KeyStrip）の「ヘルプ」ボタンには `data-help-anchor` と `aria-controls="helpPopover"` `aria-expanded={helpOpen}` を付ける。ポップアップ自体は作らない（`layout/HelpPopover.tsx` を直す）。
- スマホのアプリバーの ⋯ は `ui.menu === "appbar"`。シフト調整の ⋯ は別の名前（例 `"shift"`）にする。
- 使える見た目の部品：`layout/BrandMark.tsx` の `BrandTile`（空の状態のカップのロゴ）、`layout/SyncBadge.tsx` の `SyncPill` / `syncLook`（共有ダイアログの見出しの状態）。
- スマホのシフト調整の上の帯（この日の未割当・重複・メーター・内訳）は shift 画面が描く。`#footerNote` などの id はステータスバーにあるので、内訳には id なしで同じ文を出す（文言は `StatusBar.tsx` の `DEFAULT_FOOTER_NOTE` と `ui.share.footerNote`）。
- `domRefs.tabBarRef` は上に固定されている帯（いまはアプリバー）。ドラッグの自動スクロールなどで「画面の上の端」に使う。

## 4. views が守ること（まとめ）

- 文言・id・data-* は変えない（`docs/architecture.md`「テスト用フック」、spec §8）。確認・警告はネイティブの confirm/alert のまま、増やさない。
- 状態は store（`useModel` / `useUi` / `actions`）。部品は描いて `actions.*` を呼ぶだけ。
- 「変更された枠」の光り：`ui.flash`（store が `flashKeys` で出す）。シフト表のセルは `views/shift/cellUi.ts` の `useCellUi(key).flash` が 0 でなければ `animation: var(--anim-flash)`。
- 表で見せる：`useReveal((req) => …スクロールしたら true)`（`docs/architecture.md` の store の節）。
- 移動中のゴーストは class `drag-ghost` を必ず付ける。
