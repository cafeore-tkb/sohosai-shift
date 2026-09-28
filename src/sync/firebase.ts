// 共同編集（Firebase Firestore によるリアルタイム同期）。旧 sync.js の移植。
// firebase-config.js に設定があり、URL が #room=XXXX のときだけ有効になる。設定がなければ従来どおりオフラインで動く。
// 閲覧・編集（勤務可能表の修正を含む）：共有リンクを持ち Google ログインした人。CSVの読み込み（勤務可能時間の置き換え）と管理者の変更：管理者のみ。
// Firestore のドキュメントの形は旧版と同じ（既存の部屋がそのまま使える）。store の公開 API だけを使う。

import { SHARED_MAPS, applySharedChange, replaceShared, sharedMap } from "../domain";
import type { Availability, Model, SharedMap } from "../domain";
import { store } from "../store";
import type { ShareDialogContent } from "../store";

const FB_VERSION = "12.19.0";
const WHOLE_MAP_THRESHOLD = 200; // 1つのマップでこれ以上の変更があれば、項目ごとではなくマップごと送る

/** Firestore に置く共有データ（availability は JSON 文字列） */
type Shared = { availability: string } & Record<SharedMap, Record<string, unknown>>;
type Path = [string] | [string, string];

interface User {
  email: string;
}
interface Snapshot {
  exists(): boolean;
  data(): Record<string, unknown>;
  metadata: { hasPendingWrites: boolean; fromCache: boolean };
}
type DocRef = unknown;
/** 使う Firebase の関数（本物の SDK か、動作確認用のモック） */
interface Fb {
  db: unknown;
  FieldPath: new (...path: string[]) => unknown;
  deleteField(): unknown;
  serverTimestamp(): unknown;
  doc(db: unknown, collection: string, id: string): DocRef;
  setDoc(ref: DocRef, data: Record<string, unknown>): Promise<void>;
  updateDoc(ref: DocRef, ...args: unknown[]): Promise<void>;
  onSnapshot(ref: DocRef, opts: { includeMetadataChanges: boolean }, next: (s: Snapshot) => void, error: (e: FbError) => void): unknown;
  onUser(cb: (u: User | null) => void): unknown;
  signIn(): Promise<unknown>;
  signOut(): Promise<unknown>;
}
interface FbError extends Error {
  code?: string;
}

declare global {
  interface Window {
    FIREBASE_CONFIG?: { apiKey?: string; projectId?: string; [k: string]: unknown };
    __FIREBASE_MOCK__?: Fb;
  }
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const getPath = (obj: Shared, [k, key]: Path): unknown =>
  key === undefined ? obj[k as keyof Shared] : (obj[k as SharedMap] as Record<string, unknown> | undefined)?.[key];

function randomId(n = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    buf = crypto.getRandomValues(new Uint8Array(n));
  return [...buf].map((b) => chars[b % chars.length]).join("");
}

// 勤務可能時間は1つの文字列で同期するため、自分と相手が同時に変えたときは「人×日」ごとに3方向マージする（自分が変えた人・日は自分の内容を残す）
export function mergeAvailability(local: string, base: string, remote: string): Availability[] {
  const group = (s: string) => {
    const g: Record<string, Availability[]> = {};
    for (const a of JSON.parse(s || "[]") as Availability[]) (g[`${a.name}|${a.date}`] ??= []).push(a);
    return g;
  };
  const L = group(local),
    B = group(base),
    R = group(remote),
    out: Availability[] = [];
  for (const k of new Set([...Object.keys(L), ...Object.keys(B), ...Object.keys(R)])) out.push(...((same(L[k], B[k]) ? R[k] : L[k]) || []));
  return out;
}

export function normalize(data: Record<string, unknown>): Shared {
  const o = { availability: typeof data.availability === "string" ? data.availability : "[]" } as Shared;
  for (const k of SHARED_MAPS) o[k] = data[k] && typeof data[k] === "object" ? (data[k] as Record<string, unknown>) : {};
  return o;
}

// cur と base の差分を [[パス], 値（undefined は削除）] の配列で返す
export function diff(cur: Shared, base: Shared): [Path, unknown][] {
  const out: [Path, unknown][] = [];
  if (cur.availability !== base.availability) out.push([["availability"], cur.availability]);
  for (const k of SHARED_MAPS) {
    const a = cur[k],
      b = base[k] || {};
    for (const key of Object.keys(a)) if (!(key in b) || !same(a[key], b[key])) out.push([[k, key], a[key]]);
    for (const key of Object.keys(b)) if (!(key in a)) out.push([[k, key], undefined]);
  }
  return out;
}

const statusText: Record<string, string> = {
  connecting: "接続中…",
  live: "● 共同編集中",
  saving: "保存中…",
  offline: "オフライン（再接続で同期）",
  error: "エラー",
  login: "ログインが必要です",
};

/** 共同編集を始める（起動時に1回） */
export function startSync(): void {
  const config = window.FIREBASE_CONFIG;
  const enabled = !!(config && config.apiKey && config.projectId);
  const roomFromHash = () => (location.hash.match(/room=([A-Za-z0-9]{20,})/) || [])[1] || "";
  const M = (): Model => store.model;
  let fb: Fb | null = null,
    ref: DocRef | null = null,
    synced: Shared | null = null,
    pushTimer: ReturnType<typeof setTimeout> | undefined,
    pendingRender = false,
    roomId = "",
    user: User | null | undefined,
    starting = false,
    meta: { owner: string; admins: string[]; updatedBy?: string; updatedAt?: Date | null } = { owner: "", admins: [] };

  const myEmail = () => (user?.email || "").toLowerCase();
  const isAdmin = () => !!user && meta.admins.includes(myEmail());
  const roomUrl = () => `${location.origin}${location.pathname}#room=${roomId}`;
  const toast = (message: string, sticky = false) => store.showToast(message, sticky);

  function sharedNow(): Shared {
    const o = { availability: JSON.stringify(M().availability) } as Shared;
    for (const k of SHARED_MAPS) o[k] = clone(sharedMap(M(), k) || {});
    return o;
  }

  async function loadFirebase(): Promise<Fb> {
    if (fb) return fb;
    if (window.__FIREBASE_MOCK__) return (fb = window.__FIREBASE_MOCK__); // 動作確認用
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
    const [app, auth, fs] = await Promise.all([
      import(/* @vite-ignore */ `${base}/firebase-app.js`),
      import(/* @vite-ignore */ `${base}/firebase-auth.js`),
      import(/* @vite-ignore */ `${base}/firebase-firestore.js`),
    ]);
    const fbApp = app.initializeApp(config),
      au = auth.getAuth(fbApp);
    fb = {
      ...fs,
      db: fs.getFirestore(fbApp),
      onUser: (cb: (u: User | null) => void) => auth.onAuthStateChanged(au, cb),
      signIn: () => auth.signInWithPopup(au, new auth.GoogleAuthProvider()),
      signOut: () => auth.signOut(au),
    } as Fb;
    return fb;
  }

  // Firebase を読み込み、ログイン状態が分かったら onReady を呼ぶ
  let authStarted = false;
  async function startAuth(onReady?: () => void): Promise<void> {
    if (authStarted) return;
    authStarted = true;
    try {
      await loadFirebase();
    } catch (err) {
      console.error(err);
      setStatus("error", "接続できません");
      toast(`Firebase を読み込めませんでした：${(err as Error).message}`, true);
      return;
    }
    // 共同編集中に別アカウントへ切り替わった／ログアウトした場合は、権限が変わるので読み込み直す
    fb!.onUser((u) => {
      const switched = !!user && myEmail() !== (u?.email || "").toLowerCase();
      user = u || null;
      if (switched && ref) return location.reload();
      onReady?.();
      updateLock();
      refreshDialog();
    });
  }

  // ---- 送信 ----
  function schedulePush(): void {
    if (!ref || !synced) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 120);
  }
  function pushNow(): void {
    clearTimeout(pushTimer);
    pushTimer = undefined;
    if (!ref || !synced || !user || !fb) return;
    const cur = sharedNow(),
      changes = diff(cur, synced);
    if (!changes.length) return;
    synced = cur;
    const perMap: Record<string, number> = {};
    changes.forEach(([p]) => (perMap[p[0]] = (perMap[p[0]] || 0) + 1));
    const args: unknown[] = [],
      whole = new Set<string>();
    for (const [path, v] of changes) {
      if (path.length === 2 && perMap[path[0]] > WHOLE_MAP_THRESHOLD) {
        if (!whole.has(path[0])) {
          whole.add(path[0]);
          args.push(new fb.FieldPath(path[0]), cur[path[0] as SharedMap]);
        }
        continue;
      }
      args.push(new fb.FieldPath(...path), v === undefined ? fb.deleteField() : v);
    }
    args.push("updatedBy", user.email, "updatedAt", fb.serverTimestamp());
    // 権限がなく拒否された場合は、Firestore がサーバーの内容を配信し直すので画面も元に戻る
    fb.updateDoc(ref, ...args).catch((err: FbError) => {
      console.error(err);
      toast(err.code === "permission-denied" ? "この変更をする権限がないため、元に戻しました" : `共同編集の保存に失敗しました：${err.message}`, true);
    });
  }

  // ---- 受信 ----
  function applyMeta(data: Record<string, unknown>): void {
    const at = data.updatedAt as { toDate?: () => Date } | undefined;
    meta = {
      owner: (data.owner as string) || "",
      admins: Array.isArray(data.admins) ? (data.admins as string[]) : [],
      updatedBy: (data.updatedBy as string) || "",
      updatedAt: at?.toDate?.() || null,
    };
    updateLock();
    refreshDialog();
  }
  function applyFull(data: Record<string, unknown>): void {
    const remote = normalize(data),
      maps = {} as Record<SharedMap, Record<string, unknown>>;
    for (const k of SHARED_MAPS) maps[k] = clone(remote[k]);
    replaceShared(M(), JSON.parse(remote.availability || "[]"), maps);
    store.setUi({ importStatus: null });
    synced = remote;
    store.commit();
  }
  function applyRemote(data: Record<string, unknown>): void {
    const remote = normalize(data),
      local = sharedNow(),
      changes = diff(remote, synced!);
    if (!changes.length) return;
    const m = M();
    for (const [path, v] of changes) {
      if (path.length === 1) {
        m.availability =
          local.availability === synced!.availability
            ? JSON.parse((v as string) || "[]")
            : mergeAvailability(local.availability, synced!.availability, v as string);
        continue;
      }
      // まだ送っていない自分の変更がある項目は、自分の変更を優先（このあと送信される）
      if (!same(getPath(local, path), getPath(synced!, path))) continue;
      const [k, key] = path as [SharedMap, string];
      applySharedChange(m, k, key, clone(v));
    }
    synced = remote;
    store.dataChanged();
    renderWhenIdle();
    schedulePush();
  }

  // 入力中・ドロップダウン操作中・ドラッグ中に描き直すと操作が途切れるので、終わるまで待つ
  function busy(): boolean {
    const el = document.activeElement as HTMLInputElement | null;
    if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|file)$/.test(el.type) && !el.closest("dialog"))
      return true;
    return store.isInteracting();
  }
  function renderWhenIdle(): void {
    if (busy()) {
      pendingRender = true;
      return;
    }
    pendingRender = false;
    store.commit();
  }
  const flush = () =>
    setTimeout(() => {
      if (pendingRender && !busy()) {
        pendingRender = false;
        store.commit();
      }
    }, 0);
  document.addEventListener("focusout", flush);
  document.addEventListener("dragend", flush);
  document.addEventListener("click", flush);
  setInterval(flush, 1000);

  function subscribe(): void {
    let first = true;
    fb!.onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.exists()) {
          setStatus("error", "部屋が見つかりません");
          if (first) alert("共同編集の部屋が見つかりません。リンクが正しいか確認してください。");
          first = false;
          return;
        }
        const data = snap.data();
        applyMeta(data);
        if (first) {
          first = false;
          applyFull(data);
        } else applyRemote(data);
        setStatus(snap.metadata.hasPendingWrites ? "saving" : snap.metadata.fromCache ? "offline" : "live");
      },
      (err) => {
        console.error(err);
        setStatus("error", err.code === "permission-denied" ? "アクセス権がありません" : "接続できません");
        toast(`共同編集に接続できません：${err.message}`, true);
      },
    );
  }

  function joinRoom(id: string): void {
    roomId = id;
    setStatus("connecting");
    void startAuth(() => {
      if (!user) {
        setStatus("login", "ログインが必要です");
        openDialog();
        return;
      }
      if (!ref) {
        ref = fb!.doc(fb!.db, "rooms", roomId);
        subscribe();
      }
    });
  }
  async function startRoom(): Promise<void> {
    starting = true;
    refreshDialog();
    try {
      roomId = randomId();
      ref = fb!.doc(fb!.db, "rooms", roomId);
      const cur = sharedNow();
      await fb!.setDoc(ref, {
        ...cur,
        owner: myEmail(),
        admins: [myEmail()],
        updatedBy: user!.email,
        createdAt: fb!.serverTimestamp(),
        updatedAt: fb!.serverTimestamp(),
      });
      synced = cur;
      history.replaceState(null, "", `#room=${roomId}`);
      subscribe();
    } catch (err) {
      console.error(err);
      roomId = "";
      ref = null;
      alert(`共同編集を開始できませんでした：${(err as Error).message}`);
    }
    starting = false;
    refreshDialog();
  }
  async function setAdmins(list: string[]): Promise<void> {
    try {
      await fb!.updateDoc(ref, { admins: list, updatedBy: user!.email, updatedAt: fb!.serverTimestamp() });
    } catch (err) {
      const e = err as FbError;
      console.error(e);
      toast(e.code === "permission-denied" ? "管理者を変更する権限がありません" : `変更できませんでした：${e.message}`);
    }
  }
  function leaveRoom(): void {
    if (!confirm("このブラウザでの共同編集を終了しますか？\nクラウド上のシフトは残り、リンクを開けばいつでも再参加できます。")) return;
    history.replaceState(null, "", location.pathname + location.search);
    location.reload();
  }

  // ---- 画面 ----
  const canImportCSV = () => !roomId || isAdmin();
  store.canImportCSV = canImportCSV;
  function updateLock(): void {
    const locked = !canImportCSV();
    store.setShare({
      importLock: locked
        ? `共同編集中のため、CSVの読み込みは管理者だけができます。${meta.admins.length ? `（管理者：${meta.admins.join("、")}）` : ""}`
        : null,
    });
  }
  function setStatus(kind: string, text?: string): void {
    store.setShare({
      badge: { kind, text: text || statusText[kind] },
      footerNote: "共同編集中：データは Firebase に保存され、共有リンクを持つログイン済みの人が閲覧・編集できます。",
    });
  }
  function dialogContent(): ShareDialogContent {
    if (!enabled) return { kind: "disabled" };
    if (user === undefined) return { kind: "loading" };
    if (!user) return { kind: "login", inRoom: !!roomId };
    if (!roomId) return { kind: "start", email: user.email, starting };
    return {
      kind: "room",
      email: user.email,
      url: roomUrl(),
      admins: meta.admins,
      owner: meta.owner,
      isAdmin: isAdmin(),
      updatedBy: meta.updatedBy || "",
      when: meta.updatedAt ? meta.updatedAt.toLocaleString("ja-JP") : "",
    };
  }
  function refreshDialog(force = false): void {
    if (!force && !store.ui.share.dialogOpen) return;
    store.setShare({ dialog: dialogContent() });
    if (enabled && user === undefined) void startAuth();
  }
  function openDialog(): void {
    refreshDialog(true);
    if (!store.ui.share.dialogOpen) store.setShare({ dialogOpen: true });
  }

  store.shareActions = {
    open: openDialog,
    close: () => store.ui.share.dialogOpen && store.setShare({ dialogOpen: false }),
    signIn: () =>
      void fb!.signIn().catch((err: FbError) => {
        if (err.code !== "auth/popup-closed-by-user") alert(`ログインできませんでした：${err.message}`);
      }),
    signOut: () => void fb!.signOut(),
    start: () => void startRoom(),
    leave: leaveRoom,
    addAdmin: (email) => {
      const a = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) return;
      if (!meta.admins.includes(a)) void setAdmins([...meta.admins, a]);
    },
    removeAdmin: (a) => {
      if (confirm(`${a} を管理者から外しますか？`)) void setAdmins(meta.admins.filter((x) => x !== a));
    },
  };

  store.onStateChange = schedulePush;
  window.addEventListener("hashchange", () => {
    if (roomFromHash() !== roomId) location.reload();
  });
  const initial = roomFromHash();
  if (initial) {
    if (enabled) joinRoom(initial);
    else setTimeout(() => alert("共同編集のリンクですが、Firebase の設定（firebase-config.js）がないため接続できません。"), 0);
  }
}
