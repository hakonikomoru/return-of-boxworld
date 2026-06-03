#!/usr/bin/env node
/**
 * Minecraft Bedrock コンテンツログをリアルタイム表示。
 * - ファイル: ContentLog*.txt / *.log
 * - ゲーム内 GUI: クリップボード監視（Ctrl+H → 全コピー など）
 *
 * Usage:
 *   node scripts/tail-bedrock-log.mjs --mirror
 *   node scripts/tail-bedrock-log.mjs --mirror --robw
 *   node scripts/tail-bedrock-log.mjs --mirror --no-clipboard
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Set(process.argv.slice(2));
const robwOnly = args.has("--robw");
const mirror = args.has("--mirror");
const clipboard = !args.has("--no-clipboard") && (mirror || args.has("--clipboard"));
const mirrorPath = join(repoRoot, "logs", "bedrock-content.log");

let mirrorInitialized = false;
let lastClipboardHash = "";
let lastClipboardText = "";

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
      "LocalState",
    );
    if (existsSync(uwp)) {
      dirs.add(join(uwp, "logs"));
      dirs.add(join(uwp, "games", "com.mojang", "logs"));
    }
  }
  return [...dirs].filter((d) => existsSync(d));
}

function isContentLogFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".log") || (lower.startsWith("contentlog") && lower.endsWith(".txt"));
}

function findLatestLogFile() {
  let best = null;
  for (const dir of collectLogDirs()) {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isContentLogFile(name)) continue;
      const path = join(dir, name);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      if (st.size === 0) continue;
      if (!best || st.mtimeMs > best.mtimeMs) {
        best = { path, mtimeMs: st.mtimeMs, size: st.size };
      }
    }
  }
  return best;
}

function shouldPrint(line) {
  if (!robwOnly) return true;
  return /\[ROBW\]|robw:|scriptevent|Script|\[INFO\]|\[WARN\]|\[ERROR\]|\[ゲーム内\]/i.test(line);
}

function ensureMirror() {
  if (!mirror || mirrorInitialized) return;
  mirrorInitialized = true;
  mkdirSync(dirname(mirrorPath), { recursive: true });
  const header = [
    `# bedrock log mirror`,
    `# started ${new Date().toISOString()}`,
    `# sources: file log + in-game GUI (clipboard)`,
    ``,
  ].join("\n");
  writeFileSync(mirrorPath, header, "utf8");
  console.log(`Mirror: ${mirrorPath}\n`);
}

function emit(line, source = "file") {
  const prefix = source === "gui" ? "[gui] " : source === "file" ? "" : `[${source}] `;
  const body = `${prefix}${line}`;
  if (!shouldPrint(body)) return;
  const text = body.endsWith("\n") ? body : `${body}\n`;
  process.stdout.write(text);
  if (mirror) {
    ensureMirror();
    appendFileSync(mirrorPath, text, "utf8");
  }
}

function looksLikeMinecraftLog(text) {
  if (!text || text.trim().length < 8) return false;
  const patterns = [
    /\[Scripting\]/i,
    /\[ROBW\]/i,
    /\[INFO\]|\[WARN\]|\[ERROR\]/,
    /ContentLog/i,
    /minecraft:/i,
    /behavior.?pack/i,
    /\[Json\]/i,
    /\[Content\]/i,
    /\[Commands\]/i,
    /content log/i,
    /Script API/i,
  ];
  return patterns.some((p) => p.test(text));
}

function readClipboardText() {
  if (process.platform !== "win32") return "";
  try {
    const cmd =
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw"';
    return execSync(cmd, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function ingestClipboard() {
  const text = readClipboardText();
  if (!text) return;
  const hash = hashText(text);
  if (hash === lastClipboardHash) return;
  lastClipboardHash = hash;

  if (!looksLikeMinecraftLog(text)) return;

  let chunk = text;
  if (lastClipboardText && text.startsWith(lastClipboardText)) {
    chunk = text.slice(lastClipboardText.length);
  } else if (lastClipboardText && lastClipboardText.startsWith(text)) {
    lastClipboardText = text;
    return;
  }

  lastClipboardText = text;
  if (!chunk.trim()) return;

  const stamp = new Date().toISOString();
  emit(`--- clipboard ${stamp} ---`, "gui");
  for (const line of chunk.split(/\r?\n/)) {
    if (line.trim().length) emit(line, "gui");
  }
}

function printSetupHelp() {
  console.log("Minecraft Bedrock ログ tail（ファイル + ゲーム内 GUI）\n");
  console.log("【ファイルログ】設定 → クリエイター →「コンテンツログファイル」ON");
  console.log("  → ContentLog....txt が logs フォルダにできます\n");
  console.log("【ゲーム内 GUI】コンテンツログ GUI ON のとき:");
  console.log("  - 画面上のログは Ctrl+H → コンテンツログ履歴 →「全コピー」");
  console.log("  - コピーするとこのツールが clipboard から mirror へ追記します");
  if (clipboard) {
    console.log("  - クリップボード監視: ON（--no-clipboard で無効）\n");
  }
  console.log("診断: node scripts/diagnose-bedrock-log.mjs\n");
  console.log("監視フォルダ:");
  for (const dir of collectLogDirs()) console.log(`  ${dir}`);
  console.log("\n待機中…");
}

let currentPath = null;
let position = 0;
let partial = "";

function tailFile(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.size < position) position = 0;
  if (st.size === position) return;

  const chunk = readFileSync(path, {
    encoding: "utf8",
    start: position,
    end: st.size - 1,
  });
  position = st.size;

  const combined = partial + chunk;
  const lines = combined.split(/\r?\n/);
  partial = lines.pop() ?? "";
  for (const line of lines) {
    if (line.length) emit(line, "file");
  }
}

function switchToLog(info) {
  if (!info) return;
  if (currentPath !== info.path) {
    currentPath = info.path;
    position = 0;
    partial = "";
    console.log(`\n--- file: ${currentPath} ---\n`);
    ensureMirror();
  }
  tailFile(currentPath);
}

function pollFile() {
  const latest = findLatestLogFile();
  if (!latest) return;
  if (!currentPath || currentPath !== latest.path) {
    switchToLog(latest);
    return;
  }
  tailFile(currentPath);
}

printSetupHelp();
ensureMirror();
pollFile();

const fileInterval = setInterval(pollFile, 1500);
let clipboardInterval;

if (clipboard) {
  clipboardInterval = setInterval(ingestClipboard, 700);
  ingestClipboard();
}

for (const dir of collectLogDirs()) {
  try {
    watch(dir, { persistent: true }, () => pollFile());
  } catch {
    // ignore
  }
}

process.on("SIGINT", () => {
  clearInterval(fileInterval);
  if (clipboardInterval) clearInterval(clipboardInterval);
  if (mirror) console.log(`\nMirror: ${mirrorPath}`);
  process.exit(0);
});
