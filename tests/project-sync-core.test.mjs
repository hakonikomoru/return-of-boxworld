import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  generateMetaLine,
  markerEnd,
  markerStart,
  parseRobwGameSpec,
  replaceMarkedSection,
} from "../scripts/project-sync-core.mjs";

describe("replaceMarkedSection", () => {
  const id = "test-section";
  const content = `${markerStart(id)}\nold\n${markerEnd(id)}\n`;

  it("replaces body between markers", () => {
    const out = replaceMarkedSection(content, id, "new body");
    assert.match(out, /new body/);
    assert.doesNotMatch(out, /\nold\n/);
    assert.ok(out.includes(markerStart(id)));
    assert.ok(out.includes(markerEnd(id)));
  });

  it("throws when markers are missing", () => {
    assert.throws(
      () => replaceMarkedSection("no markers", id, "x"),
      /Missing sync markers/,
    );
  });
});

describe("generateMetaLine", () => {
  it("includes repo, branch, commit, and date", () => {
    const line = generateMetaLine("user/repo", "abc1234");
    assert.match(line, /user\/repo/);
    assert.match(line, /main/);
    assert.match(line, /abc1234/);
    assert.match(line, /\d{4}-\d{2}-\d{2}/);
  });
});

describe("parseRobwGameSpec", () => {
  const sample = `
const CONFIG = {
  GATE_OPEN_MINUTES: 5,
  WAND_MENU_NAME: "ROBW:menu",
  POINTS_HAKOINU_HIT: -1,
};
const MILESTONE_SECONDS = [60, 30, 10];
`;

  it("parses numeric and string CONFIG fields", () => {
    const spec = parseRobwGameSpec(sample);
    assert.equal(spec.gateOpenMinutes, 5);
    assert.equal(spec.wandMenuName, undefined);
  });

  it("parses real main.js without error", () => {
    const root = join(fileURLToPath(new URL("..", import.meta.url)));
    const mainJs = readFileSync(
      join(root, "behavior_packs", "robw_behavior", "scripts", "main.js"),
      "utf8",
    );
    const spec = parseRobwGameSpec(mainJs);
    assert.equal(spec.chatPrefix, "!robw");
    assert.equal(spec.wandItem, "minecraft:clock");
    assert.ok(spec.startSpawnHakoinu > 0);
    assert.equal(spec.pointsHakoinuHit, -1);
    assert.deepEqual(spec.milestoneSeconds, [60, 30, 10]);
  });
});
