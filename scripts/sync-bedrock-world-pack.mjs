#!/usr/bin/env node
/**
 * ワールド内の埋め込み robw_behavior をリポジトリ内容で同期する。
 */
import { syncBedrockWorldPack } from "./sync-bedrock-world-pack-lib.mjs";

const worldName = process.argv[2] ?? "";
const result = syncBedrockWorldPack({ worldName });
process.exit(result.ok ? 0 : 1);
