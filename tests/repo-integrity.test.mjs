import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const mainJsPath = join(root, "behavior_packs", "robw_behavior", "scripts", "main.js");
const menuUiPath = join(root, "behavior_packs", "robw_behavior", "scripts", "menu-ui.js");
const bpManifestPath = join(root, "behavior_packs", "robw_behavior", "manifest.json");
const rpManifestPath = join(root, "resource_packs", "robw_resources", "manifest.json");

function readText(path) {
  return readFileSync(path, "utf8");
}

function findDuplicateFunctionNames(source) {
  const names = [...source.matchAll(/^function (\w+)/gm)].map((m) => m[1]);
  const seen = new Set();
  const dupes = [];
  for (const name of names) {
    if (seen.has(name)) dupes.push(name);
    seen.add(name);
  }
  return [...new Set(dupes)];
}

describe("behavior pack scripts", () => {
  it("main.js has no duplicate function declarations", () => {
    const src = readText(mainJsPath);
    const dupes = findDuplicateFunctionNames(src);
    assert.deepEqual(dupes, [], `duplicate functions: ${dupes.join(", ")}`);
  });

  it("menu-ui.js has no duplicate function declarations", () => {
    const src = readText(menuUiPath);
    const dupes = findDuplicateFunctionNames(src);
    assert.deepEqual(dupes, []);
  });

  it("main.js defines WAND_MENU_NAME as ROBW:menu", () => {
    const src = readText(mainJsPath);
    assert.match(src, /WAND_MENU_NAME:\s*"ROBW:menu"/);
  });

  it("main.js imports menu-ui.js", () => {
    const src = readText(mainJsPath);
    assert.match(src, /import\s+["']\.\/menu-ui\.js["']/);
  });
});

describe("manifest.json", () => {
  it("behavior and resource pack manifests are valid JSON with header", () => {
    for (const path of [bpManifestPath, rpManifestPath]) {
      assert.ok(existsSync(path), `${path} missing`);
      const json = JSON.parse(readText(path));
      assert.ok(json.header?.name);
      assert.ok(Array.isArray(json.header?.version));
      assert.ok(json.header.version.length >= 3);
    }
  });

  it("behavior pack script entry is scripts/main.js", () => {
    const json = JSON.parse(readText(bpManifestPath));
    const scriptModule = json.modules?.find((m) => m.type === "script");
    assert.equal(scriptModule?.entry, "scripts/main.js");
  });
});

describe("package.json scripts", () => {
  it("exposes lint and test commands", () => {
    const pkg = JSON.parse(readText(join(root, "package.json")));
    assert.ok(pkg.scripts?.lint);
    assert.ok(pkg.scripts?.test);
  });
});
