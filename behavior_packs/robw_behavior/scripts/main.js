/**
 * リターン・オブ・ボックスワールド (Return of BoxWorld) — MVP
 * Minecraft Bedrock Edition Script API
 */

import { world, system, ItemStack } from "@minecraft/server";

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
  /** ボックスゲート（ワールド座標） */
  BOX_GATE: {
    x: 0,
    y: 64,
    z: 0,
    radius: 3,
  },
  /** 保護用アイテム（骨） */
  PROTECT_ITEM: "minecraft:bone",
  /** 帰還ボックスとして扱うアイテム */
  RETURN_BOX_ITEM: "minecraft:paper",
  RETURN_BOX_NAME: "帰還ボックス",
  /** ハコイヌ（MVP はオオカミ代用） */
  HAKOINU_ENTITY_TYPES: ["minecraft:wolf"],
  /** スコアボード objective ID */
  SCORE_OBJECTIVE: "return_point",
  /** 1 帰還ボックスあたりの帰還ポイント */
  POINTS_PER_BOX: 1,
  /** チャットコマンド接頭辞 */
  CHAT_PREFIX: "!robw",
};

/** 目立つ残り時間通知（秒） */
const MILESTONE_SECONDS = [60, 30, 10];

const TICKS_PER_SECOND = 20;
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
let returnLoopId = undefined;

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

function createReturnBoxStack(amount = 1) {
  const stack = new ItemStack(CONFIG.RETURN_BOX_ITEM, amount);
  stack.nameTag = CONFIG.RETURN_BOX_NAME;
  return stack;
}

function isReturnBoxItem(itemStack) {
  if (!itemStack || itemStack.typeId !== CONFIG.RETURN_BOX_ITEM) {
    return false;
  }
  const tag = itemStack.nameTag;
  return !tag || tag === CONFIG.RETURN_BOX_NAME;
}

function countReturnBoxesInInventory(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  let count = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (isReturnBoxItem(item)) {
      count += item.amount;
    }
  }
  return count;
}

function removeReturnBoxesFromInventory(player, amount) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  let remaining = amount;
  for (let slot = 0; slot < container.size && remaining > 0; slot++) {
    const item = container.getItem(slot);
    if (!isReturnBoxItem(item)) continue;

    const take = Math.min(item.amount, remaining);
    remaining -= take;

    if (item.amount - take <= 0) {
      container.setItem(slot, undefined);
    } else {
      container.setItem(slot, createReturnBoxStack(item.amount - take));
    }
  }
  return amount - remaining;
}

function giveReturnBox(player, amount = 1) {
  const stack = createReturnBoxStack(amount);
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

function isInBoxGate(location) {
  const gate = CONFIG.BOX_GATE;
  return (
    distanceSq(location.x, location.y, location.z, gate.x, gate.y, gate.z) <=
    gate.radius * gate.radius
  );
}

function findNearestHakoinu(player) {
  const { location, dimension } = player;
  const entities = dimension.getEntities({
    location,
    maxDistance: CONFIG.PROTECTION_RADIUS,
    type: CONFIG.HAKOINU_ENTITY_TYPES[0],
  });

  let nearest = undefined;
  let nearestDistSq = CONFIG.PROTECTION_RADIUS * CONFIG.PROTECTION_RADIUS;

  for (const entity of entities) {
    if (!CONFIG.HAKOINU_ENTITY_TYPES.includes(entity.typeId)) continue;
    if (!entity.isValid) continue;

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

  const hakoinu = findNearestHakoinu(player);
  if (!hakoinu) {
    player.sendMessage("§7近くにハコイヌがいません。");
    return;
  }

  const entityId = hakoinu.id;
  hakoinu.remove();
  giveReturnBox(player, 1);

  broadcast(
    `§a${player.name}§fがハコイヌを帰還ボックスに保護しました！`
  );
  broadcast("§7迷子のハコイヌが帰還準備に入りました！");
  logInfo(`hakoinu protected by ${player.name} (entity ${entityId})`);
}

// ---------------------------------------------------------------------------
// ボックスゲートでの帰還
// ---------------------------------------------------------------------------

function processReturns() {
  for (const player of world.getPlayers()) {
    if (!isInBoxGate(player.location)) continue;

    const boxCount = countReturnBoxesInInventory(player);
    if (boxCount <= 0) continue;

    const returned = removeReturnBoxesFromInventory(player, boxCount);
    if (returned <= 0) continue;

    const points = returned * CONFIG.POINTS_PER_BOX;
    const total = addReturnPoints(player, points);

    if (returned === 1) {
      broadcast(
        `§6${player.name}§fがハコイヌをボックスワールドへ帰還させました！ §a+${points}pt §7(合計 ${total}pt)`
      );
    } else {
      broadcast(
        `§6${player.name}§fが帰還ボックスを${returned}個届けました！ §a+${points}pt §7(合計 ${total}pt)`
      );
    }
    logInfo(`${player.name} returned ${returned} box(es), +${points} pts`);
  }
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
  if (returnLoopId !== undefined) {
    system.clearRun(returnLoopId);
    returnLoopId = undefined;
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

  broadcast("§6ゲート閉鎖！ハコイヌたちの帰還結果を発表します！");
  showRanking();
  logInfo("gate closed, game finished");
}

function startGame() {
  if (gameState === "running") {
    broadcast(`§cすでにゲート開放中です。${CONFIG.CHAT_PREFIX} stop で閉鎖できます。`);
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
    `§fゲート開放時間: ${CONFIG.GATE_OPEN_MINUTES}分 | 骨でハコイヌを保護 → 帰還ボックスをボックスゲートへ`
  );
  broadcast(
    `§7ボックスゲート: (${CONFIG.BOX_GATE.x}, ${CONFIG.BOX_GATE.y}, ${CONFIG.BOX_GATE.z}) 半径${CONFIG.BOX_GATE.radius}`
  );

  gameLoopId = system.runInterval(tickGameTimer, TICKS_PER_SECOND);
  returnLoopId = system.runInterval(() => {
    if (gameState !== "running") return;
    processReturns();
  }, TICKS_PER_SECOND);

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
  broadcast(`§eリセット完了。${CONFIG.CHAT_PREFIX} start でゲートを起動できます。`);
  logInfo("Game reset");
}

// ---------------------------------------------------------------------------
// チャットコマンド
// ---------------------------------------------------------------------------

function handleChatCommand(player, message) {
  const parts = message.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] !== CONFIG.CHAT_PREFIX) return false;

  const sub = parts[1].toLowerCase();

  switch (sub) {
    case "start":
      startGame();
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
      player.sendMessage(
        `§7使用法: ${CONFIG.CHAT_PREFIX} start | stop | reset | ranking`
      );
      break;
  }

  return true;
}

// ---------------------------------------------------------------------------
// イベント登録
// ---------------------------------------------------------------------------

world.beforeEvents.chatSend.subscribe((event) => {
  const message = event.message.trim();
  if (!message.startsWith(CONFIG.CHAT_PREFIX)) return;

  event.cancel = true;
  system.run(() => {
    handleChatCommand(event.sender, message);
  });
});

world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (!player || itemStack?.typeId !== CONFIG.PROTECT_ITEM) return;

  system.run(() => {
    tryProtectHakoinu(player);
  });
});

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

system.run(() => {
  getObjective();
  logInfo("Return of BoxWorld addon loaded (state: waiting)");
  logInfo(
    `box gate: (${CONFIG.BOX_GATE.x}, ${CONFIG.BOX_GATE.y}, ${CONFIG.BOX_GATE.z}) r=${CONFIG.BOX_GATE.radius}`
  );
});
