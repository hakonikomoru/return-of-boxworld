import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export function markerStart(id) {
  return `<!-- sync:auto:${id}:start -->`;
}

export function markerEnd(id) {
  return `<!-- sync:auto:${id}:end -->`;
}

export function replaceMarkedSection(content, id, body) {
  const start = markerStart(id);
  const end = markerEnd(id);
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Missing sync markers for "${id}" in docs/project-sync.md`);
  }
  const before = content.slice(0, startIdx + start.length);
  const after = content.slice(endIdx);
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `${before}\n${normalized}${after}`;
}

export function getGitCommit(cwd) {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export function generateMetaLine(repo, commit, via = "npm run sync:project-docs") {
  const date = new Date().toISOString().slice(0, 10);
  return `最終更新の想定リポジトリ: \`${repo}\`（\`main\`・\`${commit}\`・${date}・\`${via}\` 自動反映）`;
}

function listSorted(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith(".") && n !== "node_modules" && n !== "dist" && n !== ".next")
    .sort((a, b) => a.localeCompare(b, "en"));
}

function appendTree(dir, prefix, depth, maxDepth, lines) {
  if (depth > maxDepth) return;
  const names = listSorted(dir);
  names.forEach((name, i) => {
    const full = join(dir, name);
    const isLast = i === names.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    const isDir = statSync(full).isDirectory();
    lines.push(`${prefix}${branch}${name}${isDir ? "/" : ""}`);
    if (isDir) appendTree(full, prefix + childPrefix, depth + 1, maxDepth, lines);
  });
}

export function generateDirectoryTree(root, rootLabel, topEntries, maxDepth = 3) {
  const lines = ["```", `${rootLabel}/`];
  for (const entry of topEntries) {
    const full = join(root, entry);
    if (!existsSync(full)) continue;
    const isDir = statSync(full).isDirectory();
    lines.push(`├── ${entry}${isDir ? "/" : ""}`);
    if (isDir) appendTree(full, "│   ", 1, maxDepth, lines);
  }
  lines.push("```");
  return lines.join("\n");
}

export function collectNextPages(appRoot) {
  const rows = [];
  function walk(dir, segments) {
    const page = join(dir, "page.tsx");
    const pageTs = join(dir, "page.ts");
    const pageFile = existsSync(page) ? page : existsSync(pageTs) ? pageTs : null;
    if (pageFile) {
      let path = segments.length === 0 ? "/" : `/${segments.join("/")}`;
      path = path.replace(/\([^)]+\)\//g, "").replace(/\/+/g, "/");
      if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
      rows.push({ path, file: relative(appRoot, pageFile) });
    }
    for (const name of listSorted(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, [...segments, name]);
    }
  }
  if (existsSync(appRoot)) walk(appRoot, []);
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function generatePagesTable(rows) {
  const lines = ["| パス | ファイル |", "|------|----------|"];
  for (const r of rows) {
    lines.push(`| \`${r.path}\` | \`${r.file}\` |`);
  }
  return lines.join("\n");
}

export function collectNextApiRoutes(apiRoot) {
  const routes = [];
  function walk(dir) {
    for (const name of listSorted(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name === "route.ts" || name === "route.tsx") {
        const rel = relative(apiRoot, dir).replace(/\\/g, "/");
        routes.push({
          path: rel ? `/api/${rel}` : "/api",
          file: relative(apiRoot, full),
        });
      }
    }
  }
  if (existsSync(apiRoot)) walk(apiRoot);
  return routes.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function generateApiRoutesTable(routes) {
  const lines = ["| Path | ファイル |", "|------|----------|"];
  for (const r of routes) {
    lines.push(`| \`${r.path}\` | \`${r.file}\` |`);
  }
  return lines.join("\n");
}

export function collectAstroPages(pagesRoot) {
  const rows = [];
  function walk(dir, segments) {
    for (const name of listSorted(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full, [...segments, name]);
      } else if (name.endsWith(".astro")) {
        const base = name.replace(/\.astro$/, "");
        const segs =
          base === "index" ? segments : [...segments, base === "index" ? [] : base].flat();
        let path = segs.length === 0 ? "/" : `/${segs.join("/")}`;
        if (path.includes("[") && !path.endsWith("/")) path += "/";
        rows.push({ path, file: relative(pagesRoot, full) });
      }
    }
  }
  if (existsSync(pagesRoot)) walk(pagesRoot, []);
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function collectReactRouterPaths(appTsxPath) {
  const source = readFileSync(appTsxPath, "utf8");
  const paths = new Set();
  const re = /path=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source)) !== null) paths.add(m[1]);
  return [...paths].sort((a, b) => a.localeCompare(b, "en"));
}

export function generateRouterPagesTable(paths) {
  const lines = ["| パス |", "|------|"];
  for (const p of paths) lines.push(`| \`${p}\` |`);
  return lines.join("\n");
}

export function collectBotSrcTree(srcRoot) {
  const rows = [];
  function walk(dir, prefix) {
    for (const name of listSorted(dir)) {
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        rows.push({ path: `${rel}/`, kind: "dir" });
        walk(full, rel);
      } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
        rows.push({ path: rel, kind: "file" });
      }
    }
  }
  if (existsSync(srcRoot)) walk(srcRoot, "");
  return rows;
}

export function generateSrcTable(rows) {
  const lines = ["| パス | 種別 |", "|------|------|"];
  for (const r of rows) lines.push(`| \`${r.path}\` | ${r.kind} |`);
  return lines.join("\n");
}

function parseConfigStringArray(block, key) {
  const re = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`, "m");
  const match = block.match(re);
  if (!match) return [];
  const items = [];
  const itemRe = /"([^"]+)"/g;
  let m;
  while ((m = itemRe.exec(match[1])) !== null) items.push(m[1]);
  return items;
}

function parseConfigObjectEntries(block, key) {
  const re = new RegExp(`${key}:\\s*\\{([^}]*)\\}`, "m");
  const match = block.match(re);
  if (!match) return [];
  const entries = [];
  const entryRe = /"([^"]+)":\s*"([^"]+)"/g;
  let m;
  while ((m = entryRe.exec(match[1])) !== null) {
    entries.push({ label: m[1], action: m[2] });
  }
  return entries;
}

function parseConfigNumber(block, key) {
  const re = new RegExp(`${key}:\\s*(-?\\d+(?:\\.\\d+)?)`);
  const match = block.match(re);
  return match ? Number(match[1]) : undefined;
}

function parseConfigString(block, key) {
  const re = new RegExp(`${key}:\\s*"([^"]*)"`);
  const match = block.match(re);
  return match ? match[1] : undefined;
}

function parseCoordBlock(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*\\{([^}]+)\\}`));
  if (!match) return {};
  const inner = match[1];
  const num = (k) => {
    const m = inner.match(new RegExp(`${k}:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? Number(m[1]) : undefined;
  };
  return {
    x: num("x"),
    y: num("y"),
    z: num("z"),
    radius: num("radius"),
  };
}

function parseBoxGate(block) {
  return parseCoordBlock(block, "BOX_GATE");
}

export function parseRobwGameSpec(mainJsSource) {
  const configMatch = mainJsSource.match(/const CONFIG = \{([\s\S]*?)\n\};/);
  if (!configMatch) {
    throw new Error("const CONFIG = { ... } が main.js に見つかりません");
  }
  const block = configMatch[1];
  const milestoneMatch = mainJsSource.match(/const MILESTONE_SECONDS = \[([^\]]+)\]/);
  const milestones = milestoneMatch
    ? milestoneMatch[1]
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n))
    : [];

  return {
    gateOpenMinutes: parseConfigNumber(block, "GATE_OPEN_MINUTES"),
    timeNotifyIntervalSeconds: parseConfigNumber(block, "TIME_NOTIFY_INTERVAL_SECONDS"),
    protectionRadius: parseConfigNumber(block, "PROTECTION_RADIUS"),
    boxGate: parseBoxGate(block),
    submissionChest: parseCoordBlock(block, "SUBMISSION_CHEST"),
    gateSummonOffsetY: parseConfigNumber(block, "GATE_SUMMON_OFFSET_Y"),
    startGiveBones: parseConfigNumber(block, "START_GIVE_BONES"),
    bonesPerHakoinuDelivery: parseConfigNumber(block, "BONES_PER_HAKOINU_DELIVERY"),
    bonesPerWrongAnimalDelivery: parseConfigNumber(block, "BONES_PER_WRONG_ANIMAL_DELIVERY"),
    bonesPerCapture: parseConfigNumber(block, "BONES_PER_CAPTURE"),
    startSpawnHakoinu: parseConfigNumber(block, "START_SPAWN_HAKOINU"),
    startSpawnPenaltyAnimals: parseConfigNumber(block, "START_SPAWN_PENALTY_ANIMALS"),
    spawnMinDistance: parseConfigNumber(block, "SPAWN_MIN_DISTANCE"),
    spawnMaxDistance: parseConfigNumber(block, "SPAWN_MAX_DISTANCE"),
    chestCleanupRadius: parseConfigNumber(block, "CHEST_CLEANUP_RADIUS"),
    chestCleanupVerticalRange: parseConfigNumber(block, "CHEST_CLEANUP_VERTICAL_RANGE"),
    protectItem: parseConfigString(block, "PROTECT_ITEM"),
    returnBoxItem: parseConfigString(block, "RETURN_BOX_ITEM"),
    returnBoxDisplayName: parseConfigString(block, "RETURN_BOX_DISPLAY_NAME"),
    returnBoxName: parseConfigString(block, "RETURN_BOX_NAME"),
    wrongReturnBoxName: parseConfigString(block, "WRONG_RETURN_BOX_NAME"),
    hakoinuEntityTypes: parseConfigStringArray(block, "HAKOINU_ENTITY_TYPES"),
    penaltyAnimalTypes: parseConfigStringArray(block, "PENALTY_ANIMAL_TYPES"),
    pointsPerBox: parseConfigNumber(block, "POINTS_PER_BOX"),
    pointsWrongAnimal: parseConfigNumber(block, "POINTS_WRONG_ANIMAL"),
    pointsHakoinuKill: parseConfigNumber(block, "POINTS_HAKOINU_KILL"),
    pointsHakoinuHit: parseConfigNumber(block, "POINTS_HAKOINU_HIT"),
    scoreObjective: parseConfigString(block, "SCORE_OBJECTIVE"),
    chatPrefix: parseConfigString(block, "CHAT_PREFIX"),
    wandItem: parseConfigString(block, "WAND_ITEM"),
    wandNames: parseConfigObjectEntries(block, "WAND_NAMES"),
    milestoneSeconds: milestones,
  };
}

const ENTITY_LABELS = {
  "minecraft:wolf": "オオカミ（ハコイヌ代用）",
  "minecraft:cow": "牛",
  "minecraft:pig": "豚",
  "minecraft:sheep": "羊",
  "minecraft:chicken": "鶏",
  "minecraft:goat": "ヤギ",
  "minecraft:rabbit": "ウサギ",
  "minecraft:horse": "馬",
  "minecraft:donkey": "ロバ",
  "minecraft:mule": "ラバ",
  "minecraft:llama": "ラマ",
  "minecraft:fox": "キツネ",
  "minecraft:cat": "ネコ",
  "minecraft:mooshroom": "ムーシュルーム",
  "minecraft:parrot": "オウム",
  "minecraft:camel": "ラクダ",
};

function entityLabel(typeId) {
  return ENTITY_LABELS[typeId] ?? `\`${typeId}\``;
}

export function generateGameRulesMarkdown(spec, mcFunctions = []) {
  const g = spec.boxGate ?? {};
  const chest = spec.submissionChest ?? {};
  const gateCoord = `(${g.x ?? "?"}, ${g.y ?? "?"}, ${g.z ?? "?"})`;
  const chestCoord = `(${chest.x ?? "?"}, ${chest.y ?? "?"}, ${chest.z ?? "?"})`;
  const lines = [
    "> behavior_packs/robw_behavior/scripts/main.js の CONFIG から自動生成。仕様変更後は npm run sync:project-docs を実行。",
    "",
    "### 用語",
    "",
    "| ゲーム内 | 実装 |",
    "|----------|------|",
    "| ハコイヌ | " + spec.hakoinuEntityTypes.map(entityLabel).join("、") + " |",
    `| 捕獲アイテム | ${spec.returnBoxItem}（表示名: ${spec.returnBoxDisplayName ?? spec.returnBoxName}・正誤は見た目では区別不可） |`,
    "| 納品チェスト | start したプレイヤーの足元に 1 つ設置 |",
    "| ラウンド中心 | start したプレイヤーの立ち位置（ハコイヌ出現の中心） |",
    `| 帰還ポイント | スコアボード \`${spec.scoreObjective}\` |`,
    "",
    "### ゲート起動時（start）",
    "",
    `- 全員の帰還ポイントを **0** にリセット`,
    `- ゲート開放 **${spec.gateOpenMinutes} 分**（残り ${spec.timeNotifyIntervalSeconds} 秒ごとに通知、残り ${spec.milestoneSeconds.join(" / ")} 秒で目立つ警告）`,
    `- **start したプレイヤーの位置**でラウンド開始（テレポートなし・**3・2・1 カウントダウン**のあと本編）`,
    `- **地面に立った状態**でのみ起動可（空中・飛行中はエラー）`,
    `- **骨 ×${spec.startGiveBones}** を全員に配布（所持分はいったん消してからセット）`,
    `- ハコイヌ納品で **骨 ×${spec.bonesPerHakoinuDelivery ?? "?"} / 枚**、別種納品で **骨 ×${spec.bonesPerWrongAnimalDelivery ?? "?"} / 枚** を追加`,
    `- **ハコイヌ ${spec.startSpawnHakoinu} 匹** と **別種 ${spec.startSpawnPenaltyAnimals ?? "?"} 匹**（ランダム種）をラウンド中心 **${spec.spawnMinDistance ?? "?"}〜${spec.spawnMaxDistance ?? "?"} ブロック** にランダム配置`,
    `- **納品チェスト**を起動者の **足元** に **1 つだけ** 設置（半径 ${spec.chestCleanupRadius ?? "?"}・高さ ±${spec.chestCleanupVerticalRange ?? "?"} 内の既存チェスト類は撤去）`,
    "- 終了・リセット時にスクリプトが出した動物と納品チェストは片付けられる",
    "",
    "### プレイの流れ",
    "",
    "1. **地面に立って** start（起動者の位置がラウンド中心）",
    `2. **${spec.protectItem}** を持ち、**${spec.protectionRadius} ブロック以内**の動物を **空中で右クリック**（捕獲・**骨 ×${spec.bonesPerCapture ?? 1} 消費**）`,
    `3. 骨で捕獲 → どちらも **${spec.returnBoxDisplayName ?? spec.returnBoxName}**（同じ見た目。正解は納品時に +pt / 別種は -pt）`,
    `4. 捕獲アイテムを **自動設置の納品チェスト（1つ）** に入れる → 得点加算のあと **毛皮はチェストから消える**`,
    "5. 時間切れまたは stop で閉鎖 → ランキング",
    "",
    "### スコア",
    "",
    "| 内容 | 点数 |",
    "|------|------|",
    `| ハコイヌを納品チェストに入れる | **${spec.pointsPerBox > 0 ? "+" : ""}${spec.pointsPerBox} pt** / 匹分 |`,
    `| 別種の動物を納品チェストに入れる | **${spec.pointsWrongAnimal} pt** / 匹分 |`,
    `| ハコイヌ（オオカミ）を倒す | **${spec.pointsHakoinuKill ?? -10} pt** / 1 匹 |`,
    `| ハコイヌ（オオカミ）を攻撃する | **${spec.pointsHakoinuHit ?? -1} pt** / 1 回のダメージ |`,
    "",
    "ペナルティ対象の動物:",
    "",
    ...spec.penaltyAnimalTypes.map((id) => `- ${entityLabel(id)}（\`${id}\`）`),
    "",
    "### 納品チェスト",
    "",
    "> start したプレイヤーの **足元** にチェストを 1 つ設置（座標は起動メッセージを参照）。周囲の既存チェスト類は撤去。",
    "",
    "### CONFIG.BOX_GATE（フォールバック）",
    "",
    "| 項目 | 値 |",
    "|------|-----|",
    `| X | ${g.x ?? "?"} |`,
    `| Y | ${g.y ?? "?"} |`,
    `| Z | ${g.z ?? "?"} |`,
    `| 半径 | ${g.radius ?? "?"} |`,
    "",
    "> 未起動時のフォールバック。通常は **start したプレイヤー位置** がラウンド中心になる。",
    "",
    "### 操作・コマンド",
    "",
    "| 種別 | 入力 | 備考 |",
    "|------|------|------|",
    `| チャット | \`${spec.chatPrefix} start\` / \`stop\` / \`reset\` / \`ranking\` | **Beta APIs** 必須 |`,
    ...spec.wandNames.map(
      (w) =>
        `| 時計（${spec.wandItem}） | 名前 \`${w.label}\` を空中で右クリック | → \`${w.action}\` |`,
    ),
    ...mcFunctions.map((name) => `| 関数 | \`/function robw/${name}\` | チート ON |`),
    `| scriptevent | \`/scriptevent robw:start\` 等 | チート ON |`,
    "",
    "### ゲーム状態",
    "",
    "- waiting … 待機",
    "- countdown … 起動カウントダウン中",
    "- running … ゲート開放中（骨での保護・納品のみ有効）",
    "- closing … 閉鎖カウントダウン中",
    "- finished … 閉鎖済み（ランキング表示後）",
  ];
  return lines.join("\n");
}

export function collectMcFunctions(functionsDir) {
  if (!existsSync(functionsDir)) return [];
  return listSorted(functionsDir)
    .filter((name) => name.endsWith(".mcfunction"))
    .map((name) => name.replace(/\.mcfunction$/, ""))
    .sort((a, b) => a.localeCompare(b, "en"));
}

export function runSync(config, options = {}) {
  const { check = false } = options;
  const root = config.root ?? join(import.meta.dirname, "..");
  const docPath = join(root, config.docPath ?? "docs/project-sync.md");
  let content = readFileSync(docPath, "utf8");
  const commit = getGitCommit(root);
  const markers = config.markers ?? ["meta", "directory-tree"];

  if (markers.includes("meta")) {
    content = replaceMarkedSection(content, "meta", generateMetaLine(config.repo, commit));
  }
  if (markers.includes("directory-tree")) {
    content = replaceMarkedSection(
      content,
      "directory-tree",
      generateDirectoryTree(
        root,
        config.rootLabel,
        config.treeEntries ?? ["src", "scripts", "docs"],
        config.treeMaxDepth ?? 3,
      ),
    );
  }
  if (markers.includes("pages") && config.nextAppRoot) {
    const rows = collectNextPages(join(root, config.nextAppRoot));
    content = replaceMarkedSection(content, "pages", generatePagesTable(rows));
  }
  if (markers.includes("api-routes") && config.nextApiRoot) {
    const routes = collectNextApiRoutes(join(root, config.nextApiRoot));
    content = replaceMarkedSection(content, "api-routes", generateApiRoutesTable(routes));
  }
  if (markers.includes("astro-pages") && config.astroPagesRoot) {
    const rows = collectAstroPages(join(root, config.astroPagesRoot));
    content = replaceMarkedSection(content, "pages", generatePagesTable(rows));
  }
  if (markers.includes("router-pages") && config.routerAppPath) {
    const paths = collectReactRouterPaths(join(root, config.routerAppPath));
    content = replaceMarkedSection(content, "pages", generateRouterPagesTable(paths));
  }
  if (markers.includes("src-tree") && config.botSrcRoot) {
    const rows = collectBotSrcTree(join(root, config.botSrcRoot));
    content = replaceMarkedSection(content, "src-tree", generateSrcTable(rows));
  }
  if (markers.includes("game-rules") && config.gameRulesMainJs) {
    const mainPath = join(root, config.gameRulesMainJs);
    const mainSource = readFileSync(mainPath, "utf8");
    const spec = parseRobwGameSpec(mainSource);
    const functionsDir = config.gameRulesFunctionsDir
      ? join(root, config.gameRulesFunctionsDir)
      : join(root, "behavior_packs/robw_behavior/functions/robw");
    const mcFunctions = collectMcFunctions(functionsDir);
    content = replaceMarkedSection(
      content,
      "game-rules",
      generateGameRulesMarkdown(spec, mcFunctions),
    );
  }

  const previous = readFileSync(docPath, "utf8");
  if (content === previous) {
    console.log("docs/project-sync.md は最新です");
    return true;
  }
  if (check) {
    console.error("docs/project-sync.md が古いです。npm run sync:project-docs を実行してください");
    return false;
  }
  writeFileSync(docPath, content, "utf8");
  console.log("docs/project-sync.md を更新しました");
  return true;
}
