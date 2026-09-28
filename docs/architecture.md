# Shift Maker アーキテクチャ

雙峰祭のシフト作成ツール。Vite + React + TypeScript。ビルド結果は **1ファイルの `dist/index.html`**（JS・CSS をインライン化）なので、
GitHub Pages でも、zip で配ってダブルクリック（`file://`）でも同じように動く。インターネット接続は共同編集（Firebase）を使うときだけ必要。

## ディレクトリと責務（関心の分離）

```
src/
  domain/     純粋なロジック。DOM・React・window に触らない（テストはここに厚く書く）
  print/      印刷ビューの HTML 生成（別ウィンドウに書き出す自己完結 HTML）
  store/      アプリの状態と「ユーザー操作＝コマンド」。domain を呼び、トースト・元に戻す・再描画通知を行う
  sync/       共同編集（Firebase Firestore）。store の公開 API だけを使う
  ui/         React コンポーネント（見た目と入力の受け付けだけ。ロジックは store/domain を呼ぶ）
    components/  デザインシステム（Button, Segmented, Chip, Drawer, Popover, Pill, Icon …。docs/design-system.md）
    layout/      アプリの枠（AppBar・StatusBar・HelpPopover・ToastDock・FocusHint）
    dev/         開発用の部品ギャラリー（gallery.html。ビルドには入らない）
    views/       各タブ（import / availability / members / rules / shift）
  styles/     デザイントークン（CSS 変数）とグローバル CSS
  main.tsx    起動（store 初期化 → sync 開始 → React 描画）
public/firebase-config.js   共同編集の設定（ビルドせずに差し替えられるよう別ファイル）
```

依存の向き：`ui → store → domain`、`sync → store → domain`、`print → domain`。逆向き（domain が store/ui を import する等）は禁止。

## 状態（Model）

- `domain/types.ts` の `Model` は旧版の `state` と**同じ形**（キー名・値の意味・空文字と削除の区別まで同じ）。
  共同編集の Firestore ドキュメント形式もこれに依存するので、形を変えないこと（既存の部屋と互換）。
  - 共有されるもの：`availability` と `SHARED_MAPS`（assignments, slotTypes, slotCounts, slotBlanks, settings, roleRequirements, memberStatuses, memberStores, memberWants, memberDislikes, memberDrips, memberCars, memberOrder, memberWorkload）
  - `memberOrder`（氏名 → 並び順の番号）だけは旧版にない追加のマップ。旧版は知らないキーを読まず・書かない（差分はキーごと）ので、同じ部屋に旧版がいても壊れない（旧版の画面は五十音順のまま）
  - `memberWorkload`（氏名 → 働ける量 "少し"／"5時間程度"／"いっぱい"、未回答は削除）も旧版にない追加のマップ（扱いは memberOrder と同じ）
  - `slots` は必要人数（slotCounts）から作る派生キャッシュ。**並び順に意味がある**（自動割当の同順位の順、CSV・印刷の並び）。
  - 画面の状態：`view, gridDate, gridStore, gridMode, countDate, fullNames, availDate, memberQuery, memberStore`
- 旧版でモジュール変数だった UI 状態（担当者ポップアップ、移動中の枠、ドラッグ、元に戻す履歴、勤務可能表に手で追加したメンバー、ドロワーの開閉、全画面、読み込み結果メッセージ）は `store` の UI 状態に置く（Model には入れない）。
- `store.commit()` は旧版の `render()` が Model に対して行っていた副作用を同じ条件で行う：
  1. 日付があれば `ensureAllSlots()`（移行処理を含む）
  2. `gridDate`（"all" 以外で存在しない日付なら先頭へ）、`availDate`、`countDate` の補正
  3. データがないのに availability/members/shift を表示していたら `view = "import"`
  4. 再描画の通知と、共同編集への送信（`onStateChange`）

## ユーザー操作と表示の約束

- 文言（トースト・確認ダイアログ・アラート・CSV・印刷 HTML）は旧版と同一。確認・警告はブラウザ標準の `confirm` / `alert` のまま。
- CSV のダウンロードは `<a download>` + `URL.createObjectURL`、印刷ビューは `window.open` + `document.write`（ポップアップが塞がれたら HTML をダウンロード）。
- 印刷ビューの HTML は旧版とバイト単位で同じ（見た目の刷新対象外）。

## テスト用フック（UI の契約）

回帰テスト（旧版との突き合わせ）が UI を操作するための目印。**見た目を変えても必ず残す。**
スタイル用のクラス名には依存しない（CSS Modules でハッシュ化されてよい）。

- `window.__SHIFT_DEBUG__.snapshot()` … Model（上記の形）をそのまま返す
- id：`sampleBtn autoBtn clearBtn exportBtn printExportBtn templateBtn sampleDataBtn csvInput fullNameToggle auditBtn countsBtn countClose countReset countEditor fullscreenBtn shiftGridWrap picker pkSearch toast importStatus availAdd availAddName memberSearch shareBtn shareDialog shareSignIn shareStartBtn adminForm adminEmail`
  （`csvInput` は `<input type=file>`、`fullNameToggle` は checkbox、`availAdd`/`adminForm` は `<form>`、`shareDialog` は `<dialog>`）
- data 属性：
  - タブ `data-tab="import|availability|members|rules|shift"`（押すと切り替え。データがないときは disabled）
  - シフト表 `data-grid-date` `data-grid-store` `data-grid-mode="role|person"`
  - 役職別の表は `<table>`：行＝30分の時間、セル `<td>`＝役職の各番目。1人分の枠の要素に `data-slot-key`、その中の担当者ボタンに `data-pick-slot`。
    不要な時間のセル（押すと必要人数）に `data-open-counts="<slotId>"`。移動中は移動元の枠（つかんだ枠と、一緒に動く範囲）に `data-drag-source`、
    移動先にできる枠（つかんだ枠以外のすべて）に `data-drop-ok`、そのうち条件に合う枠（緑）に `data-drop-fit`。範囲の選択（Shift＋クリック）は `data-selected`（＋`aria-selected`）。
    行 `<tr>` に `data-hour`（開始時刻。移動の足あとが枠のない時間のセルを探す）。
  - 個人別の表のセル `data-pm-key`
  - 担当者ポップアップ `#picker`：候補 `data-pk-name`、長さ `data-pk-run="1|2|3|4|Infinity"`、`data-pk-clear`（外す）、`data-pk-move`（移動…）、`data-pk-close`、検索 `#pkSearch`
  - 必要人数 `data-count-slot`（number input、change で確定）、`data-count-all`、`data-count-date`
  - 勤務可能表 `data-avail-date`、セル `data-av-name` + `data-av-h`（pointerdown → ドラッグで塗る）
  - メンバー：行 `data-member-row`（氏名）、並び順のつまみ `data-member-handle`（button。ポインタでドラッグ・Alt+↑↓）、並べ替え `data-member-sort="status|kana|store"`、`data-member`（ステータス select）、`data-member-store`（checkbox, value=店舗）、`data-member-ice`（select）、`data-member-car`（checkbox）、`data-member-want` / `data-member-dislike`（text input、ネイティブの change で確定）、`data-member-filter`
  - 役職ルール `data-rule`（select）
  - 読み込み結果の「シフト調整へ進む」`data-goto="shift"`、ドロップ領域 `data-dropzone`、ダイアログを閉じる `data-close`
- `#toast`：常に DOM にあり、非表示は `hidden` 属性。表示のたびに中身を作り直す（`key` を変える）。
  `textContent` は「メッセージ＋アクションのボタン文言」だけ（アイコンは aria-hidden の SVG、閉じるボタンは aria-label のみ）。アクションは `<button>`。

## 回帰テスト

`.migration/`（git 管理外）に旧版のコピーと `oracle.mjs` がある。旧版と新版で同じ操作（約90手順：サンプル読み込み、自動割当、担当者の選択・検索・長さ、元に戻す、移動・ドラッグ、必要人数、勤務可能表の塗り替え、メンバー・役職ルールの編集、CSV 読み込み各種、書き出し、印刷、共同編集モック）を行い、Model・トースト・ダイアログ・ダウンロード内容・印刷 HTML が完全一致することを確かめる。

```
cd .migration
node oracle.mjs run http://localhost:5173/ new.json --site=../dist   # 新版を操作して記録
node oracle.mjs diff ref.json new.json                               # 旧版（ref.json）と突き合わせ
```

**旧版と意図して違うところ**（2026-09 の「どの枠へも移動・条件外」の変更。突き合わせではここから先が違って出る）：
- 手動の移動は30分のセル単位で、どの枠へも置ける（旧版は条件に合う枠だけ・1時間のまとまりは自動でまとめて移動・入れない相手は未割当）。
  移動中のトーストの文言も違う（「移動先の枠をクリック…（緑＝条件に合う枠・Escで取消）」）。oracle の手順 25〜29（moving / moved-by-click / dragged）。
- 条件（メンバー・役職ルール）を変えても割当を外さない（旧版は外して「条件に合わなくなった N 枠…」）。必要人数で枠がなくなった割当だけ外し、
  文言は「必要人数が減ってなくなった N 枠の割当を外しました」。oracle の手順 31・32（文言だけ。外す数は同じ）と 53・55・62・63（外さない）。
  以降の手順の Model は、この差（手順 26・29 の移動の差と、外さなかった割当）を引き継ぐ。「割当をクリア」（手順 66）からあとは一致。
- 差分テスト（`.migration/difftest`）の move.diff（moveAssignment・dropTargets）と、条件を変えて prune する比較は同じ理由で一致しない。

## Domain API

`src/domain/index.ts` からすべて import できる（`import { … } from "../domain"`）。関数は Model を引数で受け取り、書き換えるものは名前のとおりその Model を直接変更する（モジュール内に状態は持たない）。
旧版の `render()` がしていた Model の補正は `refreshDerived(m)`、トースト・確認・再描画は store の仕事。
旧版との突き合わせ（出荷しない）：`npx vitest run --config .migration/difftest/vitest.config.ts`（jsdom に旧 app.js を読み込んで同じ操作の結果を比較）。

**config.ts**（固定の設定）
- `rolesByStore` `eventDayRoles` `liveExtraRoles` `liveRoles` `rolesForDate(date)` … 店舗→[役職, 人数]。前日準備は `準備` の係、本番は本店・2号店・くれあ・美化・裏シフト（美化・裏シフトは店舗に属さない係＝誰でも入れる）。
  本番の人数は**その日の最大**（表の列数・役職ルールの番目の数）で、時間ごとの標準は下の時間割で決まる
- `liveSchedule`（日付 → `DaySchedule`）`liveScheduleFor(date)` `DEFAULT_LIVE_DAY` `CountWindow` `RoleSchedule` … 本番の標準人数の時間割（雙峰祭2025 の実際のシフト表から）。
  `hours`＝店舗の営業時間 [開始, 終了)（外は標準 0＝「不要な時間」）、`roles`＝ruleKey → `{ outside, windows: [開始, 終了, 人数][] }`（ドリッパー 6th は昼だけ、美化・裏シフトは時間帯だけ）。
  liveSchedule にない本番の日は `DEFAULT_LIVE_DAY`（本番1日目）と同じ。前日準備（eventDayRoles の日）は時間割なし
- `workloadLevels`（少し／5時間程度／いっぱい）`workloadTargetHours`（1日あたりの目安：少し 3・5時間程度 5。いっぱいは目安なし）
- `roleStore` `carRoles` `breakRoles` `ordinalRoles` `groupOrder` `storeNames` `prefRoles` `roleBase(role)`
- `statusLevels` `statusNames` `statusShort` `eventDays` `dayName(date, index)` `dataViews`
- `dripTypes` `slotChoices` `iceStatuses` `storeClass(store)` `cellStore` `cellRole` `printRole` `OLD_DRIP`

**types.ts** — `Model`（旧 `state` と同じ形）、`Availability` `Slot` `Item`（= Slot + occ + key）`Settings` `View` `GridMode`（`Model.view`・`Model.gridMode` の型）、`SHARED_MAPS`（共同編集で共有するマップ）と `SharedMap`

**model.ts**
- `createModel()` … 起動直後の state（役職ルールの初期値つき）
- `refreshDerived(m, { fixCountDate })` … 旧 render() の Model 補正（ensureAllSlots、gridDate/availDate/countDate、データなしなら view="import"）。必要人数の入力中は `fixCountDate: false`。ensureAllSlots は1回だけ（旧版の2回目は何も変えない）
- `fixCountDateOf(m)` … countDate だけの補正（必要人数のドロワーを開いた・日を変えたとき）
- `hasAssignments(m)` … 自動割当・クリアで確認を出すか

**time.ts** — `SLOT`(30) `toHM(min)` `hmToMin("H:MM")` `toMin("HH:MM")` `plusSlot(t)` `dayLabel(d)`（10月31日(土)）`shortDay(d)`（10/31(土)）`fmt(h)`（2.5h）

**parse.ts** — `parseStatus` `parseRoles`→{roles, unknown} `parseStores`→{stores, unknown} `parseDrips` `parseIce`（判別不能は undefined）`iceOf(drips)` `dripsForIce(ice)` `parseCar` `parseWorkload`（働ける量。空・希望なしは ""、時間の数も読む、判別不能は undefined）`normTime` `normDate` `normKey` `timePart`

**csv.ts** — `csvRows(text)` `csvLine(row)`（必要なときだけ引用）`csvLineQuoted(row)`（全部引用）`decodeCsvBytes(bytes)`（UTF-8 → だめなら Shift_JIS）

**rules.ts**（誰がどの枠に入れるか）
- `ruleKey(store, role)` `posKey(store, role, occ)` `levelOf(m, name)` `requiredFor(m, slot)`（役職と番目の厳しいほう）
- `fitsChoice` `fitsSlot(m, name, slot)`（所属・ステータス・車）`unfitReasons(m, name, slot)`（合わない理由：「所属店舗」「ステータス」「車」。条件外の表示用）`canWorkAt(m, name, slot)`（勤務可能時間）`available(m, slot)`（入れる人の勤務可能時間の一覧）`decided(m, key)`
- `posLabel(role, i)`（1st… / 1…）`posTag(m, store, role, i)`（見出しの「上級」「1年↑」、なければ ""）`wants` `dislikes` `prefMark`（★／△／""。表のセルと担当者ポップアップで使う）

**slots.ts**（枠）
- `slotId(date, store, role, start)` `itemsOf(slot)` `flattened(m)` `eventDates(m)`（先頭3日）`hoursForDate(m, date)` `findSlot(m, date, store, role, start)`
- `ensureGridSlots(m, date, hours)` `ensureAllSlots(m)`（移行 → 枠をそろえる）`migrateHalfHours` `migratePositions` `migrateBlanks`
- `defaultCount(date, store, role, start?)`（start を渡すと時間割どおりの標準。省くと `baseCount`＝時間によらない人数）`slotDefault(slot)` `baseCount(date, store, role)`
- `setSlotCount(m, slot, value)`（その枠の標準＝slotDefault と同じなら slotCounts から消す）`setRoleCounts(m, date, store, role, value)`（一括：標準が 1人以上の時間帯だけ。営業時間外などはそのまま。その日ずっと標準 0 の役職なら全時間帯。旧版は value が "" なら何もしない→呼ぶ側で判定）`resetCounts(m, date)`（時間割どおりに戻す）`splitRuleKey(key)`
- `slotAtOffset(m, item, ±1)` `partnerOf(m, item, name)`（1時間のまとまりの相方）`slotType(m, item)`（ドリップ種類）

**labels.ts** — `itemLabel(x)`（本店・ドリッパー 2nd）`slotLabel(m, x)`（本番1日目 10:30〜 …）`personCellLabel(x)`（本ドリ1st）`requirementNote(m, item)`（・上級生のみ）`roleNote(count)`

**audit.ts** — `assignmentAudit(m)`→{conflicts:Set, hours[name][date], booked} `mergeSpans` `allNames(m)` `wantsMissing(m)` `offAssignments(m)`（時間外）`unfitAssignments(m)`（条件外＝fitsSlot に合わない割当）`dislikedCount(m)` `auditRow(m, audit, name, dates)` `fillOf(m, items)` `summaryStats(m, audit?)`（旧 updateStats の数値）

**auditIssues.ts** — `auditIssues(m, audit)`→{conflicts, offs, unfits, dislikes}：勤務状況チェックの「直したほうがよい枠」を人・日ごとにまとめる（`AuditIssue`＝name・date・keys・first（「表で見る」の枠）・where（「本番1日目 14:00–15:00 本店・ホール 1 ／ 2号店・レジ」））。`groupIssues(m, items)`

**autoAssign.ts** — `autoAssign(m)` … 割当を捨てて自動割当（このあと refreshDerived）。条件に合う人だけを、1時間のまとまりで入れる（手動の移動の決まりとは別）

**assign.ts**（手動編集。結果は `EditResult {ok, message, changes}`：ok なら changes が空でないときだけ「元に戻す」付きトースト、ok でなければ message をそのままトースト。null は何もしない）
- 手動の移動の決まり（assign.ts の「移動・入れ替え」の節の先頭にも書いてある）：
  - 単位は30分のセル1つ。どの枠からどの枠へも（日・時間・店舗・役職・番目を問わず、勤務可能時間・所属・ステータス・車・同じ時間の別の枠も見ずに）移せる。移動元以外のすべての枠が移動先。
  - 移動先に人がいれば入れ替え（その人は移動元へ。条件に合わなくても入る）。人が消えることはない。1時間のまとまりを自動でまとめて動かすことはしない。
  - 範囲（`columnRange`：同じ列＝日・店舗・役職・番目の、続いた時間の枠。Shift＋クリック・Shift＋↑↓）の中の枠をつかむと範囲ごと動く：
    つかんだ枠が落とした枠へ、ほかの枠は時間のずれを保ったまま落とした枠の列へ。移動先にいた人は、空いた移動元の枠へ時間順に戻る
    （同じ列でずらして重なるときは、はみ出した分が空いた側へ回る）。移動先の列のその時間に枠がない（不要な時間・表の外）ときは動かさない（縮めない）＝ ok: false とメッセージ。
  - 結果で重複・勤務できない時間・条件外になった人がいれば、メッセージの末尾に「（重複・勤務できない時間・条件外）」を付ける。変更は1つの EditResult（元に戻すは1回）。
- `planMove(m, from, to, selection)`→`MovePlan`{grab, to, cells: `MoveCell`{source, start, target, swapOut}[], ok}（Model は変えない。足あとの表示にも使う）
- `moveAssignment(m, from, to, selection?)` `moveSpan(m, from, to, selection?)`（移動先で入る枠の数。入りきらなければ 0）`previewMove(m, from, to, selection?)`→{plan, issues}（ゴーストの注意）
  `columnRange(m, a, b)` `sameColumn(a, b)` `pickName(m, key, name, pickRun)` `clearAssignment(m, key)` `clearAll(m)`
- `runTargets(m, item, name, limit)` `pickerCandidates(m, item, q)`→{free, busy}（`Candidate`。候補は条件に合う人だけのまま）`dropTargets(m, fromKey)`（移動先にできる key＝移動元以外のすべて）
  `fitTargets(m, fromKey, selection?)`（そのうち条件に合う＝緑の key：動かす人が全員、勤務可能時間・条件を満たし、同じ時間に別の枠に入っておらず、すでにそこにいない。範囲が入りきらない枠は含まない）
- `busyElsewhere` `canTake` `overlapping` `snapshotAssignments` `diffChanges(before, m)` `undoChanges(m, changes)`→メッセージ `DEFAULT_PICK_RUN` `PICK_RUNS` `movingMessage(name, count?)`

**availability.ts** — `applyAvailability(m, date, changes)`→変更前の配列（元に戻す用）`peopleOn` `namesOn(m, date)` `boardNames(m, date, extra)` `addableNames(m, shown)` `canAt(m, date, name, h)` と文言 `AVAILABILITY_CHANGED` `UNDO_BLOCKED` `UNDONE` `addedMemberMessage`

**order.ts**（メンバーの並び順。共有マップ `memberOrder`＝氏名 → 番号）
- `orderedNames(m, names)` … **メンバーを並べるときは必ずこれ**（`allNames`・`namesOn`・`boardNames`・`addableNames`・`personNamesFor` が使う＝メンバー表・勤務可能表の行と追加候補・個人別の列・勤務状況チェック・印刷）。番号のある人が番号順（同じ番号は五十音順）、ない人はその後ろに五十音順。保存していなければ旧版と同じ五十音順。数でない値は無視
- `sortedMembers(m, names, "status"|"kana"|"store")`（学年順：上級生→2年目合格→1年目合格→未合格→未設定／五十音順／所属店舗順：本店→2号店→くれあ→なし、複数なら先の店舗。同じなら五十音順）`MEMBER_SORTS`（ボタンの文言）`setMemberOrder(m, names)`（全員に 1,2,3… を振る）
- `movedOrder(full, visible, name, to)` … 1人を動かした並び。`to` は動かす人を除いた「見えている行」の中の位置。**見えている隣の人が基準**：`visible[to]` の直前へ（いちばん下なら見えている最後の人の直後へ）。見えていない人どうしの順は変えない
- `moveMember(m, full, visible, name, to)` … 並びを変えて前の `memberOrder` を返す（変わらなければ null）。全員に番号があり重なりがなければ、動いた人の番号だけを前後の人のあいだの値にする（共同編集の送信が1キー）。番号のない人がいる・同じ番号・すき間が 1e-6 未満なら全員に振り直す
- 自動割当は `availability` の順で候補を見るので、並び順では結果が変わらない
- 文言 `memberSortedMessage(label)` `memberMovedMessage(name, n, total)`

**names.ts** — `surname(name)` `buildShortNames(m)`→{氏名: 短い名前} `displayName(name, fullNames, shortNames)`

**prune.ts** — `pruneAssignments(m)`→外した数 `prunedMessage(n)`。外すのは枠がなくなった割当（必要人数を減らした）だけ。条件に合わなくなった割当は外さず、条件外として表示する

**members.ts**（メンバー・ルールの編集。割当は外さない。念のため prune（枠がなくなった割当だけ）まで行い外した数を返す）— `setMemberStatus` `setMemberStore` `setMemberWants` `setMemberDislikes` `setMemberCar` `setMemberIce` `setMemberWorkload`（目安なので prune しない）`setRoleRequirement` `filterMembers(m, all, query, store)` `memberStoreCounts(m, all)`

**importSurvey.ts** — `importSurvey(m, text)`→{messages, warns}（失敗は Model を変えずに Error。view="shift" にする）`attendarAvailability` と文言 `importFailedMessage` `IMPORT_ADMIN_ONLY` `IMPORT_WARN_NOTE`

**mockSurvey.ts** — `mockSurveyCsv()` `mockSurveyNames` `MOCK_SURVEY_HEADERS`（アンケート CSV の列。ひな形と共通）：雙峰祭2025 の構成（人数・勤務可能時間・ステータス・所属・働ける量）を写した架空の50名（`.migration/mock-data-notes.md`）。実名は入れない

**workload.ts**（働ける量の目安）— `workloadTarget(m, name)`（時間／日。目安なしは null）`isOverTarget(m, name, hours)` `overTargets(m, audit)`→`OverTarget[]`（勤務状況チェックの「目安超え」）`overTargetIfPicked(m, audit, name, date)` `OVER_TARGET_LABEL`。
自動割当（autoAssign）は、その日の目安に届いた人を候補の後ろに回す（spare の次の順位。ほかにいなければ超えても入れる）。
UI は `ui/WorkloadTag.tsx`（担当者ポップアップの候補の「目安超え」、`data-over-target`）と `ui/WorkloadOver.tsx`（勤務状況チェックのバッジと「働ける量の目安を超えている人」）

**exports.ts** — `exportCsv(m)` `templateCsv()` `sampleCsv()`（＝`mockSurveyCsv()`、2025年ベースのサンプル） `resetForSample(m)`（サンプル読み込みの前処理。このあと importSurvey(m, sampleCsv()) し、結果の代わりに `SAMPLE_INTRO` を表示）`sampleNames` とファイル名 `EXPORT_FILE` `TEMPLATE_FILE` `SAMPLE_FILE` `PRINT_FILE`

**cells.ts**（セルのデータ。HTML は作らない）— `slotCell(m, item, audit, shortNames)`（役職別の表の1人分：kind/mark/label/tip/ariaLabel/drip/unfit。kind の優先順は 重複 → 勤務できない時間 → 条件外（unfit）→ 苦手）`dripBadge(m, name)` `carFreeAt(m, date)`→(h)=>車持ちの一覧 or null `carTitle(free)` `personMatrix(m, date, names)`→{hours, cols, span}（印刷と共用で旧版と同じ分け方。条件外は画面側の personTable が足す） `personSegments(m, name, date)`

**grid.ts**（役職別の表の列）— `dayGrid(m, date, storeF)`→{hours, stores, heads, cols, slotAt} `gridCell(grid, col, hour)`→{slot, item} `gridStores(viewDates)` `gridView(m, dates)`→{viewDates, stores, storeF}（表示する日付と店舗の絞り込み。ツールバーと表で共通）`personNamesFor(m, date, storeF)`（個人別の列）

**必要人数の互換性（時間割の導入で変わったこと）**：`slotCounts` は「標準との差分」だけを保存する（標準と同じ値は削除）。
2026-09 に標準を時間ごと（liveSchedule）に変え、裏シフトを足したので、**既存の部屋で保存してある必要人数の意味が変わる**：
差分として保存されていない枠（＝以前は標準どおりだった枠）は、新しい標準（営業時間外 0・ドリッパー 5〜6・美化／裏シフトは時間帯だけ）になる。
差分として保存されていた枠は保存された人数のまま（例：以前「本店 2日目 16:00 を 0」にしていた部屋は 0 のまま。新しい標準と同じなので、次に変えたときに slotCounts から消える）。
人数が減った枠の、はみ出した番目の割当は Model には残るが表には出ない。旧版（app.js）で同じ部屋を開くと旧来の標準で解釈される。liveSchedule を変えるときも同じことが起きる。
旧データの移行（migratePositions の「合計が 6 と違えば保存」）は旧来の標準 6 のまま。

**shared.ts**（共同編集で共有するデータ。送受信・差分・マージは sync）— `sharedMap(m, k)` `replaceShared(m, availability, maps)`（部屋の内容で置き換え。枠は作り直し、データがあれば読み込み画面→シフト調整）`applySharedChange(m, k, key, value)`（1項目の変更。undefined は削除、必要人数なら枠の人数も合わせる）

**print/**（印刷ビュー。旧版とバイト単位で同じ HTML）
- `printShiftHtml(m, { stamp? })` … 先に `ensureAllSlots(m)` を行う（旧版と同じ副作用）
- `printDayTable` `personMatrixHtml`（print/printHtml.ts）、`esc` `dripBadgeHtml` `carCellHtml` `posTagHtml`（print/html.ts）、`PRINT_STYLE` `PRINT_SCRIPT`（print/printAssets.ts、書き換え禁止）

## Store・UI・sync（step 2）

見た目はすべて新しいデザイン（`src/styles/tokens.css` のトークン + `global.css` + 部品・画面ごとの CSS Modules。旧 `style.css` は残っていない）。仕様は `.migration/design/final/spec.md`、部品の使い方は `docs/design-system.md`。

**store/**（`src/store/index.ts` から import）
- `store`（`store.ts`）… `model`（Model そのもの。直接書き換える）、`ui`（UiState：picker・pickRun・movingKey・selection・selAnchor・moveMode・painting・availExtra・ドロワー・全画面・importStatus・toast・share）、`lastChange`（元に戻す）。
  `movingRange(ui)` … 移動中に動かす枠（つかんだ枠が選んでいる範囲＝2つ以上に入っていれば範囲、そうでなければつかんだ枠だけ）。
  - `commit({ push })` … 旧 `render()`：`refreshDerived`（必要人数の入力中は countDate を補正しない＝`isEditingCounts`）→ 再描画の通知 → `onStateChange`（共同編集の送信）。旧版で部分描画だけだった操作（表示の切り替えなど）は `push: false`。
  - `version`（commit のたびに増える）と `dataVersion`（`push: false` 以外の commit と `dataChanged()` で増える）。勤務状況チェックなど共有データから作る派生データは `dataVersion` ごとに作り直す（表示だけの変更では作り直さない）。共同編集の受信で Model を書き換えて描画を保留したときは sync が `dataChanged()` を呼ぶ。
  - `setUi(patch)`、`showToast(message, sticky?, action?, variant?)`（3.5 秒／アクション付き 7 秒。variant `"move"` は移動中の見た目）、`hideToast()`、`isInteracting()`（共同編集の受信を待つか）。
  - `flashKeys(keys)` … 枠を `FLASH_MS`（900ms＝`--dur-flash`）だけ光らせる（`ui.flash = { keys, seq }`、時間がたつと null）。割当の変更（`finish`）・元に戻す・`revealSlot` が呼ぶ。
  - 差し替え口：`onStateChange`・`canImportCSV`・`shareActions`・`setShare`（sync が設定）、`isEditingCounts`（UI が設定）。
- `actions`（`actions.ts`）… 旧版のイベントハンドラ1つにつき1つ。確認・警告・トーストの文言と順序は旧版と同じ。
  - 刷新で追加：`sortMembers(kind)`・`moveMemberTo(name, visible, to)`（メンバーの並び順。commit で共同編集へ送信。トーストの「元に戻す」は前の `memberOrder` に戻す。その後に変わっていたら〈共同編集の受信を含む〉`UNDO_BLOCKED`。⌘Z は割当の変更だけのまま）
- `useModel()` / `useModelVersion()` / `useUi(select)` … useSyncExternalStore のフック。
- 画面の横断的な UI 状態（刷新で追加。Model には入れない・共有しない）
  - `ui.flash`（上）… 光っている枠の key と seq（光らせるたびに変わる）。シフト表のセルは `views/shift/cellUi.ts` の `useCellUi(key).flash` で自分の分だけ読み、`animation: var(--anim-flash)` を付ける（同じ枠の2回目は `useRestartFlash` でアニメーションだけやり直す）。
  - `ui.reveal` … 「表で見せて」の依頼。`actions.revealSlot(key, { mode? })` は view=shift・その日（「一覧」表示中ならそのまま）・店舗の絞り込み（合わなければ「すべて」）・表示（既定 役職別）を合わせて commit（push なし）し、
    `ui.reveal = { kind: "slot", key, seq }` を出して `flashKeys([key])`。枠がなければ false。`actions.revealPerson(name, date?)` は個人別でその人の列（`{ kind: "person", name, date, seq }`、光らせない）。
    表は **`useReveal(handler)`** を1か所で使う：描画のあとに `handler(req)` が呼ばれ、要素を見つけてスクロールできたら true を返す（`actions.revealDone(seq)` で消える）。false なら次の描画でもう一度呼ばれる。ドロワーは閉じない（スマホ・幅 900px 未満で閉じたければ呼ぶ側で `toggleAudit(false)`）。
  - `ui.helpOpen` と `actions.toggleHelp(open?)` … 凡例と操作ヘルプ（`layout/HelpPopover`）。開くとメニューは閉じる。
  - `ui.selection` / `ui.selAnchor` … 役職別の表の範囲の選択（同じ列の続いた枠）。`actions.selectTo(key)`（Shift＋クリック：起点から key まで。起点がない・列が違えば key だけ）、
    `actions.extendSelection(from, to)`（Shift＋↑↓）、`actions.clearSelection()`。`openPicker(key)` は範囲の外なら範囲を消して key を起点に、範囲の中なら残す（「移動…」が範囲ごと）。
    `beginDrag(key)` も範囲の外なら消す。`moveTo(from, to, range)` で範囲ごと動いたら、選択は移動先の枠へ移る（1つだけ動かしたら消える）。
  - `ui.menu` と `actions.setMenu(id | null)` … 開いている ⋯ メニュー（同時に1つ。`"appbar"` はアプリバー、シフト調整は `"shift"` など UI が名前を決める）。
  - Esc の順（`actions.escape`）：メニュー → ヘルプ → 担当者ポップアップ → 移動 → 範囲の選択 → 必要人数 → 勤務状況 → 全画面（旧版の順にメニュー・ヘルプ・範囲の選択を足した）。
- `keys.ts` の `handleKeyDown(e)` … App が document の keydown を渡す。
  - ⌘Z／Ctrl+Z は旧版と同じ（戻せる変更があり、フォーカスが input・textarea でなければ `undoShortcut`＝トーストを消して元に戻す。ステータスバーの「⌘Z 元に戻す」も同じ `undoShortcut`）。Esc は `escape()`（preventDefault しない）。
  - 新しいショートカット：`1`–`5` タブ（開けるタブだけ）・`F` 全画面（シフト調整でデータがあるとき）・`?` ヘルプ・`/` 表示中のページの検索欄（`[data-page-search]`、`SearchInput` の `pageSearch`）。
    文字の入力中（文字の input・select・textarea・contenteditable。checkbox などは除く）、⌘／Ctrl／Alt、変換中、共有ダイアログ・担当者ポップアップ・移動中・塗り替え中・⋯ メニューが開いている間（`?` を除く）は効かない。
    `1`–`5` でタブが替わってフォーカスが消えた（隠れたページに残った）ときは、新しいページ（role=tabpanel）へフォーカスを移す（`App` の `usePanelFocus`）。
  - Esc・担当者ポップアップの ↵／↑↓ は、日本語の変換中（`isComposing`・keyCode 229）は何もしない（変換の確定・取り消しだけ）。
  - `isTypingTarget(el)`・`TAB_ORDER`・`canShowView(view)` も公開。
- `browser.ts` … ダウンロード・印刷ウィンドウ・confirm/alert・`scrollToTop()`。
- `ui.picker` は枠の key だけを持つ（DOM は持たない）。ポップアップの位置は UI が key から枠の要素（`data-pick-slot` / `data-pm-key`）を探して合わせる。

**sync/firebase.ts** … 旧 sync.js の移植（`startSync()`）。ドキュメント形式・差分／マージ・WHOLE_MAP_THRESHOLD・受信の保留（busy → flush）・ログイン・管理者・退出・hashchange は旧版と同じ。gstatic から動的 import、`window.__FIREBASE_MOCK__` があればそれを使う。画面には store の `setShare` で状態を渡し、ダイアログは React（`ui/ShareDialog.tsx`）が描く。Model の共有データの書き換えは domain の `replaceShared` / `applySharedChange` で行う（sync は Model の中身の決まりを知らない）。

**ui/**
- `App.tsx` … アプリの枠の並び、body のクラス（`is-focus`＝全画面、`is-painting`・`is-dragging`＝カーソルの形だけ）と `data-view`、キー（`handleKeyDown`）・ポップアップの外側クリック。
- `layout/` … `AppBar`（ロゴ・`#modeBadge`＝`SyncBadge`・タブ `data-tab`＋`#memberTabCount` `#shiftTabCount`・`#shareBtn`・⋯ の中の `#printExportBtn` `#exportBtn`。スマホではタブが下のタブバーになる）、
  `StatusBar`（集計の id・⌘Z 元に戻す・? ヘルプ・`#footerNote`）、`HelpPopover`、`ToastDock`（`#toast`）、`FocusHint`、`BrandMark`。見た目の部品の使い方は `docs/design-system.md`。
- `views/{import,availability,members,rules,shift}/`、`Picker` `AuditDrawer` `CountsDrawer` `ShareDialog`、`components/`（デザインシステム。旧版の動きを保つ ChangeInput・StatusOptions・releaseFocus は `components/inputs.tsx`）。
- 表示中でない画面の中身（勤務可能表・シフト表）は描画しない（`section` は hidden のまま残す）。勤務可能表の横スクロールと「メンバーを追加」の書きかけは覚えておき、表示し直したときに戻す（旧版はタブの切り替えで作り直さなかった）。
- 派生データ（`useDerived.ts`）：`useAudit` `useShortNames` `useStats` `useAuditSummary`（ボタンの件数とドロワーで共有。missing・offs・unfits・disliked）`dropFitFor(from, range)`（緑の移動先）。`dataVersion` ごとに1回だけ計算する。
- 表のセル（役職別の枠・個人別のセル）は、選択中・移動元・移動先・光り（flash）を自分の分だけ store から読む（`views/shift/cellUi.ts` の `useCellUi`）。ポップアップの開閉・移動の開始で表全体を描き直さない。行・セルは `views/shift/gridModel.ts` が作る見た目のデータ（続き `data-stint`・まとまり `data-box`・`data-cont`）の `sig` で memo する。
- シフト表のキーボード（`views/shift/useGridKeys.ts`・`gridDom.ts`）：セルは `[data-cell]` の button で roving tabindex（Tab で入るのは1つ）。矢印・Home/End で移動、Enter/Space は普通のクリック（担当者ポップアップ・移動モードなら移動先に決定）、Delete/Backspace は「外す」、M は「移動…」と同じ操作（ポップアップを開いてすぐその操作をするので、トースト・元に戻すは同じ。選んでいる範囲の中なら範囲ごと）、Shift＋↑↓ は同じ列の範囲の選択（役職別だけ）。⌘/Ctrl/Alt 付きは何もしない。キーボードで開いたポップアップが閉じたらフォーカスをそのセルへ戻す。
- 表のクリック（`ShiftView`）：Shift＋クリック（役職別の枠）は `selectTo`（ポップアップは開かない）、それ以外は旧版どおり。
- 移動の足あと（`views/shift/footprint.ts` の `showFootprint(wrap, td)` / `clearFootprint`）：移動中、ポインタ（ドラッグ・「移動…」のあいだの pointerover）かフォーカス（M のあとの矢印）がある移動先について、
  `planMove` で入る枠すべてに `is-drop-hover`（つかんだ枠の行き先）・`is-drop-foot`（ほか）・`is-drop-swap`（人が戻る＝「入替」）・`is-drop-warn`（緑でない＝置けるが条件などを破る）・`is-drop-bad`（入りきらない＝落としても動かない。「入りません」）を付ける。
  ゴーストは名前（範囲に何人かいれば「山田 他1人」）・長さ（30分／Nコマ）・「移動元 → 移動先」・注意（`previewMove` の issues、入りきらなければ「× 入りません」）。
- 動きのための要素探しは data 属性・ref・store の状態で行い、見た目のクラス名に頼らない（`[data-drop-ok]`、`[data-pick-slot]`＋割当、`[data-av-name][data-av-h]`＋`canAt`、上に固定されている帯（アプリバー）は `domRefs.tabBarRef`、全画面は `ui.shiftFocus`）。
- 旧版は変更を確定するたびにその部分を作り直していたので、フォーカスは外れていた。同じにするため、メンバー・役職ルールの select・checkbox・やりたい／苦手の入力欄と「メンバーを追加」は、確定したら `releaseFocus` でフォーカスを外す（残すと共同編集の受信の保留＝busy と ⌘Z が止まったままになる）。必要人数の入力欄は旧版も作り直さなかったのでそのまま。
- ドロワー（勤務状況チェック・必要人数）は旧版と同じくモーダルではない：スクリムなし、開いたまま表を押して編集できる（Tab も閉じ込めない。画面いっぱいになるスマホ・横向きのスマホ＝高さ 560px 以下だけ閉じ込める）。勤務状況チェックが開いている間、幅 900px 以上ではシフト表の枠をドロワーの左までにする（「表で見る」でどの列もドロワーの左へ出せる）。開いている間、ドロワーの下に隠れたツールバー・凡例のボタン（真ん中が隠れているもの）は `inert`（Tab で見えないところに入らない。`ShiftView` の `InertUnderDrawers`）。
- タッチ：勤務可能表は指でスクロールでき、なぞって塗るのは長押し（350ms）してから（タップは1セル。塗っている間の吹き出しは指に隠れないようセルの上）。取り消し（pointercancel）は反映しない。`pointer: coarse` ではボタン・入力欄などが 36px 以上（`global.css` がトークンを上書き。表のセル・必要人数の入力欄・PositionSelect・リンクのボタン・ミニマップも）、入力欄は 16px（iOS が拡大しない）、キーキャップ（Esc・Tab・↵・/）は出さない（ヘルプのキーボードの一覧は除く）。
- 横にスクロールする帯（店舗のチップ・凡例・メンバーの表・スマホのシフト調整の日付と表示の切り替えの行）は `useEdgeFade` で続きのある端をぼかす（メンバーの表は中にフォーカスがある間はぼかさない）。置き場所だけ幅で変える要素（`#fullNameToggle`：PC は役職別/個人別の後ろ、スマホは ⋯ の中。641〜1240px では `#fullscreenBtn`・役職別/個人別・`#fullNameToggle` を日付のすぐ後ろ）は `useMedia` でどちらか一方だけ描く（Tab の順を見た目の順に合わせるため）。
- ドラッグ（`views/shift/useDragMove.ts`）と塗り替え（`views/availability/usePaint.ts`）は、ポインタの動きに合わせた一時的な表示（足あと `is-drop-*`、`painted to-yes/to-no`、ゴースト `.drag-ghost`＝名前・長さ・「移動元 → 移動先」・注意）だけ DOM を直接触る。押下・ドラッグ・塗り途中の状態はフックの ref に持ち、外れるときにタイマー・自動スクロール・ゴーストを片付ける。移動元・移動先・選択中（`data-drag-source`・`data-drop-ok`・選択中の枠）は状態から描く。
- 文字入力（やりたい／苦手）と必要人数はネイティブの `change` で確定する（`ChangeInput`）。
- メンバーの並べ替え（`views/members/useMemberDrag.ts`）：行の左のつまみ。マウスは 4px 動いたら、指・ペンは長押し（350ms）してからドラッグ（つまみは `touch-action: none`。長押しの前に 8px 動いたら何もしない）。入る位置の線（行の `data-member-drop="before|after"`）・動かしている行（`data-member-dragging`）・カーソル（tbody の `data-reordering`）は DOM に直接付け、離したら `actions.moveMemberTo`。Esc・pointercancel は取り消し。表の枠（スマホはページ）の端で自動スクロール。Alt+↑↓ は見えている行の中で1つ動かし、フォーカスはつまみに戻す。メンバー表の行はいつも並び順（要確認の行は色とタグだけで、上にまとめない）。
