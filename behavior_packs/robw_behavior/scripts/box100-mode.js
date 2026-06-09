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

function runHostFillCommand(host, x1, y1, z1, x2, y2, z2, typeId) {
  if (!host?.isValid || typeof host.runCommand !== "function") {
    return false;
  }
  const blockName = toCommandBlockName(typeId);
  const cmd = `fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${blockName}`;
  try {
    const result = host.runCommand(cmd);
    return (result?.successCount ?? 0) > 0;
  } catch (error) {
    logWarn(`fill command failed (${cmd}): ${error}`);
    return false;
  }
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

/**
 * 色付きガラスの箱を生成。ホストの /fill を優先（setType が使えない環境対策）
 */
function buildGlassRoom(host, origin, size, height, shellId, dimension) {
  const x0 = origin.x;
  const y0 = origin.y;
  const z0 = origin.z;
  const x1 = x0 + size - 1;
  const y1 = y0 + height - 1;
  const z1 = z0 + size - 1;

  if (host?.isValid) {
    const outer = runHostFillCommand(host, x0, y0, z0, x1, y1, z1, shellId);
    if (!outer) {
      logWarn(
        `buildGlassRoom fill outer failed at (${x0},${y0},${z0}) — チートONとコマンド権限を確認`
      );
      return 0;
    }
    if (size > 2 && height > 2) {
      runHostFillCommand(
        host,
        x0 + 1,
        y0 + 1,
        z0 + 1,
        x1 - 1,
        y1 - 1,
        z1 - 1,
        "minecraft:air"
      );
    }
    logInfo(`room fill ok: (${x0},${y0},${z0}) size=${size} h=${height}`);
    return size * size * height;
  }

  let placed = 0;
  for (let dx = 0; dx < size; dx += 1) {
    for (let dz = 0; dz < size; dz += 1) {
      for (let dy = 0; dy < height; dy += 1) {
        const shell =
          dx === 0 ||
          dz === 0 ||
          dx === size - 1 ||
          dz === size - 1 ||
          dy === 0 ||
          dy === height - 1;
        const typeId = shell ? shellId : "minecraft:air";
        if (setBlockSafe(dimension, x0 + dx, y0 + dy, z0 + dz, typeId)) {
          placed += 1;
        }
      }
    }
  }
  return placed;
}

function resolveBox100CommandHost() {
  if (typeof deps.resolveCommandHost === "function") {
    const host = deps.resolveCommandHost();
    if (host?.isValid) return host;
  }
  return world.getPlayers().find((p) => p?.isValid) ?? null;
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
  if (cmdHost?.isValid) {
    if (runHostFillCommand(cmdHost, x0, y0, z0, x1, y1, z1, "minecraft:air")) {
      return true;
    }
    logWarn(`destroyGlassRoom fill failed at (${x0},${y0},${z0})`);
  }

  for (let dx = 0; dx < size; dx += 1) {
    for (let dz = 0; dz < size; dz += 1) {
      for (let dy = 0; dy < height; dy += 1) {
        setBlockSafe(dimension, x0 + dx, y0 + dy, z0 + dz, "minecraft:air");
      }
    }
  }
  return true;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function spawnWolvesInRoom(dimension, room) {
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const height = cfg.ROOM_HEIGHT ?? 10;
  const margin = cfg.SPAWN_MARGIN ?? 3;
  const count = getBox100TargetCount();
  let spawned = 0;

  for (let i = 0; i < count; i += 1) {
    const x = room.origin.x + randomInt(margin, size - margin - 1) + 0.5;
    const z = room.origin.z + randomInt(margin, size - margin - 1) + 0.5;
    const y = room.origin.y + randomInt(1, height - 3);
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

  logInfo(`wolves spawned ${spawned}/${count} for ${room.playerName}`);
  return spawned;
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
 * @returns {{ ok: boolean, message?: string, players?: import("@minecraft/server").Player[] }}
 */
export function prepareBox100Arena(host, dimension) {
  resetBox100State();
  box100Active = true;

  const colors = getColors();
  if (colors.length === 0) {
    return { ok: false, message: "§cBOX100 の色設定がありません。" };
  }

  const players = world.getPlayers().filter((p) => p?.isValid).slice(0, getMaxPlayers());
  if (players.length === 0) {
    return { ok: false, message: "§c参加者がいません。" };
  }

  const hostX = Math.floor(host.location.x);
  const hostY = Math.floor(host.location.y);
  const hostZ = Math.floor(host.location.z);
  const cfg = getBox100Config();
  const size = cfg.ROOM_SIZE ?? 30;
  const shulkerOffset = cfg.SHULKER_OFFSET ?? { x: 15, y: 1, z: 15 };
  const skyFloorY = getBox100ArenaFloorY();
  const arenaFloorY = skyFloorY ?? hostY;

  const gridCols = getRoomGridColumns(players.length);
  const gridSpacing = getRoomGridSpacing();
  const gridRows = Math.ceil(players.length / gridCols);

  if (skyFloorY != null) {
    logInfo(
      `sky arena: floorY=${arenaFloorY} anchor=(${hostX},${hostZ}) players=${players.length} grid=${gridCols}x${gridRows} pitch=${gridSpacing}`
    );
  } else {
    logInfo(
      `arena grid: ${gridCols}x${gridRows} spacing=${gridSpacing} players=${players.length}`
    );
  }

  const roundColors = pickColorsForRound(players.length);

  for (let i = 0; i < players.length; i += 1) {
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

    try {
      const blocks = buildGlassRoom(
        host,
        origin,
        size,
        cfg.ROOM_HEIGHT ?? 10,
        room.shellId,
        dimension
      );
      if (blocks <= 0) {
        return {
          ok: false,
          message: `§c${player.name} の部屋を生成できませんでした。`,
        };
      }
      if (!placeRoomShulker(host, dimension, room)) {
        return {
          ok: false,
          message: `§c${player.name} のシュルカーを設置できませんでした。`,
        };
      }
      const wolves = spawnWolvesInRoom(dimension, room);
      if (wolves <= 0) {
        return {
          ok: false,
          message: `§c${player.name} の部屋にオオカミを出せませんでした。`,
        };
      }
      playerRooms.set(player.id, room);
      deps.robwPlayerMessage?.(
        player,
        `§7あなたの色: §f${color.label}§7（ガラス箱・シュルカー）`
      );
      logInfo(
        `room ready: ${player.name} color=${color.label} origin=(${origin.x},${origin.y},${origin.z})`
      );
    } catch (error) {
      logError(`arena setup failed for ${player.name}: ${error}`);
      return {
        ok: false,
        message: `§c部屋生成中にエラー: ${error}`,
      };
    }
  }

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

  return { ok: true, players };
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
    const cfg = getBox100Config();
    const size = cfg.ROOM_SIZE ?? 30;
    const height = cfg.ROOM_HEIGHT ?? 10;
    const host = resolveBox100CommandHost();
    for (const room of playerRooms.values()) {
      try {
        destroyGlassRoom(host, room.origin, size, height, dim);
        logInfo(
          `room removed: ${room.playerName} (${room.origin.x},${room.origin.y},${room.origin.z})`
        );
      } catch (error) {
        logWarn(`room destroy failed (${room.playerName}): ${error}`);
      }
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

export function buildBox100RankingLines() {
  const target = getBox100TargetCount();
  const finished = [];
  const unfinished = [];

  for (const room of playerRooms.values()) {
    if (room.finishedAtMs != null && room.rank != null) {
      finished.push(room);
    } else {
      unfinished.push(room);
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

  for (const room of finished) {
    const elapsed = formatElapsed((room.finishedAtMs ?? 0) - box100StartedAtMs);
    lines.push(
      `${displayRank}位：${room.playerName} - ${target}匹 - ${elapsed}`
    );
    displayRank += 1;
  }

  for (const room of unfinished) {
    lines.push(
      `${displayRank}位：${room.playerName} - ${room.deliveredCount}匹`
    );
    displayRank += 1;
  }

  if (lines.length === 0) return ["(記録なし)"];
  return lines;
}

export function showBox100Ranking() {
  const lines = [
    "§6ハコイヌ100匹チャレンジ終了！ランキングを発表します！",
    ...buildBox100RankingLines().map((line) => `§e${line}`),
  ];
  if (typeof deps.broadcastSequence === "function") {
    deps.broadcastSequence(lines, { priority: "high" });
    return;
  }
  for (const line of lines) {
    deps.broadcast?.(line, { priority: "high" });
  }
}
