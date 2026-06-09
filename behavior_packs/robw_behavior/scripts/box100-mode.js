/**
 * ハコイヌ100匹チャレンジ (box100) — 個室ガラスボックス・タイムアタック
 */

import { world, system, BlockPermutation, BlockTypes, EffectTypes } from "@minecraft/server";

export const BOX100_MODE_ID = "box100";

/** @type {import("./main.js") extends never ? any : Record<string, unknown>} */
let deps = {};

/** @type {typeof import("./main.js").CONFIG | null} */
let CONFIG = null;

let box100Active = false;
let box100StartedAtMs = 0;
let nextFinishRank = 1;
let finishedPlayerCount = 0;

/** @type {Set<string>} */
const wolfEntityIds = new Set();

/**
 * @typedef {object} Box100PlayerRoom
 * @property {string} playerId
 * @property {string} playerName
 * @property {string} colorId
 * @property {string} colorLabel
 * @property {string} shellId
 * @property {string} shulkerId
 * @property {{ x: number, y: number, z: number }} origin
 * @property {{ x: number, y: number, z: number }} shulkerPos
 * @property {number} deliveredCount
 * @property {number | null} finishedAtMs
 * @property {number | null} rank
 */

/** @type {Map<string, Box100PlayerRoom>} */
const playerRooms = new Map();

/** 削除漏れ対策: 直近に生成した部屋の原点（resetBox100State 後も保持） */
/** @type {Array<{ x: number, y: number, z: number }>} */
let persistedArenaRoomOrigins = [];

/** 前回ラウンドのグリッド配置（削除失敗時の掃除用） */
/** @type {{ anchorX: number, anchorZ: number, floorY: number, playerCount: number } | null} */
let lastArenaLayout = null;

/**
 * 終了後のランキング表示・メニュー用スナップショット
 * @type {{
 *   startedAtMs: number,
 *   target: number,
 *   entries: Array<{
 *     playerName: string,
 *     deliveredCount: number,
 *     finishedAtMs: number | null,
 *     rank: number | null,
 *   }>,
 * } | null}
 */
let lastRankingSnapshot = null;

/** @type {number | null} */
let nightVisionRefreshLoopId = null;

export function initBox100Mode(depsIn) {
  deps = depsIn;
  CONFIG = depsIn.CONFIG;
}

export function isBox100Mode() {
  return box100Active;
}

export function getBox100Config() {
  return CONFIG?.BOX100 ?? {};
}

export function getBox100TimeLimitMs() {
  const sec = Math.max(60, getBox100Config().TIME_LIMIT_SECONDS ?? 600);
  return sec * 1000;
}

export function getBox100TargetCount() {
  return Math.max(1, getBox100Config().WOLF_COUNT ?? 100);
}

function logInfo(message) {
  deps.logInfo?.(`box100: ${message}`);
}

function logWarn(message) {
  deps.logWarn?.(`box100: ${message}`);
}

function logError(message) {
  deps.logError?.(`box100: ${message}`);
}

/** @param {string} playerId */
function resolveBox100Player(playerId) {
  if (!playerId) return null;
  try {
    return world.getPlayers().find((p) => p.id === playerId && p.isValid) ?? null;
  } catch {
    return null;
  }
}

/** @param {import("@minecraft/server").Block} block */
function getBlockInventoryContainer(block) {
  if (!block || typeof block.getComponent !== "function") return null;
  try {
    const inventory = block.getComponent("inventory");
    return inventory?.container ?? null;
  } catch {
    return null;
  }
}

function getColors() {
  const colors = getBox100Config().COLORS;
  return Array.isArray(colors) && colors.length > 0 ? colors : [];
}

/** @template T @param {T[]} items @returns {T[]} */
function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** ラウンド用に色をランダム抽選（パレット切れで再シャッフル） */
function pickColorsForRound(playerCount) {
  const palette = getColors();
  if (palette.length === 0 || playerCount <= 0) return [];

  if (getBox100Config().RANDOMIZE_ROOM_COLORS === false) {
    return Array.from({ length: playerCount }, (_, i) => palette[i % palette.length]);
  }

  const picked = [];
  let deck = [];
  for (let i = 0; i < playerCount; i += 1) {
    if (deck.length === 0) {
      deck = shuffleArray(palette);
    }
    const index = Math.floor(Math.random() * deck.length);
    picked.push(deck.splice(index, 1)[0]);
  }
  return picked;
}

/** @param {{ glass?: string, shellId?: string, wool?: string, shulker?: string }} color */
function getColorShellId(color) {
  if (color.glass) return color.glass;
  if (color.shellId) return color.shellId;
  if (color.wool) {
    return String(color.wool).replace(/_wool$/, "_stained_glass");
  }
  if (color.shulker) {
    return String(color.shulker).replace(/_shulker_box$/, "_stained_glass");
  }
  return "minecraft:glass";
}

function isBox100StructureProtectionEnabled() {
  return getBox100Config().PROTECT_ROOM_STRUCTURE !== false;
}

/**
 * @param {number} blockX
 * @param {number} blockY
 * @param {number} blockZ
 * @param {Box100PlayerRoom} room
 */
function isBlockInBox100RoomStructure(blockX, blockY, blockZ, room) {
  const size = getBox100Config().ROOM_SIZE ?? 30;
  const height = getBox100Config().ROOM_HEIGHT ?? 10;
  const x0 = room.origin.x;
  const y0 = room.origin.y;
  const z0 = room.origin.z;
  const x1 = x0 + size - 1;
  const y1 = y0 + height - 1;
  const z1 = z0 + size - 1;

  if (blockX < x0 || blockX > x1 || blockY < y0 || blockY > y1 || blockZ < z0 || blockZ > z1) {
    return false;
  }

  const isShell =
    blockX === x0 ||
    blockX === x1 ||
    blockZ === z0 ||
    blockZ === z1 ||
    blockY === y0 ||
    blockY === y1;
  const isShulker =
    blockX === room.shulkerPos.x &&
    blockY === room.shulkerPos.y &&
    blockZ === room.shulkerPos.z;
  return isShell || isShulker;
}

/** @param {import("@minecraft/server").Block} block */
export function shouldCancelBox100BlockBreak(block) {
  if (!box100Active || !isBox100StructureProtectionEnabled() || !block?.isValid) {
    return false;
  }
  const loc = block.location;
  const bx = Math.floor(loc.x);
  const by = Math.floor(loc.y);
  const bz = Math.floor(loc.z);
  for (const room of playerRooms.values()) {
    if (isBlockInBox100RoomStructure(bx, by, bz, room)) return true;
  }
  return false;
}

function getMaxPlayers() {
  return Math.max(1, Math.min(16, getBox100Config().MAX_PLAYERS ?? 6));
}

function getRoomGridSpacing() {
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const gap = cfg.ROOM_GAP ?? 10;
  const spacing =
    cfg.ROOM_GRID_SPACING ?? cfg.ROOM_PITCH ?? size + gap;
  return Math.max(size + 1, Math.floor(spacing));
}

/** グリッドの列数（4人まで 2 列＝2×2 正方形） */
function getRoomGridColumns(playerCount) {
  const cfg = getBox100Config();
  const fixed = cfg.ROOM_GRID_COLUMNS;
  if (fixed != null && fixed > 0) {
    return Math.max(1, Math.min(Math.floor(fixed), playerCount));
  }
  if (playerCount <= 4) return 2;
  if (playerCount <= 6) return 3;
  return Math.ceil(Math.sqrt(playerCount));
}

/**
 * @param {number} anchorX
 * @param {number} anchorZ
 * @param {number} floorY
 * @param {number} slotIndex
 * @param {number} playerCount
 */
function getRoomOriginForGridSlot(anchorX, anchorZ, floorY, slotIndex, playerCount) {
  const cols = getRoomGridColumns(playerCount);
  const spacing = getRoomGridSpacing();
  const col = slotIndex % cols;
  const row = Math.floor(slotIndex / cols);
  return {
    x: anchorX + col * spacing,
    y: floorY,
    z: anchorZ + row * spacing,
  };
}

/** 天空アリーナの床 Y。無効時は null（ホスト足元を使う） */
function getBox100ArenaFloorY() {
  const cfg = getBox100Config();
  if (cfg.SKY_ARENA_ENABLED === false) return null;
  const y = Math.floor(cfg.SKY_ARENA_BASE_Y ?? 200);
  const minY = Math.floor(cfg.SKY_ARENA_MIN_Y ?? -60);
  const maxY = Math.floor(cfg.SKY_ARENA_MAX_Y ?? 310);
  return Math.max(minY, Math.min(maxY, y));
}

function isInsideRoomBounds(loc, room, margin = 0) {
  const size = getBox100Config().ROOM_SIZE ?? 30;
  const height = getBox100Config().ROOM_HEIGHT ?? 10;
  const minX = room.origin.x + margin;
  const maxX = room.origin.x + size - 1 - margin;
  const minZ = room.origin.z + margin;
  const maxZ = room.origin.z + size - 1 - margin;
  const minY = room.origin.y + 1;
  const maxY = room.origin.y + height - 2;
  return (
    loc.x >= minX &&
    loc.x <= maxX &&
    loc.y >= minY &&
    loc.y <= maxY &&
    loc.z >= minZ &&
    loc.z <= maxZ
  );
}

export function getBox100RoomForPlayer(player) {
  if (!player?.id) return null;
  return playerRooms.get(player.id) ?? null;
}

export function isBox100ShulkerBlock(block, player) {
  if (!box100Active || !block?.isValid || !player?.id) return false;
  const room = playerRooms.get(player.id);
  if (!room) return false;
  const loc = block.location;
  return (
    block.typeId === room.shulkerId &&
    loc.x === room.shulkerPos.x &&
    loc.y === room.shulkerPos.y &&
    loc.z === room.shulkerPos.z
  );
}

export function isBox100WolfEntity(entityId) {
  return wolfEntityIds.has(entityId);
}

export function isLocationInAnyBox100Room(loc) {
  for (const room of playerRooms.values()) {
    if (isInsideRoomBounds(loc, room, 0)) return true;
  }
  return false;
}

export function shouldSpawnPenaltyAnimals() {
  return !box100Active;
}

export function shouldReplenishSpawns() {
  return !box100Active;
}

export function shouldApplyHakoinuCombatPenalties() {
  return !box100Active;
}

function toCommandBlockName(typeId) {
  return String(typeId).replace(/^minecraft:/, "");
}

function originKey(origin) {
  return `${origin.x},${origin.y},${origin.z}`;
}

function rememberArenaRoomOrigin(origin) {
  const key = originKey(origin);
  if (!persistedArenaRoomOrigins.some((o) => originKey(o) === key)) {
    persistedArenaRoomOrigins.push({
      x: origin.x,
      y: origin.y,
      z: origin.z,
    });
  }
}

function collectKnownArenaRoomOrigins() {
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  const origins = new Map();
  for (const origin of persistedArenaRoomOrigins) {
    origins.set(originKey(origin), origin);
  }
  for (const room of playerRooms.values()) {
    origins.set(originKey(room.origin), room.origin);
  }
  return [...origins.values()];
}

function getBox100RemovableBlockNames() {
  const names = new Set(["glass", "stained_glass"]);
  for (const color of getColors()) {
    names.add(toCommandBlockName(getColorShellId(color)));
    if (color.shulker) {
      names.add(toCommandBlockName(color.shulker));
    }
  }
  return [...names];
}

function runFillReplaceCommand(host, dimension, x1, y1, z1, x2, y2, z2, blockName) {
  const cmd = `fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} air replace ${blockName}`;
  if (host?.isValid && typeof host.runCommand === "function") {
    try {
      const result = host.runCommand(cmd);
      if ((result?.successCount ?? 0) > 0) return true;
    } catch (error) {
      logWarn(`fill replace failed (${cmd}): ${error}`);
    }
  }
  if (dimension && typeof dimension.runCommand === "function") {
    try {
      const result = dimension.runCommand(cmd);
      if ((result?.successCount ?? 0) > 0) return true;
    } catch (error) {
      logWarn(`dimension fill replace failed (${cmd}): ${error}`);
    }
  }
  return false;
}

const FILL_TILE_SIZE = 28;

function getRoomChunkPreloadTicks() {
  return Math.max(10, Math.floor(getBox100Config().ROOM_CHUNK_PRELOAD_TICKS ?? 20));
}

/** 遠方スロット向け: 対角2点だけテレポートしてチャンクを載せる（getBlock 走査はしない） */
function forceLoadBounds(host, dimension, x0, y0, z0, x1, y1, z1) {
  const dim = dimension ?? host?.dimension;
  if (!dim) return;
  if (!host?.isValid || typeof host.teleport !== "function") return;

  const visitY = Math.min(y1, y0 + 2);
  const saved = {
    x: host.location.x,
    y: host.location.y,
    z: host.location.z,
    dimension: host.dimension,
  };
  try {
    host.teleport({ x: x0 + 0.5, y: visitY, z: z0 + 0.5 }, { dimension: dim });
    host.teleport({ x: x1 + 0.5, y: visitY, z: z1 + 0.5 }, { dimension: dim });
    host.teleport(
      { x: saved.x, y: saved.y, z: saved.z },
      { dimension: saved.dimension }
    );
  } catch (error) {
    logWarn(`forceLoadBounds failed: ${error}`);
  }
}

function runFillRegionTiled(host, dimension, x0, y0, z0, x1, y1, z1, typeId) {
  const tile = FILL_TILE_SIZE;
  let placedTiles = 0;
  let totalTiles = 0;
  for (let x = x0; x <= x1; x += tile) {
    for (let z = z0; z <= z1; z += tile) {
      for (let y = y0; y <= y1; y += tile) {
        const ex = Math.min(x + tile - 1, x1);
        const ey = Math.min(y + tile - 1, y1);
        const ez = Math.min(z + tile - 1, z1);
        totalTiles += 1;
        if (runFillCommand(host, dimension, x, y, z, ex, ey, ez, typeId)) {
          placedTiles += 1;
        }
      }
    }
  }
  return { placedTiles, totalTiles };
}

function runFillCommand(host, dimension, x1, y1, z1, x2, y2, z2, typeId) {
  const blockName = toCommandBlockName(typeId);
  const cmd = `fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${blockName}`;

  if (host?.isValid && typeof host.runCommand === "function") {
    try {
      const result = host.runCommand(cmd);
      if ((result?.successCount ?? 0) > 0) return true;
    } catch (error) {
      logWarn(`fill command failed (${cmd}): ${error}`);
    }
  }

  if (dimension && typeof dimension.runCommand === "function") {
    try {
      const result = dimension.runCommand(cmd);
      if ((result?.successCount ?? 0) > 0) return true;
    } catch (error) {
      logWarn(`dimension fill failed (${cmd}): ${error}`);
    }
  }

  return false;
}

function setBlockSafe(dimension, x, y, z, typeId) {
  const location = { x, y, z };
  try {
    const block = dimension.getBlock(location);
    if (!block) return false;

    if (
      typeof block.setPermutation === "function" &&
      typeof BlockPermutation?.resolve === "function"
    ) {
      block.setPermutation(BlockPermutation.resolve(typeId));
      return true;
    }

    if (typeof block.setType === "function") {
      block.setType(typeId);
      return true;
    }

    const blockType = BlockTypes?.get?.(typeId);
    if (blockType && typeof block.setType === "function") {
      block.setType(blockType);
      return true;
    }

    if (typeof dimension.setBlockType === "function") {
      dimension.setBlockType(location, typeId);
      return true;
    }

    return false;
  } catch (error) {
    logWarn(`setBlock failed (${x},${y},${z}) ${typeId}: ${error}`);
    return false;
  }
}

/** 箱全体をガラスで上書きしてから中を空ける（不純物を残さない） */
function buildGlassRoomShellOverwrite(host, dimension, origin, size, height, shellId) {
  const x0 = origin.x;
  const y0 = origin.y;
  const z0 = origin.z;
  const x1 = x0 + size - 1;
  const y1 = y0 + height - 1;
  const z1 = z0 + size - 1;
  const cmdHost = host ?? resolveBox100CommandHost();

  const outer = runFillRegionTiled(
    cmdHost,
    dimension,
    x0,
    y0,
    z0,
    x1,
    y1,
    z1,
    shellId
  );
  if (size > 2 && height > 2) {
    runFillRegionTiled(
      cmdHost,
      dimension,
      x0 + 1,
      y0 + 1,
      z0 + 1,
      x1 - 1,
      y1 - 1,
      z1 - 1,
      "minecraft:air"
    );
  }
  return outer;
}

function buildGlassRoomShellWithFills(host, dimension, origin, size, height, shellId) {
  const x0 = origin.x;
  const y0 = origin.y;
  const z0 = origin.z;
  const x1 = x0 + size - 1;
  const y1 = y0 + height - 1;
  const z1 = z0 + size - 1;
  const cmdHost = host ?? resolveBox100CommandHost();
  let placedTiles = 0;
  let totalTiles = 0;

  const addFace = (fx0, fy0, fz0, fx1, fy1, fz1) => {
    const result = runFillRegionTiled(
      cmdHost,
      dimension,
      fx0,
      fy0,
      fz0,
      fx1,
      fy1,
      fz1,
      shellId
    );
    placedTiles += result.placedTiles;
    totalTiles += result.totalTiles;
  };

  addFace(x0, y0, z0, x1, y0, z1);
  addFace(x0, y1, z0, x1, y1, z1);
  if (height > 2) {
    addFace(x0, y0 + 1, z0, x0, y1 - 1, z1);
    addFace(x1, y0 + 1, z0, x1, y1 - 1, z1);
    addFace(x0, y0 + 1, z0, x1, y1 - 1, z0);
    addFace(x0, y0 + 1, z1, x1, y1 - 1, z1);
  }
  if (size > 2 && height > 2) {
    runFillRegionTiled(
      cmdHost,
      dimension,
      x0 + 1,
      y0 + 1,
      z0 + 1,
      x1 - 1,
      y1 - 1,
      z1 - 1,
      "minecraft:air"
    );
  }
  return { placedTiles, totalTiles };
}

/** 色付きガラスの箱を生成（ガラス fill で上書き。検証・修復ループは行わない） */
function buildGlassRoom(host, origin, size, height, shellId, dimension) {
  const x0 = origin.x;
  const y0 = origin.y;
  const z0 = origin.z;

  let fillResult = buildGlassRoomShellOverwrite(
    host,
    dimension,
    origin,
    size,
    height,
    shellId
  );
  if (fillResult.placedTiles <= 0) {
    logWarn(`room overwrite fill weak at (${x0},${y0},${z0}), trying face fills`);
    fillResult = buildGlassRoomShellWithFills(
      host,
      dimension,
      origin,
      size,
      height,
      shellId
    );
  }

  if (fillResult.placedTiles <= 0) {
    logWarn(`room fill failed at (${x0},${y0},${z0})`);
    return 0;
  }

  logInfo(
    `room ok: (${x0},${y0},${z0}) size=${size} h=${height} shell=${fillResult.placedTiles}/${fillResult.totalTiles}`
  );
  return size * size * height;
}

function resolveBox100CommandHost() {
  if (typeof deps.resolveCommandHost === "function") {
    const host = deps.resolveCommandHost();
    if (host?.isValid) return host;
  }
  return world.getPlayers().find((p) => p?.isValid) ?? null;
}

function destroyLastArenaLayout(host, dimension) {
  if (!lastArenaLayout) return 0;
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const height = cfg.ROOM_HEIGHT ?? 10;
  const { anchorX, anchorZ, floorY, playerCount } = lastArenaLayout;
  const cmdHost = host ?? resolveBox100CommandHost();
  logInfo(
    `cleaning previous arena layout: anchor=(${anchorX},${anchorZ}) floorY=${floorY} rooms=${playerCount}`
  );
  for (let i = 0; i < playerCount; i += 1) {
    const origin = getRoomOriginForGridSlot(
      anchorX,
      anchorZ,
      floorY,
      i,
      playerCount
    );
    destroyGlassRoom(cmdHost, origin, size, height, dimension);
  }
  return playerCount;
}

function destroyAllKnownArenaRooms(host, dimension) {
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const height = cfg.ROOM_HEIGHT ?? 10;
  const cmdHost = host ?? resolveBox100CommandHost();

  destroyLastArenaLayout(cmdHost, dimension);

  const origins = collectKnownArenaRoomOrigins();
  if (origins.length > 0) {
    logInfo(`destroying ${origins.length} tracked arena room(s)`);
    for (const origin of origins) {
      destroyGlassRoom(cmdHost, origin, size, height, dimension);
    }
  }
  persistedArenaRoomOrigins = [];
  return origins.length;
}

/** ガラス箱全体を air で削除 */
function destroyGlassRoom(host, origin, size, height, dimension) {
  const x0 = origin.x;
  const y0 = origin.y;
  const z0 = origin.z;
  const x1 = x0 + size - 1;
  const y1 = y0 + height - 1;
  const z1 = z0 + size - 1;

  const cmdHost = host ?? resolveBox100CommandHost();

  let removed = 0;
  if (
    runFillCommand(cmdHost, dimension, x0, y0, z0, x1, y1, z1, "minecraft:air")
  ) {
    removed += 1;
  }
  for (const blockName of getBox100RemovableBlockNames()) {
    if (
      runFillReplaceCommand(
        cmdHost,
        dimension,
        x0,
        y0,
        z0,
        x1,
        y1,
        z1,
        blockName
      )
    ) {
      removed += 1;
    }
  }

  if (removed <= 0) {
    logWarn(`destroyGlassRoom failed at (${x0},${y0},${z0})`);
    return false;
  }
  logInfo(`room removed (${x0},${y0},${z0}) fill=${removed}`);
  return true;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function spawnWolvesInRoomBatched(dimension, room, onComplete) {
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const height = cfg.ROOM_HEIGHT ?? 10;
  const margin = cfg.SPAWN_MARGIN ?? 3;
  const count = getBox100TargetCount();
  const batchSize = Math.max(
    10,
    Math.floor(cfg.WOLF_SPAWN_BATCH_SIZE ?? 20)
  );
  const batchTicks = Math.max(1, Math.floor(cfg.WOLF_SPAWN_BATCH_TICKS ?? 3));
  let spawned = 0;
  let index = 0;
  const floorY = room.origin.y;
  const maxSpawnY = Math.max(floorY + 2, floorY + height - 2);

  const spawnBatch = () => {
    const end = Math.min(index + batchSize, count);
    for (; index < end; index += 1) {
      const x = room.origin.x + randomInt(margin, size - margin - 1) + 0.5;
      const z = room.origin.z + randomInt(margin, size - margin - 1) + 0.5;
      const y = randomInt(floorY + 2, maxSpawnY) + 0.5;
      try {
        const entity = dimension.spawnEntity("minecraft:wolf", { x, y, z });
        if (entity?.isValid) {
          wolfEntityIds.add(entity.id);
          deps.registerRoundWolf?.(entity.id);
          spawned += 1;
        }
      } catch (error) {
        logWarn(`wolf spawn failed in ${room.playerName} room: ${error}`);
      }
    }
    if (index < count) {
      system.runTimeout(spawnBatch, batchTicks);
      return;
    }
    logInfo(`wolves spawned ${spawned}/${count} for ${room.playerName}`);
    onComplete(spawned);
  };

  spawnBatch();
}

function placeRoomShulker(host, dimension, room) {
  const pos = room.shulkerPos;
  const blockName = toCommandBlockName(room.shulkerId);

  if (host?.isValid && typeof host.runCommand === "function") {
    try {
      const result = host.runCommand(
        `setblock ${pos.x} ${pos.y} ${pos.z} ${blockName}`
      );
      if ((result?.successCount ?? 0) > 0) {
        // fall through to clear inventory
      } else if (!setBlockSafe(dimension, pos.x, pos.y, pos.z, room.shulkerId)) {
        return false;
      }
    } catch {
      if (!setBlockSafe(dimension, pos.x, pos.y, pos.z, room.shulkerId)) {
        return false;
      }
    }
  } else if (!setBlockSafe(dimension, pos.x, pos.y, pos.z, room.shulkerId)) {
    return false;
  }
  try {
    const block = dimension.getBlock(pos);
    const inventory = block?.getComponent?.("inventory");
    if (inventory?.container) {
      for (let slot = 0; slot < inventory.container.size; slot++) {
        inventory.container.setItem(slot, undefined);
      }
    }
  } catch {
    // ignore
  }
  return true;
}

function teleportToRoom(player, room) {
  const size = getBox100Config().ROOM_SIZE ?? 30;
  const x = room.origin.x + size / 2 + 0.5;
  const y = room.origin.y + 2;
  const z = room.origin.z + size / 2 + 0.5;
  try {
    player.teleport(
      { x, y, z },
      { dimension: player.dimension, keepVelocity: false }
    );
    return true;
  } catch (error) {
    logWarn(`teleport failed for ${player.name}: ${error}`);
    return false;
  }
}

function giveBox100Loadout(player) {
  deps.clearInventoryExceptWand?.(player);
  const bones = Math.max(1, getBox100Config().BONE_COUNT ?? 120);
  deps.giveBones?.(player, bones);
}

function isBox100NightVisionEnabled() {
  return getBox100Config().NIGHT_VISION_ENABLED !== false;
}

function getBox100NightVisionDurationTicks() {
  const limitSec = Math.max(60, getBox100Config().TIME_LIMIT_SECONDS ?? 600);
  const bufferSec = 45;
  return Math.ceil((limitSec + bufferSec) * 20);
}

/** @param {import("@minecraft/server").Player} player */
function applyBox100NightVision(player) {
  if (!isBox100NightVisionEnabled() || !player?.isValid) return;
  try {
    const effect = EffectTypes.get("night_vision");
    if (!effect) return;
    player.addEffect(effect, getBox100NightVisionDurationTicks(), {
      amplifier: 0,
      showParticles: false,
    });
  } catch (error) {
    logWarn(`night vision apply failed for ${player.name}: ${error}`);
  }
}

/** @param {import("@minecraft/server").Player} player */
function removeBox100NightVision(player) {
  if (!player?.isValid) return;
  try {
    const effect = EffectTypes.get("night_vision");
    if (effect) player.removeEffect(effect);
  } catch {
    // ignore
  }
}

function applyBox100NightVisionToParticipants() {
  for (const room of playerRooms.values()) {
    const player = resolveBox100Player(room.playerId);
    if (player) applyBox100NightVision(player);
  }
}

function removeBox100NightVisionFromParticipants() {
  for (const room of playerRooms.values()) {
    const player = resolveBox100Player(room.playerId);
    if (player) removeBox100NightVision(player);
  }
}

function stopBox100NightVisionRefreshLoop() {
  if (nightVisionRefreshLoopId != null) {
    system.clearRun(nightVisionRefreshLoopId);
    nightVisionRefreshLoopId = null;
  }
}

function startBox100NightVisionRefreshLoop() {
  if (!isBox100NightVisionEnabled()) return;
  stopBox100NightVisionRefreshLoop();
  const intervalTicks = 20 * 30;
  nightVisionRefreshLoopId = system.runInterval(() => {
    if (!box100Active) {
      stopBox100NightVisionRefreshLoop();
      return;
    }
    applyBox100NightVisionToParticipants();
  }, intervalTicks);
}

function getBox100Objective() {
  const id = getBox100Config().SCORE_OBJECTIVE ?? "box100_count";
  const board = world.scoreboard;
  let objective = board.getObjective(id);
  if (!objective) {
    objective = board.addObjective(id, "§b§l帰還数");
  }
  return objective;
}

function setDeliveredScore(player, count) {
  try {
    getBox100Objective().setScore(player, count);
  } catch (error) {
    logWarn(`setScore failed for ${player.name}: ${error}`);
  }
}

function resetBox100Scores() {
  try {
    getBox100Objective().setScore(world.scoreboard.getParticipants(), 0);
  } catch {
    for (const player of world.getPlayers()) {
      try {
        getBox100Objective().setScore(player, 0);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * @param {import("@minecraft/server").Player} host
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ x?: number, y?: number, z?: number } | null} [anchor]
 * @param {(result: { ok: boolean, message?: string, players?: import("@minecraft/server").Player[], pending?: boolean }) => void} [onComplete]
 * @returns {{ ok: boolean, message?: string, players?: import("@minecraft/server").Player[], pending?: boolean }}
 */
export function prepareBox100Arena(host, dimension, anchor = null, onComplete) {
  const complete = (result) => {
    if (typeof onComplete === "function") onComplete(result);
    return result;
  };

  persistedArenaRoomOrigins = [];
  clearBox100RankingSnapshot();
  resetBox100State();
  box100Active = true;

  const colors = getColors();
  if (colors.length === 0) {
    return complete({ ok: false, message: "§cBOX100 の色設定がありません。" });
  }

  const players = world.getPlayers().filter((p) => p?.isValid).slice(0, getMaxPlayers());
  if (players.length === 0) {
    return complete({ ok: false, message: "§c参加者がいません。" });
  }

  if (typeof onComplete !== "function") {
    return complete({
      ok: false,
      message: "§c部屋生成の準備コールバックがありません。",
    });
  }

  const hostX = Math.floor(anchor?.x ?? host.location.x);
  const hostY = Math.floor(anchor?.y ?? host.location.y);
  const hostZ = Math.floor(anchor?.z ?? host.location.z);
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const shulkerOffset = cfg.SHULKER_OFFSET ?? { x: 15, y: 1, z: 15 };
  const skyFloorY = getBox100ArenaFloorY();
  const arenaFloorY = skyFloorY ?? hostY;

  const gridCols = getRoomGridColumns(players.length);
  const gridSpacing = getRoomGridSpacing();
  const gridRows = Math.ceil(players.length / gridCols);

  const playerNames = players.map((p) => p.name).join(", ");
  if (skyFloorY != null) {
    logInfo(
      `sky arena: floorY=${arenaFloorY} anchor=(${hostX},${hostZ}) rooms=${players.length} grid=${gridCols}x${gridRows} pitch=${gridSpacing} players=${playerNames}`
    );
  } else {
    logInfo(
      `arena grid: ${gridCols}x${gridRows} spacing=${gridSpacing} rooms=${players.length} players=${playerNames}`
    );
  }

  const roundColors = pickColorsForRound(players.length);
  const roomHeight = cfg.ROOM_HEIGHT ?? 10;

  const stepTicks = Math.max(
    10,
    Math.floor(getBox100Config().ROOM_BUILD_STEP_TICKS ?? 20)
  );
  const preloadTicks = getRoomChunkPreloadTicks();
  const maxBuildAttempts = Math.max(
    1,
    Math.floor(getBox100Config().ROOM_BUILD_MAX_ATTEMPTS ?? 2)
  );
  let buildIndex = 0;

  const failPrepare = (message) => {
    cleanupBox100Entities(dimension, { removeRooms: true });
    complete({ ok: false, message });
  };

  const finishPrepare = () => {
    resetBox100Scores();
    for (const player of players) {
      const room = playerRooms.get(player.id);
      if (!room) continue;
      giveBox100Loadout(player);
      teleportToRoom(player, room);
      setDeliveredScore(player, 0);
    }

    applyBox100NightVisionToParticipants();
    startBox100NightVisionRefreshLoop();

    lastArenaLayout = {
      anchorX: hostX,
      anchorZ: hostZ,
      floorY: arenaFloorY,
      playerCount: players.length,
    };
    logInfo(
      `arena ready: ${playerRooms.size} room(s) for ${players.length} player(s)`
    );
    complete({ ok: true, players });
  };

  const buildNextRoom = () => {
    if (buildIndex >= players.length) {
      finishPrepare();
      return;
    }

    const i = buildIndex;
    const roomIndex = buildIndex + 1;
    buildIndex += 1;
    const player = players[i];
    const color = roundColors[i];
    const origin = getRoomOriginForGridSlot(
      hostX,
      hostZ,
      arenaFloorY,
      i,
      players.length
    );

    const shulkerPos = {
      x: origin.x + shulkerOffset.x,
      y: origin.y + shulkerOffset.y,
      z: origin.z + shulkerOffset.z,
    };

    const room = {
      playerId: player.id,
      playerName: player.name,
      colorId: color.id,
      colorLabel: color.label,
      shellId: getColorShellId(color),
      shulkerId: color.shulker,
      origin,
      shulkerPos,
      deliveredCount: 0,
      finishedAtMs: null,
      rank: null,
    };

    deps.broadcast?.(
      `§7部屋を生成中... §f${roomIndex}/${players.length} §7(${player.name})`,
      { priority: "high" }
    );
    logInfo(
      `building room ${roomIndex}/${players.length}: ${player.name} at (${origin.x},${origin.y},${origin.z})`
    );

    const finalizeRoom = () => {
      try {
        rememberArenaRoomOrigin(origin);
        if (!placeRoomShulker(host, dimension, room)) {
          failPrepare(`§c${player.name} のシュルカーを設置できませんでした。`);
          return;
        }
        playerRooms.set(player.id, room);
        deps.robwPlayerMessage?.(
          player,
          `§7あなたの色: §f${color.label}§7（ガラス箱・シュルカー）`
        );
        logInfo(
          `room ready: ${player.name} color=${color.label} origin=(${origin.x},${origin.y},${origin.z})`
        );
        system.runTimeout(buildNextRoom, stepTicks);
      } catch (error) {
        logError(`arena setup failed for ${player.name}: ${error}`);
        failPrepare(`§c部屋生成中にエラー: ${error}`);
      }
    };

    const tryBuildRoom = (attempt) => {
      try {
        const blocks = buildGlassRoom(
          host,
          origin,
          size,
          roomHeight,
          room.shellId,
          dimension
        );
        if (blocks > 0) {
          finalizeRoom();
          return;
        }
        if (attempt < maxBuildAttempts) {
          logWarn(
            `room build retry ${attempt + 1}/${maxBuildAttempts} for ${player.name} at (${origin.x},${origin.y},${origin.z})`
          );
          preloadRoomChunks(i, origin, () => tryBuildRoom(attempt + 1));
          return;
        }
        failPrepare(`§c${player.name} の部屋を生成できませんでした。`);
      } catch (error) {
        logError(`arena setup failed for ${player.name}: ${error}`);
        failPrepare(`§c部屋生成中にエラー: ${error}`);
      }
    };

    preloadRoomChunks(i, origin, () => tryBuildRoom(0));
  };

  const preloadRoomChunks = (slotIndex, origin, onReady) => {
    if (slotIndex <= 0) {
      onReady();
      return;
    }
    const x0 = origin.x;
    const y0 = origin.y;
    const z0 = origin.z;
    const x1 = x0 + size - 1;
    const y1 = y0 + roomHeight - 1;
    const z1 = z0 + size - 1;
    forceLoadBounds(host, dimension, x0, y0, z0, x1, y1, z1);
    system.runTimeout(onReady, preloadTicks);
  };

  deps.broadcast?.("§7部屋を順番に生成します...", { priority: "high" });
  system.runTimeout(buildNextRoom, preloadTicks);
  return { ok: true, pending: true };
}

export function resetBox100State() {
  removeBox100NightVisionFromParticipants();
  stopBox100NightVisionRefreshLoop();
  box100Active = false;
  box100StartedAtMs = 0;
  nextFinishRank = 1;
  finishedPlayerCount = 0;
  playerRooms.clear();
  wolfEntityIds.clear();
}

/**
 * START と同時に全員の部屋へハコイヌを並列スポーン
 * @param {import("@minecraft/server").Player} host
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {(ok: boolean) => void} [onComplete]
 */
export function releaseBox100Wolves(host, dimension, onComplete) {
  const rooms = [...playerRooms.values()];
  if (rooms.length === 0) {
    onComplete?.(false);
    return;
  }

  const cfg = getBox100Config();
  const roomHeight = cfg.ROOM_HEIGHT ?? 10;
  const size = cfg.ROOM_SIZE ?? 30;
  const target = getBox100TargetCount();

  for (const room of rooms) {
    const x0 = room.origin.x;
    const y0 = room.origin.y;
    const z0 = room.origin.z;
    forceLoadBounds(
      host,
      dimension,
      x0,
      y0,
      z0,
      x0 + size - 1,
      y0 + roomHeight - 1,
      z0 + size - 1
    );
  }

  let pending = rooms.length;
  let anySpawned = false;

  const finishRelease = (wolves, room) => {
    if (wolves > 0) {
      anySpawned = true;
    } else {
      logWarn(`wolf release failed for ${room.playerName}`);
    }
    if (wolves > 0 && wolves < target) {
      logWarn(`wolf release partial for ${room.playerName}: ${wolves}/${target}`);
    }
    pending -= 1;
    if (pending === 0) {
      if (!anySpawned) {
        logWarn("wolf release finished with zero spawns");
      }
      onComplete?.(anySpawned);
    }
  };

  for (const room of rooms) {
    spawnWolvesInRoomBatched(dimension, room, (wolves) => finishRelease(wolves, room));
  }
}

export function beginBox100Running(host) {
  box100StartedAtMs = Date.now();
  applyBox100NightVisionToParticipants();
  const target = getBox100TargetCount();
  const limitMin = Math.ceil(getBox100TimeLimitMs() / 60_000);

  deps.broadcast?.(
    `§a§lハコイヌ100匹チャレンジ開始！§f 自分の部屋のハコイヌをすべて帰還させよう！`,
    { priority: "high" }
  );
  deps.broadcast?.(
    `§7目標 §f${target}匹§7 / 制限時間 §f${limitMin}分§7 / 骨で捕獲→自分の色のシュルカーへ`,
    { priority: "high" }
  );
  if (getBox100ArenaFloorY() != null) {
    deps.broadcast?.(`§7戦場: §f上空（Y=${getBox100ArenaFloorY()}付近）`, { priority: "high" });
  }
  deps.broadcast?.(`§7ホスト: §f${host.name}`, { priority: "high" });
  logInfo(`running: players=${playerRooms.size} target=${target}`);
}

/**
 * @param {import("@minecraft/server").Dimension} [dimension]
 * @param {{ removeWolves?: boolean, removeShulkers?: boolean, removeRooms?: boolean, removeNightVision?: boolean }} [options]
 */
export function cleanupBox100Entities(dimension, options = {}) {
  const dim = dimension ?? world.getDimension("overworld");
  const removeWolves = options.removeWolves !== false;
  const removeShulkers = options.removeShulkers !== false;
  const removeRooms = options.removeRooms !== false;
  const removeNightVision = options.removeNightVision !== false;

  if (removeNightVision) {
    removeBox100NightVisionFromParticipants();
    stopBox100NightVisionRefreshLoop();
  }

  if (removeWolves) {
    for (const entityId of [...wolfEntityIds]) {
      try {
        const entity = world.getEntity(entityId);
        if (entity?.isValid) entity.remove();
      } catch {
        // ignore
      }
      wolfEntityIds.delete(entityId);
    }
    deps.clearRoundWolfRefs?.();
  }

  if (removeShulkers) {
    for (const room of playerRooms.values()) {
      try {
        const block = dim.getBlock(room.shulkerPos);
        const inventory = block?.getComponent?.("inventory");
        const container = inventory?.container;
        if (container) {
          for (let slot = 0; slot < container.size; slot++) {
            container.setItem(slot, undefined);
          }
        }
        setBlockSafe(
          dim,
          room.shulkerPos.x,
          room.shulkerPos.y,
          room.shulkerPos.z,
          "minecraft:air"
        );
      } catch (error) {
        logWarn(`shulker cleanup failed (${room.playerName}): ${error}`);
      }
    }
  }

  if (removeRooms) {
    try {
      destroyAllKnownArenaRooms(resolveBox100CommandHost(), dim);
    } catch (error) {
      logWarn(`arena room destroy failed: ${error}`);
    }
    logInfo("box100 cleanup done (rooms removed)");
  } else {
    logInfo("box100 partial cleanup (rooms kept)");
  }
}

/** @param {import("@minecraft/server").Dimension} [dimension] */
export function cleanupBox100(dimension) {
  cleanupBox100Entities(dimension);
  resetBox100State();
}

function countHakoinuFurInContainer(container) {
  if (!container || typeof deps.countCaptureItemsInContainer !== "function") {
    return 0;
  }
  const counts = deps.countCaptureItemsInContainer(container);
  return counts.hakoinu + counts.unified;
}

function clearHakoinuFurFromContainer(container) {
  if (!container || typeof deps.clearCaptureItemsFromContainer !== "function") {
    return 0;
  }
  const cleared = deps.clearCaptureItemsFromContainer(container);
  return cleared.hakoinu + cleared.unified;
}

function markPlayerFinished(room, player) {
  if (room.finishedAtMs != null) return;
  room.finishedAtMs = Date.now();
  room.rank = nextFinishRank;
  nextFinishRank += 1;
  finishedPlayerCount += 1;

  const elapsedSec = Math.max(0, Math.floor((room.finishedAtMs - box100StartedAtMs) / 1000));
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  const timeText = `${min}分${sec.toString().padStart(2, "0")}秒`;

  const target = getBox100TargetCount();
  deps.broadcast?.(
    `§6${player.name}§aが${target}匹すべて帰還完了！ §e第${room.rank}位§a (${timeText})`,
    { priority: "high" }
  );
  deps.robwPlayerMessage?.(
    player,
    `§a§lゴール！§f 第${room.rank}位 §7(${timeText})`
  );
  logInfo(`${player.name} finished rank=${room.rank} time=${timeText}`);
}

function maybeBroadcastProgress(player, room) {
  const every = getBox100Config().PROGRESS_BROADCAST_EVERY ?? 10;
  if (every <= 0 || room.deliveredCount % every !== 0) return;
  const target = getBox100TargetCount();
  deps.robwPlayerMessage?.(
    player,
    `§7進捗: §f${room.deliveredCount} / ${target} 匹帰還`
  );
}

export function processBox100ShulkerDeliveries() {
  if (!box100Active) return false;

  const target = getBox100TargetCount();
  let any = false;

  for (const [playerId, room] of playerRooms) {
    const player = resolveBox100Player(playerId);
    if (!player) continue;
    if (room.finishedAtMs != null) continue;

    let dimension;
    try {
      dimension = player.dimension;
    } catch {
      continue;
    }

    let container;
    try {
      const block = dimension.getBlock(room.shulkerPos);
      if (block?.typeId !== room.shulkerId) continue;
      container = getBlockInventoryContainer(block);
    } catch {
      continue;
    }
    if (!container) continue;

    const pending = countHakoinuFurInContainer(container);
    if (pending <= 0) continue;

    const delivered = clearHakoinuFurFromContainer(container);
    if (delivered <= 0) continue;

    any = true;
    room.deliveredCount += delivered;
    setDeliveredScore(player, room.deliveredCount);
    maybeBroadcastProgress(player, room);

    if (room.deliveredCount >= target) {
      markPlayerFinished(room, player);
    }
  }

  if (finishedPlayerCount >= playerRooms.size && playerRooms.size > 0) {
    deps.requestGameEnd?.(false);
  }

  return any;
}

export function noteBox100ShulkerUse(player) {
  if (!box100Active || !player?.isValid) return;
  deps.noteShulkerSubmission?.(player);
}

export function getBox100CaptureHint(player) {
  const room = getBox100RoomForPlayer(player);
  if (!room) {
    return "§a毛皮を手に入れた！ §7自分の色のシュルカーに入れてください。";
  }
  return `§a毛皮を手に入れた！ §7${room.colorLabel}のシュルカー (${room.shulkerPos.x}, ${room.shulkerPos.y}, ${room.shulkerPos.z}) に入れてください。`;
}

export function findNearestBox100Wolf(player, maxDistance = 16) {
  if (!player?.isValid) return undefined;
  const room = getBox100RoomForPlayer(player);
  if (!room) return undefined;

  let nearest;
  let nearestDistSq = maxDistance * maxDistance;

  try {
    const entities = player.dimension.getEntities({
      type: "minecraft:wolf",
      location: player.location,
      maxDistance,
    });
    for (const entity of entities) {
      if (!entity?.isValid || !wolfEntityIds.has(entity.id)) continue;
      if (!isInsideRoomBounds(entity.location, room, 0)) continue;
      const el = entity.location;
      const pl = player.location;
      const distSq =
        (el.x - pl.x) ** 2 + (el.y - pl.y) ** 2 + (el.z - pl.z) ** 2;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = entity;
      }
    }
  } catch (error) {
    logWarn(`find wolf failed: ${error}`);
  }

  return nearest;
}

function formatElapsed(ms) {
  const elapsedSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return `${min}分${sec.toString().padStart(2, "0")}秒`;
}

function clearBox100RankingSnapshot() {
  lastRankingSnapshot = null;
}

export function snapshotBox100Ranking() {
  if (playerRooms.size === 0) return false;
  lastRankingSnapshot = {
    startedAtMs: box100StartedAtMs,
    target: getBox100TargetCount(),
    entries: [...playerRooms.values()].map((room) => ({
      playerName: room.playerName,
      deliveredCount: room.deliveredCount,
      finishedAtMs: room.finishedAtMs,
      rank: room.rank,
    })),
  };
  logInfo(`ranking snapshot saved (${lastRankingSnapshot.entries.length} entries)`);
  return true;
}

export function hasBox100RankingResults() {
  if (playerRooms.size > 0) return true;
  return (lastRankingSnapshot?.entries?.length ?? 0) > 0;
}

function getBox100RankingSource() {
  if (playerRooms.size > 0) {
    return {
      startedAtMs: box100StartedAtMs,
      target: getBox100TargetCount(),
      entries: [...playerRooms.values()].map((room) => ({
        playerName: room.playerName,
        deliveredCount: room.deliveredCount,
        finishedAtMs: room.finishedAtMs,
        rank: room.rank,
      })),
    };
  }
  if (lastRankingSnapshot) return lastRankingSnapshot;
  return null;
}

export function buildBox100RankingLines() {
  const source = getBox100RankingSource();
  if (!source || source.entries.length === 0) return ["(記録なし)"];

  const target = source.target;
  const startedAtMs = source.startedAtMs;
  const finished = [];
  const unfinished = [];

  for (const entry of source.entries) {
    if (entry.finishedAtMs != null && entry.rank != null) {
      finished.push(entry);
    } else {
      unfinished.push(entry);
    }
  }

  finished.sort((a, b) => {
    if (a.rank !== b.rank) return (a.rank ?? 0) - (b.rank ?? 0);
    return (a.finishedAtMs ?? 0) - (b.finishedAtMs ?? 0);
  });
  unfinished.sort((a, b) => {
    if (b.deliveredCount !== a.deliveredCount) {
      return b.deliveredCount - a.deliveredCount;
    }
    return a.playerName.localeCompare(b.playerName);
  });

  const lines = [];
  let displayRank = 1;

  for (const entry of finished) {
    const elapsed = formatElapsed((entry.finishedAtMs ?? 0) - startedAtMs);
    lines.push(
      `${displayRank}位：${entry.playerName} - ${target}匹 - ${elapsed}`
    );
    displayRank += 1;
  }

  for (const entry of unfinished) {
    lines.push(
      `${displayRank}位：${entry.playerName} - ${entry.deliveredCount}匹`
    );
    displayRank += 1;
  }

  return lines;
}

export function showBox100Ranking(options = {}) {
  const lines = [
    "§6ハコイヌ100匹チャレンジ終了！ランキングを発表します！",
    ...buildBox100RankingLines().map((line) => `§e${line}`),
  ];
  const broadcastOptions = { priority: "high", ...options };
  if (typeof deps.broadcastSequence === "function") {
    deps.broadcastSequence(lines, broadcastOptions);
    return;
  }
  for (const line of lines) {
    deps.broadcast?.(line, broadcastOptions);
  }
}
