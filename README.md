# Shift Maker

雙峰祭（CAFEORE）のシフト作成ツールです。アンケート回答の CSV を読み込み、勤務可能表・メンバー情報・役職ルールをもとに
30分単位のシフト表を自動割当し、クリックやドラッグで手直しして、印刷（PDF）や CSV で書き出します。
Firebase を使った複数人でのリアルタイム共同編集にも対応しています。

- 公開 URL：**https://sohosai-shift.cafeore.workers.dev/**（旧 URL https://cafeore-tkb.github.io/sohosai-shift/ は、リンクの `#room=…` などを保ったまま新 URL へ転送します）
- 利用者向けの手順書：[README_共有手順.txt](README_共有手順.txt)（画面の使い方・CSV の形式・印刷・共同編集。オフライン配布の zip にも同梱）

ビルド結果は JS・CSS をインライン化した **1ファイルの `dist/index.html`** です。Web でも、zip で配ってダブルクリック（`file://`）でも
同じように動きます。インターネット接続が必要なのは共同編集を使うときだけです。データはブラウザの中だけで処理され、
ページを閉じる・再読み込みすると作業内容は消えます（保存は「CSVを書き出す」「印刷ビュー」で行います）。

## 開発

Node.js 24（CI と同じバージョン）を使ってください。

```sh
npm ci              # 依存関係を入れる（package-lock.json どおり）
npm run dev         # 開発サーバー（http://localhost:5173/）
npm test            # テスト（Vitest。src/**/*.test.ts）
npm run typecheck   # 型チェック（tsc --noEmit）
npm run build       # 型チェック → dist/index.html と dist/firebase-config.js を作る
npm run preview     # ビルド結果を確認（vite preview）
npm run package     # オフライン配布用の ShiftMaker_Offline.zip を作る（下記）
```

部品の一覧（開発用・ビルドには入らない）：`npm run dev` のあと http://localhost:5173/src/ui/dev/gallery.html

## 構成

Vite + React + TypeScript。詳しくは次の2つを読んでください。

- [docs/architecture.md](docs/architecture.md) … ディレクトリの責務、状態（Model）、store・sync・UI の約束、テスト用フック、Domain API
- [docs/design-system.md](docs/design-system.md) … デザイントークン、部品（`src/ui/components/`）の使い方、アプリの枠のレイアウト

```
src/
  domain/     純粋なロジック（DOM・React・window に触らない。テストはここに厚く書く）
  print/      印刷ビューの HTML 生成
  store/      アプリの状態とユーザー操作（actions）。domain を呼び、トースト・元に戻す・再描画の通知を行う
  sync/       共同編集（Firebase Firestore）。store の公開 API だけを使う
  ui/         React コンポーネント（components＝デザインシステム、layout＝アプリの枠、views＝各タブ）
  styles/     デザイントークン（tokens.css）とグローバル CSS
  main.tsx    起動（store 初期化 → sync 開始 → React 描画）
public/firebase-config.js   共同編集の設定（ビルドせずに差し替えられるよう別ファイルのままコピーされる）
distribution/               オフライン配布用のランチャー（.command / .cmd）
scripts/package-offline.mjs オフライン配布の zip を作るスクリプト
firestore.rules             Firestore のセキュリティルール
.github/workflows/deploy.yml  GitHub Pages への自動デプロイ
```

### 依存の向き（レイヤーの決まり）

```
ui   → store → domain
sync → store → domain
print → domain
```

- 逆向き（domain が store・ui を import する、store が ui を import する など）は禁止です。
- `domain/` は純粋な関数だけ。Model を引数で受け取り、DOM・React・`window` に触りません。
- `ui/` は見た目と入力の受け付けだけ。ロジックは `store` の `actions` と `domain` を呼びます。
- `sync/` は Model の中身の決まりを知らず、domain の `replaceShared` / `applySharedChange` を通して書き換えます。
- Model の形（キー名・値の意味）は共同編集の Firestore ドキュメントの形式でもあるので、変えないでください（既存の部屋と互換）。
- 回帰テスト用の id・`data-*` 属性（docs/architecture.md「テスト用フック」）は、見た目を変えても残してください。
- CSS Modules では意味のトークン（`--surface-*` `--ink-*` `--primary*` …）だけを使い、生の色（16進数）は書きません。

画面の文言やヘルプ（`src/ui/layout/HelpPopover.tsx`、`src/ui/views/import/ImportView.tsx` の CSV の形式）を変えたときは、
[README_共有手順.txt](README_共有手順.txt) も合わせて直してください。

## デプロイ（Cloudflare Workers・GitHub Pages）

`main` ブランチに push すると、GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が
`npm ci` → `npm test` → `npm run build` を行い、`dist/` を **Cloudflare Workers**（`worker/`。https://sohosai-shift.cafeore.workers.dev 、
アプリ本体は静的ファイル、`/c/…` はカレンダー購読）に公開し、**GitHub Pages**（旧 URL）には新 URL へ転送するだけのページ（`pages/`）を置きます（Actions の画面から手動でも実行できます）。
テストかビルドが失敗したときは公開されません。Cloudflare へのデプロイには Secrets の `CLOUDFLARE_API_TOKEN`
（権限「アカウント → Workers スクリプト → 編集」だけ）と `CLOUDFLARE_ACCOUNT_ID` が要ります。
静的ファイルの応答ヘッダー（noindex）は `public/_headers`。

リポジトリの Settings → Pages の Source は「GitHub Actions」にしておきます。

## 共同編集（Firebase）の設定

共同編集は Firebase Authentication（Google ログイン）と Cloud Firestore を使います。プロジェクトは `sohosai-shift`（管理アカウント cafeore2016@gmail.com）です。

- **`public/firebase-config.js`** … Firebase コンソールの「プロジェクトの設定 → マイアプリ」に出る `firebaseConfig` を
  `window.FIREBASE_CONFIG = { … }` として書きます。ビルドするとそのまま `dist/firebase-config.js` にコピーされ、
  `index.html` から別ファイルとして読み込まれるので、ビルドし直さずに差し替えられます。
  中身を空にする（`window.FIREBASE_CONFIG` を設定しない）と共同編集は無効になり、オフラインだけで動きます。
  apiKey は公開してよい値です（アクセス制限は firestore.rules で行います）。
- **`firestore.rules`** … 部屋（`rooms/{roomId}`）のルール。部屋 ID（共有リンクの `#room=…`）を知っていて Google ログインした人だけが
  読み書きでき、管理者リストを変えられるのは管理者だけ、一覧取得は禁止です。変更したら
  `firebase deploy --only firestore:rules`（`.firebaserc` の既定プロジェクトは `sohosai-shift`）かコンソールの「ルール」タブで反映します。
- Authentication の「承認済みドメイン」に `sohosai-shift.cafeore.workers.dev` と `cafeore-tkb.github.io`（と開発に使うなら `localhost`）を入れておきます。

初回セットアップの手順と、利用者側の使い方（共同編集の始め方・管理者・注意点）は [README_共有手順.txt](README_共有手順.txt) の
「共同編集」にあります。

## 公開サイトの URL

| URL | 画面 |
|---|---|
| `/` | ローカル（このブラウザだけで動く。データは共有されない） |
| `/edit` | 本番の共同編集の部屋（`public/firebase-config.js` の `window.SHIFT_SITE.room`）。**閲覧・編集できるのは管理者と「編集できる人」に登録した Google アカウントだけ**（firestore.rules）。管理者が共有ダイアログで追加・削除する |
| `/shift` | カレンダー配信の名前の一覧と、その下に全体のシフト（ログイン不要） |
| `/shift/{名前}` | その人のシフト（日ごとの表）と、購読・ダウンロード（名前は空白を除いた氏名） |
| `/shift/{名前}.ics` | 購読の URL（Worker が返す） |

古いリンク（`#room={本番の部屋}` と `#cal=…`）は `/edit`・`/shift` に置き換わります。`SHIFT_SITE.room` が空なら、今までどおり
「共同編集を始める」で部屋（`#room=…`）を作れます。本番の部屋の ID は公開の設定に書いてあるので、ID を知っているだけでは入れません
（本番の部屋は rules で必ず登録制。ID を変えるときは firestore.rules の2か所も直す）。

## カレンダー配信（個人TT）

本番の部屋（`/edit`）の管理者が、共有ダイアログの「カレンダー配信」で**配信**すると、その時点の全員分の個人TTが Firestore の
`pubs/shift` に置かれます（編集中の内容は、もう一度「配信」を押すまで届きません）。メンバーには **`/shift`** だけを共有します。
ログイン不要で、全体のシフト（`/shift` の名前の一覧の下）を見たり、名前を選んで（`/shift/山田太郎`）自分のシフトを確認したりできます。
表はどちらもシフト調整の「個人別」と同じ形（行＝時間、担当は縦の枠）で、枠の中ではスクロールせず、ページごとスクロールします（見出しと時間は固定）。自分のページでは

- **購読**（webcal。シフトが変わると自動で反映。専用のカレンダーとして追加される）
- **ファイルで取り込む**（.ics。自分のカレンダーに予定として入る。変更は届かない）

ができます。閲覧ページと購読の応答は検索エンジンに載せません（noindex・robots.txt）。シフトは部内で見えて構わない前提で、
URL を知っていれば誰の分も見られます。止めるときは「配信を止める」（ドキュメントを削除。もう一度配信すると同じ URL で再開）。

購読の URL（`/shift/{名前}.ics`）は Cloudflare Worker（`worker/`）が返します。Worker は秘密の値を持たず、名前から ID を求めて
（`src/domain/calendarId.ts`。アプリと同じ関数）、Firestore の REST API で `pubs/shift` のその人の分（`ics.{ID}`）だけを読んで
`text/calendar` で返します。ICS を作るのはアプリだけ（`src/domain/ical.ts`）で、ダウンロードと購読は同じ中身です
（取り込み用はカレンダー名・更新間隔の指定だけを外す）。

**初回セットアップ**

1. `firestore.rules` を反映する。
2. Cloudflare（cafeore.internal のアカウント）で、権限「アカウント → Workers スクリプト → 編集」だけの API トークンを作り、
   GitHub の Settings → Secrets and variables → Actions に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録する。
3. Actions の「Deploy」を実行する（main に push したときも動く）。手元からなら `npm run build && cd worker && npx wrangler login && npx wrangler deploy`。
4. Firebase Authentication の承認済みドメインに `sohosai-shift.cafeore.workers.dev` を入れる。

## オフライン配布（zip）

インターネットに出せない場面や、公開 URL を使わずに渡したいとき用です。

```sh
npm run package
```

`dist/` がない・ソースより古いときは先にビルドし（`--build` で必ずビルド、`--no-build` でビルドしない：`npm run package -- --build`）、
リポジトリ直下に **`ShiftMaker_Offline.zip`** を作ります（`*.zip` は git 管理外）。zip の直下に次のファイルが入ります。

| ファイル | 元 |
|---|---|
| `index.html` | `dist/index.html`（アプリ本体。1ファイル） |
| `firebase-config.js` | `dist/firebase-config.js`（= `public/firebase-config.js`） |
| `Shift Maker を開く.command` | `distribution/`（macOS 用ランチャー。実行権限つき） |
| `Shift Maker を開く.cmd` | `distribution/`（Windows 用ランチャー） |
| `README_共有手順.txt` | リポジトリ直下（利用者向けの手順書） |

受け取った人は展開してランチャー（または `index.html`）をダブルクリックするだけで使えます。zip の作成にはシステムの `zip` コマンド
（macOS・Linux に標準で入っているもの）を使います。
