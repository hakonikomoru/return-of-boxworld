#!/usr/bin/env node
/**
 * ローカルの Bedrock behavior_packs 配置をざっと確認する。
 * Windows Launcher 既定パスを想定。
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoPack = join(repoRoot, "behavior_packs", "robw_behavior");
const requiredMcfunctions = ["start", "stop", "reset", "ranking", "menu", "give_wand", "ping"];

function checkPackRoot(label, packRoot) {
  console.log(`\n=== ${label} ===`);
  console.log(packRoot);

  if (!existsSync(packRoot)) {
    console.log("  MISSING pack folder");
    return false;
  }

  let ok = true;
  const manifest = join(packRoot, "manifest.json");
  const fnDir = join(packRoot, "functions", "robw");
  const mainJs = join(packRoot, "scripts", "main.js");

  for (const p of [manifest, mainJs]) {
    const mark = existsSync(p) ? "OK" : "MISSING";
    console.log(`  [${mark}] ${p.replace(packRoot, ".")}`);
    if (mark === "MISSING") ok = false;
  }

  if (!existsSync(fnDir)) {
    console.log("  [MISSING] functions/robw/");
    ok = false;
  } else {
    const files = readdirSync(fnDir).filter((f) => f.endsWith(".mcfunction"));
    for (const name of requiredMcfunctions) {
      const found = files.includes(`${name}.mcfunction`);
      console.log(`  [${found ? "OK" : "MISSING"}] functions/robw/${name}.mcfunction`);
      if (!found) ok = false;
    }
  }

  return ok;
}

let allOk = true;
allOk = checkPackRoot("Repository pack", repoPack) && allOk;

const appData = process.env.APPDATA;
if (appData) {
  const bedrockUsers = join(appData, "Minecraft Bedrock", "Users");
  const deployRoots = [
    join(bedrockUsers, "Shared", "games", "com.mojang", "behavior_packs", "robw_behavior"),
  ];
  if (existsSync(bedrockUsers)) {
    for (const name of readdirSync(bedrockUsers)) {
      if (name === "Shared") continue;
      const userBp = join(
        bedrockUsers,
        name,
        "games",
        "com.mojang",
        "behavior_packs",
        "robw_behavior",
      );
      if (existsSync(join(bedrockUsers, name))) deployRoots.push(userBp);
    }
  }
  for (const deployed of deployRoots) {
    if (existsSync(deployed)) {
      allOk = checkPackRoot(`Deployed: ${deployed}`, deployed) && allOk;
    }
  }
  if (!deployRoots.some((p) => existsSync(p))) {
    console.log(
      "\n[WARN] No deployed robw_behavior junction found. Run: npm run install:bedrock-pack",
    );
    allOk = false;
  }
} else {
  console.log("\n(APPDATA not set — skipped deployed pack check)");
}

console.log(allOk ? "\nverify: OK" : "\nverify: FAILED — fix paths or junction");
process.exit(allOk ? 0 : 1);
