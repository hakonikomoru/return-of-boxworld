import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSync } from "./project-sync-core.mjs";

const root = join(import.meta.dirname, "..");
const configPath = join(root, "project.sync.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const ok = runSync(
  { ...config, root },
  { check: process.argv.includes("--check") },
);

process.exit(ok ? 0 : 1);
