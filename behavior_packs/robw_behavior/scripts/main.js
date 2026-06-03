/**
 * リターン・オブ・ボックスワールド (Return of BoxWorld) — MVP
 * Minecraft Bedrock Edition Script API
 */

import { world, system, ItemStack, WeatherType, DisplaySlotId } from "@minecraft/server";

import "./menu-ui.js";

console.warn("[ROBW] main.js loaded");

// ---------------------------------------------------------------------------
// ゲーム設定（CONFIG）
//
// 各項目の意味・おすすめ値は docs/config-reference.md を参照。
// (注) OS の環境変数ではなく、このオブジェクトの値を編集して調整します。
// ---------------------------------------------------------------------------

const CONFIG = {
  /** 1 ラウンドの長さ（分）。start から捕獲・納品できる時間 */
  GATE_OPEN_MINUTES: 5,
  /** 残り時間をチャットに出す間隔（秒） */
  TIME_NOTIFY_INTERVAL_SECONDS: 60,
  /** 10 秒あたりの全員チャット上限（左上オーバーレイの詰まり抑制） */
  UI_BROADCAST_MAX_PER_10_SECONDS: 4,
  /** 骨で捕獲できる動物までの距離（ブロック） */
  PROTECTION_RADIUS: 4,
  /** ラウンド中心のフォールバック（通常は start した人の位置が使われる） */
  BOX_GATE: {
    x: 0,
    y: 86,
    z: 0,
    radius: 3,
  },
  /** 納品チェストのフォールバック座標（通常は足元に自動設置） */
  SUBMISSION_CHEST: {
    x: 0,
    y: 85,
    z: 0,
  },
  /** start 時に、開始位置付近の既存チェスト類を撤去する半径（ブロック） */
  CHEST_CLEANUP_RADIUS: 12,
  /** start 時のチェスト撤去：足元（地面）から上下に探す高さ（ブロック） */
  CHEST_CLEANUP_VERTICAL_RANGE: 10,
  /** 落とし物（アイテムエンティティ）を消す半径。0 でスポーン範囲に合わせる */
  ROUND_ITEM_CLEANUP_RADIUS: 0,
  /** 撤去する落とし物エンティティの typeId */
  DROPPED_ITEM_ENTITY_TYPES: ["minecraft:item"],
  /** 撤去対象とする収納ブロック（通常は変更不要） */
  SUBMISSION_CHEST_BLOCK_TYPES: ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel"],
  /** 互換用（現在ほぼ未使用） */
  GATE_SUMMON_OFFSET_Y: 0,
  /** ラウンド開始時に全員へ渡す骨の数（所持分はいったん消してから配布） */
  START_GIVE_BONES: 12,
  /** ハコイヌ納品 1 枚あたりの骨ボーナス */
  BONES_PER_HAKOINU_DELIVERY: 2,
  /** 別種納品 1 枚あたりの骨ボーナス */
  BONES_PER_WRONG_ANIMAL_DELIVERY: 4,
  /** 捕獲 1 回で消費する骨の数 */
  BONES_PER_CAPTURE: 1,
  /** 出現するオオカミ（ハコイヌ）の匹数（5 分ラウンド向け。Switch 等は 70〜80 程度） */
  START_SPAWN_HAKOINU: 90,
  /** 出現する別種動物の匹数（PENALTY_ANIMAL_TYPES からランダム） */
  START_SPAWN_PENALTY_ANIMALS: 20,
  /** 1 匹あたりのスポーン試行回数（地形で失敗しやすいとき用） */
  SPAWN_ATTEMPTS_PER_ENTITY: 8,
  /** スポーン位置：中心（チェスト）からの最短距離。足元を空ける */
  SPAWN_MIN_DISTANCE: 6,
  /** スポーン位置：中心からの最長距離。狭いほど遭遇密度アップ（ブロック） */
  SPAWN_MAX_DISTANCE: 40,
  /** ラウンド中、捕獲などで減ったとき目標数（START_SPAWN_*）まで補充する */
  SPAWN_REPLENISH_ENABLED: true,
  /** 補充チェックの間隔（秒） */
  SPAWN_REPLENISH_INTERVAL_SECONDS: 4,
  /** 1 回のチェックで新規スポーンする上限（ハコイヌ＋別種の合計。負荷対策） */
  SPAWN_REPLENISH_MAX_PER_CHECK: 6,
  /** 補充・再出現をプレイヤー付近に寄せる（false ならゲート中心のみ） */
  SPAWN_NEAR_PLAYERS: true,
  /** プレイヤーからの最短距離（その場に被らない） */
  SPAWN_NEAR_PLAYER_MIN_DISTANCE: 8,
  /** プレイヤーからの最長距離（歩いてすぐ会える範囲） */
  SPAWN_NEAR_PLAYER_MAX_DISTANCE: 18,
  /** 各プレイヤーの周辺に最低キープしたい動物数（ハコイヌ＋別種） */
  SPAWN_MIN_NEAR_PLAYER: 4,
  /** 捕獲直後、そのプレイヤー付近に即スポーンする */
  SPAWN_ON_CAPTURE_ENABLED: true,
  /** 捕獲 1 回あたりに近くへ出すハコイヌの匹数 */
  SPAWN_ON_CAPTURE_COUNT: 1,
  /** 捕獲に使うアイテム ID */
  PROTECT_ITEM: "minecraft:bone",
  /** 捕獲アイテムの見た目（茶色の毛皮） */
  RETURN_BOX_ITEM: "minecraft:rabbit_hide",
  /** プレイヤーに見える名前（ハコイヌ／別種とも同じ表示） */
  RETURN_BOX_DISPLAY_NAME: "捕獲した毛皮",
  /** 正誤をスクリプトだけが持つ内部 ID（アイテムの動的プロパティ） */
  RETURN_BOX_KIND_PROPERTY: "robw:return_kind",
  /** 旧名タグ（互換用。新規捕獲では使わない） */
  RETURN_BOX_NAME: "捕獲したハコイヌ",
  WRONG_RETURN_BOX_NAME: "捕獲した別種",
  /** ハコイヌとして扱う Mob（MVP はオオカミ） */
  HAKOINU_ENTITY_TYPES: ["minecraft:wolf"],
  /** 別種としてスポーン／ペナルティ対象の Mob 一覧 */
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
  /** ハコイヌ毛皮 1 枚納品あたりの得点 */
  POINTS_PER_BOX: 1,
  /** 別種毛皮 1 枚納品あたりの減点（マイナスで書く） */
  POINTS_WRONG_ANIMAL: -2,
  /** 毛皮以外を納品チェストに入れたときの減点（1 個あたり・マイナスで書く） */
  POINTS_CHEST_JUNK_ITEM: -1,
  /** ラウンド中にハコイヌ（オオカミ）を倒したときの減点（加害プレイヤーへ） */
  POINTS_HAKOINU_KILL: -10,
  /** ラウンド中にハコイヌへ与えたダメージ 1 回あたりの減点 */
  POINTS_HAKOINU_HIT: -1,
  /** ラウンド中にプレイヤーが死亡したときの減点（マイナスで書く） */
  POINTS_PLAYER_DEATH: -10,
  /** スコアボードの objective ID */
  SCORE_OBJECTIVE: "return_point",
  /** チャットコマンドの接頭辞（例: !robw start） */
  CHAT_PREFIX: "!robw",
  /** 操作メニュー用（必ず配布するバニラ時計 + 名前タグ） */
  WAND_ITEM: "minecraft:clock",
  /** カスタム操作アイテム（登録できれば追加配布） */
  WAND_ITEM_CUSTOM: "robw:control",
  /** 配布する時計の名前（右クリックで操作メニュー） */
  WAND_MENU_NAME: "ROBW:menu",
  /** 旧名（normalize で ROBW:menu に直す） */
  WAND_LEGACY_MENU_NAMES: ["ROBW:start"],
  WAND_NAMES: {
    "ROBW:menu": "menu",
    "ROBW:start": "menu",
    "ROBW:stop": "stop",
    "ROBW:reset": "reset",
    "ROBW:ranking": "ranking",
  },
  /** true で昼・晴天を固定 */
  LOCK_DAYTIME: true,
  /** 固定する時刻（tick）。6000 = 真昼 */
  DAY_TIME_OF_DAY: 6000,
  /** 晴天を維持する長さ（tick） */
  WEATHER_CLEAR_DURATION_TICKS: 100000,
  /** start 時の 3・2・1 演出を出すか */
  START_COUNTDOWN_ENABLED: true,
  /** カウント 1 歩の長さ（tick）。20 ≒ 1 秒（開始・終了共通） */
  START_COUNTDOWN_STEP_TICKS: 20,
  /** 終了時の 3・2・1 閉鎖演出（時間切れ時は残り 3 秒と同期） */
  END_COUNTDOWN_ENABLED: true,
  /** 残り時間を画面に常時表示する */
  SHOW_REMAINING_TIME_HUD: true,
  /**
   * true = 画面右サイドバー（既定・配置は従来どおり）
   * false = アクションバー中央下（行右の並び用数字は出ない）
   */
  TIMER_HUD_USE_SIDEBAR: true,
  /** 残り時間表示用スコアボード ID（TIMER_HUD_USE_SIDEBAR 時のみ使用） */
  TIMER_SCORE_OBJECTIVE: "robw_timer",
};

/** 目立つ残り時間通知（秒） */
const MILESTONE_SECONDS = [60, 30, 10];

const TICKS_PER_SECOND = 20;
const SUBMISSION_CREDIT_WINDOW_TICKS = 15 * TICKS_PER_SECOND;
const SUBMISSION_PROCESS_DELAYS = [5, 20, 40, 60, 100, 150];
const GATE_OPEN_TICKS = CONFIG.GATE_OPEN_MINUTES * 60 * TICKS_PER_SECOND;
const GATE_OPEN_MS = CONFIG.GATE_OPEN_MINUTES * 60 * 1000;
const TIME_NOTIFY_INTERVAL_MS = CONFIG.TIME_NOTIFY_INTERVAL_SECONDS * 1000;
/** 1 tick あたりの実時間（ms）。制限時間は実時間で進める（ポーズ中も経過） */
const MS_PER_TICK = 1000 / TICKS_PER_SECOND;
const DAYTIME_LOCK_INTERVAL_TICKS = 200;
const LOCKED_DIMENSION_IDS = ["overworld", "nether", "the_end"];
const UI_BROADCAST_WINDOW_MS = 10_000;
let uiBroadcastWindowStartMs = 0;
let uiBroadcastCountInWindow = 0;

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------

/** @type {number | undefined} */
let daylightLockLoopId = undefined;
/** @type {"waiting" | "countdown" | "running" | "closing" | "finished"} */
let gameState = "waiting";
/** ゲート閉鎖予定の実時間（Date.now() 基準） */
let gameEndWallMs = 0;
let nextTimeNotifyWallMs = 0;
/** @type {Set<number>} */
let announcedMilestones = new Set();
/** @type {number | undefined} */
let gameLoopId = undefined;
/** @type {number | undefined} */
let submissionLoopId = undefined;
/** @type {number | undefined} */
let spawnReplenishLoopId = undefined;
/** @type {import("@minecraft/server").Player | null} */
let lastSubmissionPlayer = null;
let lastSubmissionTick = 0;
/** @type {{ x: number, y: number, z: number } | null} */
let activeSubmissionChestPos = null;
/** @type {{ dimension: import("@minecraft/server").Dimension, x: number, y: number, z: number, typeId: string } | null} */
let placedChestRestore = null;
/** @type {{ x: number, y: number, z: number, radius: number } | null} */
let activeRoundCenter = null;
/** @type {import("@minecraft/server").Dimension | null} */
let activeRoundDimension = null;
let startCountdownGeneration = 0;
let endCountdownGeneration = 0;
/** 時間切れ時、タイマー残り秒（3・2・1）ごとに演出済みか */
let endCountdownSyncedSecsShown = new Set();
/** ラウンド中の死亡後、骨補充などリスポーン後処理待ちのプレイヤー ID */
const pendingRoundDeathRespawnIds = new Set();
/** 同一死亡で開始地点復帰 TP を二重実行しない */
const roundDeathRecoveryInProgress = new Set();
/** 同一死亡で減点を二重適用しない */
const roundDeathPenaltyAppliedIds = new Set();
/** playerDie 時点で無効だったプレイヤーへの減点を復活後に適用 */
const pendingRoundDeathPenaltyIds = new Set();
/** ラウンド開始前の個人スポーン（終了時に戻す） */
const savedPlayerSpawnBeforeRound = new Map();
/** @type {boolean | null} */
let savedDoImmediateRespawn = null;
/** @type {number | undefined} */
let hudLoopId = undefined;
/** @type {string | null} */
let timerHudRemainingName = null;
/** @type {string | null} */
let timerHudLimitName = null;
/** @type {string | null} */
let timerHudChestName = null;
/** @type {Map<string, string>} */
const timerHudPlayerPointNames = new Map();
let timerHudActive = false;
/** @type {number | undefined} */
let timerHudWatchdogId = undefined;
/** セッションホスト（先に入ったプレイヤー。退出時は次の参加者へ） @type {string | null} */
let sessionHostPlayerId = null;
/** 再接続などで ID が変わったときのフォールバック @type {string | null} */
let sessionHostPlayerName = null;

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

/** ゲーム内表示用の § カラーコードを除去（コンテンツログ用） */
function stripMcFormatting(text) {
  return String(text ?? "").replace(/§[0-9a-fklmnor]/gi, "");
}

/**
 * プレイヤー向けチャット。ゲーム内表示と同じ文言をコンテンツログにも出す。
 */
function robwPlayerMessage(player, message) {
  const text = String(message ?? "");
  const who = player?.name ?? "?";
  logInfo(`[ゲーム内] ${who}: ${stripMcFormatting(text)}`);
  if (player && typeof player.sendMessage === "function") {
    player.sendMessage(message);
  }
}

function resetUiBroadcastBudget() {
  uiBroadcastWindowStartMs = 0;
  uiBroadcastCountInWindow = 0;
}

/** @param {"high" | "normal"} [priority] high はレート制限を bypass */
function canSendUiBroadcast(priority = "normal") {
  if (priority === "high") return true;
  const max = Math.max(1, CONFIG.UI_BROADCAST_MAX_PER_10_SECONDS ?? 4);
  const now = Date.now();
  if (now - uiBroadcastWindowStartMs >= UI_BROADCAST_WINDOW_MS) {
    uiBroadcastWindowStartMs = now;
    uiBroadcastCountInWindow = 0;
  }
  if (uiBroadcastCountInWindow >= max) return false;
  uiBroadcastCountInWindow += 1;
  return true;
}

/** 全員向けチャット（コンテンツログにも出す） */
function robwBroadcast(message, options = {}) {
  const text = String(message ?? "");
  const priority = options.priority === "high" ? "high" : "normal";
  if (!canSendUiBroadcast(priority)) {
    logInfo(`[ゲーム内] 全員(省略): ${stripMcFormatting(text)}`);
    return;
  }
  logInfo(`[ゲーム内] 全員: ${stripMcFormatting(text)}`);
  world.sendMessage(message);
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
  daylightLockLoopId = system.runInterval(applyDaytimeLock, DAYTIME_LOCK_INTERVAL_TICKS);
  logInfo("daytime lock enabled (clear weather, fixed noon)");
}

// ---------------------------------------------------------------------------
// ゲーム開始カウントダウン演出
// ---------------------------------------------------------------------------

const START_COUNTDOWN_SEQUENCE = [
  {
    title: "§6§lRETURN OF BOXWORLD",
    subtitle: "§fゲート起動準備...",
    actionBar: "§6§oReturn of BoxWorld",
    sound: null,
    pitch: 1,
  },
  {
    title: "§e§l3",
    subtitle: "§7まもなく開始",
    actionBar: "§e§l>> 3",
    sound: "note.pling",
    pitch: 0.75,
  },
  {
    title: "§6§l2",
    subtitle: "§7まもなく開始",
    actionBar: "§6§l>> 2",
    sound: "note.pling",
    pitch: 1,
  },
  {
    title: "§c§l1",
    subtitle: "§7まもなく開始",
    actionBar: "§c§l>> 1",
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
    activeRoundDimension = null;
    clearRemainingTimeHud();
  }
}

function showCeremonyPresentation(step, stepTicks = CONFIG.START_COUNTDOWN_STEP_TICKS) {
  const titleOpts = {
    fadeInDuration: 2,
    stayDuration: Math.max(8, stepTicks - 4),
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
  const particles = ["minecraft:totem_particle", "minecraft:villager_happy"];
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
  broadcast(`§6${host.name}§fがゲートを起動します...`, { priority: "high" });

  for (let i = 0; i < START_COUNTDOWN_SEQUENCE.length; i++) {
    const step = START_COUNTDOWN_SEQUENCE[i];
    system.runTimeout(() => {
      if (generation !== startCountdownGeneration || gameState !== "countdown") {
        return;
      }
      showCeremonyPresentation(step, stepTicks);
      if (i === START_COUNTDOWN_SEQUENCE.length - 1) {
        spawnCountdownBurst(validation.dimension, center);
      }
      if (i >= 1 && i <= 3) {
        broadcast(`§e§l  ${4 - i}  `, { priority: "high" });
      } else if (i === START_COUNTDOWN_SEQUENCE.length - 1) {
        broadcast("§a§l===== START! =====", { priority: "high" });
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
// ゲーム終了カウントダウン演出
// ---------------------------------------------------------------------------

const END_COUNTDOWN_SEQUENCE = [
  {
    title: "§e§l3",
    subtitle: "§7まもなく閉鎖",
    actionBar: "§e§l>> 3",
    sound: "note.pling",
    pitch: 0.75,
  },
  {
    title: "§6§l2",
    subtitle: "§7まもなく閉鎖",
    actionBar: "§6§l>> 2",
    sound: "note.pling",
    pitch: 1,
  },
  {
    title: "§c§l1",
    subtitle: "§7まもなく閉鎖",
    actionBar: "§c§l>> 1",
    sound: "note.pling",
    pitch: 1.25,
  },
  {
    title: "§6§lゲート閉鎖!",
    subtitle: "§e帰還ランキング発表",
    actionBar: "§6§lCLOSED",
    sound: "random.levelup",
    pitch: 0.9,
  },
];

function cancelEndCountdown() {
  endCountdownGeneration++;
  endCountdownSyncedSecsShown.clear();
}

function resetEndCountdownSyncState() {
  endCountdownSyncedSecsShown.clear();
}

const END_COUNTDOWN_CLOSE_INDEX = END_COUNTDOWN_SEQUENCE.length - 1;

function showEndCountdownStep(index) {
  const step = END_COUNTDOWN_SEQUENCE[index];
  if (!step) return;

  const stepTicks = CONFIG.START_COUNTDOWN_STEP_TICKS;
  showCeremonyPresentation(step, stepTicks);

  if (index >= 0 && index <= 2) {
    broadcast(`§e§l  ${3 - index}  `, { priority: "high" });
    return;
  }

  if (index !== END_COUNTDOWN_CLOSE_INDEX) return;

  const center = activeRoundCenter;
  const players = world.getPlayers();
  const dimension = players[0]?.dimension;
  if (dimension && center) {
    spawnEndCeremonyBurst(dimension, center);
  }
  broadcast("§6§l===== ゲート閉鎖! =====", { priority: "high" });
}

/** ゲート残り時間の 3・2・1 秒と同期して終了カウントを出す（running 中のみ） */
function tryShowTimerSyncedEndCountdown(remainingTicks) {
  if (!CONFIG.END_COUNTDOWN_ENABLED || gameState !== "running") return;

  const remainingSec = Math.ceil(remainingTicks / TICKS_PER_SECOND);
  if (remainingSec < 1 || remainingSec > 3) return;
  if (endCountdownSyncedSecsShown.has(remainingSec)) return;

  endCountdownSyncedSecsShown.add(remainingSec);
  showEndCountdownStep(3 - remainingSec);
}

function spawnEndCeremonyBurst(dimension, center) {
  if (!center) return;
  const loc = { x: center.x + 0.5, y: center.y + 1.5, z: center.z + 0.5 };
  const particles = [
    "minecraft:totem_particle",
    "minecraft:villager_happy",
    "minecraft:fireworks_spark",
  ];
  for (const id of particles) {
    try {
      dimension.spawnParticle(id, loc);
    } catch {
      // ignore
    }
  }
  try {
    dimension.playSound("random.levelup", loc, { volume: 1, pitch: 1 });
    dimension.playSound("random.explode", loc, { volume: 0.25, pitch: 0.8 });
  } catch {
    // ignore
  }
}

function runGameEndCountdown(onComplete) {
  if (!CONFIG.END_COUNTDOWN_ENABLED) {
    onComplete();
    return;
  }

  const generation = ++endCountdownGeneration;
  const stepTicks = CONFIG.START_COUNTDOWN_STEP_TICKS;

  for (let i = 0; i < END_COUNTDOWN_SEQUENCE.length; i++) {
    system.runTimeout(() => {
      if (generation !== endCountdownGeneration || gameState !== "closing") {
        return;
      }
      showEndCountdownStep(i);
    }, i * stepTicks);
  }

  const totalTicks = END_COUNTDOWN_SEQUENCE.length * stepTicks;
  system.runTimeout(() => {
    if (generation !== endCountdownGeneration || gameState !== "closing") {
      return;
    }
    onComplete();
  }, totalTicks);
}

function finalizeGameAfterCeremony() {
  gameState = "finished";
  clearPendingRoundDeathRespawns();
  restoreRoundRespawnSettings();
  clearRemainingTimeHud();
  const center = activeRoundCenter;
  const dimension = getActiveRoundDimension();
  clearSpawnedHakoinu(center, dimension);
  activeRoundCenter = null;
  activeRoundDimension = null;

  const players = world.getPlayers();
  if (players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }

  broadcast("§6ゲート閉鎖！ハコイヌたちの帰還結果を発表します！", {
    priority: "high",
  });
  showRanking();
  resetAllPlayersToLobbyInventory();
  logInfo("gate closed, game finished");
}

/** 手動 stop 時: 3・2・1 → 閉鎖を演出時間で順に再生 */
function beginManualGameEndCeremony() {
  if (gameState === "finished" || gameState === "closing") return;

  gameState = "closing";
  resetEndCountdownSyncState();
  stopGameLoops();
  clearRemainingTimeHud();
  clearSpawnedHakoinu(activeRoundCenter, getActiveRoundDimension());
  broadcast("§eゲートを手動で閉鎖します...", { priority: "high" });

  runGameEndCountdown(() => {
    if (gameState !== "closing") return;
    finalizeGameAfterCeremony();
  });
}

/** 時間切れ時: 3・2・1 はタイマー残り秒に同期済み → 閉鎖のみ */
function beginTimedGameEndFinalize() {
  if (gameState === "finished" || gameState === "closing") return;

  gameState = "closing";
  stopGameLoops();
  clearRemainingTimeHud();
  clearSpawnedHakoinu(activeRoundCenter, getActiveRoundDimension());
  broadcast("§c§l時間切れ！§fゲートを閉鎖します...", { priority: "high" });

  const generation = ++endCountdownGeneration;
  const stepTicks = CONFIG.START_COUNTDOWN_STEP_TICKS;

  if (CONFIG.END_COUNTDOWN_ENABLED) {
    showEndCountdownStep(END_COUNTDOWN_CLOSE_INDEX);
    system.runTimeout(() => {
      if (generation !== endCountdownGeneration || gameState !== "closing") {
        return;
      }
      finalizeGameAfterCeremony();
    }, stepTicks);
    return;
  }

  finalizeGameAfterCeremony();
}

function requestGameEnd(wasManualStop = false) {
  if (gameState === "finished" || gameState === "closing") return;

  if (gameState === "running" && CONFIG.END_COUNTDOWN_ENABLED && wasManualStop) {
    beginManualGameEndCeremony();
    return;
  }

  if (gameState === "running" && !wasManualStop) {
    beginTimedGameEndFinalize();
    return;
  }

  stopGameLoops();
  clearRemainingTimeHud();
  finalizeGameAfterCeremony();
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function broadcast(message, options) {
  robwBroadcast(message, options);
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
    objective = board.addObjective(CONFIG.SCORE_OBJECTIVE, "帰還ポイント");
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

function getPlayerReturnPoints(player) {
  return getObjective().getScore(player) ?? 0;
}

// ---------------------------------------------------------------------------
// 帰還ボックス（インベントリ）
// ---------------------------------------------------------------------------

/** 捕獲順の正誤（アイテム見た目では区別不可） @type {Map<string, ("hakoinu" | "wrong")[]>} */
const playerReturnBoxLedger = new Map();

function clearPlayerReturnBoxLedger(playerId) {
  playerReturnBoxLedger.delete(playerId);
}

function clearAllReturnBoxLedgers() {
  playerReturnBoxLedger.clear();
}

function recordCapturedReturnBox(player, kind, amount = 1) {
  let queue = playerReturnBoxLedger.get(player.id);
  if (!queue) {
    queue = [];
    playerReturnBoxLedger.set(player.id, queue);
  }
  for (let i = 0; i < amount; i++) {
    queue.push(kind);
  }
}

/** @returns {{ hakoinu: number, wrong: number }} */
function consumeReturnBoxKindsFromLedger(player, amount) {
  const returned = { hakoinu: 0, wrong: 0 };
  if (amount <= 0) return returned;

  const queue = playerReturnBoxLedger.get(player.id) ?? [];
  let remaining = amount;

  while (remaining > 0 && queue.length > 0) {
    const kind = queue.shift();
    returned[kind] += 1;
    remaining -= 1;
  }

  if (queue.length === 0) {
    playerReturnBoxLedger.delete(player.id);
  } else {
    playerReturnBoxLedger.set(player.id, queue);
  }

  return returned;
}

/** 全プレイヤーの台帳から FIFO で種別を消費（未記録分は別種として減点） */
function consumeReturnBoxKindsFromAnyLedger(amount) {
  const returned = { hakoinu: 0, wrong: 0 };
  if (amount <= 0) return returned;

  let remaining = amount;

  while (remaining > 0) {
    let consumed = 0;
    for (const player of world.getPlayers()) {
      if (remaining <= 0) break;
      const partial = consumeReturnBoxKindsFromLedger(player, 1);
      if (partial.hakoinu + partial.wrong <= 0) continue;
      returned.hakoinu += partial.hakoinu;
      returned.wrong += partial.wrong;
      remaining -= 1;
      consumed += 1;
    }
    if (consumed === 0) break;
  }

  if (remaining > 0) {
    logWarn(`submitted ${remaining} untracked return box(es); counted as wrong`);
    returned.wrong += remaining;
  }

  return returned;
}

function isReturnBoxItem(itemStack) {
  if (!itemStack || itemStack.typeId !== CONFIG.RETURN_BOX_ITEM) {
    return false;
  }

  const tag = (itemStack.nameTag ?? "").replace(/§./g, "").trim();
  return (
    !tag ||
    tag === CONFIG.RETURN_BOX_DISPLAY_NAME ||
    tag === CONFIG.RETURN_BOX_NAME ||
    tag === CONFIG.WRONG_RETURN_BOX_NAME
  );
}

/** 旧ワールド互換: 名前で判別できるものだけ。通常の「捕獲した毛皮」は null */
/** @returns {"hakoinu" | "wrong" | null} */
function getLegacyReturnBoxKind(itemStack) {
  if (!isReturnBoxItem(itemStack)) return null;

  if (typeof itemStack.getDynamicProperty === "function") {
    const prop = itemStack.getDynamicProperty(CONFIG.RETURN_BOX_KIND_PROPERTY);
    if (prop === "wrong") return "wrong";
    if (prop === "hakoinu") return "hakoinu";
  }

  const tag = (itemStack.nameTag ?? "").replace(/§./g, "").trim();
  if (tag === CONFIG.WRONG_RETURN_BOX_NAME) return "wrong";
  if (tag === CONFIG.RETURN_BOX_NAME) return "hakoinu";
  return null;
}

function createReturnBoxStack(amount = 1) {
  const stack = new ItemStack(CONFIG.RETURN_BOX_ITEM, amount);
  stack.nameTag = CONFIG.RETURN_BOX_DISPLAY_NAME;
  return stack;
}

function countReturnBoxItemsInContainer(container) {
  let total = 0;
  if (!container) return total;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!isReturnBoxItem(item)) continue;
    total += item.amount;
  }
  return total;
}

function removeReturnBoxesFromInventory(player) {
  const container = player.getComponent("inventory")?.container;
  let removed = 0;
  if (!container) return removed;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!isReturnBoxItem(item)) continue;
    removed += item.amount;
    container.setItem(slot, undefined);
  }

  if (removed > 0) {
    consumeReturnBoxKindsFromLedger(player, removed);
  }
  return removed;
}

function giveReturnBox(player, amount = 1, kind = "hakoinu") {
  recordCapturedReturnBox(player, kind, amount);
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

/** @type {string[]} */
let spawnedRoundEntityIds = [];
/** script 捕獲で remove した ID（entityDie と二重処理しない） @type {Set<string>} */
const scriptRemovedRoundEntityIds = new Set();

function resolveSpawnedRoundEntity(entityId) {
  if (!entityId) return null;
  try {
    const entity = world.getEntity(entityId);
    if (!entity?.isValid) return null;
    return entity;
  } catch {
    return null;
  }
}

function clearSpawnedRoundEntities() {
  for (const entityId of spawnedRoundEntityIds) {
    try {
      resolveSpawnedRoundEntity(entityId)?.remove();
    } catch {
      // 既に消えている場合は無視
    }
  }
  spawnedRoundEntityIds = [];
  scriptRemovedRoundEntityIds.clear();
}

function getEndHakoinuCleanupRadius() {
  return CONFIG.SPAWN_MAX_DISTANCE + (CONFIG.SPAWN_NEAR_PLAYER_MAX_DISTANCE ?? 18) + 12;
}

function getRoundItemCleanupRadius() {
  const configured = CONFIG.ROUND_ITEM_CLEANUP_RADIUS ?? 0;
  if (configured > 0) return configured;
  return getEndHakoinuCleanupRadius();
}

/** ラウンド中心周辺の落とし物（アイテムエンティティ）を消す */
function clearDroppedItemsNearRoundCenter(center, dimension) {
  const gate = center ?? activeRoundCenter ?? CONFIG.BOX_GATE;
  const dim = dimension ?? getActiveRoundDimension();
  if (!dim) return 0;

  const radius = getRoundItemCleanupRadius();
  const location = { x: gate.x + 0.5, y: gate.y, z: gate.z + 0.5 };
  const itemTypes = CONFIG.DROPPED_ITEM_ENTITY_TYPES ?? ["minecraft:item"];
  let removed = 0;

  try {
    const entities = dim.getEntities({ location, maxDistance: radius });
    for (const entity of entities) {
      if (!entity?.isValid) continue;
      if (!itemTypes.includes(entity.typeId)) continue;
      try {
        entity.remove();
        removed++;
      } catch {
        // ignore
      }
    }
  } catch (error) {
    logWarn(`clearDroppedItemsNearRoundCenter failed: ${error}`);
  }
  if (removed > 0) {
    logInfo(`cleared ${removed} dropped item(s) within ${radius} blocks of round center`);
  }
  return removed;
}

/** ラウンド中心周辺のオオカミをすべて消す（終了・リセット用） */
function clearAllHakoinuNearRoundCenter(center, dimension) {
  const gate = center ?? activeRoundCenter ?? CONFIG.BOX_GATE;
  const dim = dimension ?? getActiveRoundDimension();
  if (!dim) return 0;

  const radius = getEndHakoinuCleanupRadius();
  const location = { x: gate.x + 0.5, y: gate.y, z: gate.z + 0.5 };
  let removed = 0;

  try {
    const entities = dim.getEntities({ location, maxDistance: radius });
    for (const entity of entities) {
      if (!entity?.isValid) continue;
      if (!CONFIG.HAKOINU_ENTITY_TYPES.includes(entity.typeId)) continue;
      try {
        removeSpawnedRoundEntityRef(entity.id);
        entity.remove();
        removed++;
      } catch {
        // ignore
      }
    }
  } catch (error) {
    logWarn(`clearAllHakoinuNearRoundCenter failed: ${error}`);
  }
  return removed;
}

/** @deprecated 互換エイリアス */
function clearSpawnedHakoinu(center, dimension) {
  clearSpawnedRoundEntities();
  const wolves = clearAllHakoinuNearRoundCenter(center, dimension);
  clearDroppedItemsNearRoundCenter(center, dimension);
  if (wolves > 0) {
    logInfo(
      `cleared ${wolves} hakoinu within ${getEndHakoinuCleanupRadius()} blocks of round center`,
    );
  }
}

function pickRandomPenaltyAnimalType() {
  const types = CONFIG.PENALTY_ANIMAL_TYPES;
  return types[Math.floor(Math.random() * types.length)];
}

function randomSpawnLocationNearAnchor(anchor, usePlayerRing = false) {
  const minD = usePlayerRing
    ? (CONFIG.SPAWN_NEAR_PLAYER_MIN_DISTANCE ?? CONFIG.SPAWN_MIN_DISTANCE)
    : CONFIG.SPAWN_MIN_DISTANCE;
  const maxD = usePlayerRing
    ? (CONFIG.SPAWN_NEAR_PLAYER_MAX_DISTANCE ?? 22)
    : CONFIG.SPAWN_MAX_DISTANCE;
  const angle = Math.random() * Math.PI * 2;
  const dist = minD + Math.sqrt(Math.random()) * (maxD - minD);
  return {
    x: anchor.x + Math.cos(angle) * dist,
    y: anchor.y + CONFIG.GATE_SUMMON_OFFSET_Y,
    z: anchor.z + Math.sin(angle) * dist,
  };
}

function randomSpawnLocationNearGate(gate) {
  return randomSpawnLocationNearAnchor({ x: gate.x + 0.5, y: gate.y, z: gate.z + 0.5 }, false);
}

function trySpawnRoundEntity(dimension, entityType, location) {
  try {
    const entity = dimension.spawnEntity(entityType, location);
    spawnedRoundEntityIds.push(entity.id);
    return true;
  } catch {
    return false;
  }
}

function trySpawnRoundEntityAtCandidates(dimension, entityType, makeBaseLocation) {
  const attempts = Math.max(1, CONFIG.SPAWN_ATTEMPTS_PER_ENTITY ?? 1);
  const yOffsets = [0, 1, 2, 3, -1, -2];

  for (let attempt = 0; attempt < attempts; attempt++) {
    const base = makeBaseLocation(attempt);
    for (const yOff of yOffsets) {
      if (
        trySpawnRoundEntity(dimension, entityType, {
          x: base.x,
          y: base.y + yOff,
          z: base.z,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

function trySpawnRoundEntityNearGate(dimension, entityType, gate) {
  const ok = trySpawnRoundEntityAtCandidates(dimension, entityType, () =>
    randomSpawnLocationNearGate(gate),
  );
  if (!ok) {
    logWarn(`spawn ${entityType} failed near gate`);
  }
  return ok;
}

function trySpawnRoundEntityNearPlayer(dimension, entityType, player) {
  if (!player?.isValid) return false;
  let loc;
  try {
    loc = player.location;
  } catch {
    return false;
  }
  const anchor = { x: loc.x, y: loc.y, z: loc.z };
  return trySpawnRoundEntityAtCandidates(dimension, entityType, () =>
    randomSpawnLocationNearAnchor(anchor, true),
  );
}

function trySpawnRoundEntityNearRandomPlayer(dimension, entityType) {
  const players = world.getPlayers().filter((p) => p?.isValid);
  if (players.length === 0) return false;
  const tries = Math.min(players.length, 4);
  for (let t = 0; t < tries; t++) {
    const player = players[Math.floor(Math.random() * players.length)];
    if (trySpawnRoundEntityNearPlayer(dimension, entityType, player)) {
      return true;
    }
  }
  return false;
}

function trySpawnRoundEntityForRound(dimension, entityType, preferredPlayer) {
  if (CONFIG.SPAWN_NEAR_PLAYERS !== false) {
    if (
      preferredPlayer?.isValid &&
      trySpawnRoundEntityNearPlayer(dimension, entityType, preferredPlayer)
    ) {
      return true;
    }
    if (trySpawnRoundEntityNearRandomPlayer(dimension, entityType)) {
      return true;
    }
  }
  return trySpawnRoundEntityNearGate(dimension, entityType, getActiveBoxGate());
}

/** @returns {{ kind: "hakoinu" | "penalty", location: import("@minecraft/server").Vector3 } | null} */
function inspectSpawnedRoundEntity(entityId) {
  const entity = resolveSpawnedRoundEntity(entityId);
  if (!entity) return null;
  try {
    const typeId = entity.typeId;
    const location = entity.location;
    if (CONFIG.HAKOINU_ENTITY_TYPES.includes(typeId)) {
      return { kind: "hakoinu", location };
    }
    if (CONFIG.PENALTY_ANIMAL_TYPES.includes(typeId)) {
      return { kind: "penalty", location };
    }
  } catch {
    return null;
  }
  return null;
}

function removeSpawnedRoundEntityRef(entityOrId) {
  const id = typeof entityOrId === "string" ? entityOrId : entityOrId?.id;
  if (!id) return;
  const index = spawnedRoundEntityIds.indexOf(id);
  if (index >= 0) spawnedRoundEntityIds.splice(index, 1);
}

function pruneSpawnedRoundEntityIds() {
  spawnedRoundEntityIds = spawnedRoundEntityIds.filter(
    (entityId) => inspectSpawnedRoundEntity(entityId) !== null,
  );
}

/** @returns {{ hakoinu: number, penalty: number }} */
function countActiveRoundSpawns() {
  pruneSpawnedRoundEntityIds();
  let hakoinu = 0;
  let penalty = 0;
  for (const entityId of spawnedRoundEntityIds) {
    const info = inspectSpawnedRoundEntity(entityId);
    if (info?.kind === "hakoinu") hakoinu++;
    else if (info?.kind === "penalty") penalty++;
  }
  return { hakoinu, penalty };
}

function countRoundAnimalsNearPlayer(player) {
  try {
    if (!player?.isValid) return 0;
    pruneSpawnedRoundEntityIds();
    const loc = player.location;
    const radius = CONFIG.SPAWN_NEAR_PLAYER_MAX_DISTANCE ?? 22;
    const maxDistSq = radius * radius;
    let count = 0;
    for (const entityId of spawnedRoundEntityIds) {
      const info = inspectSpawnedRoundEntity(entityId);
      if (!info) continue;
      const el = info.location;
      if (distanceSq(loc.x, loc.y, loc.z, el.x, el.y, el.z) <= maxDistSq) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function spawnRoundAnimalsAtGate(dimension, targets) {
  const hakoinuType = CONFIG.HAKOINU_ENTITY_TYPES[0];
  const targetHakoinu = targets?.hakoinu ?? CONFIG.START_SPAWN_HAKOINU;
  const targetPenalty = targets?.penalty ?? CONFIG.START_SPAWN_PENALTY_ANIMALS;
  let hakoinuSpawned = 0;
  let penaltySpawned = 0;

  for (let i = 0; i < targetHakoinu; i++) {
    if (trySpawnRoundEntityForRound(dimension, hakoinuType)) {
      hakoinuSpawned++;
    }
  }

  for (let i = 0; i < targetPenalty; i++) {
    const entityType = pickRandomPenaltyAnimalType();
    if (trySpawnRoundEntityForRound(dimension, entityType)) {
      penaltySpawned++;
    }
  }

  logInfo(
    `spawned hakoinu=${hakoinuSpawned}/${targetHakoinu} penalty=${penaltySpawned}/${targetPenalty} (near players=${CONFIG.SPAWN_NEAR_PLAYERS !== false})`,
  );
  return { hakoinuSpawned, penaltySpawned };
}

function spawnAfterCapture(player) {
  if (!CONFIG.SPAWN_ON_CAPTURE_ENABLED || gameState !== "running") return;
  if (!player?.isValid) return;

  const dimension = player.dimension;
  const hakoinuType = CONFIG.HAKOINU_ENTITY_TYPES[0];
  const count = Math.max(1, CONFIG.SPAWN_ON_CAPTURE_COUNT ?? 1);
  let spawned = 0;

  for (let i = 0; i < count; i++) {
    const { hakoinu } = countActiveRoundSpawns();
    if (hakoinu >= CONFIG.START_SPAWN_HAKOINU) break;
    if (trySpawnRoundEntityNearPlayer(dimension, hakoinuType, player)) {
      spawned++;
    }
  }

  if (spawned > 0) {
    logInfo(`spawn after capture +${spawned} near ${player.name}`);
  }
}

function replenishRoundSpawns(dimension) {
  if (!CONFIG.SPAWN_REPLENISH_ENABLED || gameState !== "running") return;

  let budget = Math.max(1, CONFIG.SPAWN_REPLENISH_MAX_PER_CHECK ?? 1);
  let spawned = 0;
  const hakoinuType = CONFIG.HAKOINU_ENTITY_TYPES[0];
  const minNear = CONFIG.SPAWN_MIN_NEAR_PLAYER ?? 8;
  const players = world.getPlayers().filter((p) => p?.isValid);

  for (const player of players) {
    if (budget <= 0) break;
    const near = countRoundAnimalsNearPlayer(player);
    if (near >= minNear) continue;

    const deficit = minNear - near;
    for (let i = 0; i < deficit && budget > 0; i++) {
      const counts = countActiveRoundSpawns();
      if (counts.hakoinu < CONFIG.START_SPAWN_HAKOINU) {
        if (trySpawnRoundEntityNearPlayer(dimension, hakoinuType, player)) {
          budget--;
          spawned++;
          continue;
        }
      }
      if (counts.penalty < CONFIG.START_SPAWN_PENALTY_ANIMALS) {
        const entityType = pickRandomPenaltyAnimalType();
        if (trySpawnRoundEntityNearPlayer(dimension, entityType, player)) {
          budget--;
          spawned++;
        }
      }
    }
  }

  const counts = countActiveRoundSpawns();
  const needHakoinu = Math.max(0, CONFIG.START_SPAWN_HAKOINU - counts.hakoinu);
  const needPenalty = Math.max(0, CONFIG.START_SPAWN_PENALTY_ANIMALS - counts.penalty);

  for (let i = 0; i < needHakoinu && budget > 0; i++) {
    if (trySpawnRoundEntityForRound(dimension, hakoinuType)) {
      budget--;
      spawned++;
    }
  }
  for (let i = 0; i < needPenalty && budget > 0; i++) {
    const entityType = pickRandomPenaltyAnimalType();
    if (trySpawnRoundEntityForRound(dimension, entityType)) {
      budget--;
      spawned++;
    }
  }

  if (spawned > 0) {
    const after = countActiveRoundSpawns();
    logInfo(
      `spawn replenish +${spawned} (hakoinu=${after.hakoinu}/${CONFIG.START_SPAWN_HAKOINU} penalty=${after.penalty}/${CONFIG.START_SPAWN_PENALTY_ANIMALS})`,
    );
  }
}

function getRoundStartDimension() {
  if (activeRoundDimension) return activeRoundDimension;
  try {
    return world.getDimension("overworld");
  } catch (error) {
    logWarn(`getRoundStartDimension failed: ${error}`);
    return null;
  }
}

function getActiveRoundDimension() {
  if (activeRoundDimension) return activeRoundDimension;
  const players = world.getPlayers();
  if (players.length > 0) return players[0].dimension;
  return placedChestRestore?.dimension;
}

function tickSpawnReplenish() {
  if (gameState !== "running") return;
  try {
    const dimension = getActiveRoundDimension();
    if (!dimension) return;
    replenishRoundSpawns(dimension);
  } catch (error) {
    logWarn(`spawn replenish tick failed: ${error}`);
  }
}

function startSpawnReplenishLoop() {
  if (!CONFIG.SPAWN_REPLENISH_ENABLED) return;
  if (spawnReplenishLoopId !== undefined) return;
  const intervalSec = Math.max(1, CONFIG.SPAWN_REPLENISH_INTERVAL_SECONDS ?? 4);
  spawnReplenishLoopId = system.runInterval(tickSpawnReplenish, intervalSec * TICKS_PER_SECOND);
}

/** @deprecated 互換エイリアス */
function spawnHakoinuAtGate(dimension) {
  spawnRoundAnimalsAtGate(dimension);
}

function shouldKeepRobwWandItem(item) {
  if (!item) return false;
  return isRobwWandItemType(item.typeId);
}

/** 操作時計だけ残し、骨・毛皮などゲームアイテムを除去 */
function clearInventoryExceptWand(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  let removed = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item || shouldKeepRobwWandItem(item)) continue;
    container.setItem(slot, undefined);
    removed += 1;
  }
  return removed;
}

function shouldResetToLobbyInventory() {
  return gameState !== "running";
}

function resetPlayerToLobbyInventory(player) {
  clearPlayerReturnBoxLedger(player.id);
  if (isSessionHost(player)) {
    const removed = clearInventoryExceptWand(player);
    if (removed > 0) {
      logInfo(`lobby inventory for ${player.name}: removed ${removed} slot(s), kept wand only`);
    }
  } else {
    clearPlayerInventoryCompletely(player);
  }
}

function resetAllPlayersToLobbyInventory() {
  ensureSessionHostAssigned();
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    resetPlayerToLobbyInventory(player);
  }
  ensureHostWandDistribution();
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

function countItemInInventory(player, typeId) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  let total = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === typeId) total += item.amount;
  }
  return total;
}

/** @returns {number} 実際に消費できた数 */
function consumeItemFromInventory(player, typeId, amount) {
  if (amount <= 0) return 0;
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  let remaining = amount;
  for (let slot = 0; slot < container.size && remaining > 0; slot++) {
    const item = container.getItem(slot);
    if (!item || item.typeId !== typeId) continue;

    if (item.amount <= remaining) {
      remaining -= item.amount;
      container.setItem(slot, undefined);
    } else {
      container.setItem(slot, new ItemStack(typeId, item.amount - remaining));
      remaining = 0;
    }
  }
  return amount - remaining;
}

/** ラウンド中の死亡復帰時: 骨だけ開始時と同数に補充（時計はホストのみ保持） */
function giveRoundRespawnBones(player) {
  if (!player?.isValid) return 0;

  const amount = Math.max(0, CONFIG.START_GIVE_BONES ?? 0);
  if (amount <= 0) return 0;

  removeItemTypeFromInventory(player, CONFIG.PROTECT_ITEM);
  return giveBones(player, amount);
}

function giveStartKit(player) {
  clearPlayerReturnBoxLedger(player.id);
  if (isSessionHost(player)) {
    const cleared = clearInventoryExceptWand(player);
    if (cleared > 0) {
      logInfo(
        `cleared ${cleared} inventory slot(s) for ${player.name} (kept wand, will give bones)`,
      );
    }
  } else {
    removeRobwWandsFromPlayer(player);
    clearPlayerInventoryCompletely(player);
  }
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

// ---------------------------------------------------------------------------
// セッションホスト（ゲート起動・操作時計はホストのみ）
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").Player} player */
function claimSessionHost(player) {
  sessionHostPlayerId = player.id;
  sessionHostPlayerName = player.name;
  logInfo(`session host: ${player.name}`);
  return player;
}

/** @returns {import("@minecraft/server").Player | null} */
function getSessionHost() {
  if (sessionHostPlayerId) {
    const byId = world.getPlayers().find((p) => p.id === sessionHostPlayerId);
    if (byId?.isValid) return byId;
  }

  if (sessionHostPlayerName) {
    const byName = world.getPlayers().find((p) => p?.isValid && p.name === sessionHostPlayerName);
    if (byName) {
      sessionHostPlayerId = byName.id;
      logInfo(`session host restored by name: ${byName.name}`);
      return byName;
    }
  }

  return null;
}

function isSessionHost(player) {
  if (!player?.isValid) return false;
  const host = getSessionHost();
  return host !== null && player.id === host.id;
}

/** @returns {import("@minecraft/server").Player | null} */
function ensureSessionHostAssigned() {
  const host = getSessionHost();
  if (host) return host;

  const players = world.getPlayers().filter((p) => p?.isValid);
  if (players.length === 0) {
    sessionHostPlayerId = null;
    sessionHostPlayerName = null;
    return null;
  }

  return claimSessionHost(players[0]);
}

/**
 * @param {import("@minecraft/server").Player | undefined} player
 * @param {string} actionLabel
 * @returns {boolean}
 */
function requireSessionHost(player, actionLabel) {
  if (!player?.isValid) return false;
  if (isSessionHost(player)) return true;
  robwPlayerMessage(player, `§c${actionLabel}はホストだけができます。`);
  return false;
}

function removeRobwWandsFromPlayer(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item || !isRobwWandItemType(item.typeId)) continue;
    container.setItem(slot, undefined);
  }
}

function clearPlayerInventoryCompletely(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return;

  for (let slot = 0; slot < container.size; slot++) {
    container.setItem(slot, undefined);
  }
}

function ensureHostWandDistribution() {
  ensureSessionHostAssigned();
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    if (isSessionHost(player)) {
      giveStarterWand(player);
    } else {
      removeRobwWandsFromPlayer(player);
    }
  }
}

function onSessionHostLeft(player) {
  if (player.id !== sessionHostPlayerId) return;
  sessionHostPlayerId = null;
  sessionHostPlayerName = null;
  system.run(() => {
    const next = getSessionHost();
    if (!next) return;
    robwBroadcast(`§6${next.name}§fがホストになりました。`);
    logInfo(`session host reassigned to ${next.name}`);
    if (shouldResetToLobbyInventory()) {
      resetAllPlayersToLobbyInventory();
    } else {
      ensureHostWandDistribution();
    }
  });
}

function resolveStartHost(initiator) {
  const host = getSessionHost();
  if (initiator?.isValid && isSessionHost(initiator)) return initiator;
  return host;
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
      message: "§c地面の上で start してください。(空中や足場の下では開始できません)",
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

function getChestCleanupBounds(chestSpot) {
  const footY = chestSpot.footY ?? Math.floor((chestSpot.y ?? 0) - 1);
  const vertical = Math.max(2, CONFIG.CHEST_CLEANUP_VERTICAL_RANGE ?? 10);
  return {
    minY: footY - vertical,
    maxY: footY + vertical,
  };
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
  const x1 = baseX - radius;
  const x2 = baseX + radius;
  const z1 = baseZ - radius;
  const z2 = baseZ + radius;
  const y1 = Math.floor(minY);
  const y2 = Math.floor(maxY);
  let removed = 0;

  if (typeof dimension.runCommand === "function") {
    for (const typeId of CONFIG.SUBMISSION_CHEST_BLOCK_TYPES) {
      const blockName = typeId.replace("minecraft:", "");
      try {
        dimension.runCommand(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} air replace ${blockName}`);
      } catch (error) {
        logWarn(`fill replace ${blockName} failed: ${error}`);
      }
    }
  }

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let y = y1; y <= y2; y++) {
        const x = baseX + dx;
        const z = baseZ + dz;
        try {
          const block = dimension.getBlock({ x, y, z });
          if (!block?.isValid || !isSubmissionChestBlockType(block.typeId)) continue;

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
    logInfo(
      `removed ${removed} extra chest(s) near (${baseX}, ${baseZ}) r=${radius} y=${y1}..${y2}`,
    );
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
    if (block && CONFIG.SUBMISSION_CHEST_BLOCK_TYPES.includes(block.typeId)) {
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

  const cleanup = getChestCleanupBounds(spot);
  removeExtraChestsInArea(
    dimension,
    spot.x,
    spot.z,
    CONFIG.CHEST_CLEANUP_RADIUS,
    cleanup.minY,
    cleanup.maxY,
  );

  const before = dimension.getBlock({ x: spot.x, y: spot.y, z: spot.z });
  if (!before?.isAir) {
    logWarn(`submission chest blocked at (${spot.x}, ${spot.y}, ${spot.z}) type=${before?.typeId}`);
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

  broadcast(`§b納品チェストを足元に設置しました: (${spot.x}, ${spot.y}, ${spot.z})`);
  logInfo(`submission chest placed at (${spot.x}, ${spot.y}, ${spot.z}) footY=${spot.footY}`);
  return true;
}

/** @returns {boolean} */
function prepareRoundStart(validation) {
  const dimension = validation.dimension;
  const { center, chestSpot } = validation;

  clearSpawnedRoundEntities();
  removePlacedSubmissionChest(dimension);

  const cleanup = getChestCleanupBounds(chestSpot);
  removeExtraChestsInArea(
    dimension,
    center.x,
    center.z,
    CONFIG.CHEST_CLEANUP_RADIUS,
    cleanup.minY,
    cleanup.maxY,
  );
  clearDroppedItemsNearRoundCenter(center, dimension);

  if (!placeSubmissionChest(dimension, chestSpot)) {
    return false;
  }
  const spawned = spawnRoundAnimalsAtGate(dimension);

  for (const player of world.getPlayers()) {
    giveStartKit(player);
  }

  broadcast(
    `§f骨を §7x${CONFIG.START_GIVE_BONES} §fにリセット、§fハコイヌ §7${spawned.hakoinuSpawned} 匹§7 / §c別種 §7${spawned.penaltySpawned} 匹§fを §7半径 ${CONFIG.SPAWN_MIN_DISTANCE}~${CONFIG.SPAWN_MAX_DISTANCE} §fに出現！`,
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
    const distSq = distanceSq(location.x, location.y, location.z, el.x, el.y, el.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = entity;
    }
  }

  return nearest;
}

function canCaptureInCurrentGame() {
  return gameState === "running";
}

function sendCaptureBlockedMessage(player) {
  switch (gameState) {
    case "countdown":
      robwPlayerMessage(player, "§c起動カウントダウン中は捕獲できません。");
      break;
    case "closing":
      robwPlayerMessage(player, "§cゲート閉鎖中は捕獲できません。");
      break;
    default:
      robwPlayerMessage(
        player,
        `§cゲート停止中は捕獲できません。${CONFIG.CHAT_PREFIX} start で起動してください。`,
      );
      break;
  }
}

/** @type {Map<string, number>} */
const recentProtectUseTick = new Map();

function shouldProcessProtectUse(playerId) {
  const now = system.currentTick;
  const last = recentProtectUseTick.get(playerId) ?? 0;
  if (now - last < 10) return false;
  recentProtectUseTick.set(playerId, now);
  return true;
}

function tryProtectHakoinu(player, preferredTarget) {
  if (!player?.isValid) return;
  if (!shouldProcessProtectUse(player.id)) return;

  if (!canCaptureInCurrentGame()) {
    sendCaptureBlockedMessage(player);
    return;
  }

  let target = preferredTarget;
  if (target && (!target.isValid || (!isHakoinuEntity(target) && !isPenaltyAnimalEntity(target)))) {
    target = undefined;
  }
  if (!target) {
    target = findNearestProtectableAnimal(player);
  }
  if (!target) {
    robwPlayerMessage(player, "§7近くにハコイヌや動物がいません。");
    return;
  }

  const boneCost = Math.max(0, CONFIG.BONES_PER_CAPTURE ?? 1);
  if (boneCost > 0 && countItemInInventory(player, CONFIG.PROTECT_ITEM) < boneCost) {
    robwPlayerMessage(player, "§c骨が足りません。");
    return;
  }

  const entityId = target.id;
  const entityType = target.typeId;
  const kind = CONFIG.HAKOINU_ENTITY_TYPES.includes(entityType) ? "hakoinu" : "wrong";

  if (boneCost > 0) {
    const consumed = consumeItemFromInventory(player, CONFIG.PROTECT_ITEM, boneCost);
    if (consumed < boneCost) {
      robwPlayerMessage(player, "§c骨が足りません。");
      return;
    }
  }

  removeSpawnedRoundEntityRef(entityId);
  scriptRemovedRoundEntityIds.add(entityId);
  target.remove();

  giveReturnBox(player, 1, kind);
  const chest = getActiveSubmissionChestPos();
  robwPlayerMessage(
    player,
    `§a毛皮を手に入れた！ §7${CONFIG.RETURN_BOX_DISPLAY_NAME} を納品チェスト (${chest.x}, ${chest.y}, ${chest.z}) に入れてください。`,
  );
  logInfo(`${kind} captured by ${player.name} (entity ${entityId}, ${entityType})`);
  spawnAfterCapture(player);
}

function resolveKillAttributionPlayer(damageSource) {
  if (!damageSource) return null;
  try {
    const entity = damageSource.damagingEntity;
    if (!entity) return null;
    if (entity.isValid && entity.typeId === "minecraft:player") {
      return entity;
    }
    const projectile = entity.getComponent("minecraft:projectile");
    const owner = projectile?.owner;
    if (owner?.isValid && owner.typeId === "minecraft:player") {
      return owner;
    }
  } catch {
    return null;
  }
  return null;
}

function isRoundSpawnedHakoinuEntity(entityId, typeId) {
  if (!entityId || !CONFIG.HAKOINU_ENTITY_TYPES.includes(typeId)) return false;
  if (scriptRemovedRoundEntityIds.has(entityId)) return false;
  return spawnedRoundEntityIds.includes(entityId);
}

function applyHakoinuCombatPenalty(player, points, message) {
  if (!player?.isValid || points === 0) return;
  const total = addReturnPoints(player, points);
  robwPlayerMessage(player, `${message} ${formatPointsDelta(points)} §7(合計 ${total}pt)`);
  if (timerHudActive) {
    refreshRemainingTimeHud();
  }
}

function handleHakoinuRoundHurt(hurtEntity, damageSource) {
  if (gameState !== "running") return;

  let entityId;
  let typeId;
  try {
    entityId = hurtEntity.id;
    typeId = hurtEntity.typeId;
  } catch {
    return;
  }

  if (!isRoundSpawnedHakoinuEntity(entityId, typeId)) return;

  const penalty = CONFIG.POINTS_HAKOINU_HIT ?? -1;
  if (penalty === 0) return;

  const attacker = resolveKillAttributionPlayer(damageSource);
  if (!attacker?.isValid) return;

  applyHakoinuCombatPenalty(attacker, penalty, "§cハコイヌを攻撃してしまった！");
  logInfo(`hakoinu hit by ${attacker.name} (${penalty} pts, entity ${entityId})`);
}

function handleHakoinuRoundDeath(deadEntity, damageSource) {
  if (gameState !== "running") return;

  let entityId;
  let typeId;
  try {
    entityId = deadEntity.id;
    typeId = deadEntity.typeId;
  } catch {
    return;
  }

  if (scriptRemovedRoundEntityIds.has(entityId)) {
    scriptRemovedRoundEntityIds.delete(entityId);
    return;
  }

  if (!isRoundSpawnedHakoinuEntity(entityId, typeId)) return;

  removeSpawnedRoundEntityRef(entityId);

  const penalty = CONFIG.POINTS_HAKOINU_KILL ?? -10;
  if (penalty === 0) return;

  const killer = resolveKillAttributionPlayer(damageSource);
  if (killer?.isValid) {
    const total = addReturnPoints(killer, penalty);
    broadcast(
      `§c${killer.name}§fがハコイヌを倒してしまった！ ${formatPointsDelta(penalty)} §7(合計 ${total}pt)`,
    );
    logInfo(`hakoinu killed by ${killer.name} (${penalty} pts, entity ${entityId})`);
    if (timerHudActive) {
      refreshRemainingTimeHud();
    }
  } else {
    logInfo(`hakoinu killed with no player attribution (entity ${entityId})`);
  }
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
  const counts = { hakoinu: 0, wrong: 0, unified: 0 };
  if (!container) return counts;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!isReturnBoxItem(item)) continue;

    const legacyKind = getLegacyReturnBoxKind(item);
    if (legacyKind === "hakoinu") {
      counts.hakoinu += item.amount;
    } else if (legacyKind === "wrong") {
      counts.wrong += item.amount;
    } else {
      counts.unified += item.amount;
    }
  }
  return counts;
}

function hasCaptureItemsInContainer(container) {
  const counts = countCaptureItemsInContainer(container);
  return counts.hakoinu > 0 || counts.wrong > 0 || counts.unified > 0;
}

/** 納品チェストで吸収・減点しない（操作時計・骨） */
function isChestPreservedItem(itemStack) {
  if (!itemStack) return false;
  return isRobwWandItemType(itemStack.typeId) || itemStack.typeId === CONFIG.PROTECT_ITEM;
}

function countJunkItemsInContainer(container) {
  let count = 0;
  if (!container) return 0;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;
    if (isReturnBoxItem(item)) continue;
    if (isChestPreservedItem(item)) continue;
    count += item.amount;
  }
  return count;
}

function hasSubmissionChestItemsInContainer(container) {
  return hasCaptureItemsInContainer(container) || countJunkItemsInContainer(container) > 0;
}

function clearJunkItemsFromContainer(container) {
  let removed = 0;
  if (!container) return removed;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;
    if (isReturnBoxItem(item)) continue;
    if (isChestPreservedItem(item)) continue;
    removed += item.amount;
    container.setItem(slot, undefined);
  }
  return removed;
}

function clearCaptureItemsFromContainer(container) {
  const removed = { hakoinu: 0, wrong: 0, unified: 0 };
  if (!container) return removed;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!isReturnBoxItem(item)) continue;

    const legacyKind = getLegacyReturnBoxKind(item);
    if (legacyKind === "hakoinu") {
      removed.hakoinu += item.amount;
    } else if (legacyKind === "wrong") {
      removed.wrong += item.amount;
    } else {
      removed.unified += item.amount;
    }
    container.setItem(slot, undefined);
  }
  return removed;
}

function announceDelivery(player, returned, junkCount, points, total) {
  const wrongPenalty = returned.wrong * CONFIG.POINTS_WRONG_ANIMAL;
  const junkPenalty = junkCount * CONFIG.POINTS_CHEST_JUNK_ITEM;
  const furTotal = returned.hakoinu + returned.wrong;

  if (junkCount > 0 && furTotal <= 0) {
    broadcast(
      `§c${player.name}§fが納品チェストに毛皮以外を入れてしまった！ ${formatPointsDelta(junkPenalty)} §7(合計 ${total}pt)`,
    );
    return;
  }

  if (returned.wrong > 0 && returned.hakoinu > 0) {
    broadcast(
      `§6${player.name}§fが納品しました！ §aハコイヌ${returned.hakoinu} §7/ §c別種${returned.wrong} (${formatPointsDelta(wrongPenalty)}) §7-> ${formatPointsDelta(points)} §7(合計 ${total}pt)`,
    );
  } else if (returned.wrong > 0) {
    broadcast(
      `§c${player.name}§fが別種の動物を納品してしまった！ ${formatPointsDelta(points)} §7(合計 ${total}pt)`,
    );
  } else if (returned.hakoinu === 1) {
    broadcast(
      `§6${player.name}§fがハコイヌをボックスワールドへ帰還させました！ ${formatPointsDelta(points)} §7(合計 ${total}pt)`,
    );
  } else {
    broadcast(
      `§6${player.name}§fが捕獲ハコイヌを${returned.hakoinu}匹納品しました！ ${formatPointsDelta(points)} §7(合計 ${total}pt)`,
    );
  }
}

function processSubmissionChest(player) {
  if (gameState !== "running") return;
  if (!player?.isValid) return;

  const container = getSubmissionChestContainer();
  if (!container) {
    const chest = getActiveSubmissionChestPos();
    robwPlayerMessage(
      player,
      `§c納品チェストがありません。(${chest.x}, ${chest.y}, ${chest.z}) 付近を確認してください。`,
    );
    return;
  }

  const pending = countCaptureItemsInContainer(container);
  const pendingJunk = countJunkItemsInContainer(container);
  if (pending.hakoinu <= 0 && pending.wrong <= 0 && pending.unified <= 0 && pendingJunk <= 0) {
    return;
  }

  const cleared = clearCaptureItemsFromContainer(container);
  const junkRemoved = clearJunkItemsFromContainer(container);
  const fromLedger = consumeReturnBoxKindsFromAnyLedger(cleared.unified);
  const returned = {
    hakoinu: cleared.hakoinu + fromLedger.hakoinu,
    wrong: cleared.wrong + fromLedger.wrong,
  };
  if (returned.hakoinu <= 0 && returned.wrong <= 0 && junkRemoved <= 0) {
    return;
  }

  const points =
    returned.hakoinu * CONFIG.POINTS_PER_BOX +
    returned.wrong * CONFIG.POINTS_WRONG_ANIMAL +
    junkRemoved * CONFIG.POINTS_CHEST_JUNK_ITEM;
  const total = addReturnPoints(player, points);
  const bonesFromHakoinu = returned.hakoinu * CONFIG.BONES_PER_HAKOINU_DELIVERY;
  const bonesFromWrong = returned.wrong * (CONFIG.BONES_PER_WRONG_ANIMAL_DELIVERY ?? 0);
  const bonesEarned = bonesFromHakoinu + bonesFromWrong;
  if (bonesEarned > 0) {
    giveBones(player, bonesEarned);
  }
  announceDelivery(player, returned, junkRemoved, points, total);
  const furConsumed = returned.hakoinu + returned.wrong;
  if (furConsumed > 0) {
    robwPlayerMessage(player, `§7納品した毛皮 ${furConsumed} 枚を消費しました。`);
  }
  if (junkRemoved > 0) {
    robwPlayerMessage(
      player,
      `§7納品チェストから毛皮以外 x${junkRemoved} を吸収しました。 ${formatPointsDelta(junkRemoved * CONFIG.POINTS_CHEST_JUNK_ITEM)}`,
    );
  }
  if (returned.wrong > 0) {
    robwPlayerMessage(
      player,
      `§c別種 ${returned.wrong} 枚 … ${formatPointsDelta(returned.wrong * CONFIG.POINTS_WRONG_ANIMAL)}`,
    );
  }
  if (bonesFromHakoinu > 0) {
    robwPlayerMessage(
      player,
      `§a納品ボーナス: 骨 x${bonesFromHakoinu} §7(ハコイヌ x${CONFIG.BONES_PER_HAKOINU_DELIVERY}/枚)`,
    );
  }
  if (bonesFromWrong > 0) {
    robwPlayerMessage(
      player,
      `§a納品ボーナス: 骨 x${bonesFromWrong} §7(別種 x${CONFIG.BONES_PER_WRONG_ANIMAL_DELIVERY}/枚)`,
    );
  }
  logInfo(
    `${player.name} submitted hakoinu=${returned.hakoinu} wrong=${returned.wrong} junk=${junkRemoved} (${points} pts)`,
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
    return ["(参加者なし)"];
  }

  return entries.map((entry, index) => {
    const rank = index + 1;
    return `${rank}位：${entry.name} - ${entry.score}pt`;
  });
}

function showRanking(title = "§6Return of BoxWorld 帰還ランキング") {
  broadcast(title, { priority: "high" });
  for (const line of buildRankingLines()) {
    broadcast(`§e${line}`, { priority: "high" });
  }
}

// ---------------------------------------------------------------------------
// タイマー
// ---------------------------------------------------------------------------

function resetTimerState() {
  gameEndWallMs = 0;
  nextTimeNotifyWallMs = 0;
  announcedMilestones = new Set();
  resetEndCountdownSyncState();
  resetUiBroadcastBudget();
}

/** 残り tick（実時間。マイクラポーズ中も Date.now() で進む） */
function getGameRemainingTicks() {
  if (gameEndWallMs <= 0) return 0;
  return Math.max(0, Math.ceil((gameEndWallMs - Date.now()) / MS_PER_TICK));
}

function stopRemainingTimeHudLoop() {
  if (hudLoopId !== undefined) {
    system.clearRun(hudLoopId);
    hudLoopId = undefined;
  }
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
  if (spawnReplenishLoopId !== undefined) {
    system.clearRun(spawnReplenishLoopId);
    spawnReplenishLoopId = undefined;
  }
  stopRemainingTimeHudLoop();
}

function getTimerObjective() {
  const board = world.scoreboard;
  let objective = board.getObjective(CONFIG.TIMER_SCORE_OBJECTIVE);
  if (!objective) {
    objective = board.addObjective(CONFIG.TIMER_SCORE_OBJECTIVE, "§e§l残り時間");
  }
  return objective;
}

function setupTimerSidebar() {
  if (!CONFIG.SHOW_REMAINING_TIME_HUD) return;
  try {
    const board = world.scoreboard;
    if (typeof board.setObjectiveAtDisplaySlot !== "function") return;
    board.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
      objective: getTimerObjective(),
    });
  } catch (error) {
    logWarn(`timer sidebar setup failed: ${error}`);
  }
}

function clearTimerSidebarParticipants() {
  try {
    const objective = getTimerObjective();
    if (typeof objective.getParticipants !== "function") return;
    for (const participant of objective.getParticipants()) {
      try {
        objective.removeParticipant(participant);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  timerHudRemainingName = null;
  timerHudLimitName = null;
  timerHudChestName = null;
  timerHudPlayerPointNames.clear();
}

function removeTimerFakePlayer(objective, name) {
  if (!name) return;
  try {
    objective.removeParticipant(name);
  } catch {
    // ignore
  }
}

function setTimerFakePlayer(objective, name, score) {
  objective.setScore(name, score);
}

function clearRemainingTimeHud() {
  timerHudActive = false;
  stopRemainingTimeHudLoop();

  for (const player of world.getPlayers()) {
    try {
      player.onScreenDisplay?.setActionBar("");
    } catch {
      // ignore
    }
  }

  try {
    const board = world.scoreboard;
    const objective = board.getObjective(CONFIG.TIMER_SCORE_OBJECTIVE);
    if (objective) {
      if (timerHudRemainingName) {
        removeTimerFakePlayer(objective, timerHudRemainingName);
      }
      if (timerHudLimitName) {
        removeTimerFakePlayer(objective, timerHudLimitName);
      }
      if (timerHudChestName) {
        removeTimerFakePlayer(objective, timerHudChestName);
      }
      for (const name of timerHudPlayerPointNames.values()) {
        removeTimerFakePlayer(objective, name);
      }
      timerHudPlayerPointNames.clear();
      clearTimerSidebarParticipants();
      if (typeof board.removeObjective === "function") {
        board.removeObjective(objective);
      }
    }
    timerHudRemainingName = null;
    timerHudLimitName = null;
    timerHudChestName = null;
    timerHudPlayerPointNames.clear();

    if (typeof board.clearObjectiveAtDisplaySlot === "function") {
      board.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
    }
  } catch (error) {
    logWarn(`clear timer hud failed: ${error}`);
  }
}

function formatRemainingTimeHudText(remainingTicks) {
  const remaining = Math.max(0, remainingTicks);
  const urgent = remaining <= 30 * TICKS_PER_SECOND;
  const time = formatTimeRemaining(remaining);
  if (urgent) {
    return `§c§l残 ${time}`;
  }
  return `§e§l残 ${time}`;
}

function formatLimitTimeHudText() {
  const time = formatTimeRemaining(GATE_OPEN_TICKS);
  return `§7制限 §f${time}`;
}

function formatChestHudLine() {
  const chest = getActiveSubmissionChestPos();
  return `§7納品 §f${chest.x} ${chest.y} ${chest.z}`;
}

function formatPlayerPointsHudLine(player, solo) {
  const pts = getPlayerReturnPoints(player);
  if (solo) {
    return `§f帰還 §e${pts}pt`;
  }
  return `§7${player.name} §e${pts}pt`;
}

/** アクションバー用（サイドバー右の並び用数字を出さない） */
function formatHudActionBarForPlayer(viewer, remainingLineText, limitLineText) {
  const segments = [remainingLineText, limitLineText, formatChestHudLine()];
  const players = world.getPlayers().filter((p) => p?.isValid);

  if (players.length <= 1) {
    segments.push(`§f帰還 §e${getPlayerReturnPoints(viewer)}pt`);
  } else {
    for (const player of players) {
      segments.push(`§7${player.name} §e${getPlayerReturnPoints(player)}pt`);
    }
  }

  return segments.join(" §7| ");
}

function clearTimerSidebarHudLines() {
  try {
    const board = world.scoreboard;
    const objective = board.getObjective(CONFIG.TIMER_SCORE_OBJECTIVE);
    if (objective) {
      if (timerHudRemainingName) {
        removeTimerFakePlayer(objective, timerHudRemainingName);
      }
      if (timerHudLimitName) {
        removeTimerFakePlayer(objective, timerHudLimitName);
      }
      if (timerHudChestName) {
        removeTimerFakePlayer(objective, timerHudChestName);
      }
      for (const name of timerHudPlayerPointNames.values()) {
        removeTimerFakePlayer(objective, name);
      }
      timerHudPlayerPointNames.clear();
      clearTimerSidebarParticipants();
    }
    if (typeof board.clearObjectiveAtDisplaySlot === "function") {
      board.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
    }
  } catch {
    // ignore
  }
  timerHudRemainingName = null;
  timerHudLimitName = null;
  timerHudChestName = null;
}

function applyTimerHudActionBar(remainingLineText, limitLineText) {
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    try {
      player.onScreenDisplay?.setActionBar(
        formatHudActionBarForPlayer(player, remainingLineText, limitLineText),
      );
    } catch {
      // ignore
    }
  }
}

function updateTimerSidebarLine(objective, previousName, lineText, score) {
  if (previousName && previousName !== lineText) {
    removeTimerFakePlayer(objective, previousName);
  }
  setTimerFakePlayer(objective, lineText, score);
  return lineText;
}

/**
 * サイドバー（上→下）: 残り / 制限 / 納品座標 / 帰還pt（1人時）または各プレイヤー
 */
function updateTimerSidebar(remainingLineText, limitLineText) {
  if (!timerHudActive || gameState !== "running") return false;

  try {
    const objective = getTimerObjective();
    timerHudRemainingName = updateTimerSidebarLine(
      objective,
      timerHudRemainingName,
      remainingLineText,
      6,
    );
    timerHudLimitName = updateTimerSidebarLine(objective, timerHudLimitName, limitLineText, 5);
    timerHudChestName = updateTimerSidebarLine(
      objective,
      timerHudChestName,
      formatChestHudLine(),
      4,
    );

    const players = world.getPlayers().filter((p) => p?.isValid);
    const solo = players.length === 1;
    const activeIds = new Set();
    let slot = 3;

    for (const player of players) {
      const line = formatPlayerPointsHudLine(player, solo);
      const prev = timerHudPlayerPointNames.get(player.id);
      timerHudPlayerPointNames.set(player.id, updateTimerSidebarLine(objective, prev, line, slot));
      activeIds.add(player.id);
      slot -= 1;
    }

    for (const [playerId, name] of timerHudPlayerPointNames) {
      if (activeIds.has(playerId)) continue;
      removeTimerFakePlayer(objective, name);
      timerHudPlayerPointNames.delete(playerId);
    }

    return true;
  } catch (error) {
    logWarn(`timer sidebar update failed: ${error}`);
    return false;
  }
}

function updateRemainingTimeHud(remainingTicks) {
  if (!CONFIG.SHOW_REMAINING_TIME_HUD) return;
  if (!timerHudActive || gameState !== "running") {
    clearRemainingTimeHud();
    return;
  }

  const remainingText = formatRemainingTimeHudText(remainingTicks);
  const limitText = formatLimitTimeHudText();

  if (CONFIG.TIMER_HUD_USE_SIDEBAR) {
    const sidebarOk = updateTimerSidebar(remainingText, limitText);
    if (sidebarOk) {
      for (const player of world.getPlayers()) {
        if (!player?.isValid) continue;
        try {
          player.onScreenDisplay?.setActionBar("");
        } catch {
          // ignore
        }
      }
      return;
    }
  }

  clearTimerSidebarHudLines();
  applyTimerHudActionBar(remainingText, limitText);
}

function refreshRemainingTimeHud() {
  if (gameState !== "running") {
    clearRemainingTimeHud();
    return;
  }
  updateRemainingTimeHud(getGameRemainingTicks());
}

function startRemainingTimeHudLoop() {
  if (!CONFIG.SHOW_REMAINING_TIME_HUD) return;
  if (gameState !== "running") return;

  stopRemainingTimeHudLoop();
  timerHudActive = true;
  if (CONFIG.TIMER_HUD_USE_SIDEBAR) {
    setupTimerSidebar();
  } else {
    clearTimerSidebarHudLines();
  }
  refreshRemainingTimeHud();
  hudLoopId = system.runInterval(refreshRemainingTimeHud, 10);
}

function startTimerHudWatchdog() {
  if (timerHudWatchdogId !== undefined) return;
  timerHudWatchdogId = system.runInterval(() => {
    if (gameState === "running" && timerHudActive) return;
    const objective = world.scoreboard.getObjective(CONFIG.TIMER_SCORE_OBJECTIVE);
    if (!objective) return;
    clearRemainingTimeHud();
  }, 40);
}

function notifyMilestones(remainingTicks) {
  const remainingSec = Math.ceil(remainingTicks / TICKS_PER_SECOND);

  for (const sec of MILESTONE_SECONDS) {
    if (remainingSec > sec || announcedMilestones.has(sec)) continue;

    announcedMilestones.add(sec);

    if (sec === 60) {
      broadcast("§c§l[ゲート閉鎖まで残り1分!]", { priority: "high" });
    } else if (sec === 30) {
      broadcast("§c§l[残り30秒!]", { priority: "high" });
    } else if (sec === 10) {
      broadcast("§e§l[残り10秒!]", { priority: "high" });
    }
  }
}

function tickGameTimer() {
  if (gameState !== "running") return;

  const remaining = getGameRemainingTicks();

  if (remaining <= 0) {
    finishGame();
    return;
  }

  tryShowTimerSyncedEndCountdown(remaining);
  notifyMilestones(remaining);
  if (timerHudActive) {
    updateRemainingTimeHud(remaining);
  }

  const nowMs = Date.now();
  if (nowMs >= nextTimeNotifyWallMs) {
    broadcast(`§bゲート開放時間 残り: §f${formatTimeRemaining(remaining)}`);
    nextTimeNotifyWallMs = nowMs + TIME_NOTIFY_INTERVAL_MS;
  }
}

// ---------------------------------------------------------------------------
// ゲームフロー
// ---------------------------------------------------------------------------

function finishGame() {
  requestGameEnd(false);
}

function clearPendingRoundDeathRespawns() {
  pendingRoundDeathRespawnIds.clear();
  roundDeathRecoveryInProgress.clear();
  roundDeathPenaltyAppliedIds.clear();
  pendingRoundDeathPenaltyIds.clear();
}

function resolveRoundDeathPlayer(playerOrId) {
  if (playerOrId?.isValid) return playerOrId;
  const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
  if (!id) return null;
  return world.getPlayers().find((p) => p.id === id && p.isValid) ?? null;
}

function applyRoundDeathPenalty(playerOrId, fallbackName) {
  if (gameState !== "running" || !activeRoundCenter) return false;

  const playerId = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
  if (!playerId || roundDeathPenaltyAppliedIds.has(playerId)) return false;

  const penalty = CONFIG.POINTS_PLAYER_DEATH ?? -10;
  if (penalty === 0) {
    roundDeathPenaltyAppliedIds.add(playerId);
    return false;
  }

  const player = resolveRoundDeathPlayer(playerOrId);
  if (!player) {
    pendingRoundDeathPenaltyIds.add(playerId);
    return false;
  }

  roundDeathPenaltyAppliedIds.add(playerId);
  pendingRoundDeathPenaltyIds.delete(playerId);

  const total = addReturnPoints(player, penalty);
  const displayName = player.name ?? fallbackName ?? "?";
  broadcast(`§c${displayName}§fが倒れました！ ${formatPointsDelta(penalty)} §7(合計 ${total}pt)`);
  robwPlayerMessage(
    player,
    `§c死亡… ${formatPointsDelta(penalty)} §7開始地点へテレポートして復帰します。`,
  );
  if (timerHudActive) {
    refreshRemainingTimeHud();
  }
  logInfo(`player death penalty: ${displayName} (${penalty} pt, total ${total})`);
  return true;
}

function getRoundStartTeleportTarget(player, center, dimension) {
  const players = world.getPlayers().filter((p) => p?.isValid);
  const index = Math.max(
    0,
    players.findIndex((p) => p.id === player.id),
  );
  const count = Math.max(1, players.length);
  const baseY = center.y + 1;
  const radius = Math.max(2, Math.ceil(Math.sqrt(count)));
  const angle = (Math.PI * 2 * index) / count;
  return {
    location: {
      x: center.x + 0.5 + Math.cos(angle) * radius,
      y: baseY,
      z: center.z + 0.5 + Math.sin(angle) * radius,
    },
    dimension,
  };
}

function setPlayerRoundSpawnPoint(player, center, dimension) {
  if (!player?.isValid || !center || !dimension) return false;
  if (typeof player.setSpawnPoint !== "function") return false;

  const { location } = getRoundStartTeleportTarget(player, center, dimension);
  try {
    player.setSpawnPoint({
      dimension,
      x: location.x,
      y: location.y,
      z: location.z,
    });
    return true;
  } catch (error) {
    logWarn(`setSpawnPoint failed for ${player.name}: ${error}`);
    return false;
  }
}

function rememberPlayerSpawnPointsBeforeRound() {
  savedPlayerSpawnBeforeRound.clear();
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    try {
      const spawn = typeof player.getSpawnPoint === "function" ? player.getSpawnPoint() : undefined;
      savedPlayerSpawnBeforeRound.set(player.id, spawn);
    } catch {
      savedPlayerSpawnBeforeRound.set(player.id, undefined);
    }
  }
}

function restorePlayerSpawnPointsAfterRound() {
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    if (!savedPlayerSpawnBeforeRound.has(player.id)) continue;
    const spawn = savedPlayerSpawnBeforeRound.get(player.id);
    try {
      if (typeof player.setSpawnPoint === "function") {
        player.setSpawnPoint(spawn);
      }
    } catch (error) {
      logWarn(`restore spawn failed for ${player.name}: ${error}`);
    }
  }
  savedPlayerSpawnBeforeRound.clear();
}

function enableRoundImmediateRespawn() {
  try {
    const rules = world.gameRules;
    if (!rules || !("doImmediateRespawn" in rules)) return;
    savedDoImmediateRespawn = rules.doImmediateRespawn;
    rules.doImmediateRespawn = true;
  } catch (error) {
    logWarn(`doImmediateRespawn enable failed: ${error}`);
  }
}

function disableRoundImmediateRespawn() {
  try {
    const rules = world.gameRules;
    if (!rules || !("doImmediateRespawn" in rules)) return;
    if (savedDoImmediateRespawn !== null) {
      rules.doImmediateRespawn = savedDoImmediateRespawn;
    }
    savedDoImmediateRespawn = null;
  } catch (error) {
    logWarn(`doImmediateRespawn restore failed: ${error}`);
  }
}

function restoreRoundRespawnSettings() {
  restorePlayerSpawnPointsAfterRound();
  disableRoundImmediateRespawn();
}

function isPlayerAtRoundStart(player) {
  if (!player?.isValid || !activeRoundCenter) return false;
  const dimension = getRoundStartDimension();
  if (!dimension || player.dimension?.id !== dimension.id) return false;

  const { location } = getRoundStartTeleportTarget(player, activeRoundCenter, dimension);
  const dx = player.location.x - location.x;
  const dy = player.location.y - location.y;
  const dz = player.location.z - location.z;
  return dx * dx + dy * dy + dz * dz <= 16;
}

function teleportPlayerToRoundStart(player, options = {}) {
  if (!player?.isValid || !activeRoundCenter) return false;

  const center = activeRoundCenter;
  const dimension = getRoundStartDimension();
  if (!dimension) return false;

  if (options.updateSpawn !== false) {
    setPlayerRoundSpawnPoint(player, center, dimension);
  }

  if (options.skipIfAlreadyThere && isPlayerAtRoundStart(player)) {
    return true;
  }

  const { location } = getRoundStartTeleportTarget(player, center, dimension);
  try {
    player.teleport(location, { dimension, keepVelocity: false });
    return true;
  } catch (error) {
    logWarn(`failed to respawn ${player.name} at round start: ${error}`);
    return false;
  }
}

/** ラウンド中の死亡 1 回につき、開始地点へ戻す処理を 1 系統だけ走らせる */
function beginRoundDeathRecovery(playerOrId, options = {}) {
  if (gameState !== "running" || !activeRoundCenter) return false;

  const playerId = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
  if (!playerId || roundDeathRecoveryInProgress.has(playerId)) {
    return false;
  }

  roundDeathRecoveryInProgress.add(playerId);
  pendingRoundDeathRespawnIds.add(playerId);
  applyRoundDeathPenalty(playerOrId, options.fallbackName);

  const teleportNow = () => {
    const live = resolveRoundDeathPlayer(playerId);
    if (!live) return false;
    return teleportPlayerToRoundStart(live);
  };

  teleportNow();

  // 別ディメンション死亡などで即 TP できなかったときだけ、最大 2 回だけ再試行
  for (const delay of [8, 25]) {
    system.runTimeout(() => {
      if (!roundDeathRecoveryInProgress.has(playerId)) return;
      if (gameState !== "running" || !activeRoundCenter) return;
      const live = resolveRoundDeathPlayer(playerId);
      if (!live) return;
      teleportPlayerToRoundStart(live, {
        skipIfAlreadyThere: true,
        updateSpawn: false,
      });
    }, delay);
  }

  system.runTimeout(() => {
    roundDeathRecoveryInProgress.delete(playerId);
    roundDeathPenaltyAppliedIds.delete(playerId);
  }, 45);

  return true;
}

function gatherAllPlayersToRoundStart(validation) {
  const players = world.getPlayers().filter((player) => player?.isValid);
  if (players.length <= 0) return;

  const center = validation.center;
  const dimension = validation.dimension;

  for (const player of players) {
    setPlayerRoundSpawnPoint(player, center, dimension);
    const { location } = getRoundStartTeleportTarget(player, center, dimension);
    try {
      player.teleport(location, { dimension, keepVelocity: false });
    } catch (error) {
      logWarn(`failed to gather ${player.name}: ${error}`);
    }
  }
}

function handlePlayerFatalRoundHurt(player) {
  beginRoundDeathRecovery(player);
}

function handlePlayerRoundDeath(player, fallbackName) {
  if (gameState !== "running" || !activeRoundCenter) return;
  if (!player?.id) return;
  beginRoundDeathRecovery(player, { fallbackName });
}

function handlePlayerRoundRespawn(player) {
  if (gameState !== "running" || !player?.isValid || !activeRoundCenter) return;
  if (!pendingRoundDeathRespawnIds.delete(player.id)) return;

  if (pendingRoundDeathPenaltyIds.has(player.id)) {
    applyRoundDeathPenalty(player);
  }

  system.runTimeout(() => {
    if (!player?.isValid || gameState !== "running") return;
    if (!isPlayerAtRoundStart(player)) {
      teleportPlayerToRoundStart(player, { skipIfAlreadyThere: true });
    }
    const bones = giveRoundRespawnBones(player);
    if (bones > 0) {
      robwPlayerMessage(player, `§7開始地点に戻りました。§f骨 §7x${bones} §fを補充しました。`);
    } else {
      robwPlayerMessage(player, "§7開始地点に戻りました。");
    }
  }, 5);
}

function beginGameRound(host, validation) {
  gameState = "running";
  const startedMs = Date.now();
  gameEndWallMs = startedMs + GATE_OPEN_MS;
  nextTimeNotifyWallMs = startedMs + TIME_NOTIFY_INTERVAL_MS;

  broadcast(`§aゲート起動！§f ${CONFIG.GATE_OPEN_MINUTES}分 | 骨で捕獲→足元の納品チェストへ`, {
    priority: "high",
  });
  broadcast(
    `§7攻撃 ${CONFIG.POINTS_HAKOINU_HIT}pt/回 倒す ${CONFIG.POINTS_HAKOINU_KILL}pt 別種納品 ${CONFIG.POINTS_WRONG_ANIMAL}pt §7| 開始: ${host.name} (${validation.center.x}, ${validation.center.y}, ${validation.center.z})`,
    { priority: "high" },
  );

  if (!prepareRoundStart(validation)) {
    gameState = "waiting";
    activeRoundCenter = null;
    activeRoundDimension = null;
    activeSubmissionChestPos = null;
    placedChestRestore = null;
    clearRemainingTimeHud();
    restoreRoundRespawnSettings();
    robwPlayerMessage(
      host,
      "§c納品チェストを設置できませんでした。地面の上で start してください。",
    );
    logWarn("start rolled back: chest placement failed");
    return;
  }

  rememberPlayerSpawnPointsBeforeRound();
  enableRoundImmediateRespawn();
  gatherAllPlayersToRoundStart(validation);

  gameLoopId = system.runInterval(tickGameTimer, TICKS_PER_SECOND);
  startRemainingTimeHudLoop();
  submissionLoopId = system.runInterval(() => {
    if (gameState !== "running") return;
    const container = getSubmissionChestContainer();
    if (!container || !hasSubmissionChestItemsInContainer(container)) return;
    if (!lastSubmissionPlayer?.isValid) return;
    if (system.currentTick - lastSubmissionTick > SUBMISSION_CREDIT_WINDOW_TICKS) {
      return;
    }
    processSubmissionChest(lastSubmissionPlayer);
  }, TICKS_PER_SECOND);
  startSpawnReplenishLoop();

  robwPlayerMessage(host, "§a[ROBW] ゲートを起動しました！");
  logInfo(
    `Game started at (${validation.center.x}, ${validation.center.y}, ${validation.center.z}) by ${host.name}`,
  );
}

function startGame(initiator) {
  if (initiator && !requireSessionHost(initiator, "ゲートの起動")) {
    return;
  }

  if (gameState === "running") {
    const msg = `§cすでにゲート開放中です。${CONFIG.CHAT_PREFIX} stop で閉鎖できます。`;
    broadcast(msg);
    robwPlayerMessage(initiator, msg);
    logWarn("Start command ignored because game is already running");
    return;
  }

  if (gameState === "countdown") {
    const msg = "§cカウントダウン中です。しばらくお待ちください。";
    robwPlayerMessage(initiator, msg);
    return;
  }

  if (gameState === "closing") {
    const msg = "§c閉鎖演出中です。しばらくお待ちください。";
    robwPlayerMessage(initiator, msg);
    return;
  }

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないためゲートを起動できません。");
    return;
  }

  const validation = validateRoundStartAtPlayer(host);
  if (!validation.ok) {
    robwPlayerMessage(host, validation.message);
    logWarn(`start blocked for ${host.name}: ${validation.reason}`);
    return;
  }

  stopGameLoops();
  resetAllScores();
  resetTimerState();
  activeRoundCenter = validation.center;
  activeRoundDimension = validation.dimension;
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
  if (gameState === "closing") {
    broadcast("§c閉鎖演出中です。しばらくお待ちください。");
    return;
  }
  if (gameState !== "running") {
    broadcast("§cゲートは開放されていません。");
    return;
  }
  requestGameEnd(true);
  logInfo("Game stopped manually");
}

function resetGame() {
  cancelStartCountdown();
  cancelEndCountdown();
  clearPendingRoundDeathRespawns();
  restoreRoundRespawnSettings();
  stopGameLoops();
  clearRemainingTimeHud();
  gameState = "waiting";
  resetTimerState();
  resetAllScores();
  clearAllReturnBoxLedgers();
  const center = activeRoundCenter;
  const players = world.getPlayers();
  const dimension = players.length > 0 ? players[0].dimension : undefined;
  clearSpawnedHakoinu(center, dimension);
  activeRoundCenter = null;
  activeRoundDimension = null;
  if (players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }
  resetAllPlayersToLobbyInventory();
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
      if (player && !requireSessionHost(player, "ゲートの閉鎖")) break;
      stopGame();
      break;
    case "reset":
      if (player && !requireSessionHost(player, "リセット")) break;
      resetGame();
      break;
    case "ranking":
      showRanking("§6Return of BoxWorld 帰還ランキング");
      break;
    default:
      if (player) {
        robwPlayerMessage(player, `§7使用法: ${CONFIG.CHAT_PREFIX} start | stop | reset | ranking`);
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

function isRobwWandItemType(typeId) {
  return typeId === CONFIG.WAND_ITEM || typeId === CONFIG.WAND_ITEM_CUSTOM;
}

function resolveWandSubcommand(itemStack) {
  if (!itemStack || !isRobwWandItemType(itemStack.typeId)) return undefined;

  if (itemStack.typeId === CONFIG.WAND_ITEM_CUSTOM) {
    return "menu";
  }

  const raw = itemStack.nameTag ?? "";
  const name = stripFormatting(raw);
  if (!name) return "menu";

  const exact = CONFIG.WAND_NAMES[name];
  if (exact) return exact;

  const lower = name.toLowerCase();
  for (const [wandName, sub] of Object.entries(CONFIG.WAND_NAMES)) {
    if (wandName.toLowerCase() === lower) return sub;
  }

  const prefixMatch = lower.match(/^robw[:：](start|stop|reset|ranking|menu|メニュー)$/);
  if (prefixMatch) {
    const cmd = prefixMatch[1];
    if (cmd === "start" || cmd === "menu" || cmd === "メニュー") return "menu";
    return cmd;
  }

  return "menu";
}

function getRobwMenuStateLabel() {
  switch (gameState) {
    case "waiting":
      return "§7待機中";
    case "countdown":
      return "§e起動カウントダウン中";
    case "running":
      return "§aゲート開放中";
    case "closing":
      return "§6閉鎖演出中";
    case "finished":
      return "§7終了";
    default:
      return gameState;
  }
}

function getRobwMenuStatePlain() {
  return stripFormatting(getRobwMenuStateLabel());
}

function onRobwMenuSelected(player, sub) {
  runRobwSubcommand(sub, player);
  if (sub !== "ranking") {
    robwPlayerMessage(player, `§7[ROBW] ${sub} を実行しました`);
  }
}

function openRobwControlMenuChat(player) {
  const state = getRobwMenuStatePlain();
  robwPlayerMessage(player, "§6§l--- Return of BoxWorld ---");
  robwPlayerMessage(player, `§7状態: ${state}`);
  robwPlayerMessage(player, "§e操作 (チート ON で入力):");
  robwPlayerMessage(player, "§f/scriptevent robw:menu run §7- この一覧");
  robwPlayerMessage(player, "§f/scriptevent robw:start run §7- ゲート起動");
  robwPlayerMessage(player, "§f/scriptevent robw:stop run §7- ゲート閉鎖");
  robwPlayerMessage(player, "§f/scriptevent robw:reset run §7- リセット");
  robwPlayerMessage(player, "§f/scriptevent robw:ranking run §7- ランキング");
  robwPlayerMessage(player, "§7(パック適用済みなら) §f/function robw/start §7なども可");
  robwPlayerMessage(player, `§7または §f${CONFIG.CHAT_PREFIX} start §7(Beta API 要)`);
}

function openRobwControlMenu(player) {
  if (!player?.isValid) return;

  const showForm = globalThis.robwShowActionMenu;
  if (typeof showForm === "function") {
    showForm(player, getRobwMenuStatePlain(), onRobwMenuSelected);
    return;
  }
  system.run(() => {
    if (!player.isValid) return;
    openRobwControlMenuChat(player);
  });
}

/** 同一 tick の itemUse 二重発火を防ぐ */
const wandMenuOpenTick = new Map();

function tryOpenRobwMenuFromWand(player, itemStack) {
  if (!player?.isValid) return false;

  const tick = system.currentTick;
  if (wandMenuOpenTick.get(player.id) === tick) return true;
  wandMenuOpenTick.set(player.id, tick);

  const held = itemStack ?? getHeldItemStack(player);
  if (!held || !isRobwWandItemType(held.typeId)) return false;

  if (!isSessionHost(player)) {
    robwPlayerMessage(player, "§c操作時計はホストだけが使えます。");
    return true;
  }

  const sub = resolveWandSubcommand(held);
  if (!sub) return false;

  if (sub === "menu") {
    openRobwControlMenu(player);
    return true;
  }

  robwPlayerMessage(player, "§7[ROBW] 操作時計を使用中...");
  runRobwSubcommand(sub, player);
  robwPlayerMessage(player, `§7[ROBW] ${sub} を実行しました`);
  return true;
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

function tryRobwWand(player, itemStack) {
  return tryOpenRobwMenuFromWand(player, itemStack);
}

function playerHasStarterWand(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return false;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;
    if (item.typeId === CONFIG.WAND_ITEM_CUSTOM) return true;
    if (item.typeId !== CONFIG.WAND_ITEM) continue;
    const name = stripFormatting(item.nameTag ?? "");
    if (!name || name === CONFIG.WAND_MENU_NAME || name.toLowerCase().startsWith("robw")) {
      return true;
    }
  }
  return false;
}

/** @returns {boolean} */
function isLegacyRobwWandNameTag(nameTag) {
  const name = stripFormatting(nameTag ?? "").toLowerCase();
  if (!name) return false;
  for (const legacy of CONFIG.WAND_LEGACY_MENU_NAMES ?? []) {
    if (name === legacy.toLowerCase()) return true;
  }
  return false;
}

/** 旧名（ROBW:start）のバニラ時計だけ ROBW:menu に直す @returns {boolean} */
function normalizeRobwWandNameTags(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return false;

  let changed = false;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item || item.typeId !== CONFIG.WAND_ITEM) continue;
    if (!isLegacyRobwWandNameTag(item.nameTag)) continue;

    const next = new ItemStack(CONFIG.WAND_ITEM, item.amount);
    next.nameTag = CONFIG.WAND_MENU_NAME;
    container.setItem(slot, next);
    changed = true;
  }
  return changed;
}

function addItemStackToPlayer(player, stack) {
  const container = player.getComponent("inventory")?.container;
  if (container) {
    const leftover = container.addItem(stack);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }
    return true;
  }
  player.dimension.spawnItem(stack, player.location);
  return true;
}

function tryGiveCustomControlItem(player) {
  try {
    const stack = new ItemStack(CONFIG.WAND_ITEM_CUSTOM, 1);
    stack.nameTag = CONFIG.WAND_MENU_NAME;
    addItemStackToPlayer(player, stack);
    logInfo(`bonus ${CONFIG.WAND_ITEM_CUSTOM} given to ${player.name}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{ notifyIfOwned?: boolean }} [options]
 *   notifyIfOwned … true のときだけ「既に持っています」を表示（/give_wand 等）
 */
function giveStarterWand(player, options) {
  if (!player?.isValid) return;
  const notifyIfOwned = options?.notifyIfOwned === true;

  if (notifyIfOwned) {
    claimSessionHost(player);
  } else if (!getSessionHost()) {
    claimSessionHost(player);
  }

  if (!isSessionHost(player)) {
    removeRobwWandsFromPlayer(player);
    if (notifyIfOwned) {
      robwPlayerMessage(player, "§c操作時計はホストだけが持てます。");
    }
    return;
  }

  try {
    normalizeRobwWandNameTags(player);

    if (playerHasStarterWand(player)) {
      if (notifyIfOwned) {
        robwPlayerMessage(player, "§7[ROBW] 操作時計は既に持っています");
      }
      return;
    }

    const stack = new ItemStack(CONFIG.WAND_ITEM, 1);
    stack.nameTag = CONFIG.WAND_MENU_NAME;
    addItemStackToPlayer(player, stack);

    robwPlayerMessage(
      player,
      "§a[ROBW] 操作時計を渡しました。§fブロック右クリック§aでメニュー(start/stop/reset)",
    );
    logInfo(`gave ${CONFIG.WAND_ITEM} (${CONFIG.WAND_MENU_NAME}) to ${player.name}`);

    tryGiveCustomControlItem(player);
  } catch (error) {
    logError(`giveStarterWand failed for ${player.name}: ${error}`);
    robwPlayerMessage(player, "§c[ROBW] 操作時計の配布に失敗しました");
    robwPlayerMessage(player, "§7/scriptevent robw:give_wand run または /give @s clock 1");
  }
}

function scheduleStarterWandRetries(player) {
  if (!player?.isValid || !isSessionHost(player) || playerHasStarterWand(player)) {
    return;
  }
  for (const delay of [20, 60, 120]) {
    system.runTimeout(() => {
      if (!player?.isValid) return;
      giveStarterWand(player);
    }, delay);
  }
}

function handleScriptEvent(eventId, sourceEntity) {
  const id = eventId.toLowerCase();
  const player =
    sourceEntity && typeof sourceEntity.sendMessage === "function" ? sourceEntity : undefined;

  if (
    id.includes("give_wand") ||
    id.endsWith(":wand") ||
    id.includes(":menu") ||
    id.endsWith(":menu")
  ) {
    if (!player) return;
    if (id.includes("give_wand") || id.endsWith(":wand")) {
      giveStarterWand(player, { notifyIfOwned: true });
      return;
    }
    openRobwControlMenu(player);
    return;
  }

  const match =
    id.match(/(?:^|[:_/])(start|stop|reset|ranking)$/) ??
    id.match(/^robw[:_](start|stop|reset|ranking)$/);
  if (!match) {
    logWarn(`unknown scriptevent id: ${eventId}`);
    return;
  }

  runRobwSubcommand(match[1], player);
}

function onItemUsed(player, itemStack) {
  if (!player) return;

  if (tryRobwWand(player, itemStack)) return;

  if (itemStack?.typeId === CONFIG.PROTECT_ITEM) {
    tryProtectHakoinu(player, undefined);
    return;
  }

  const held = getHeldItemStack(player);
  if (held && isRobwWandItemType(held.typeId)) {
    robwPlayerMessage(
      player,
      "§7[ROBW] 操作アイテムを右クリック(空中またはブロック)してください。",
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
        robwPlayerMessage(sender, "§c[ROBW] コマンドを認識できませんでした");
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

function getRobwItemUseStack(player, eventStack) {
  const held = getHeldItemStack(player);
  if (held && (isRobwWandItemType(held.typeId) || held.typeId === CONFIG.PROTECT_ITEM)) {
    return held;
  }
  return eventStack ?? held;
}

function isRobwHandledItemUse(itemStack) {
  if (!itemStack) return false;
  if (itemStack.typeId === CONFIG.PROTECT_ITEM) return true;
  return isRobwWandItemType(itemStack.typeId);
}

function registerItemUseHandlers() {
  const runUse = (player, itemStack) => {
    system.run(() => onItemUsed(player, itemStack));
  };

  const onItemUse = (event, cancelVanilla) => {
    const player = event.source;
    if (!player) return;
    const itemStack = getRobwItemUseStack(player, event.itemStack);
    if (!isRobwHandledItemUse(itemStack)) return;
    if (cancelVanilla) event.cancel = true;

    if (isRobwWandItemType(itemStack.typeId)) {
      system.run(() => tryOpenRobwMenuFromWand(player, itemStack));
      return;
    }

    runUse(player, itemStack);
  };

  const afterUse = world.afterEvents?.itemUse;
  if (afterUse) {
    afterUse.subscribe((event) => onItemUse(event, false));
    logInfo("item handler: afterEvents.itemUse (wand + bone)");
  } else {
    const beforeUse = world.beforeEvents?.itemUse;
    if (beforeUse) {
      beforeUse.subscribe((event) => onItemUse(event, true));
      logInfo("item handler: beforeEvents.itemUse (wand + bone, fallback)");
    } else {
      logWarn("itemUse events not available");
    }
  }
}

function registerWandInteractHandlers() {
  const onBlockInteract = (event, cancelVanilla) => {
    const player = event.player;
    if (!player) return;
    if (event.block && isSubmissionChestBlock(event.block)) return;

    const held = getHeldItemStack(player);
    if (!held || !isRobwWandItemType(held.typeId)) return;
    if (cancelVanilla) event.cancel = true;

    system.run(() => tryOpenRobwMenuFromWand(player, held));
  };

  const before = world.beforeEvents?.playerInteractWithBlock;
  if (before) {
    before.subscribe((event) => onBlockInteract(event, true));
    logInfo("wand handler: beforeEvents.playerInteractWithBlock");
  }

  const after = world.afterEvents?.playerInteractWithBlock;
  if (after) {
    after.subscribe((event) => onBlockInteract(event, false));
    logInfo("wand handler: afterEvents.playerInteractWithBlock");
  }

  if (!before && !after) {
    logWarn("playerInteractWithBlock not available for wand");
  }
}

function registerRobwCustomCommands(initEvent) {
  const registry = initEvent?.customCommandRegistry;
  if (!registry?.registerCommand) {
    logInfo(
      "customCommandRegistry unavailable — use /scriptevent robw:start (game 1.21.80+ for /robw:start)",
    );
    return;
  }

  const specs = [
    ["robw:menu", "操作メニュー", "menu"],
    ["robw:start", "ゲート起動", "start"],
    ["robw:stop", "ゲート閉鎖", "stop"],
    ["robw:reset", "リセット", "reset"],
    ["robw:ranking", "ランキング", "ranking"],
    ["robw:give_wand", "操作時計を配布", "give_wand"],
  ];

  for (const [name, description, action] of specs) {
    registry.registerCommand(
      {
        name,
        description: `ROBW: ${description}`,
        permissionLevel: 0,
        cheatsRequired: false,
      },
      (origin) => {
        const entity = origin?.sourceEntity;
        system.run(() => {
          if (action === "menu") {
            if (entity) openRobwControlMenu(entity);
            return;
          }
          if (action === "give_wand") {
            if (entity) giveStarterWand(entity, { notifyIfOwned: true });
            return;
          }
          runRobwSubcommand(action, entity);
        });
        return { status: 0 };
      },
    );
  }

  logInfo("registered slash commands: /robw:start, /robw:menu, ...");
}

let robwStartupRegistered = false;

function registerRobwItemComponents() {
  if (robwStartupRegistered) return;

  const startup = system.beforeEvents?.startup;
  if (!startup) {
    logWarn("startup event unavailable; robw:control may not respond to use");
    return;
  }

  robwStartupRegistered = true;
  startup.subscribe((initEvent) => {
    registerRobwCustomCommands(initEvent);

    const itemRegistry = initEvent?.itemComponentRegistry;
    if (!itemRegistry?.registerCustomComponent) {
      logWarn("itemComponentRegistry unavailable; robw:control may not respond to use");
      return;
    }

    itemRegistry.registerCustomComponent("robw:control_menu", {
      onUse(event) {
        const player = event.source;
        if (!player?.isValid) return;
        const stack = event.itemStack;
        system.run(() => tryOpenRobwMenuFromWand(player, stack));
      },
    });
    logInfo("registered item component: robw:control_menu");
  });
  logInfo("subscribed startup (item components + custom commands)");
}

function registerBoneInteractHandlers() {
  const onInteract = (event, cancelVanilla) => {
    const player = event.player;
    if (!player) return;
    const itemStack = event.itemStack ?? getHeldItemStack(player);
    if (itemStack?.typeId !== CONFIG.PROTECT_ITEM) return;
    if (cancelVanilla) event.cancel = true;

    const target = event.target;
    system.run(() => tryProtectHakoinu(player, target));
  };

  const before = world.beforeEvents?.playerInteractWithEntity;
  if (before) {
    before.subscribe((event) => onInteract(event, true));
    logInfo("bone handler: beforeEvents.playerInteractWithEntity");
  }

  const after = world.afterEvents?.playerInteractWithEntity;
  if (after) {
    after.subscribe((event) => onInteract(event, false));
    logInfo("bone handler: afterEvents.playerInteractWithEntity");
  }
}

function registerPlayerDeathHandlers() {
  const hurtSignal = world.afterEvents?.entityHurt;
  if (hurtSignal) {
    hurtSignal.subscribe((event) => {
      system.run(() => {
        if (gameState !== "running") return;
        const hurt = event.hurtEntity;
        if (!hurt?.isValid || hurt.typeId !== "minecraft:player") return;
        const health = hurt.getComponent("health");
        if (!health || health.currentValue > 0) return;
        handlePlayerFatalRoundHurt(hurt);
      });
    });
    logInfo("player round fatal hurt: afterEvents.entityHurt");
  }

  const dieSignal = world.afterEvents?.playerDie;
  if (dieSignal) {
    dieSignal.subscribe((event) => {
      const dead = event.player;
      const playerId = dead?.id;
      const playerName = dead?.name;
      system.run(() => {
        if (!playerId) return;
        const live = resolveRoundDeathPlayer(dead) ?? dead;
        handlePlayerRoundDeath(live, playerName);
      });
    });
    logInfo("player round death: afterEvents.playerDie");
  } else {
    logWarn("playerDie not available for round death penalty");
  }
}

function registerHakoinuCombatHandlers() {
  const hurtSignal = world.afterEvents?.entityHurt;
  if (hurtSignal) {
    hurtSignal.subscribe((event) => {
      system.run(() => {
        handleHakoinuRoundHurt(event.hurtEntity, event.damageSource);
      });
    });
    logInfo("hakoinu hit penalty: afterEvents.entityHurt");
  } else {
    logWarn("entityHurt not available for hakoinu hit penalty");
  }

  const dieSignal = world.afterEvents?.entityDie;
  if (dieSignal) {
    dieSignal.subscribe((event) => {
      system.run(() => {
        handleHakoinuRoundDeath(event.deadEntity, event.damageSource);
      });
    });
    logInfo("hakoinu kill penalty: afterEvents.entityDie");
  } else {
    logWarn("entityDie not available for hakoinu kill penalty");
  }
}

function registerGameEvents() {
  if (gameEventsRegistered) return;

  registerChatHandlers();
  registerItemUseHandlers();
  registerWandInteractHandlers();
  registerBoneInteractHandlers();
  registerSubmissionChestHandler();
  registerHakoinuCombatHandlers();
  registerPlayerDeathHandlers();

  const scriptEventSignal =
    system.afterEvents?.scriptEventReceive ?? world.afterEvents?.scriptEventReceive;
  if (scriptEventSignal) {
    scriptEventSignal.subscribe((event) => {
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
  console.warn("[ROBW] game events registered");
}

function getRobwHelpLines() {
  const lines = [
    "§a[ROBW] 準備OK",
    "§7(1) 操作時計(ROBW:menu)をブロック右クリック -> メニュー",
    "§7(2) 骨で捕獲 -> 納品チェストに入れる",
    "§7(3) §f/scriptevent robw:start run §7(チートON・推奨)",
    "§7(4) §f/function robw/start §7(ワールドにパック適用時)",
  ];
  if (chatHandlerMode === "none") {
    lines.push("§c(注) !robw は Beta APIs 実験的機能が必要です");
  } else {
    lines.push(`§7(5) チャット: §f!robw start §7(${chatHandlerMode})`);
  }
  return lines;
}

let addonReadyDone = false;

function ensureStarterWandsForAllPlayers() {
  ensureSessionHostAssigned();
  for (const player of world.getPlayers()) {
    if (shouldResetToLobbyInventory()) {
      resetPlayerToLobbyInventory(player);
    }
    if (isSessionHost(player)) {
      giveStarterWand(player);
      scheduleStarterWandRetries(player);
    } else {
      removeRobwWandsFromPlayer(player);
    }
  }
}

function announceRobwReady() {
  console.warn("[ROBW] announceRobwReady");
  try {
    robwBroadcast("§a[ROBW] 準備OK");
  } catch (error) {
    console.warn(`[ROBW] broadcast failed: ${error}`);
  }

  ensureSessionHostAssigned();
  for (const player of world.getPlayers()) {
    try {
      robwPlayerMessage(player, "§a[ROBW] 準備OK");
      if (isSessionHost(player)) {
        robwPlayerMessage(player, "§7あなたは§6ホスト§7です。操作時計でゲートを起動できます。");
      } else {
        robwPlayerMessage(player, "§7あなたは§f参加者§7です。ゲートの起動はホストが行います。");
      }
      if (shouldResetToLobbyInventory()) {
        resetPlayerToLobbyInventory(player);
      }
      if (isSessionHost(player)) {
        giveStarterWand(player);
        scheduleStarterWandRetries(player);
      } else {
        removeRobwWandsFromPlayer(player);
      }
    } catch (error) {
      console.warn(`[ROBW] player ready failed: ${error}`);
    }
  }
}

function onAddonReady() {
  if (!addonReadyDone) {
    try {
      getObjective();
      clearRemainingTimeHud();
      registerGameEvents();
      startDaytimeLockLoop();
      startTimerHudWatchdog();
      addonReadyDone = true;
      logInfo("Return of BoxWorld addon loaded (state: waiting)");
      logInfo(
        `box gate: (${CONFIG.BOX_GATE.x}, ${CONFIG.BOX_GATE.y}, ${CONFIG.BOX_GATE.z}) r=${CONFIG.BOX_GATE.radius}`,
      );
      for (const line of getRobwHelpLines()) {
        try {
          robwBroadcast(line);
        } catch {
          // ignore
        }
      }
    } catch (error) {
      logError(`startup failed: ${error}`);
      try {
        robwBroadcast(`§c[ROBW] 起動エラー: ${error}`);
      } catch {
        // ignore
      }
      try {
        registerGameEvents();
      } catch (registerError) {
        logError(`registerGameEvents after startup error: ${registerError}`);
      }
    }
  }

  ensureStarterWandsForAllPlayers();
}

function scheduleAddonReady() {
  system.run(() => onAddonReady());
}

function bootstrapRobwScript() {
  console.warn("[ROBW] bootstrap");
  try {
    registerRobwItemComponents();
  } catch (error) {
    console.warn(`[ROBW] bootstrap startup: ${error}`);
  }
  try {
    registerGameEvents();
  } catch (error) {
    console.warn(`[ROBW] bootstrap registerGameEvents: ${error}`);
  }
  scheduleAddonReady();
  system.runTimeout(scheduleAddonReady, 40);
  system.runTimeout(scheduleAddonReady, 100);
}

bootstrapRobwScript();

if (world.afterEvents?.worldLoad) {
  world.afterEvents.worldLoad.subscribe(() => scheduleAddonReady());
}

world.afterEvents.playerSpawn.subscribe((event) => {
  scheduleAddonReady();
  system.run(() => {
    const player = event.player;
    if (!player) return;

    const wasHostless = !sessionHostPlayerId;
    ensureSessionHostAssigned();

    if (!event.initialSpawn) {
      handlePlayerRoundRespawn(player);
    }

    if (event.initialSpawn) {
      for (const line of getRobwHelpLines()) {
        robwPlayerMessage(player, line);
      }
      if (isSessionHost(player)) {
        if (wasHostless) {
          robwPlayerMessage(player, "§7あなたは§6ホスト§7です。操作時計でゲートを起動できます。");
        }
      } else {
        const host = getSessionHost();
        robwPlayerMessage(player, `§7あなたは§f参加者§7です。ホスト: §6${host?.name ?? "?"}`);
      }
    }

    if (shouldResetToLobbyInventory()) {
      resetPlayerToLobbyInventory(player);
    }
    if (isSessionHost(player)) {
      giveStarterWand(player);
      scheduleStarterWandRetries(player);
    } else {
      removeRobwWandsFromPlayer(player);
    }
  });
});

if (world.afterEvents?.playerLeave) {
  world.afterEvents.playerLeave.subscribe((event) => {
    const player = event.player;
    if (player) onSessionHostLeft(player);
  });
}
