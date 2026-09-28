#!/usr/bin/env node
// オフライン配布用の ShiftMaker_Offline.zip を作る（npm run package）。
//
// 中身（zip の直下に平らに入れる。展開すると「ShiftMaker_Offline」フォルダになる）：
//   index.html                     … dist/ のビルド結果（JS・CSS をインライン化した1ファイル）
//   firebase-config.js             … dist/（= public/firebase-config.js のコピー）
//   Shift Maker を開く.command      … distribution/（macOS 用ランチャー。実行権限を付けたまま入れる）
//   Shift Maker を開く.cmd          … distribution/（Windows 用ランチャー）
//   README_共有手順.txt             … 利用者向けの手順書
//
// dist/ がない・ソースより古いときは先に `npm run build` を行う（--build で必ずビルド、--no-build でビルドしない）。
// zip はシステムの zip コマンドで作り、日本語のファイル名が Windows で文字化けしないよう UTF-8 の印を付ける。

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const OUT = join(root, "ShiftMaker_Offline.zip");
const MAC_LAUNCHER = "Shift Maker を開く.command";
const WIN_LAUNCHER = "Shift Maker を開く.cmd";
const MANUAL = "README_共有手順.txt";

/** zip に入れるもの：[zip の中の名前, 元のファイル] */
const FILES = [
  ["index.html", join(dist, "index.html")],
  ["firebase-config.js", join(dist, "firebase-config.js")],
  [MAC_LAUNCHER, join(root, "distribution", MAC_LAUNCHER)],
  [WIN_LAUNCHER, join(root, "distribution", WIN_LAUNCHER)],
  [MANUAL, join(root, MANUAL)],
];

/** ビルドの入力（これより dist/index.html が古ければビルドし直す） */
const BUILD_INPUTS = ["src", "public", "index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"];

const args = new Set(process.argv.slice(2));

/** パス（ファイルまたはフォルダの中すべて）の最新の更新時刻 */
function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(st.mtimeMs, ...readdirSync(path).map((name) => newestMtime(join(path, name))));
}

function needsBuild() {
  if (args.has("--build")) return true;
  if (args.has("--no-build")) return false;
  const built = join(dist, "index.html");
  if (!existsSync(built) || !existsSync(join(dist, "firebase-config.js"))) return true;
  const src = Math.max(...BUILD_INPUTS.map((p) => newestMtime(join(root, p))));
  return src > statSync(built).mtimeMs;
}

/**
 * zip の中のファイル名が UTF-8 であることを示す印（general purpose flag の bit 11）を付ける。
 * macOS の zip コマンドはこの印を付けないため、そのままだと Windows の「すべて展開」で日本語のファイル名
 * （「Shift Maker を開く.cmd」など）が文字化けする。名前・中身・CRC は変えず、ヘッダーのフラグだけを書き換える。
 */
function markUtf8Names(zipPath) {
  const buf = readFileSync(zipPath);
  // 末尾の End of central directory（0x06054b50）を探す
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip の終端が見つかりません");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip の目次が読めません");
    const nameLen = buf.readUInt16LE(p + 28),
      extraLen = buf.readUInt16LE(p + 30),
      commentLen = buf.readUInt16LE(p + 32),
      local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen);
    if (name.some((c) => c >= 0x80)) {
      buf.writeUInt16LE(buf.readUInt16LE(p + 8) | 0x800, p + 8);
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("zip のファイルの見出しが読めません");
      buf.writeUInt16LE(buf.readUInt16LE(local + 6) | 0x800, local + 6);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  writeFileSync(zipPath, buf);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${cmdArgs.join(" ")} が失敗しました（終了コード ${r.status ?? r.signal}）`);
    process.exit(r.status || 1);
  }
}

if (needsBuild()) {
  console.log("▶ dist/ をビルドします（npm run build）\n");
  run("npm", ["run", "build"]);
} else {
  console.log("▶ dist/ は最新なのでビルドを省略します（--build で必ずビルド）");
}

for (const [name, src] of FILES) {
  if (!existsSync(src)) {
    console.error(`✗ ${name} が見つかりません：${relative(root, src)}`);
    process.exit(1);
  }
}

// 一時フォルダにそろえてから、そのフォルダの中身を zip にする（zip の直下に平らに入る）
const stage = mkdtempSync(join(tmpdir(), "shiftmaker-offline-"));
try {
  for (const [name, src] of FILES) copyFileSync(src, join(stage, name));
  // .command はダブルクリックで実行できるよう、実行権限を付けて入れる（zip は Unix の権限を保存する）
  chmodSync(join(stage, MAC_LAUNCHER), 0o755);
  rmSync(OUT, { force: true });
  // -X：余計な拡張属性（uid/gid など）を入れない。-q：静か。名前は UTF-8 のバイト列のまま入る（印は markUtf8Names で付ける）
  execFileSync("zip", ["-X", "-q", OUT, ...FILES.map(([name]) => name)], { cwd: stage, stdio: "inherit" });
  markUtf8Names(OUT);
} catch (e) {
  console.error(`✗ zip の作成に失敗しました：${e.message}`);
  console.error("  zip コマンドが必要です（macOS・Linux は標準で入っています）。");
  process.exitCode = 1;
} finally {
  rmSync(stage, { recursive: true, force: true });
}

if (!process.exitCode) {
  const kb = (statSync(OUT).size / 1024).toFixed(0);
  console.log(`\n✓ ${relative(root, OUT)}（${kb} KB）を作成しました：`);
  for (const [name] of FILES) console.log(`   ${name}`);
}
