// 開発用：デザインシステムの部品の一覧（ビルドには入らない）。`npx vite` で /src/ui/dev/gallery.html を開く。
// 部品の見た目・状態の確認用。アプリの store は使わない（ドロワー・ポップアップなどはこのページの useState で開く）

import "../../styles/tokens.css";
import "../../styles/global.css";
import { StrictMode, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  CarChip,
  Card,
  Checkbox,
  Chip,
  ChipCount,
  ChipGroup,
  Dialog,
  Disclosure,
  Drawer,
  Drip,
  Fill,
  IconButton,
  IconSprite,
  Kbd,
  KbdHint,
  Mark,
  Meter,
  Notice,
  Page,
  Pill,
  Popover,
  PosTag,
  SearchInput,
  SegButton,
  SegSep,
  Segmented,
  Select,
  ShopTag,
  ShopToggle,
  StatusTag,
  Swatch,
  Switch,
  TextInput,
  ToastView,
} from "../components";
import type { PillTone, SwatchKind } from "../components";
import { BrandTile } from "../layout/BrandMark";
import { SyncPill } from "../layout/SyncBadge";
import type { SyncVariant } from "../layout/SyncBadge";
import styles from "./gallery.module.css";

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card pad className={styles.sec}>
      <h2 className={styles.h}>{title}</h2>
      {children}
    </Card>
  );
}
const Row = ({ children }: { children: ReactNode }) => <div className={styles.row}>{children}</div>;

function Gallery() {
  const [day, setDay] = useState("1");
  const [mode, setMode] = useState("role");
  const [shop, setShop] = useState("");
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  return (
    <Page hidden={false} step={0} title="コンポーネントと状態" description="開発用のギャラリー。すべて tokens.css の値だけで描いています。">
      <div className={styles.grid}>
        <Sec title="BUTTON">
          <Row>
            <Button variant="primary" icon="sparkle">自動割当</Button>
            <Button icon="sliders">必要人数を設定</Button>
            <Button variant="ghost" icon="printer">印刷ビュー</Button>
          </Row>
          <Row>
            <Button variant="ghost" danger icon="trash">割当をクリア</Button>
            <Button danger size="sm">外す</Button>
            <Button variant="ghost" icon="download" disabled>CSVを書き出す</Button>
            <IconButton icon="more" label="その他" variant="secondary" />
          </Row>
          <Row>
            <Button variant="primary" size="sm">sm</Button>
            <Button variant="primary">md</Button>
            <Button variant="primary" size="lg">lg</Button>
            <IconButton icon="check-list" label="勤務状況チェック" variant="secondary" dot={19} />
            <Button size="sm" icon="back" kbd="Esc">通常表示に戻る</Button>
          </Row>
          <Row>
            <Button icon="sliders" shortLabel="人数" shortAt="1279">必要人数を設定（1279px 以下で短く）</Button>
            <Button variant="ghost" icon="download" iconOnly="1439">1439px 以下でアイコンだけ</Button>
          </Row>
        </Sec>

        <Sec title="SEGMENTED · CHIP · SWITCH · CHECKBOX">
          <Row>
            <Segmented label="日付">
              {[["0", "前日準備", "10/30", 87], ["1", "本番1日目", "10/31", 91], ["2", "本番2日目", "11/1", 91]].map(([v, l, d, p]) => (
                <SegButton key={v} pressed={day === v} sub={d} hideSubAt="1400" badge={<Fill rate={p as number} />} onClick={() => setDay(v as string)}>
                  {l}
                </SegButton>
              ))}
              <SegSep />
              <SegButton pressed={day === "all"} badge={<Fill rate={89} />} onClick={() => setDay("all")}>3日分を一覧</SegButton>
            </Segmented>
          </Row>
          <Row>
            <Segmented label="表示" size="sm">
              <SegButton pressed={mode === "role"} icon="grid" onClick={() => setMode("role")}>役職別</SegButton>
              <SegButton pressed={mode === "person"} icon="person" onClick={() => setMode("person")}>個人別</SegButton>
            </Segmented>
            <Switch label="フルネーム" />
            <Checkbox label="車あり" defaultChecked />
          </Row>
          <ChipGroup label="店舗">
            {[["", "すべての店舗", 23], ["本店", "本店", 21], ["2号店", "2号店", 0], ["美化", "美化", 2]].map(([v, l, n]) => (
              <Chip key={v} pressed={shop === v} shop={(v as string) || undefined} onClick={() => setShop(v as string)} count={n ? <ChipCount tone="hot">{`未割当 ${n}`}</ChipCount> : <ChipCount tone="ok" />}>
                {l}
              </Chip>
            ))}
            <Chip pressed={false} attentionDot count={<ChipCount tone="hot">2</ChipCount>}>店舗未設定</Chip>
          </ChipGroup>
        </Sec>

        <Sec title="INPUTS">
          <Row>
            <SearchInput placeholder="氏名で検索" shortcut="/" />
            <TextInput placeholder="レジ、ホール" />
          </Row>
          <Row>
            <Select tone="unset" defaultValue="未設定"><option>未設定</option></Select>
            <Select defaultValue="2年目合格"><option>2年目合格</option></Select>
            <Select tone="set" defaultValue="上級生"><option>上級生</option></Select>
            <TextInput disabled placeholder="disabled" size="sm" />
          </Row>
          <Row>
            <ShopToggle shop="本店" defaultChecked />
            <ShopToggle shop="2号店" />
            <ShopToggle shop="くれあ" defaultChecked />
          </Row>
        </Sec>

        <Sec title="PILLS · TAGS · MARKS">
          <Row>
            {(["neutral", "open", "danger", "ok", "accent", "off", "unfit", "dislike", "warn"] as PillTone[]).map((t) => (
              <Pill key={t} tone={t}>{t}</Pill>
            ))}
          </Row>
          <Row>
            <Fill rate={100} /> <Fill rate={91} /> <Fill rate={0} /> <Pill tone="open" size="lg">未割当 154</Pill> <Pill tone="danger" size="lg">重複 2</Pill>
          </Row>
          <Row>
            <StatusTag top>上級</StatusTag> <StatusTag>2年</StatusTag> <StatusTag>1年</StatusTag> <StatusTag>未合格</StatusTag>
            <span>ドリッパー 1st<PosTag>上級</PosTag></span> <CarChip n={3} /> <CarChip n={0} />
          </Row>
          <Row>
            {["本店", "2号店", "くれあ", "美化", "準備", ""].map((s) => (
              <ShopTag key={s} shop={s}>{s || "なし"}</ShopTag>
            ))}
          </Row>
          <Row>
            <Mark kind="want" /> <Mark kind="dislike" /> <Mark kind="off" /> <Mark kind="unfit" /> <Mark kind="conflict" />
            <Drip kind="both" text="○" /> <Drip kind="ice" text="1" /> <Drip kind="hot" text="H" />
            {(["open", "none", "dislike", "conflict", "off", "unfit", "na", "stint", "brk"] as SwatchKind[]).map((k) => (
              <Swatch key={k} kind={k} />
            ))}
            <Swatch kind="shop" shop="本店" />
          </Row>
        </Sec>

        <Sec title="SYNC BADGE · BRAND · KBD · METER">
          <Row>
            {([["offline", "オフライン対応"], ["room", "共同編集中"], ["saving", "保存中…"], ["reconnecting", "オフライン（再接続で同期）"], ["error", "エラー"], ["login", "ログインが必要です"]] as [SyncVariant, string][]).map(([v, t]) => (
              <SyncPill key={v} variant={v} text={t} onLogin={() => undefined} />
            ))}
          </Row>
          <Row>
            <BrandTile size={30} /> <BrandTile size={44} />
            <Kbd>Esc</Kbd> <KbdHint keys={["⌘", "Z"]}>元に戻す</KbdHint> <KbdHint keys={["?"]}>ヘルプ</KbdHint>
            <Meter value={89} /> <Meter value={30} width={56} />
          </Row>
        </Sec>

        <Sec title="TOAST">
          <div className={styles.toasts}>
            <ToastView visible message="井上七海 を 本店・ドリッパー 3rd に割り当てました" action={{ label: "元に戻す", icon: "undo", title: "元に戻す（⌘Z）", onClick: () => undefined }} onClose={() => undefined} />
            <ToastView visible variant="move" message="石川彩 を移動中：緑の枠をクリックで移動・入れ替え（Escで取消）" />
          </div>
        </Sec>

        <Sec title="NOTICE · DISCLOSURE · OVERLAYS">
          <Notice>勤務可能表のヒント（info）</Notice>
          <Notice tone="ok">読み込みました</Notice>
          <Notice tone="warn" icon="lock">共同編集中のため、CSVの読み込みは管理者だけができます。</Notice>
          <Disclosure label="CSVの形式を見る">中身</Disclosure>
          <Row>
            <Button ref={menuBtn} icon="help" aria-expanded={menu} onClick={() => setMenu(!menu)}>ポップアップ</Button>
            <Button onClick={() => setDrawer(true)}>ドロワー</Button>
            <Button onClick={() => setDialog(true)}>ダイアログ</Button>
          </Row>
          <Popover open={menu} onClose={() => setMenu(false)} anchor={() => menuBtn.current} label="凡例と操作ヘルプ" width={320}>
            <p style={{ padding: 16 }}>ポップアップの中身</p>
          </Popover>
          <Drawer open={drawer} onClose={() => setDrawer(false)} title="勤務状況チェック" icon="check-list" footer={<span>フッター</span>}>
            <p>本文</p>
          </Drawer>
          <Dialog open={dialog} onClose={() => setDialog(false)} title="共同編集" icon="users" headExtra={<SyncPill variant="room" text="共同編集中" />} footer={<Button data-close="">閉じる</Button>}>
            <p>本文</p>
          </Dialog>
        </Sec>
      </div>
    </Page>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IconSprite />
    <Gallery />
  </StrictMode>,
);
