/**
 * リターン・オブ・ボックスワールド (Return of BoxWorld) — MVP
 * Minecraft Bedrock Edition Script API
 */

import { world, system, ItemStack, WeatherType } from "@minecraft/server";

console.warn("[ROBW] main.js loaded");

// ---------------------------------------------------------------------------
// 設定（BOX_GATE は未起動時のフォールバック。通常は start したプレイヤー位置が中心）
// ---------------------------------------------------------------------------

const CONFIG = {
  /** ゲート開放時間（分） */
  GATE_OPEN_MINUTES: 5,
  /** 残り時間の定期通知間隔（秒） */
  TIME_NOTIFY_INTERVAL_SECONDS: 60,
  /** 帰還ボックス化: 骨を使える距離 */
  PROTECTION_RADIUS: 4,
  /** ラウンド中心の半径（ハコイヌスポーン等の目安。未起動時のフォールバック座標も兼用） */
  BOX_GATE: {
    x: 0,
    y: 86,
    z: 0,
    radius: 3,
  },
  /** 納品チェスト（未設置時のフォールバック座標） */
  SUBMISSION_CHEST: {
    x: 0,
    y: 85,
    z: 0,
  },
  /** start 時に足元付近の既存チェスト類を撤去する半径 */
  CHEST_CLEANUP_RADIUS: 3,
  /** 納品に使えるブロック */
  SUBMISSION_CHEST_BLOCK_TYPES: [
    "minecraft:chest",
    "minecraft:trapped_chest",
    "minecraft:barrel",
  ],
  /** ゲート起動時に招集する高さ（未使用・互換用） */
  GATE_SUMMON_OFFSET_Y: 0,
  /** ゲート起動時に全員へ配る骨の数 */
  START_GIVE_BONES: 12,
  /** ハコイヌを納品チェストに納品したとき、1 匹あたりもらえる骨の数 */
  BONES_PER_HAKOINU_DELIVERY: 4,
  /** ゲート起動時にスポーンするハコイヌ（オオカミ）の数 */
  START_SPAWN_HAKOINU: 100,
  /** ゲート起動時にランダムでスポーンする別種（ペナルティ動物）の数 */
  START_SPAWN_PENALTY_ANIMALS: 50,
  /** スポーン位置: 中心からの最小距離（ブロック） */
  SPAWN_MIN_DISTANCE: 4,
  /** スポーン位置: 中心からの最大距離（ブロック） */
  SPAWN_MAX_DISTANCE: 28,
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
  /** 昼・晴天を固定する */
  LOCK_DAYTIME: true,
  /** 固定する時刻（ゲーム刻。6000 = 真昼） */
  DAY_TIME_OF_DAY: 6000,
  /** 晴天を維持する長さ（tick） */
  WEATHER_CLEAR_DURATION_TICKS: 100000,
  /** start 時のカウントダウン演出（3・2・1） */
  START_COUNTDOWN_ENABLED: true,
  /** カウントダウン各表示の間隔（tick。20 = 1秒） */
  START_COUNTDOWN_STEP_TICKS: 20,
};

/** 目立つ残り時間通知（秒） */
const MILESTONE_SECONDS = [60, 30, 10];

const TICKS_PER_SECOND = 20;
const SUBMISSION_CREDIT_WINDOW_TICKS = 15 * TICKS_PER_SECOND;
const SUBMISSION_PROCESS_DELAYS = [5, 20, 40, 60, 100, 150];
const GATE_OPEN_TICKS = CONFIG.GATE_OPEN_MINUTES * 60 * TICKS_PER_SECOND;
const TIME_NOTIFY_INTERVAL_TICKS =
  CONFIG.TIME_NOTIFY_INTERVAL_SECONDS * TICKS_PER_SECOND;
const DAYTIME_LOCK_INTERVAL_TICKS = 200;
const LOCKED_DIMENSION_IDS = ["overworld", "nether", "the_end"];

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------

/** @type {number | undefined} */
let daylightLockLoopId = undefined;
/** @type {"waiting" | "countdown" | "running" | "finished"} */
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
/** @type {{ x: number, y: number, z: number, radius: number } | null} */
let activeRoundCenter = null;
/** カウントダウンキャンセル用（増やすと予約した start を無効化） */
let startCountdownGeneration = 0;

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
// 天候・時刻（昼固定）
// ---------------------------------------------------------------------------

function disableTimeAndWeatherCycles() {
  try {
    const rules = world.gameRules;
    if (!rules) return;
    if ("doDaylightCycle" in rules) rules.doDaylightCycle = false;
    if ("doDayLightCycle" in rules) rules.doDayLightCycle = false;
    if ("doWeatherCycle" in rules) rules.doWeatherCycle = false;
  } catch (error) {
    logWarn(`gameRules lock failed: ${error}`);
  }
}

function applyDaytimeLockToDimension(dimension) {
  const time = CONFIG.DAY_TIME_OF_DAY;
  const weatherTicks = CONFIG.WEATHER_CLEAR_DURATION_TICKS;

  if (typeof dimension.setTimeOfDay === "function") {
    dimension.setTimeOfDay(time);
  }

  if (typeof dimension.setWeather === "function") {
    dimension.setWeather(WeatherType.Clear, weatherTicks);
  } else if (typeof dimension.runCommand === "function") {
    const seconds = Math.max(1, Math.floor(weatherTicks / TICKS_PER_SECOND));
    dimension.runCommand(`weather clear ${seconds}`);
    dimension.runCommand("time set noon");
  }
}

function applyDaytimeLock() {
  if (!CONFIG.LOCK_DAYTIME) return;

  disableTimeAndWeatherCycles();

  try {
    if (typeof world.setTimeOfDay === "function") {
      world.setTimeOfDay(CONFIG.DAY_TIME_OF_DAY);
    }
  } catch (error) {
    logWarn(`world.setTimeOfDay failed: ${error}`);
  }

  for (const dimId of LOCKED_DIMENSION_IDS) {
    try {
      applyDaytimeLockToDimension(world.getDimension(dimId));
    } catch (error) {
      logWarn(`daytime lock failed for ${dimId}: ${error}`);
    }
  }
}

function startDaytimeLockLoop() {
  if (!CONFIG.LOCK_DAYTIME) return;
  applyDaytimeLock();
  if (daylightLockLoopId !== undefined) return;
  daylightLockLoopId = system.runInterval(
    applyDaytimeLock,
    DAYTIME_LOCK_INTERVAL_TICKS
  );
  logInfo("daytime lock enabled (clear weather, fixed noon)");
}

// ---------------------------------------------------------------------------
// ゲーム開始カウントダウン演出
// ---------------------------------------------------------------------------

const START_COUNTDOWN_SEQUENCE = [
  {
    title: "§6§lRETURN OF BOXWORLD",
    subtitle: "§fゲート起動準備…",
    actionBar: "§6§oReturn of BoxWorld",
    sound: null,
    pitch: 1,
  },
  {
    title: "§e§l3",
    subtitle: "§7まもなく開始",
    actionBar: "§e§l▶ 3",
    sound: "note.pling",
    pitch: 0.75,
  },
  {
    title: "§6§l2",
    subtitle: "§7まもなく開始",
    actionBar: "§6§l▶ 2",
    sound: "note.pling",
    pitch: 1,
  },
  {
    title: "§c§l1",
    subtitle: "§7まもなく開始",
    actionBar: "§c§l▶ 1",
    sound: "note.pling",
    pitch: 1.25,
  },
  {
    title: "§a§lSTART!",
    subtitle: "§fハコイヌを帰還させよう！",
    actionBar: "§a§lゲート開放！",
    sound: "random.levelup",
    pitch: 1,
  },
];

function cancelStartCountdown() {
  startCountdownGeneration++;
  if (gameState === "countdown") {
    gameState = "waiting";
    activeRoundCenter = null;
  }
}

function showCountdownPresentation(step) {
  const titleOpts = {
    fadeInDuration: 2,
    stayDuration: Math.max(8, CONFIG.START_COUNTDOWN_STEP_TICKS - 4),
    fadeOutDuration: 4,
  };

  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;

    try {
      const display = player.onScreenDisplay;
      if (display) {
        try {
          display.setTitle(step.title, titleOpts);
        } catch {
          display.setTitle(step.title);
        }
        if (step.subtitle) {
          try {
            display.setSubtitle(step.subtitle);
          } catch {
            // ignore
          }
        }
        if (step.actionBar) {
          display.setActionBar(step.actionBar);
        }
      }
    } catch {
      // ignore
    }

    if (step.sound) {
      try {
        player.dimension.playSound(step.sound, player.location, {
          volume: 1,
          pitch: step.pitch ?? 1,
        });
      } catch {
        // ignore
      }
    }
  }
}

function spawnCountdownBurst(dimension, center) {
  if (!center) return;
  const loc = { x: center.x + 0.5, y: center.y + 1, z: center.z + 0.5 };
  const particles = [
    "minecraft:totem_particle",
    "minecraft:villager_happy",
  ];
  for (const id of particles) {
    try {
      dimension.spawnParticle(id, loc);
    } catch {
      // ignore
    }
  }
  try {
    dimension.playSound("random.explode", loc, { volume: 0.35, pitch: 1.2 });
  } catch {
    // ignore
  }
}

function runStartCountdown(host, validation, onComplete) {
  if (!CONFIG.START_COUNTDOWN_ENABLED) {
    onComplete();
    return;
  }

  const generation = ++startCountdownGeneration;
  const stepTicks = CONFIG.START_COUNTDOWN_STEP_TICKS;
  const center = validation.center;

  gameState = "countdown";
  broadcast(`§6${host.name}§fがゲートを起動します…`);

  for (let i = 0; i < START_COUNTDOWN_SEQUENCE.length; i++) {
    const step = START_COUNTDOWN_SEQUENCE[i];
    system.runTimeout(() => {
      if (generation !== startCountdownGeneration || gameState !== "countdown") {
        return;
      }
      showCountdownPresentation(step);
      if (i === START_COUNTDOWN_SEQUENCE.length - 1) {
        spawnCountdownBurst(validation.dimension, center);
      }
      if (i >= 1 && i <= 3) {
        broadcast(`§e§l  ${4 - i}  `);
      } else if (i === START_COUNTDOWN_SEQUENCE.length - 1) {
        broadcast("§a§l━━━━━ START! ━━━━━");
      }
    }, i * stepTicks);
  }

  const totalTicks = START_COUNTDOWN_SEQUENCE.length * stepTicks;
  system.runTimeout(() => {
    if (generation !== startCountdownGeneration || gameState !== "countdown") {
      return;
    }
    onComplete();
  }, totalTicks);
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
let spawnedRoundEntities = [];

function clearSpawnedRoundEntities() {
  for (const entity of spawnedRoundEntities) {
    try {
      if (entity?.isValid) entity.remove();
    } catch {
      // 既に消えている場合は無視
    }
  }
  spawnedRoundEntities = [];
}

/** @deprecated 互換エイリアス */
function clearSpawnedHakoinu() {
  clearSpawnedRoundEntities();
}

function pickRandomPenaltyAnimalType() {
  const types = CONFIG.PENALTY_ANIMAL_TYPES;
  return types[Math.floor(Math.random() * types.length)];
}

function randomSpawnLocationNearGate(gate) {
  const angle = Math.random() * Math.PI * 2;
  const minD = CONFIG.SPAWN_MIN_DISTANCE;
  const maxD = CONFIG.SPAWN_MAX_DISTANCE;
  const dist = minD + Math.random() * (maxD - minD);
  return {
    x: gate.x + 0.5 + Math.cos(angle) * dist,
    y: gate.y + CONFIG.GATE_SUMMON_OFFSET_Y,
    z: gate.z + 0.5 + Math.sin(angle) * dist,
  };
}

function trySpawnRoundEntity(dimension, entityType, location) {
  try {
    const entity = dimension.spawnEntity(entityType, location);
    spawnedRoundEntities.push(entity);
    return true;
  } catch (error) {
    logWarn(`spawn ${entityType} failed: ${error}`);
    return false;
  }
}

function spawnRoundAnimalsAtGate(dimension) {
  const gate = getActiveBoxGate();
  const hakoinuType = CONFIG.HAKOINU_ENTITY_TYPES[0];
  let hakoinuSpawned = 0;
  let penaltySpawned = 0;

  for (let i = 0; i < CONFIG.START_SPAWN_HAKOINU; i++) {
    if (
      trySpawnRoundEntity(
        dimension,
        hakoinuType,
        randomSpawnLocationNearGate(gate)
      )
    ) {
      hakoinuSpawned++;
    }
  }

  for (let i = 0; i < CONFIG.START_SPAWN_PENALTY_ANIMALS; i++) {
    const entityType = pickRandomPenaltyAnimalType();
    if (
      trySpawnRoundEntity(
        dimension,
        entityType,
        randomSpawnLocationNearGate(gate)
      )
    ) {
      penaltySpawned++;
    }
  }

  logInfo(
    `spawned hakoinu=${hakoinuSpawned}/${CONFIG.START_SPAWN_HAKOINU} penalty=${penaltySpawned}/${CONFIG.START_SPAWN_PENALTY_ANIMALS} near round center`
  );
  return { hakoinuSpawned, penaltySpawned };
}

/** @deprecated 互換エイリアス */
function spawnHakoinuAtGate(dimension) {
  spawnRoundAnimalsAtGate(dimension);
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

function giveBones(player, amount) {
  if (amount <= 0) return 0;

  const container = player.getComponent("inventory")?.container;
  let remaining = amount;

  while (remaining > 0) {
    const batch = Math.min(remaining, 64);
    const stack = new ItemStack(CONFIG.PROTECT_ITEM, batch);
    remaining -= batch;

    if (!container) {
      player.dimension.spawnItem(stack, player.location);
      continue;
    }

    const leftover = container.addItem(stack);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }
  }

  return amount;
}

function getActiveBoxGate() {
  return activeRoundCenter ?? CONFIG.BOX_GATE;
}

function resolveStartHost(initiator) {
  if (initiator?.isValid) return initiator;
  const players = world.getPlayers();
  return players.length > 0 ? players[0] : null;
}

function isPlayerFlying(player) {
  if (player.isFlying === true) return true;
  if (player.isGliding === true) return true;
  return false;
}

/** @returns {{ ok: true, center: { x: number, y: number, z: number, radius: number }, chestSpot: { x: number, y: number, z: number, footY: number }, dimension: import("@minecraft/server").Dimension } | { ok: false, message: string, reason: string }} */
function validateRoundStartAtPlayer(player) {
  const loc = player.location;
  const dimension = player.dimension;
  const bx = Math.floor(loc.x);
  const bz = Math.floor(loc.z);

  if (isPlayerFlying(player)) {
    return {
      ok: false,
      message: "§c飛行中はゲートを起動できません。地面に立って start してください。",
      reason: "flying",
    };
  }

  if (typeof player.isOnGround === "boolean" && !player.isOnGround) {
    return {
      ok: false,
      message: "§c地面に立った状態で start してください。",
      reason: "not_on_ground",
    };
  }

  const belowY = Math.floor(loc.y - 0.01);
  const ground = dimension.getBlock({ x: bx, y: belowY, z: bz });
  if (!isSolidGroundBlock(ground)) {
    return {
      ok: false,
      message: "§c足元に地面がありません。地面の上で start してください。",
      reason: "no_ground",
    };
  }

  const chestY = belowY + 1;
  const heightAboveGround = loc.y - chestY;
  if (heightAboveGround < -0.2 || heightAboveGround > 1.25) {
    return {
      ok: false,
      message:
        "§c地面の上で start してください。（空中や足場の下では開始できません）",
      reason: "off_ground",
    };
  }

  const atFeet = dimension.getBlock({ x: bx, y: chestY, z: bz });
  if (!atFeet?.isAir) {
    return {
      ok: false,
      message: "§c足元にブロックがあるためチェストを設置できません。",
      reason: "blocked_feet",
    };
  }

  const center = {
    x: bx,
    y: chestY,
    z: bz,
    radius: CONFIG.BOX_GATE.radius,
  };

  return {
    ok: true,
    center,
    chestSpot: { x: bx, y: chestY, z: bz, footY: belowY },
    dimension,
  };
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
    logInfo(`removed ${removed} extra chest(s) near submission spot`);
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

function placeSubmissionChest(dimension, spot) {
  placedChestRestore = null;
  activeSubmissionChestPos = null;

  removeExtraChestsInArea(
    dimension,
    spot.x,
    spot.z,
    CONFIG.CHEST_CLEANUP_RADIUS,
    spot.footY - 1,
    spot.footY + 2
  );

  const before = dimension.getBlock({ x: spot.x, y: spot.y, z: spot.z });
  if (!before?.isAir) {
    logWarn(
      `submission chest blocked at (${spot.x}, ${spot.y}, ${spot.z}) type=${before?.typeId}`
    );
    return false;
  }

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
    `§b納品チェストを足元に設置しました: (${spot.x}, ${spot.y}, ${spot.z})`
  );
  logInfo(
    `submission chest placed at (${spot.x}, ${spot.y}, ${spot.z}) footY=${spot.footY}`
  );
  return true;
}

/** @returns {boolean} */
function prepareRoundStart(validation) {
  const dimension = validation.dimension;

  clearSpawnedRoundEntities();
  if (!placeSubmissionChest(dimension, validation.chestSpot)) {
    return false;
  }
  const spawned = spawnRoundAnimalsAtGate(dimension);

  for (const player of world.getPlayers()) {
    giveStartKit(player);
  }

  broadcast(
    `§f骨を §7×${CONFIG.START_GIVE_BONES} §fにリセット、§fハコイヌ §7${spawned.hakoinuSpawned} 匹§7・§c別種 §7${spawned.penaltySpawned} 匹§fを出現させました！`
  );
  return true;
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
  const bonesEarned =
    returned.hakoinu * CONFIG.BONES_PER_HAKOINU_DELIVERY;
  if (bonesEarned > 0) {
    giveBones(player, bonesEarned);
  }
  announceDelivery(player, returned, points, total);
  player.sendMessage(
    `§7納品した毛皮 ${returned.hakoinu + returned.wrong} 枚を消費しました。`
  );
  if (bonesEarned > 0) {
    player.sendMessage(
      `§a納品ボーナス: 骨 ×${bonesEarned} §7（ハコイヌ 1 匹あたり ×${CONFIG.BONES_PER_HAKOINU_DELIVERY}）`
    );
  }
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
  activeRoundCenter = null;

  const players = world.getPlayers();
  if (players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }

  broadcast("§6ゲート閉鎖！ハコイヌたちの帰還結果を発表します！");
  showRanking();
  logInfo("gate closed, game finished");
}

function beginGameRound(host, validation) {
  gameState = "running";
  gameEndTick = system.currentTick + GATE_OPEN_TICKS;
  nextTimeNotifyTick = system.currentTick + TIME_NOTIFY_INTERVAL_TICKS;

  broadcast(
    "§aゲート起動！現世に迷い込んだハコイヌたちを、ボックスワールドへ帰してあげよう！"
  );
  broadcast(
    `§fゲート開放時間: ${CONFIG.GATE_OPEN_MINUTES}分 | 骨で捕獲 → 足元の納品チェストへ`
  );
  broadcast(
    `§7ハコイヌ以外を納品すると §c${CONFIG.POINTS_WRONG_ANIMAL}pt§7 ペナルティ`
  );
  broadcast(
    `§7開始地点: ${host.name} の位置 (${validation.center.x}, ${validation.center.y}, ${validation.center.z})`
  );

  if (!prepareRoundStart(validation)) {
    gameState = "waiting";
    activeRoundCenter = null;
    activeSubmissionChestPos = null;
    placedChestRestore = null;
    host.sendMessage("§c納品チェストを設置できませんでした。地面の上で start してください。");
    logWarn("start rolled back: chest placement failed");
    return;
  }

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

  host.sendMessage("§a[ROBW] ゲートを起動しました！");
  logInfo(
    `Game started at (${validation.center.x}, ${validation.center.y}, ${validation.center.z}) by ${host.name}`
  );
}

function startGame(initiator) {
  if (gameState === "running") {
    const msg = `§cすでにゲート開放中です。${CONFIG.CHAT_PREFIX} stop で閉鎖できます。`;
    broadcast(msg);
    initiator?.sendMessage(msg);
    logWarn("Start command ignored because game is already running");
    return;
  }

  if (gameState === "countdown") {
    const msg = "§cカウントダウン中です。しばらくお待ちください。";
    initiator?.sendMessage(msg);
    return;
  }

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないためゲートを起動できません。");
    return;
  }

  const validation = validateRoundStartAtPlayer(host);
  if (!validation.ok) {
    host.sendMessage(validation.message);
    logWarn(`start blocked for ${host.name}: ${validation.reason}`);
    return;
  }

  stopGameLoops();
  resetAllScores();
  resetTimerState();
  activeRoundCenter = validation.center;
  applyDaytimeLock();

  runStartCountdown(host, validation, () => {
    beginGameRound(host, validation);
  });
}

function stopGame() {
  if (gameState === "countdown") {
    cancelStartCountdown();
    broadcast("§cゲート起動をキャンセルしました。");
    logInfo("Start countdown cancelled");
    return;
  }
  if (gameState !== "running") {
    broadcast("§cゲートは開放されていません。");
    return;
  }
  finishGame();
  logInfo("Game stopped manually");
}

function resetGame() {
  cancelStartCountdown();
  stopGameLoops();
  gameState = "waiting";
  resetTimerState();
  resetAllScores();
  clearSpawnedHakoinu();
  activeRoundCenter = null;
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
    "§7① 地面に立って §fROBW:start§7（空中右クリック）→ 足元にチェスト",
    "§7② 骨で捕獲 → 納品チェストに入れる",
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
    startDaytimeLockLoop();
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
