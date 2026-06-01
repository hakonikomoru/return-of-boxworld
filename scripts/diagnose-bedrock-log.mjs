#!/usr/bin/env node
/**
 * コンテンツログの保存場所と有無を診断する。
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function isContentLogFile(name) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".log") ||
    (lower.startsWith("contentlog") && lower.endsWith(".txt"))
  );
}

function collectLogDirs() {
  const dirs = new Set();
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const gameRoots = [];
  if (appData) {
    gameRoots.push(join(appData, "Minecraft Bedrock"));
    gameRoots.push(join(appData, "Minecraft Bedrock Preview"));
  }
  for (const base of gameRoots) {
    if (!existsSync(base)) continue;
    dirs.add(join(base, "logs"));
    dirs.add(join(base, "logging"));
    const usersDir = join(base, "Users");
    if (existsSync(usersDir)) {
      for (const user of readdirSync(usersDir)) {
        dirs.add(join(usersDir, user, "games", "com.mojang", "logs"));
      }
    }
  }
  if (localAppData) {
    const uwp = join(
      localAppData,
      "Packages",
      "Microsoft.MinecraftUWP_8wekyb3d8bbwe",
      "LocalState"
    );
    if (existsSync(uwp)) {
      dirs.add(join(uwp, "logs"));
      dirs.add(join(uwp, "games", "com.mojang", "logs"));
    }
  }
  return [...dirs];
}

console.log("=== Minecraft Bedrock コンテンツログ診断 ===\n");

const dirs = collectLogDirs();
const found = [];

for (const dir of dirs) {
  const exists = existsSync(dir);
  console.log(`[${exists ? "DIR" : " ---"}] ${dir}`);
  if (!exists) continue;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    const mark = isContentLogFile(name) ? "LOG" : "   ";
    console.log(`  [${mark}] ${name}  (${st.size} bytes, ${st.mtime.toISOString()})`);
    if (isContentLogFile(name) && st.size > 0) found.push(path);
  }
}

console.log("");
if (found.length === 0) {
  console.log("結果: コンテンツログファイルはまだありません。\n");
  console.log("対処チェックリスト:");
  console.log("  1. 設定 → クリエイター →「コンテンツログファイルを有効にする」ON");
  console.log("  2. 設定を変えたら一度ホーム画面に戻る");
  console.log("  3. ROBW パック付きワールドに入る（スクリプトが動くとログが出やすい）");
  console.log("  4. プロフィール画面に表示されるログパスを確認");
  console.log("  5. ゲーム内 Ctrl+H → コンテンツログ履歴（ファイルが無くてもここに出る）");
  console.log("  6. 再診断: node scripts/diagnose-bedrock-log.mjs");
  console.log("\nリアルタイム監視: node scripts/tail-bedrock-log.mjs --mirror");
  process.exit(1);
}

console.log(`結果: ${found.length} 件のログファイル`);
for (const p of found.sort()) console.log(`  ${p}`);
console.log("\n最新を tail: node scripts/tail-bedrock-log.mjs --mirror");
process.exit(0);
