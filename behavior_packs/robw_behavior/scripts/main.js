/**
 * リターン・オブ・ボックスワールド (Return of BoxWorld) — MVP
 * Minecraft Bedrock Edition Script API
 */

import { world, system, ItemStack } from "@minecraft/server";

console.warn("[ROBW] main.js loaded");

// ---------------------------------------------------------------------------
// 設定（ワールドに合わせて BOX_GATE を変更してください）
// ---------------------------------------------------------------------------

const CONFIG = {
  /** ゲート開放時間（分） */
  GATE_OPEN_MINUTES: 10,
  /** 残り時間の定期通知間隔（秒） */
  TIME_NOTIFY_INTERVAL_SECONDS: 60,
  /** 帰還ボックス化: 骨を使える距離 */
  PROTECTION_RADIUS: 4,
  /** ボックスゲート（招集・集合エリアの中心） */
  BOX_GATE: {
    x: 0,
    y: 86,
    z: 0,
    radius: 3,
  },
  /** 納品チェスト（未設置時のフォールバック座標。通常は起動時に自動配置） */
  SUBMISSION_CHEST: {
    x: 0,
    y: 85,
    z: 0,
  },
  /** 平坦なチェスト設置場所を探す半径（BOX_GATE 中心から） */
  CHEST_FLAT_SEARCH_RADIUS: 24,
  /** 納品に使えるブロック */
  SUBMISSION_CHEST_BLOCK_TYPES: [
    "minecraft:chest",
    "minecraft:trapped_chest",
    "minecraft:barrel",
  ],
  /** ゲート起動時に招集する高さ（ブロック内埋まり防止用オフセット） */
  GATE_SUMMON_OFFSET_Y: 0,
  /** ゲート起動時に全員へ配る骨の数 */
  START_GIVE_BONES: 16,
  /** ゲート起動時にスポーンするハコイヌ（オオカミ）の数 */
  START_SPAWN_HAKOINU: 10,
  /** ゲート中心からハコイヌをスポーンする距離（ブロック） */
  HAKOINU_SPAWN_DISTANCE: 6,
  /** 保護用アイテム（骨） */
  PROTECT_ITEM: "minecraft:bone",
  /** 帰還ボックスとして扱うアイテム（MVP はウサギの皮＝茶色の毛皮） */
  RETURN_BOX_ITEM: "minecraft:rabbit_hide",
  /** 骨で捕獲したハコイヌ（納品チェストへ） */
  RETURN_BOX_NAME: "捕獲したハコイヌ",
  /** ハコイヌ以外の動物（納品でマイナス点） */
  WRONG_RETURN_BOX_NAME: "捕獲した別種",
  /** ハコイヌ（MVP はオオカミ代用） */
  HAKOINU_ENTITY_TYPES: ["minecraft:wolf"],
  /** 骨で保護できるがマイナス点になる動物 */
  PENALTY_ANIMAL_TYPES: [
    "minecraft:cow",
    "minecraft:pig",
    "minecraft:sheep",
    "minecraft:chicken",
    "minecraft:goat",
    "minecraft:rabbit",
    "minecraft:horse",
    "minecraft:donkey",
    "minecraft:mule",
    "minecraft:llama",
    "minecraft:fox",
    "minecraft:cat",
    "minecraft:mooshroom",
    "minecraft:parrot",
    "minecraft:camel",
  ],
  /** 1 帰還ボックスあたりの帰還ポイント */
  POINTS_PER_BOX: 1,
  /** 誤帰還（ハコイヌ以外の動物）1 箱あたりのペナルティ */
  POINTS_WRONG_ANIMAL: -3,
  /** スコアボード objective ID */
  SCORE_OBJECTIVE: "return_point",
  /** チャットコマンド接頭辞 */
  CHAT_PREFIX: "!robw",
  /** 右クリックでコマンド代わり（時計はブロック設置しないので棒より安全） */
  WAND_ITEM: "minecraft:clock",
  WAND_NAMES: {
    "ROBW:start": "start",
    "ROBW:stop": "stop",
    "ROBW:reset": "reset",
    "ROBW:ranking": "ranking",
  },
};

/** 目立つ残り時間通知（秒） */
const MILESTONE_SECONDS = [60, 30, 10];

const TICKS_PER_SECOND = 20;
const SUBMISSION_CREDIT_WINDOW_TICKS = 15 * TICKS_PER_SECOND;
const SUBMISSION_PROCESS_DELAYS = [5, 20, 40, 60, 100, 150];
const GATE_OPEN_TICKS = CONFIG.GATE_OPEN_MINUTES * 60 * TICKS_PER_SECOND;
const TIME_NOTIFY_INTERVAL_TICKS =
  CONFIG.TIME_NOTIFY_INTERVAL_SECONDS * TICKS_PER_SECOND;

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------

/** @type {"waiting" | "running" | "finished"} */
let gameState = "waiting";
let gameEndTick = 0;
let nextTimeNotifyTick = 0;
/** @type {Set<number>} */
let announcedMilestones = new Set();
/** @type {number | undefined} */
let gameLoopId = undefined;
/** @type {number | undefined} */
let submissionLoopId = undefined;
/** @type {import("@minecraft/server").Player | null} */
let lastSubmissionPlayer = null;
let lastSubmissionTick = 0;
/** @type {{ x: number, y: number, z: number } | null} */
let activeSubmissionChestPos = null;
/** @type {{ dimension: import("@minecraft/server").Dimension, x: number, y: number, z: number, typeId: string } | null} */
let placedChestRestore = null;

// ---------------------------------------------------------------------------
// ログ
// ---------------------------------------------------------------------------

function logInfo(message) {
  console.warn(`[INFO] ${message}`);
}

function logWarn(message) {
  console.warn(`[WARN] ${message}`);
}

function logError(message) {
  console.warn(`[ERROR] ${message}`);
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function broadcast(message) {
  world.sendMessage(message);
}

function distanceSq(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function formatTimeRemaining(ticksRemaining) {
  const totalSeconds = Math.max(0, Math.ceil(ticksRemaining / TICKS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// スコア（帰還ポイント）
// ---------------------------------------------------------------------------

function getObjective() {
  const board = world.scoreboard;
  let objective = board.getObjective(CONFIG.SCORE_OBJECTIVE);
  if (!objective) {
    objective = board.addObjective(
      CONFIG.SCORE_OBJECTIVE,
      "帰還ポイント"
    );
    logInfo(`scoreboard objective created: ${CONFIG.SCORE_OBJECTIVE}`);
  }
  return objective;
}

function resetAllScores() {
  const objective = getObjective();
  for (const player of world.getPlayers()) {
    objective.setScore(player, 0);
  }
  logInfo("all return points reset to 0");
}

function addReturnPoints(player, points) {
  const objective = getObjective();
  const current = objective.getScore(player) ?? 0;
  objective.setScore(player, current + points);
  return current + points;
}

// ---------------------------------------------------------------------------
// 帰還ボックス（インベントリ）
// ---------------------------------------------------------------------------

/** @returns {"hakoinu" | "wrong" | null} */
function getReturnBoxKind(itemStack) {
  if (!itemStack || itemStack.typeId !== CONFIG.RETURN_BOX_ITEM) {
    return null;
  }

  const tag = (itemStack.nameTag ?? "").replace(/§./g, "").trim();
  if (!tag || tag === CONFIG.RETURN_BOX_NAME) return "hakoinu";
  if (tag === CONFIG.WRONG_RETURN_BOX_NAME) return "wrong";
  return null;
}

function createReturnBoxStack(amount = 1, kind = "hakoinu") {
  const stack = new ItemStack(CONFIG.RETURN_BOX_ITEM, amount);
  stack.nameTag =
    kind === "wrong" ? CONFIG.WRONG_RETURN_BOX_NAME : CONFIG.RETURN_BOX_NAME;
  return stack;
}

function countReturnBoxesInInventory(player) {
  const container = player.getComponent("inventory")?.container;
  const counts = { hakoinu: 0, wrong: 0 };
  if (!container) return counts;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    const kind = getReturnBoxKind(item);
    if (kind === "hakoinu") counts.hakoinu += item.amount;
    if (kind === "wrong") counts.wrong += item.amount;
  }
  return counts;
}

function removeReturnBoxesFromInventory(player) {
  const container = player.getComponent("inventory")?.container;
  const removed = { hakoinu: 0, wrong: 0 };
  if (!container) return removed;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    const kind = getReturnBoxKind(item);
    if (!kind) continue;

    removed[kind] += item.amount;
    container.setItem(slot, undefined);
  }
  return removed;
}

function giveReturnBox(player, amount = 1, kind = "hakoinu") {
  const stack = createReturnBoxStack(amount, kind);
  const container = player.getComponent("inventory")?.container;
  if (!container) {
    player.dimension.spawnItem(stack, player.location);
    return;
  }
  const leftover = container.addItem(stack);
  if (leftover) {
    player.dimension.spawnItem(leftover, player.location);
  }
}

// ---------------------------------------------------------------------------
// ハコイヌ
// ---------------------------------------------------------------------------

/** @type {import("@minecraft/server").Entity[]} */
let spawnedHakoinu = [];

function clearSpawnedHakoinu() {
  for (const entity of spawnedHakoinu) {
    try {
      if (entity?.isValid) entity.remove();
    } catch {
      // 既に消えている場合は無視
    }
  }
  spawnedHakoinu = [];
}

function removeItemTypeFromInventory(player, typeId) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === typeId) {
      container.setItem(slot, undefined);
    }
  }
}

function giveStartKit(player) {
  removeItemTypeFromInventory(player, CONFIG.PROTECT_ITEM);

  const stack = new ItemStack(CONFIG.PROTECT_ITEM, CONFIG.START_GIVE_BONES);
  const container = player.getComponent("inventory")?.container;
  if (!container) {
    player.dimension.spawnItem(stack, player.location);
    return;
  }
  const leftover = container.addItem(stack);
  if (leftover) {
    player.dimension.spawnItem(leftover, player.location);
  }
}

function spawnHakoinuAtGate(dimension) {
  const gate = CONFIG.BOX_GATE;
  const count = CONFIG.START_SPAWN_HAKOINU;
  const entityType = CONFIG.HAKOINU_ENTITY_TYPES[0];
  const baseY = gate.y + CONFIG.GATE_SUMMON_OFFSET_Y;

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / Math.max(count, 1);
    const dist = CONFIG.HAKOINU_SPAWN_DISTANCE;
    const x = gate.x + 0.5 + Math.cos(angle) * dist;
    const z = gate.z + 0.5 + Math.sin(angle) * dist;

    try {
      const entity = dimension.spawnEntity(entityType, { x, y: baseY, z });
      spawnedHakoinu.push(entity);
    } catch (error) {
      logWarn(`spawn hakoinu failed (${i + 1}/${count}): ${error}`);
    }
  }

  logInfo(`spawned ${spawnedHakoinu.length} hakoinu near box gate`);
}

function getActiveSubmissionChestPos() {
  return activeSubmissionChestPos ?? CONFIG.SUBMISSION_CHEST;
}

function isSolidGroundBlock(block) {
  if (!block?.isValid) return false;
  if (block.isAir) return false;
  if (block.isLiquid) return false;
  return true;
}

function findSurfaceFootY(dimension, x, z, minY, maxY) {
  for (let y = maxY; y >= minY; y--) {
    const ground = dimension.getBlock({ x, y, z });
    const above = dimension.getBlock({ x, y: y + 1, z });
    if (isSolidGroundBlock(ground) && above?.isAir) {
      return y;
    }
  }
  return null;
}

function evaluateFlatChestPlatform(dimension, centerX, centerZ, refY) {
  const minY = refY - 10;
  const maxY = refY + 2;
  const centerFootY = findSurfaceFootY(dimension, centerX, centerZ, minY, maxY);
  if (centerFootY === null) return null;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const x = centerX + dx;
      const z = centerZ + dz;
      const footY = findSurfaceFootY(dimension, x, z, minY, maxY);
      if (footY === null || footY !== centerFootY) return null;

      const above = dimension.getBlock({ x, y: footY + 1, z });
      if (!above?.isAir) return null;
    }
  }

  const chestY = centerFootY + 1;
  return {
    x: centerX,
    y: chestY,
    z: centerZ,
    footY: centerFootY,
    score: 9 - Math.abs(centerFootY - (refY - 1)) * 3,
  };
}

function findFlatChestSpot(dimension) {
  const gate = CONFIG.BOX_GATE;
  const refY = gate.y;
  const radius = CONFIG.CHEST_FLAT_SEARCH_RADIUS;
  const baseX = Math.floor(gate.x);
  const baseZ = Math.floor(gate.z);

  let best = null;

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const platform = evaluateFlatChestPlatform(
        dimension,
        baseX + dx,
        baseZ + dz,
        refY
      );
      if (!platform) continue;

      const dist = Math.hypot(dx, dz);
      const score = platform.score - dist * 0.2;
      if (!best || score > best.score) {
        best = { ...platform, score };
      }
    }
  }

  return best;
}

function setBlockTypeAt(dimension, location, typeId) {
  const block = dimension.getBlock(location);
  if (block?.setType) {
    block.setType(typeId);
    return;
  }
  if (dimension.setBlockType) {
    dimension.setBlockType(location, typeId);
  }
}

function isSubmissionChestBlockType(typeId) {
  return CONFIG.SUBMISSION_CHEST_BLOCK_TYPES.includes(typeId);
}

function clearContainerItems(container) {
  if (!container) return;
  for (let slot = 0; slot < container.size; slot++) {
    container.setItem(slot, undefined);
  }
}

/** 探索半径内のチェスト類をすべて撤去（納品用は起動後に1つだけ設置） */
function removeExtraChestsInArea(dimension, centerX, centerZ, radius, minY, maxY) {
  const baseX = Math.floor(centerX);
  const baseZ = Math.floor(centerZ);
  let removed = 0;

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let y = minY; y <= maxY; y++) {
        const x = baseX + dx;
        const z = baseZ + dz;
        try {
          const block = dimension.getBlock({ x, y, z });
          if (!block?.isValid || !isSubmissionChestBlockType(block.typeId)) {
            continue;
          }

          clearContainerItems(block.getComponent("inventory")?.container);
          setBlockTypeAt(dimension, { x, y, z }, "minecraft:air");
          removed++;
        } catch {
          // 読み込み範囲外など
        }
      }
    }
  }

  if (removed > 0) {
    logInfo(`removed ${removed} chest(s) near box gate before placement`);
  }
  return removed;
}

function clearPlacedSubmissionChestContents() {
  clearContainerItems(getSubmissionChestContainer());
}

function removePlacedSubmissionChest(dimension) {
  if (!placedChestRestore) return;

  clearPlacedSubmissionChestContents();

  const { x, y, z, typeId } = placedChestRestore;
  const dim = placedChestRestore.dimension ?? dimension;

  try {
    const block = dim.getBlock({ x, y, z });
    if (
      block &&
      CONFIG.SUBMISSION_CHEST_BLOCK_TYPES.includes(block.typeId)
    ) {
      setBlockTypeAt(dim, { x, y, z }, typeId || "minecraft:air");
    }
  } catch (error) {
    logWarn(`remove submission chest failed: ${error}`);
  }

  placedChestRestore = null;
  activeSubmissionChestPos = null;
}

function placeSubmissionChest(dimension) {
  placedChestRestore = null;
  activeSubmissionChestPos = null;

  const gate = CONFIG.BOX_GATE;
  removeExtraChestsInArea(
    dimension,
    gate.x,
    gate.z,
    CONFIG.CHEST_FLAT_SEARCH_RADIUS,
    gate.y - 10,
    gate.y + 3
  );

  const spot = findFlatChestSpot(dimension);
  if (!spot) {
    logWarn("no flat location found for submission chest");
    broadcast(
      "§c平坦な場所が見つからず、納品チェストを設置できませんでした。"
    );
    return false;
  }

  const before = dimension.getBlock({ x: spot.x, y: spot.y, z: spot.z });
  placedChestRestore = {
    dimension,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    typeId: before?.typeId ?? "minecraft:air",
  };

  setBlockTypeAt(dimension, { x: spot.x, y: spot.y, z: spot.z }, "minecraft:chest");
  activeSubmissionChestPos = { x: spot.x, y: spot.y, z: spot.z };

  broadcast(
    `§b納品チェストを平坦な場所に設置しました: (${spot.x}, ${spot.y}, ${spot.z})`
  );
  logInfo(
    `submission chest placed at (${spot.x}, ${spot.y}, ${spot.z}) footY=${spot.footY}`
  );
  return true;
}

function prepareRoundStart() {
  const players = world.getPlayers();
  if (players.length === 0) return;

  const dimension = players[0].dimension;

  clearSpawnedHakoinu();
  placeSubmissionChest(dimension);
  spawnHakoinuAtGate(dimension);

  for (const player of players) {
    giveStartKit(player);
  }

  broadcast(
    `§f骨を §7×${CONFIG.START_GIVE_BONES} §fにリセット、§fハコイヌ §7${CONFIG.START_SPAWN_HAKOINU} 匹を出現させました！`
  );
}

function isHakoinuEntity(entity) {
  return CONFIG.HAKOINU_ENTITY_TYPES.includes(entity.typeId);
}

function isPenaltyAnimalEntity(entity) {
  return CONFIG.PENALTY_ANIMAL_TYPES.includes(entity.typeId);
}

function findNearestProtectableAnimal(player) {
  const { location, dimension } = player;
  const entities = dimension.getEntities({
    location,
    maxDistance: CONFIG.PROTECTION_RADIUS,
  });

  let nearest = undefined;
  let nearestDistSq = CONFIG.PROTECTION_RADIUS * CONFIG.PROTECTION_RADIUS;

  for (const entity of entities) {
    if (!entity.isValid) continue;
    if (!isHakoinuEntity(entity) && !isPenaltyAnimalEntity(entity)) continue;

    const el = entity.location;
    const distSq = distanceSq(
      location.x,
      location.y,
      location.z,
      el.x,
      el.y,
      el.z
    );
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = entity;
    }
  }

  return nearest;
}

function tryProtectHakoinu(player) {
  if (gameState !== "running") {
    player.sendMessage(
      `§cゲート開放中のみ保護できます。${CONFIG.CHAT_PREFIX} start でゲートを起動してください。`
    );
    return;
  }

  const target = findNearestProtectableAnimal(player);
  if (!target) {
    player.sendMessage("§7近くにハコイヌや動物がいません。");
    return;
  }

  const entityId = target.id;
  const entityType = target.typeId;
  target.remove();

  if (CONFIG.HAKOINU_ENTITY_TYPES.includes(entityType)) {
    giveReturnBox(player, 1, "hakoinu");
    broadcast(`§a${player.name}§fがハコイヌを捕獲しました！`);
    const chest = getActiveSubmissionChestPos();
    player.sendMessage(
      `§7「${CONFIG.RETURN_BOX_NAME}」を納品チェスト (${chest.x}, ${chest.y}, ${chest.z}) に入れてください。`
    );
    logInfo(`hakoinu captured by ${player.name} (entity ${entityId})`);
    return;
  }

  giveReturnBox(player, 1, "wrong");
  broadcast(
    `§e${player.name}§fが§cハコイヌ以外の動物§fを誤って捕獲しました…（§c${CONFIG.POINTS_WRONG_ANIMAL}pt§f）`
  );
  player.sendMessage(
    `§7「${CONFIG.WRONG_RETURN_BOX_NAME}」を納品するとペナルティです。ハコイヌだけ届けてね！`
  );
  logInfo(
    `wrong animal protected by ${player.name} (${entityType}, entity ${entityId})`
  );
}

// ---------------------------------------------------------------------------
// 納品チェスト
// ---------------------------------------------------------------------------

function formatPointsDelta(points) {
  if (points > 0) return `§a+${points}pt`;
  if (points < 0) return `§c${points}pt`;
  return "§70pt";
}

function isSubmissionChestBlock(block) {
  if (!block?.isValid) return false;
  const chest = getActiveSubmissionChestPos();
  const loc = block.location;
  if (loc.x !== chest.x || loc.y !== chest.y || loc.z !== chest.z) {
    return false;
  }
  return block.typeId === "minecraft:chest";
}

function getSubmissionChestContainer() {
  const chest = getActiveSubmissionChestPos();
  const dimensions = new Set();
  try {
    dimensions.add(world.getDimension("overworld"));
  } catch {
    // ignore
  }
  for (const player of world.getPlayers()) {
    dimensions.add(player.dimension);
  }

  for (const dimension of dimensions) {
    try {
      const block = dimension.getBlock({ x: chest.x, y: chest.y, z: chest.z });
      if (!isSubmissionChestBlock(block)) continue;
      const inventory = block.getComponent("inventory");
      return inventory?.container ?? null;
    } catch {
      continue;
    }
  }
  return null;
}

function noteSubmissionChestUse(player) {
  lastSubmissionPlayer = player;
  lastSubmissionTick = system.currentTick;
}

function countCaptureItemsInContainer(container) {
  const counts = { hakoinu: 0, wrong: 0 };
  if (!container) return counts;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    const kind = getReturnBoxKind(item);
    if (kind === "hakoinu") counts.hakoinu += item.amount;
    if (kind === "wrong") counts.wrong += item.amount;
  }
  return counts;
}

function hasCaptureItemsInContainer(container) {
  const counts = countCaptureItemsInContainer(container);
  return counts.hakoinu > 0 || counts.wrong > 0;
}

function clearCaptureItemsFromContainer(container) {
  const removed = { hakoinu: 0, wrong: 0 };
  if (!container) return removed;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    const kind = getReturnBoxKind(item);
    if (!kind) continue;

    removed[kind] += item.amount;
    container.setItem(slot, undefined);
  }
  return removed;
}

function announceDelivery(player, returned, points, total) {
  if (returned.wrong > 0 && returned.hakoinu > 0) {
    broadcast(
      `§6${player.name}§fが納品しました！ §aハコイヌ${returned.hakoinu} §7/ §c別種${returned.wrong} §7→ ${formatPointsDelta(points)} §7(合計 ${total}pt)`
    );
  } else if (returned.wrong > 0) {
    broadcast(
      `§c${player.name}§fが別種の動物を納品してしまった！ ${formatPointsDelta(points)} §7(合計 ${total}pt)`
    );
  } else if (returned.hakoinu === 1) {
    broadcast(
      `§6${player.name}§fがハコイヌをボックスワールドへ帰還させました！ ${formatPointsDelta(points)} §7(合計 ${total}pt)`
    );
  } else {
    broadcast(
      `§6${player.name}§fが捕獲ハコイヌを${returned.hakoinu}匹納品しました！ ${formatPointsDelta(points)} §7(合計 ${total}pt)`
    );
  }
}

function processSubmissionChest(player) {
  if (gameState !== "running") return;
  if (!player?.isValid) return;

  const container = getSubmissionChestContainer();
  if (!container) {
    const chest = getActiveSubmissionChestPos();
    player.sendMessage(
      `§c納品チェストがありません。(${chest.x}, ${chest.y}, ${chest.z}) 付近を確認してください。`
    );
    return;
  }

  const pending = countCaptureItemsInContainer(container);
  if (pending.hakoinu <= 0 && pending.wrong <= 0) return;

  const returned = clearCaptureItemsFromContainer(container);
  if (returned.hakoinu <= 0 && returned.wrong <= 0) return;

  const points =
    returned.hakoinu * CONFIG.POINTS_PER_BOX +
    returned.wrong * CONFIG.POINTS_WRONG_ANIMAL;
  const total = addReturnPoints(player, points);
  announceDelivery(player, returned, points, total);
  player.sendMessage(
    `§7納品した毛皮 ${returned.hakoinu + returned.wrong} 枚を消費しました。`
  );
  logInfo(
    `${player.name} submitted hakoinu=${returned.hakoinu} wrong=${returned.wrong} (${points} pts)`
  );
}

// ---------------------------------------------------------------------------
// ランキング
// ---------------------------------------------------------------------------

function buildRankingLines() {
  const objective = getObjective();
  const entries = [];

  for (const player of world.getPlayers()) {
    const score = objective.getScore(player) ?? 0;
    entries.push({ name: player.name, score });
  }

  entries.sort((a, b) => b.score - a.score);

  if (entries.length === 0) {
    return ["（参加者なし）"];
  }

  return entries.map((entry, index) => {
    const rank = index + 1;
    return `${rank}位：${entry.name} - ${entry.score}pt`;
  });
}

function showRanking(title = "§6Return of BoxWorld 帰還ランキング") {
  broadcast(title);
  for (const line of buildRankingLines()) {
    broadcast(`§e${line}`);
  }
}

// ---------------------------------------------------------------------------
// タイマー
// ---------------------------------------------------------------------------

function resetTimerState() {
  gameEndTick = 0;
  nextTimeNotifyTick = 0;
  announcedMilestones = new Set();
}

function stopGameLoops() {
  if (gameLoopId !== undefined) {
    system.clearRun(gameLoopId);
    gameLoopId = undefined;
  }
  if (submissionLoopId !== undefined) {
    system.clearRun(submissionLoopId);
    submissionLoopId = undefined;
  }
}

function notifyMilestones(remainingTicks) {
  const remainingSec = Math.ceil(remainingTicks / TICKS_PER_SECOND);

  for (const sec of MILESTONE_SECONDS) {
    if (remainingSec > sec || announcedMilestones.has(sec)) continue;

    announcedMilestones.add(sec);

    if (sec === 60) {
      broadcast("§c§l【ゲート閉鎖まで残り1分！】");
    } else if (sec === 30) {
      broadcast("§c§l【残り30秒！】");
    } else if (sec === 10) {
      broadcast("§e§l【残り10秒！】");
    }
  }
}

function tickGameTimer() {
  if (gameState !== "running") return;

  const now = system.currentTick;
  const remaining = gameEndTick - now;

  if (remaining <= 0) {
    finishGame();
    return;
  }

  notifyMilestones(remaining);

  if (now >= nextTimeNotifyTick) {
    broadcast(`§bゲート開放時間 残り: §f${formatTimeRemaining(remaining)}`);
    nextTimeNotifyTick = now + TIME_NOTIFY_INTERVAL_TICKS;
  }
}

// ---------------------------------------------------------------------------
// ゲームフロー
// ---------------------------------------------------------------------------

function finishGame() {
  if (gameState === "finished") return;

  gameState = "finished";
  stopGameLoops();
  clearSpawnedHakoinu();

  const players = world.getPlayers();
  if (players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }

  broadcast("§6ゲート閉鎖！ハコイヌたちの帰還結果を発表します！");
  showRanking();
  logInfo("gate closed, game finished");
}

function teleportPlayersToBoxGate() {
  const gate = CONFIG.BOX_GATE;
  const chest = getActiveSubmissionChestPos();
  const location = {
    x: (chest?.x ?? gate.x) + 0.5,
    y: (chest ? chest.y + 1 : gate.y) + CONFIG.GATE_SUMMON_OFFSET_Y,
    z: (chest?.z ?? gate.z) + 0.5,
  };

  for (const player of world.getPlayers()) {
    try {
      player.teleport(location, {
        dimension: player.dimension,
        rotation: player.getRotation(),
      });
    } catch (error) {
      logWarn(`teleport to gathering point failed for ${player.name}: ${error}`);
    }
  }

  if (chest) {
    broadcast(
      `§b全員を納品チェスト付近 (${chest.x}, ${chest.y}, ${chest.z}) に招集しました！`
    );
  } else {
    broadcast(
      `§b全員をボックスゲート (${gate.x}, ${gate.y}, ${gate.z}) に招集しました！`
    );
  }
  logInfo(`teleported ${world.getPlayers().length} player(s) to gathering point`);
}

function startGame(initiator) {
  if (gameState === "running") {
    const msg = `§cすでにゲート開放中です。${CONFIG.CHAT_PREFIX} stop で閉鎖できます。`;
    broadcast(msg);
    initiator?.sendMessage(msg);
    logWarn("Start command ignored because game is already running");
    return;
  }

  stopGameLoops();
  resetAllScores();
  resetTimerState();

  gameState = "running";
  gameEndTick = system.currentTick + GATE_OPEN_TICKS;
  nextTimeNotifyTick = system.currentTick + TIME_NOTIFY_INTERVAL_TICKS;

  broadcast(
    "§aゲート起動！現世に迷い込んだハコイヌたちを、ボックスワールドへ帰してあげよう！"
  );
  broadcast(
    `§fゲート開放時間: ${CONFIG.GATE_OPEN_MINUTES}分 | 骨で捕獲 → 納品チェストへ`
  );
  broadcast(
    `§7ハコイヌ以外を納品すると §c${CONFIG.POINTS_WRONG_ANIMAL}pt§7 ペナルティ`
  );
  broadcast(
    `§7納品チェスト: 起動時に Y${CONFIG.BOX_GATE.y} 付近へ **1つだけ** 自動設置（周囲の既存チェストは撤去）`
  );
  broadcast(
    `§7集合エリア: (${CONFIG.BOX_GATE.x}, ${CONFIG.BOX_GATE.y}, ${CONFIG.BOX_GATE.z}) 半径${CONFIG.BOX_GATE.radius}`
  );

  prepareRoundStart();
  teleportPlayersToBoxGate();

  gameLoopId = system.runInterval(tickGameTimer, TICKS_PER_SECOND);
  submissionLoopId = system.runInterval(() => {
    if (gameState !== "running") return;
    const container = getSubmissionChestContainer();
    if (!container || !hasCaptureItemsInContainer(container)) return;
    if (!lastSubmissionPlayer?.isValid) return;
    if (system.currentTick - lastSubmissionTick > SUBMISSION_CREDIT_WINDOW_TICKS) {
      return;
    }
    processSubmissionChest(lastSubmissionPlayer);
  }, TICKS_PER_SECOND);

  initiator?.sendMessage("§a[ROBW] ゲートを起動しました！");
  logInfo("Game started");
}

function stopGame() {
  if (gameState !== "running") {
    broadcast("§cゲートは開放されていません。");
    return;
  }
  finishGame();
  logInfo("Game stopped manually");
}

function resetGame() {
  stopGameLoops();
  gameState = "waiting";
  resetTimerState();
  resetAllScores();
  clearSpawnedHakoinu();
  const players = world.getPlayers();
  if (players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }
  broadcast(`§eリセット完了。${CONFIG.CHAT_PREFIX} start でゲートを起動できます。`);
  logInfo("Game reset");
}

// ---------------------------------------------------------------------------
// チャットコマンド
// ---------------------------------------------------------------------------

function normalizeChatMessage(message) {
  return message.trim().replace(/！/g, "!");
}

function runRobwSubcommand(sub, player) {
  switch (sub) {
    case "start":
      startGame(player);
      break;
    case "stop":
      stopGame();
      break;
    case "reset":
      resetGame();
      break;
    case "ranking":
      showRanking("§6Return of BoxWorld 帰還ランキング");
      break;
    default:
      if (player) {
        player.sendMessage(
          `§7使用法: ${CONFIG.CHAT_PREFIX} start | stop | reset | ranking`
        );
      }
      break;
  }
}

/** @type {Map<string, { message: string, tick: number }>} */
const recentChatCommands = new Map();

function shouldProcessChatCommand(playerId, message) {
  const now = system.currentTick;
  const prev = recentChatCommands.get(playerId);
  if (prev && prev.message === message && now - prev.tick < 20) {
    return false;
  }
  recentChatCommands.set(playerId, { message, tick: now });
  return true;
}

function handleChatCommand(player, message) {
  const normalized = normalizeChatMessage(message);
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts[0].toLowerCase() !== "!robw") return false;

  runRobwSubcommand(parts[1].toLowerCase(), player);
  return true;
}

function stripFormatting(text) {
  return text.replace(/§./g, "").trim();
}

function resolveWandSubcommand(itemStack) {
  if (!itemStack || itemStack.typeId !== CONFIG.WAND_ITEM) return undefined;

  const raw = itemStack.nameTag ?? "";
  const name = stripFormatting(raw);
  if (!name) return undefined;

  const exact = CONFIG.WAND_NAMES[name];
  if (exact) return exact;

  const lower = name.toLowerCase();
  for (const [wandName, sub] of Object.entries(CONFIG.WAND_NAMES)) {
    if (wandName.toLowerCase() === lower) return sub;
  }

  const prefixMatch = lower.match(/^robw[:：](start|stop|reset|ranking)$/);
  return prefixMatch?.[1];
}

function getHeldItemStack(player) {
  const inventory = player.getComponent("inventory");
  const container = inventory?.container;
  if (!container) return undefined;

  let slot = 0;
  if (inventory && typeof inventory.selectedSlot === "number") {
    slot = inventory.selectedSlot;
  } else if (typeof player.selectedSlotIndex === "number") {
    slot = player.selectedSlotIndex;
  }

  return container.getItem(slot);
}

/** @type {Map<string, number>} */
const recentWandUseTick = new Map();

function shouldProcessWandUse(playerId) {
  const now = system.currentTick;
  const last = recentWandUseTick.get(playerId) ?? 0;
  if (now - last < 10) return false;
  recentWandUseTick.set(playerId, now);
  return true;
}

function tryRobwWand(player, itemStack) {
  if (!shouldProcessWandUse(player.id)) return false;

  const held = itemStack ?? getHeldItemStack(player);
  const sub = resolveWandSubcommand(held);
  if (!sub) return false;

  runRobwSubcommand(sub, player);
  player.sendMessage(`§7[ROBW] ${sub} を実行しました`);
  return true;
}

function playerHasRobwWand(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return false;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (resolveWandSubcommand(item)) return true;
  }
  return false;
}

function giveStarterWand(player) {
  if (playerHasRobwWand(player)) return;

  const stack = new ItemStack(CONFIG.WAND_ITEM, 1);
  stack.nameTag = "ROBW:start";

  const container = player.getComponent("inventory")?.container;
  if (container) {
    const leftover = container.addItem(stack);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }
  } else {
    player.dimension.spawnItem(stack, player.location);
  }

  player.sendMessage(
    "§a[ROBW] 起動用の時計を渡しました。§f空中§aで右クリック（ブロックを狙わない）"
  );
}

function handleScriptEvent(eventId, sourceEntity) {
  const id = eventId.toLowerCase();
  const match =
    id.match(/(?:^|[:_/])(start|stop|reset|ranking)$/) ??
    id.match(/^robw[:_](start|stop|reset|ranking)$/);
  if (!match) {
    logWarn(`unknown scriptevent id: ${eventId}`);
    return;
  }

  const player =
    sourceEntity && typeof sourceEntity.sendMessage === "function"
      ? sourceEntity
      : undefined;
  runRobwSubcommand(match[1], player);
}

function onItemUsed(player, itemStack) {
  if (!player) return;

  if (tryRobwWand(player, itemStack)) return;

  if (itemStack?.typeId === CONFIG.PROTECT_ITEM) {
    tryProtectHakoinu(player);
    return;
  }

  const held = getHeldItemStack(player);
  if (held?.typeId === CONFIG.WAND_ITEM && held.nameTag) {
    player.sendMessage(
      `§7[ROBW] 時計の名前を確認: §f"${stripFormatting(held.nameTag)}"`
    );
  }
}

// ---------------------------------------------------------------------------
// イベント登録
// ---------------------------------------------------------------------------

let gameEventsRegistered = false;
let chatHandlerMode = "none";

function registerChatHandlers() {
  const onChat = (event, cancelChat) => {
    const message = normalizeChatMessage(event.message);
    if (!message.toLowerCase().startsWith("!robw")) return;

    if (cancelChat) event.cancel = true;

    const sender = event.sender;
    system.run(() => {
      if (!shouldProcessChatCommand(sender.id, message)) return;
      if (!handleChatCommand(sender, message)) {
        sender.sendMessage("§c[ROBW] コマンドを認識できませんでした");
      }
    });
  };

  const before = world.beforeEvents?.chatSend;
  const after = world.afterEvents?.chatSend;

  if (before) {
    before.subscribe((event) => onChat(event, true));
    logInfo("chat handler: beforeEvents.chatSend");
  }
  if (after) {
    after.subscribe((event) => onChat(event, false));
    logInfo("chat handler: afterEvents.chatSend");
  }

  if (before && after) {
    chatHandlerMode = "before+after";
  } else if (before) {
    chatHandlerMode = "before";
  } else if (after) {
    chatHandlerMode = "after";
  } else {
    chatHandlerMode = "none";
    logWarn("chat handlers unavailable — use wand, /function, or /scriptevent");
  }
}

function registerSubmissionChestHandler() {
  const interact = world.afterEvents?.playerInteractWithBlock;
  if (!interact) {
    logWarn("playerInteractWithBlock not available for submission chest");
    return;
  }

  interact.subscribe((event) => {
    if (!isSubmissionChestBlock(event.block)) return;
    const player = event.player;
    if (!player) return;

    noteSubmissionChestUse(player);
    for (const delay of SUBMISSION_PROCESS_DELAYS) {
      system.runTimeout(() => processSubmissionChest(player), delay);
    }
  });
  logInfo("submission chest handler: playerInteractWithBlock");
}

function registerItemUseHandlers() {
  const runUse = (player, itemStack) => {
    system.run(() => onItemUsed(player, itemStack));
  };

  const beforeUse = world.beforeEvents?.itemUse;
  if (beforeUse) {
    beforeUse.subscribe((event) => {
      const player = event.source;
      const itemStack = event.itemStack ?? getHeldItemStack(player);
      if (!player) return;

      const sub = resolveWandSubcommand(itemStack ?? getHeldItemStack(player));
      if (sub) {
        event.cancel = true;
        runUse(player, itemStack);
      }
    });
    logInfo("item handler: beforeEvents.itemUse");
  }

  const afterUse = world.afterEvents?.itemUse;
  if (afterUse) {
    afterUse.subscribe((event) => {
      const player = event.source;
      if (!player) return;
      runUse(player, event.itemStack);
    });
    logInfo("item handler: afterEvents.itemUse");
  }

  if (!beforeUse && !afterUse) {
    logWarn("itemUse events not available");
  }
}

function registerGameEvents() {
  if (gameEventsRegistered) return;

  try {
    registerChatHandlers();
    registerItemUseHandlers();
    registerSubmissionChestHandler();

    if (world.afterEvents?.scriptEventReceive) {
      world.afterEvents.scriptEventReceive.subscribe((event) => {
        logInfo(`scriptevent received: ${event.id}`);
        system.run(() => {
          handleScriptEvent(event.id, event.sourceEntity);
        });
      });
      logInfo("registered /scriptevent robw:* handler");
    } else {
      logWarn("scriptEventReceive not available");
    }

    gameEventsRegistered = true;
  } catch (error) {
    logError(`registerGameEvents failed: ${error}`);
    throw error;
  }
}

function getRobwHelpLines() {
  const lines = [
    "§a[ROBW] 準備OK",
    "§7① 時計 §fROBW:start§7 を空中右クリック",
    "§7② 骨で捕獲 → 自動設置の納品チェストに入れる",
    "§7③ §f/function robw/start §7（チートON）",
    "§7④ §f/scriptevent robw:start",
  ];
  if (chatHandlerMode === "none") {
    lines.push("§c※ !robw は Beta APIs 実験的機能が必要です");
  } else {
    lines.push(`§7⑤ チャット: §f!robw start §7(${chatHandlerMode})`);
  }
  return lines;
}

let addonReadyDone = false;

function onAddonReady() {
  if (addonReadyDone) return;
  addonReadyDone = true;

  try {
    getObjective();
    registerGameEvents();
    logInfo("Return of BoxWorld addon loaded (state: waiting)");
    logInfo(
      `box gate: (${CONFIG.BOX_GATE.x}, ${CONFIG.BOX_GATE.y}, ${CONFIG.BOX_GATE.z}) r=${CONFIG.BOX_GATE.radius}`
    );
    for (const line of getRobwHelpLines()) {
      broadcast(line);
    }
    for (const player of world.getPlayers()) {
      giveStarterWand(player);
    }
  } catch (error) {
    addonReadyDone = false;
    logError(`startup failed: ${error}`);
  }
}

function scheduleAddonReady() {
  system.run(() => onAddonReady());
}

// worldLoad はスクリプトより先に発火することがあるため、即時実行も行う
scheduleAddonReady();
system.runTimeout(scheduleAddonReady, 40);

if (world.afterEvents?.worldLoad) {
  world.afterEvents.worldLoad.subscribe(() => scheduleAddonReady());
}

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  scheduleAddonReady();
  system.run(() => {
    const player = event.player;
    if (!player) return;
    for (const line of getRobwHelpLines()) {
      player.sendMessage(line);
    }
    giveStarterWand(player);
  });
});
