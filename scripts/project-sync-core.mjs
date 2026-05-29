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
