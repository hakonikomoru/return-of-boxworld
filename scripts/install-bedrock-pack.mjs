#!/usr/bin/env node
/**
 * リポジトリの behavior pack を Minecraft Bedrock の各配置先へジャンクションで接続する。
 * PowerShell の実行ポリシーに依存しない（node のみ）。
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readlink, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const behaviorSrc = join(repoRoot, "behavior_packs", "robw_behavior");
const resourceSrc = join(repoRoot, "resource_packs", "robw_resources");
const behaviorSrcResolved = resolve(behaviorSrc);
const resourceSrcResolved = resolve(resourceSrc);

if (!existsSync(join(behaviorSrc, "manifest.json"))) {
  console.error(`Behavior pack not found: ${behaviorSrc}`);
  process.exit(1);
}

const appData = process.env.APPDATA;
if (!appData) {
  console.error("APPDATA is not set");
  process.exit(1);
}

const usersRoot = join(appData, "Minecraft Bedrock", "Users");
const mojangRoots = [join(usersRoot, "Shared", "games", "com.mojang")];

if (existsSync(usersRoot)) {
  for (const name of readdirSync(usersRoot)) {
    if (name === "Shared") continue;
    const root = join(usersRoot, name, "games", "com.mojang");
    if (existsSync(join(usersRoot, name, "games"))) mojangRoots.push(root);
  }
}

const destFolders = [
  {
    kind: "behavior",
    folder: "behavior_packs",
    name: "robw_behavior",
    srcResolved: behaviorSrcResolved,
  },
  {
    kind: "behavior",
    folder: "development_behavior_packs",
    name: "robw_behavior",
    srcResolved: behaviorSrcResolved,
  },
  {
    kind: "resource",
    folder: "resource_packs",
    name: "robw_resources",
    srcResolved: resourceSrcResolved,
  },
  {
    kind: "resource",
    folder: "development_resource_packs",
    name: "robw_resources",
    srcResolved: resourceSrcResolved,
  },
];
let linked = 0;

async function ensureJunction(dest, srcResolved) {
  if (existsSync(dest)) {
    try {
      const target = await readlink(dest);
      const normalized =
        target.startsWith("\\\\?\\") || /^[A-Za-z]:/.test(target)
          ? resolve(target.replace(/^\\\\\?\\/, ""))
          : resolve(dirname(dest), target);
      if (normalized.toLowerCase() === srcResolved.toLowerCase()) {
        console.log(`OK (exists): ${dest}`);
        return;
      }
      await rm(dest, { recursive: true, force: true });
    } catch {
      console.warn(`Skip (not a junction): ${dest}`);
      return;
    }
  }

  await mkdir(dirname(dest), { recursive: true });
  await symlink(srcResolved, dest, "junction");
  console.log(`Linked: ${dest} -> ${srcResolved}`);
  linked += 1;
}

for (const root of [...new Set(mojangRoots)]) {
  for (const { folder, name, srcResolved } of destFolders) {
    if (!existsSync(srcResolved)) continue;
    const parent = join(root, folder);
    if (!existsSync(join(root))) continue;
    await ensureJunction(join(parent, name), srcResolved);
  }
}

if (linked === 0) {
  console.log("No new links (already configured or skipped).");
} else {
  console.log("");
  console.log("Done. Re-enter the world or run /reload, then try:");
  console.log("  /function robw/ping");
  console.log("  /scriptevent robw:menu run");
}
