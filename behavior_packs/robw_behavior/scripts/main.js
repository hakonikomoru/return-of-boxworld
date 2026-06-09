/**
 * リターン・オブ・ボックスワールド (Return of BoxWorld) — MVP
 * Minecraft Bedrock Edition Script API
 */

import { world, system, ItemStack, WeatherType, DisplaySlotId } from "@minecraft/server";

import "./menu-ui.js";
import * as box100 from "./box100-mode.js";

/** manifest header.version と揃える（起動ログ用） */
const ROBW_PACK_VERSION = "0.1.3";

console.warn(`[ROBW] main.js loaded (pack ${ROBW_PACK_VERSION})`);

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
  /**
   * 全員向けメッセージの見た目。
   * - `actionbar` … 画面上部に1行だけ（次の通知で上書き。左上に積まない）
   * - `chat` … 従来どおりチャット（左上に積む）
   */
  UI_BROADCAST_DISPLAY: "actionbar",
  /** 個人向け（robwPlayerMessage）。未指定時は UI_BROADCAST_DISPLAY と同じ */
  UI_PLAYER_MESSAGE_DISPLAY: "actionbar",
  /** `chat` 時、同一文言を再送しない秒数（0=無効） */
  UI_BROADCAST_DEDUPE_SECONDS: 30,
  /** `actionbar` でランキング等を順送りするときの間隔（tick）。20≒1秒 */
  UI_BROADCAST_SEQUENCE_STEP_TICKS: 60,
  /** locate で探すステージのスキャン最大半径（ブロック）。API で座標が取れないとき */
  STAGE_LOCATE_MAX_SCAN_BLOCKS: 8192,
  /** 構造物スキャンの粗い間隔（ブロック） */
  STAGE_LOCATE_SCAN_STEP: 128,
  /** ワールド入場後、ホスト向けに構造物座標を裏でプリフェッチする */
  STAGE_LOCATE_PREFETCH_ON_JOIN: false,
  /**
   * 「構造物を探す」メニューに出すステージ id（locate ショートカットのみ。座標は手動登録）
   */
  STRUCTURE_LOCATE_SHORTCUT_STAGE_IDS: [
    "village",
    "pillager_outpost",
    "desert_pyramid",
    "jungle_pyramid",
    "igloo",
    "swamp_hut",
  ],
  /** プリフェッチ時の getGeneratedStructures スキャン半径（ブロック） */
  STAGE_LOCATE_PREFETCH_SCAN_BLOCKS: 8192,
  /** locate 後にホストを送って探す最大試行数 */
  STAGE_LOCATE_MAX_PROBES: 48,
  /** 各試行で chunk 読み込み後に待つ tick 数（エンティティスポーン待ち） */
  STAGE_LOCATE_PROBE_WAIT_TICKS: 20,
  /** ラウンド中心のフォールバック（通常は start した人の位置が使われる） */
  BOX_GATE: {
    x: 0,
    y: 86,
    z: 0,
    radius: 3,
  },
  /**
   * locate メニュー（/locate structure）で選べる構造物の ID。
   * locate: null は移動メニューに出さない。dimension は locate 先（省略時 overworld）。
   * locate ID は Bedrock 公式どおり minecraft: 付き（例: minecraft:pillager_outpost）。
   */
  ROUND_STAGES: [
    { id: "here", label: "今の位置（ホスト足元）", locate: null },
    { id: "village", label: "村", locate: "minecraft:village", dimension: "overworld" },
    {
      id: "pillager_outpost",
      label: "ピリジャー前哨基地",
      locate: "minecraft:pillager_outpost",
      dimension: "overworld",
    },
    {
      id: "desert_pyramid",
      label: "砂漠の神殿",
      locate: "minecraft:desert_pyramid",
      dimension: "overworld",
    },
    {
      id: "jungle_pyramid",
      label: "ジャングルの寺院",
      locate: "minecraft:jungle_pyramid",
      dimension: "overworld",
    },
    {
      id: "swamp_hut",
      label: "沼地の小屋",
      locate: "minecraft:swamp_hut",
      dimension: "overworld",
    },
    { id: "igloo", label: "イグルー", locate: "minecraft:igloo", dimension: "overworld" },
    {
      id: "ocean_monument",
      label: "海底神殿",
      locate: "minecraft:monument",
      dimension: "overworld",
    },
    {
      id: "woodland_mansion",
      label: "森の洋館",
      locate: "minecraft:mansion",
      dimension: "overworld",
    },
    {
      id: "stronghold",
      label: "要塞",
      locate: "minecraft:stronghold",
      dimension: "overworld",
    },
    {
      id: "ruined_portal",
      label: "崩壊ポータル",
      locate: "minecraft:ruined_portal",
      dimension: "overworld",
    },
    {
      id: "shipwreck",
      label: "難破船",
      locate: "minecraft:shipwreck",
      dimension: "overworld",
    },
    {
      id: "buried_treasure",
      label: "埋もれた宝",
      locate: "minecraft:buried_treasure",
      dimension: "overworld",
    },
    {
      id: "trail_ruins",
      label: "道標の遺跡",
      locate: "minecraft:trail_ruins",
      dimension: "overworld",
    },
    {
      id: "ancient_city",
      label: "古代都市",
      locate: "minecraft:ancient_city",
      dimension: "overworld",
    },
  ],
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
  SUBMISSION_CHEST_BLOCK_TYPES: [
    "minecraft:chest",
    "minecraft:trapped_chest",
    "minecraft:barrel",
  ],
  /** ラウンド中、設置した納品チェストの破壊を防ぐ（通常モード） */
  PROTECT_SUBMISSION_CHEST: true,
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
  /**
   * ハコイヌ100匹チャレンジ (box100) — 個室羊毛ボックス・タイムアタック
   * 開発中は WOLF_COUNT を 10 などに下げて負荷テストしてください。
   */
  BOX100: {
    MODE_LABEL: "ハコイヌ100匹チャレンジ",
    SCORE_OBJECTIVE: "box100_count",
    ROOM_SIZE: 30,
    ROOM_HEIGHT: 10,
    ROOM_GAP: 10,
    /** 部屋と部屋の間隔（ブロック）。未指定時は ROOM_SIZE + ROOM_GAP */
    ROOM_GRID_SPACING: 40,
    /** 横方向の部屋数。4人まで 2×2（■■ / ■■）。5〜6人は自動で 3 列 */
    ROOM_GRID_COLUMNS: 2,
    /** @deprecated ROOM_GRID_SPACING を使用 */
    ROOM_PITCH: 40,
    /** true のとき地上ではなく天空に部屋を生成（既存建造物を壊さない） */
    SKY_ARENA_ENABLED: true,
    /** 羊毛箱の床ブロックの Y（水平位置はホストの X/Z 基準） */
    SKY_ARENA_BASE_Y: 200,
    WOLF_COUNT: 100,
    BONE_COUNT: 120,
    TIME_LIMIT_SECONDS: 180,
    MAX_PLAYERS: 6,
    SHULKER_OFFSET: { x: 15, y: 1, z: 15 },
    SPAWN_MARGIN: 3,
    PROGRESS_BROADCAST_EVERY: 10,
    /** ラウンド中のみ暗視（箱内の視認性向上） */
    NIGHT_VISION_ENABLED: true,
    /** ラウンド中、生成した箱（ガラス外殻・シュルカー）の破壊を防ぐ */
    PROTECT_ROOM_STRUCTURE: true,
    /** 開始のたびにプレイヤーへ割り当てる箱の色をランダムにする */
    RANDOMIZE_ROOM_COLORS: true,
    COLORS: [
      {
        id: "red",
        label: "赤",
        glass: "minecraft:red_stained_glass",
        shulker: "minecraft:red_shulker_box",
      },
      {
        id: "blue",
        label: "青",
        glass: "minecraft:blue_stained_glass",
        shulker: "minecraft:blue_shulker_box",
      },
      {
        id: "green",
        label: "緑",
        glass: "minecraft:green_stained_glass",
        shulker: "minecraft:green_shulker_box",
      },
      {
        id: "yellow",
        label: "黄",
        glass: "minecraft:yellow_stained_glass",
        shulker: "minecraft:yellow_shulker_box",
      },
      {
        id: "purple",
        label: "紫",
        glass: "minecraft:purple_stained_glass",
        shulker: "minecraft:purple_shulker_box",
      },
      {
        id: "orange",
        label: "オレンジ",
        glass: "minecraft:orange_stained_glass",
        shulker: "minecraft:orange_shulker_box",
      },
      {
        id: "cyan",
        label: "水色",
        glass: "minecraft:cyan_stained_glass",
        shulker: "minecraft:cyan_shulker_box",
      },
      {
        id: "lime",
        label: "黄緑",
        glass: "minecraft:lime_stained_glass",
        shulker: "minecraft:lime_shulker_box",
      },
      {
        id: "pink",
        label: "桃",
        glass: "minecraft:pink_stained_glass",
        shulker: "minecraft:pink_shulker_box",
      },
      {
        id: "light_blue",
        label: "空色",
        glass: "minecraft:light_blue_stained_glass",
        shulker: "minecraft:light_blue_shulker_box",
      },
      {
        id: "magenta",
        label: "赤紫",
        glass: "minecraft:magenta_stained_glass",
        shulker: "minecraft:magenta_shulker_box",
      },
      {
        id: "white",
        label: "白",
        glass: "minecraft:white_stained_glass",
        shulker: "minecraft:white_shulker_box",
      },
    ],
  },
  /** スコアボードの objective ID */
  SCORE_OBJECTIVE: "return_point",
  /** チャットコマンドの接頭辞（例: !robw start） */
  CHAT_PREFIX: "!robw",
  /** 旧配布（バニラ時計）。入場時に除去。互換の右クリック判定のみ残す */
  WAND_ITEM: "minecraft:clock",
  /** 操作メニュー用カスタムアイテム（ホストに1個だけ配布） */
  WAND_ITEM_CUSTOM: "robw:control",
  /** 操作アイテムを置くホットバー左端スロット（0〜8） */
  WAND_CONTROL_HOTBAR_SLOT: 0,
  /** 操作アイテムの名前タグ（右クリックで操作メニュー） */
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
let lastUiBroadcastDedupeKey = "";
let lastUiBroadcastDedupeAtMs = 0;

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
/**
 * ラウンド開始前の位置・スポーン（終了時に戻す）
 * @type {Map<string, { location: { x: number, y: number, z: number }, dimensionId: string, spawn: import("@minecraft/server").SpawnPoint | undefined }>}
 */
const savedPlayerPreRoundState = new Map();
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
  if (player) {
    sendUiMessageToPlayer(player, message, getUiPlayerMessageDisplayMode());
  }
}

function resetUiBroadcastBudget() {
  uiBroadcastWindowStartMs = 0;
  uiBroadcastCountInWindow = 0;
  lastUiBroadcastDedupeKey = "";
  lastUiBroadcastDedupeAtMs = 0;
}

function normalizeUiDisplayMode(mode, fallback = "actionbar") {
  const value = String(mode ?? fallback).toLowerCase();
  return value === "chat" ? "chat" : "actionbar";
}

function getUiBroadcastDisplayMode() {
  return normalizeUiDisplayMode(CONFIG.UI_BROADCAST_DISPLAY, "actionbar");
}

function getUiPlayerMessageDisplayMode() {
  return normalizeUiDisplayMode(
    CONFIG.UI_PLAYER_MESSAGE_DISPLAY ?? CONFIG.UI_BROADCAST_DISPLAY,
    "actionbar"
  );
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {string} message
 * @param {"chat" | "actionbar"} mode
 */
function sendUiMessageToPlayer(player, message, mode) {
  if (!player?.isValid) return;
  if (mode === "actionbar") {
    try {
      const display = player.onScreenDisplay;
      if (display && typeof display.setActionBar === "function") {
        display.setActionBar(message);
        return;
      }
    } catch {
      // fall through to chat
    }
  }
  if (typeof player.sendMessage === "function") {
    player.sendMessage(message);
  }
}

function shouldDedupeUiBroadcast(text, options = {}) {
  if (options.skipDedupe || getUiBroadcastDisplayMode() !== "chat") return false;
  const sec = Math.max(0, CONFIG.UI_BROADCAST_DEDUPE_SECONDS ?? 0);
  if (sec <= 0) return false;
  const key = stripMcFormatting(text);
  const now = Date.now();
  if (key === lastUiBroadcastDedupeKey && now - lastUiBroadcastDedupeAtMs < sec * 1000) {
    return true;
  }
  lastUiBroadcastDedupeKey = key;
  lastUiBroadcastDedupeAtMs = now;
  return false;
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

/** 全員向け通知（コンテンツログにも出す） */
function robwBroadcast(message, options = {}) {
  const text = String(message ?? "");
  const priority = options.priority === "high" ? "high" : "normal";
  if (!canSendUiBroadcast(priority)) {
    logInfo(`[ゲーム内] 全員(省略): ${stripMcFormatting(text)}`);
    return;
  }
  if (shouldDedupeUiBroadcast(text, options)) {
    logInfo(`[ゲーム内] 全員(重複省略): ${stripMcFormatting(text)}`);
    return;
  }

  const mode = options.forceChat ? "chat" : getUiBroadcastDisplayMode();
  logInfo(`[ゲーム内] 全員(${mode}): ${stripMcFormatting(text)}`);

  if (mode === "actionbar") {
    for (const player of world.getPlayers()) {
      sendUiMessageToPlayer(player, message, "actionbar");
    }
    return;
  }
  world.sendMessage(message);
}

/**
 * 複数行を順に表示。actionbar 時は1行ずつ上書き（左上に積まない）。
 * @param {string[]} messages
 */
function robwBroadcastSequence(messages, options = {}) {
  const list = messages.filter((m) => m != null && String(m).length > 0);
  if (list.length === 0) return;

  const mode = options.forceChat ? "chat" : getUiBroadcastDisplayMode();
  if (mode === "chat") {
    for (const message of list) {
      robwBroadcast(message, { ...options, priority: "high", skipDedupe: true });
    }
    return;
  }

  const stepTicks = Math.max(
    20,
    CONFIG.UI_BROADCAST_SEQUENCE_STEP_TICKS ?? 60
  );
  list.forEach((message, index) => {
    system.runTimeout(() => {
      robwBroadcast(message, {
        ...options,
        priority: "high",
        skipDedupe: true,
      });
    }, index * stepTicks);
  });
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
  if (box100.isBox100Mode()) {
    broadcast(`§6${host.name}§fがハコイヌ100匹チャレンジを開始します...`, {
      priority: "high",
    });
  } else {
    broadcast(`§6${host.name}§fがゲートを起動します...`, { priority: "high" });
  }

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

/**
 * ラウンド終了後の完全リセット（stop カウントダウン後・reset コマンド共通）
 * @param {{ announce?: boolean, announceMessage?: string }} [options]
 */
function performFullGameReset(options = {}) {
  const { announce = true, announceMessage } = options;

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
  lastSubmissionPlayer = null;
  lastSubmissionTick = 0;

  const center = activeRoundCenter;
  const dimension = getActiveRoundDimension();
  const wasBox100 = box100.isBox100Mode();

  if (wasBox100) {
    box100.cleanupBox100(dimension);
  } else {
    clearSpawnedHakoinu(center, dimension);
  }

  activeRoundCenter = null;
  activeRoundDimension = null;

  const players = world.getPlayers();
  if (!wasBox100 && players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }

  resetAllPlayersToLobbyInventory();

  if (announce) {
    broadcast(
      announceMessage ??
        `§eゲートを閉鎖し、すべてリセットしました。${CONFIG.CHAT_PREFIX} start で再起動できます。`,
      { priority: "high" }
    );
  }
  logInfo("full game reset complete");
}

/**
 * @param {{ manualStop?: boolean }} [options]
 */
function finalizeGameAfterCeremony(options = {}) {
  if (options.manualStop) {
    performFullGameReset();
    return;
  }

  gameState = "finished";
  clearPendingRoundDeathRespawns();
  restoreRoundRespawnSettings();
  clearRemainingTimeHud();
  const center = activeRoundCenter;
  const dimension = getActiveRoundDimension();
  const wasBox100 = box100.isBox100Mode();
  if (wasBox100) {
    box100.cleanupBox100(dimension);
  } else {
    clearSpawnedHakoinu(center, dimension);
  }
  activeRoundCenter = null;
  activeRoundDimension = null;

  const players = world.getPlayers();
  if (!wasBox100 && players.length > 0) {
    removePlacedSubmissionChest(players[0].dimension);
  }

  if (wasBox100) {
    box100.showBox100Ranking();
  } else {
    broadcast("§6ゲート閉鎖！ハコイヌたちの帰還結果を発表します！", {
      priority: "high",
    });
    showRanking();
  }
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
  if (box100.isBox100Mode()) {
    // 閉鎖カウントダウン中はガラス箱を残す（落下死防止）。箱の削除はカウントダウン後
    box100.cleanupBox100Entities(getActiveRoundDimension(), {
      removeRooms: false,
      removeShulkers: false,
      removeNightVision: false,
    });
  } else {
    clearSpawnedHakoinu(activeRoundCenter, getActiveRoundDimension());
  }
  broadcast("§eゲートを手動で閉鎖します...", { priority: "high" });

  runGameEndCountdown(() => {
    if (gameState !== "closing") return;
    finalizeGameAfterCeremony({ manualStop: true });
  });
}

/** 時間切れ時: 3・2・1 はタイマー残り秒に同期済み → 閉鎖のみ */
function beginTimedGameEndFinalize() {
  if (gameState === "finished" || gameState === "closing") return;

  gameState = "closing";
  stopGameLoops();
  clearRemainingTimeHud();
  if (box100.isBox100Mode()) {
    box100.cleanupBox100Entities(getActiveRoundDimension());
  } else {
    clearSpawnedHakoinu(activeRoundCenter, getActiveRoundDimension());
  }
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

  if (gameState === "running" && wasManualStop) {
    beginManualGameEndCeremony();
    return;
  }

  if (gameState === "running" && !wasManualStop) {
    beginTimedGameEndFinalize();
    return;
  }

  stopGameLoops();
  clearRemainingTimeHud();
  finalizeGameAfterCeremony({ manualStop: wasManualStop });
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
  if (!CONFIG.SPAWN_REPLENISH_ENABLED || !box100.shouldReplenishSpawns()) return;
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

/** 操作アイテムだけ残し、骨・毛皮などゲームアイテムを除去 */
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

/** ラウンド中の死亡復帰時: 骨だけ開始時と同数に補充（操作アイテムはホストのみ保持） */
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
// セッションホスト（ゲート起動・操作アイテムはホストのみ）
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

function getConfiguredRoundStages() {
  const stages = CONFIG.ROUND_STAGES;
  if (Array.isArray(stages) && stages.length > 0) {
    return stages;
  }
  return [{ id: "here", label: "今の位置（ホスト足元）", locate: null }];
}

function getRoundStageTravelStages() {
  return getConfiguredRoundStages().filter((stage) => stage.locate);
}

function getRoundStageTravelMenuEntries() {
  return getRoundStageTravelStages().map((stage) => ({
    id: stage.id,
    label: stage.label,
  }));
}

function getStructureLocateShortcutStages() {
  const ids = new Set(CONFIG.STRUCTURE_LOCATE_SHORTCUT_STAGE_IDS ?? []);
  return getRoundStageTravelStages().filter((stage) => ids.has(stage.id));
}

function getStructureFindMenuEntries() {
  return getStructureLocateShortcutStages().map((stage) => ({
    id: stage.id,
    label: `${stage.label}を探す`,
  }));
}

function getStructureRegisterMenuEntries() {
  return getStructureLocateShortcutStages().map((stage) => ({
    id: stage.id,
    label: stage.label,
  }));
}

function structureLocateCacheTrustsProximity(entry) {
  const source = entry?.source ?? "";
  return source !== "registered" && source !== "manual";
}

function findRoundStageTravelIndexById(stageId) {
  const id = String(stageId ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return getRoundStageTravelStages().findIndex((stage) => stage.id === id);
}

/** /locate structure の引数（Bedrock は minecraft: 付きが正） */
const STRUCTURE_LOCATE_ALIASES = {
  village: ["minecraft:village", "village"],
  pillager_outpost: ["minecraft:pillager_outpost", "pillager_outpost"],
  desert_pyramid: ["minecraft:desert_pyramid", "desert_pyramid"],
  jungle_pyramid: ["minecraft:jungle_pyramid", "jungle_pyramid"],
  swamp_hut: ["minecraft:swamp_hut", "swamp_hut"],
  igloo: ["minecraft:igloo", "igloo"],
  monument: ["minecraft:monument", "monument"],
  mansion: ["minecraft:mansion", "mansion"],
  stronghold: ["minecraft:stronghold", "stronghold"],
  ruined_portal: ["minecraft:ruined_portal", "ruined_portal"],
  shipwreck: ["minecraft:shipwreck", "shipwreck"],
  buried_treasure: ["minecraft:buried_treasure", "buried_treasure"],
  trail_ruins: ["minecraft:trail_ruins", "trail_ruins"],
  ancient_city: ["minecraft:ancient_city", "ancient_city"],
};

function normalizeStructureToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^minecraft:/, "")
    .replace(/\s+/g, "_");
}

/** チャット表示・runCommand 用の locate 構造物 ID（常に minecraft: 付きを先に） */
function toLocateStructureId(structureId) {
  const key = normalizeStructureToken(structureId);
  if (!key) return String(structureId ?? "");
  return `minecraft:${key}`;
}

function getStructureLocateAliases(structureId) {
  const key = normalizeStructureToken(structureId);
  const aliases = STRUCTURE_LOCATE_ALIASES[key];
  if (aliases?.length) return aliases;
  return [toLocateStructureId(structureId), key];
}

function parseCoordsFromText(text) {
  const source = String(text ?? "");
  if (!source) return null;

  const bracket = source.match(/\[(-?\d+)\s*,\s*(-?\d+|~)\s*,\s*(-?\d+)\]/);
  if (bracket) {
    return {
      x: Number.parseInt(bracket[1], 10),
      y: bracket[2] === "~" ? undefined : Number.parseInt(bracket[2], 10),
      z: Number.parseInt(bracket[3], 10),
    };
  }

  const paren = source.match(/\((-?\d+)\s*,\s*(-?\d+|~)\s*,\s*(-?\d+)\)/);
  if (paren) {
    return {
      x: Number.parseInt(paren[1], 10),
      y: paren[2] === "~" ? undefined : Number.parseInt(paren[2], 10),
      z: Number.parseInt(paren[3], 10),
    };
  }

  const triple = source.match(/(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
  if (triple) {
    return {
      x: Number.parseInt(triple[1], 10),
      y: Number.parseInt(triple[2], 10),
      z: Number.parseInt(triple[3], 10),
    };
  }

  return null;
}

function commandResultToText(result) {
  if (!result) return "";
  const chunks = [];
  const visited = new Set();
  const queue = [result];

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);

    for (const key of Reflect.ownKeys(value)) {
      try {
        const child = value[key];
        if (typeof child === "string" && child.trim()) {
          chunks.push(child);
        } else if (child && typeof child === "object") {
          queue.push(child);
        }
      } catch {
        // ignore inaccessible properties
      }
    }
  }

  return chunks.join(" ");
}

function parseLocateDistanceFromText(text) {
  const source = String(text ?? "");
  if (!source) return null;

  const patterns = [
    /(\d+)\s*(?:blocks away|blocks? away)/i,
    /(\d+)\s*ブロック先/,
    /（\s*(\d+)\s*ブロック先\s*）/,
    /\(\s*(\d+)\s*blocks away\s*\)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const distance = Number.parseInt(match[1], 10);
      if (Number.isFinite(distance) && distance > 0) {
        return distance;
      }
    }
  }

  return null;
}

function sampleChunkOnRing(originCx, originCz, ringChunks, samples) {
  if (ringChunks <= 0) {
    return [{ cx: originCx, cz: originCz }];
  }

  const chunks = [];
  for (let i = 0; i < samples; i += 1) {
    const angle = (Math.PI * 2 * i) / samples;
    const dx = Math.round(Math.cos(angle) * ringChunks);
    const dz = Math.round(Math.sin(angle) * ringChunks);
    chunks.push({ cx: originCx + dx, cz: originCz + dz });
  }
  return chunks;
}

function buildStructureSampleChunkQueue(originCx, originCz, maxProbes, hintDistance) {
  const queue = [];
  const maxRing = Math.max(
    1,
    Math.ceil((CONFIG.STAGE_LOCATE_MAX_SCAN_BLOCKS ?? 8192) / 16)
  );

  const pushSamples = (ring, samples) => {
    for (const chunk of sampleChunkOnRing(originCx, originCz, ring, samples)) {
      queue.push(chunk);
      if (queue.length >= maxProbes) {
        return true;
      }
    }
    return false;
  };

  if (hintDistance && hintDistance > 0) {
    const centerRing = Math.max(1, Math.round(hintDistance / 16));
    for (const offset of [-4, -2, -1, 0, 1, 2, 4]) {
      const ring = centerRing + offset;
      if (ring < 0 || ring > maxRing) continue;
      const samples = ring <= 8 ? 12 : ring <= 32 ? 20 : 32;
      if (pushSamples(ring, samples)) {
        return queue.slice(0, maxProbes);
      }
    }
  }

  if (pushSamples(0, 1)) {
    return queue.slice(0, maxProbes);
  }

  for (let ring = 4; ring <= maxRing; ring += 4) {
    const samples = ring <= 16 ? 12 : ring <= 64 ? 20 : 32;
    if (pushSamples(ring, samples)) {
      break;
    }
  }

  return queue.slice(0, maxProbes);
}

function buildPlayerNearProbePoints(origin, hintDistance) {
  const maxRadius = Math.max(
    256,
    CONFIG.STAGE_LOCATE_MAX_SCAN_BLOCKS ?? 8192
  );
  const points = [];

  if (hintDistance && hintDistance > 0) {
    const directions = 24;
    for (const offset of [-128, -64, 0, 64, 128]) {
      const distance = hintDistance + offset;
      if (distance < 128 || distance > maxRadius) continue;
      for (let i = 0; i < directions; i += 1) {
        const angle = (Math.PI * 2 * i) / directions;
        points.push({
          x: origin.x + Math.cos(angle) * distance,
          z: origin.z + Math.sin(angle) * distance,
        });
      }
    }
  }

  const directions = 8;
  for (const distance of [
    128, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192,
  ]) {
    if (distance > maxRadius) continue;
    for (let i = 0; i < directions; i += 1) {
      const angle = (Math.PI * 2 * i) / directions;
      points.push({
        x: origin.x + Math.cos(angle) * distance,
        z: origin.z + Math.sin(angle) * distance,
      });
    }
  }

  const maxProbes = Math.max(
    8,
    CONFIG.STAGE_LOCATE_MAX_PROBES ?? 48
  );
  return points.slice(0, maxProbes);
}

let structureLocateAreaSerial = 0;

function loadChunkWithTickingArea(manager, dimension, cx, cz) {
  const areaId = `robw_loc_${structureLocateAreaSerial++}`;
  const options = {
    dimension,
    from: { x: cx * 16, y: -64, z: cz * 16 },
    to: { x: cx * 16 + 15, y: 319, z: cz * 16 + 15 },
  };

  try {
    const created = manager.createTickingArea(areaId, options);
    if (created && typeof created.then === "function") {
      return created.then(() => areaId);
    }
    return Promise.resolve(areaId);
  } catch (error) {
    try {
      manager.removeTickingArea(areaId);
    } catch {
      // ignore cleanup errors
    }
    return Promise.reject(error);
  }
}

function removeTickingAreaSafe(manager, areaId) {
  try {
    manager.removeTickingArea(areaId);
  } catch {
    // ignore cleanup errors
  }
}

/** @param {import("@minecraft/server").CommandResult | undefined} result */
function locateCommandResultText(result) {
  if (!result) return "";
  const parts = [];
  if (typeof result.statusMessage === "string" && result.statusMessage.trim()) {
    parts.push(result.statusMessage.trim());
  }
  const walked = commandResultToText(result);
  if (walked && !parts.includes(walked)) {
    parts.push(walked);
  }
  return parts.join(" ");
}

/** @param {import("@minecraft/server").CommandResult | undefined} result */
function parseLocateCommandResult(result) {
  const sources = [locateCommandResultText(result)];
  if (typeof result?.statusMessage === "string") {
    sources.unshift(result.statusMessage);
  }

  for (const source of sources) {
    const parsed = parseCoordsFromText(source);
    if (parsed) return parsed;
  }

  return null;
}

/** Bedrock のブロック Y 範囲（ビルド限界） */
const ROBW_WORLD_MIN_Y = -64;
const ROBW_WORLD_MAX_Y = 319;

function clampBlockY(y, fallback = 64) {
  const n = Number(y);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), ROBW_WORLD_MIN_Y), ROBW_WORLD_MAX_Y);
}

function isPlausibleBlockY(y) {
  const n = Number(y);
  return Number.isFinite(n) && n >= ROBW_WORLD_MIN_Y && n <= ROBW_WORLD_MAX_Y;
}

function sanitizeLocatedCoords(located) {
  if (!located || !Number.isFinite(located.x) || !Number.isFinite(located.z)) {
    return null;
  }
  const out = { x: located.x, z: located.z };
  if (located.y != null && Number.isFinite(located.y)) {
    out.y = clampBlockY(located.y);
  }
  return out;
}

/** locate で得た座標が足元付近（誤パース）でないか */
function isPlausibleStructureLocate(player, located, minDistBlocks = 48) {
  if (!player?.isValid || !located) return false;
  if (located.y != null && !isPlausibleBlockY(located.y)) return false;
  const dx = located.x - player.location.x;
  const dz = located.z - player.location.z;
  const minDist = Math.max(16, minDistBlocks);
  return dx * dx + dz * dz >= minDist * minDist;
}

function structureLocateUsesGeneratedStructuresApi(dimension) {
  return typeof dimension?.getGeneratedStructures === "function";
}

function countEntitiesNear(dimension, location, filter, maxDistance) {
  try {
    return dimension.getEntities({ ...filter, location, maxDistance }).length;
  } catch {
    return 0;
  }
}

function findBlocksNear(dimension, x, y, z, radius, predicate) {
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const bz = Math.floor(z);

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > radius + 2) continue;
        try {
          const block = dimension.getBlock({ x: bx + dx, y: by + dy, z: bz + dz });
          if (block?.isValid && predicate(block)) {
            return true;
          }
        } catch {
          // chunk may still be loading
        }
      }
    }
  }

  return false;
}

function findStructureNearPlayerFallback(dimension, player, structureId) {
  if (!player?.isValid) return null;

  const key = normalizeStructureToken(structureId);
  const loc = player.location;
  const px = Math.floor(loc.x);
  const py = Math.floor(loc.y);
  const pz = Math.floor(loc.z);

  if (key === "pillager_outpost") {
    if (
      countEntitiesNear(dimension, loc, { type: "minecraft:pillager" }, 96) > 0 ||
      countEntitiesNear(dimension, loc, { type: "minecraft:iron_golem" }, 96) > 0
    ) {
      return { x: px, y: py, z: pz };
    }
    return null;
  }

  if (key === "village") {
    if (
      countEntitiesNear(dimension, loc, { type: "minecraft:villager" }, 72) > 0 ||
      countEntitiesNear(dimension, loc, { type: "minecraft:iron_golem" }, 96) > 0
    ) {
      return { x: px, y: py, z: pz };
    }
    return null;
  }

  if (key === "igloo") {
    const looksLikeIgloo = findBlocksNear(
      dimension,
      px,
      py,
      pz,
      10,
      (block) => {
        const id = block.typeId;
        return (
          id === "minecraft:snow_block" ||
          id === "minecraft:packed_ice" ||
          id === "minecraft:red_carpet" ||
          id === "minecraft:white_carpet"
        );
      }
    );
    if (looksLikeIgloo) {
      return { x: px, y: py, z: pz };
    }
    return null;
  }

  if (key === "desert_pyramid") {
    if (
      findBlocksNear(dimension, px, py, pz, 16, (block) => {
        const id = block.typeId;
        return id === "minecraft:orange_terracotta" || id === "minecraft:chiseled_sandstone";
      })
    ) {
      return { x: px, y: py, z: pz };
    }
    return null;
  }

  if (key === "swamp_hut") {
    if (
      countEntitiesNear(dimension, loc, { type: "minecraft:witch" }, 48) > 0 ||
      findBlocksNear(dimension, px, py, pz, 12, (block) => block.typeId === "minecraft:cauldron")
    ) {
      return { x: px, y: py, z: pz };
    }
    return null;
  }

  return null;
}

/** 構造物ごとの最寄り座標キャッシュ（dimensionKey:structureKey → coords） */
const structureLocateCoordCache = new Map();
let structurePrefetchRunning = false;
let structurePrefetchScheduled = false;
let structurePrefetchLoggedApi = false;

function structureLocateCacheKey(dimensionId, structureId) {
  return `${normalizeStructureToken(dimensionId) || "overworld"}:${normalizeStructureToken(structureId)}`;
}

function getCachedStructureCoords(dimensionId, structureId, player = null) {
  const entry = structureLocateCoordCache.get(
    structureLocateCacheKey(dimensionId, structureId)
  );
  if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.z)) {
    return null;
  }
  if (entry.y != null && !isPlausibleBlockY(entry.y)) {
    structureLocateCoordCache.delete(
      structureLocateCacheKey(dimensionId, structureId)
    );
    return null;
  }
  if (
    player?.isValid &&
    structureLocateCacheTrustsProximity(entry) &&
    !isPlausibleStructureLocate(player, entry, 24)
  ) {
    structureLocateCoordCache.delete(
      structureLocateCacheKey(dimensionId, structureId)
    );
    return null;
  }
  return entry;
}

function setCachedStructureCoords(dimensionId, structureId, located, source = "unknown") {
  if (!located || !Number.isFinite(located.x) || !Number.isFinite(located.z)) {
    return;
  }
  structureLocateCoordCache.set(structureLocateCacheKey(dimensionId, structureId), {
    x: Math.floor(located.x),
    y:
      located.y === undefined
        ? undefined
        : clampBlockY(located.y, Math.floor(located.y)),
    z: Math.floor(located.z),
    source,
    at: Date.now(),
  });
}

function formatLocateStructureCommand(structureId) {
  return `/locate structure ${toLocateStructureId(structureId)}`;
}

/** runCommand 用（先頭スラッシュなし）。Bedrock は execute in に minecraft: 付き次元名は使えない */
function buildLocateStructureRunCommands(structureId) {
  const commands = [];
  for (const alias of getStructureLocateAliases(structureId)) {
    const cmd = `locate structure ${alias}`;
    if (!commands.includes(cmd)) {
      commands.push(cmd);
    }
  }
  return commands;
}

function runLocateStructureCommandInternal(player, structureId, options = {}) {
  const silent = options.silent === true;
  if (!player?.isValid || typeof player.runCommand !== "function") {
    return { ran: false, located: null, success: false, hintDistance: null, lastText: "" };
  }

  for (const cmd of buildLocateStructureRunCommands(structureId)) {
    try {
      const result = player.runCommand(cmd);
      const success = (result?.successCount ?? 0) > 0;
      const text = locateCommandResultText(result);
      const hintDistance = parseLocateDistanceFromText(text);
      if (!silent) {
        logInfo(
          `locate run (${cmd}): success=${result?.successCount ?? 0} hint=${hintDistance ?? "none"} status=${result?.statusMessage ?? ""} text=${text}`
        );
      }

      const located = parseLocateCommandResult(result);
      if (located) {
        return {
          ran: true,
          located,
          success: true,
          hintDistance,
          lastText: text,
        };
      }

      if (success) {
        return {
          ran: true,
          located: null,
          success: true,
          hintDistance,
          lastText: text,
        };
      }
    } catch (error) {
      logWarn(`locate command failed (${cmd}): ${error}`);
    }
  }

  return {
    ran: true,
    located: null,
    success: false,
    hintDistance: null,
    lastText: "",
  };
}

/**
 * locate 手動実行の案内（runCommand は使わない。Script 経由では座標がチャットに出ないことがある）
 */
function showStructureLocateManualGuide(player, stage) {
  if (!player?.isValid || !stage?.locate) return false;

  const cmd = formatLocateStructureCommand(stage.locate);
  const label = stage.label ?? stage.id;

  robwPlayerMessage(player, `§6--- ${label}を探す ---`);
  robwPlayerMessage(
    player,
    `§7${label}を探すには、チャットに以下を入力してください。`
  );
  robwPlayerMessage(player, `§f${cmd}`);
  robwPlayerMessage(
    player,
    "§7座標が表示されたら、その場所へ移動して、"
  );
  robwPlayerMessage(
    player,
    "§7ROBWメニューから §f現在地をステージ登録 §7を実行してください。"
  );
  robwPlayerMessage(
    player,
    "§8座標が出ない場合: §f/gamerule sendcommandfeedback true"
  );
  robwPlayerMessage(player, "§8§f/gamerule commandblockoutput true");

  logInfo(`structure find guide shown: ${stage.id} cmd=${cmd}`);
  return true;
}

function hostMatchesStageDimension(host, dimensionId = "overworld") {
  if (!host?.isValid) return false;
  try {
    const dimension = world.getDimension(dimensionId);
    return dimension && host.dimension?.id === dimension.id;
  } catch {
    return false;
  }
}

function registerStructureStageFromCurrentLocation(host, stage) {
  const dimensionId = stage.dimension ?? "overworld";
  if (!hostMatchesStageDimension(host, dimensionId)) {
    robwPlayerMessage(
      host,
      `§c「${stage.label}」は ${dimensionId} で登録してください。`
    );
    return;
  }

  if (isPlayerFlying(host)) {
    robwPlayerMessage(
      host,
      "§c飛行中は登録できません。地面に立ってから試してください。"
    );
    return;
  }

  let dimension;
  try {
    dimension = world.getDimension(dimensionId);
  } catch (error) {
    logWarn(`stage register dimension failed (${dimensionId}): ${error}`);
    robwPlayerMessage(host, "§cステージ用ディメンションを開けませんでした。");
    return;
  }

  const loc = host.location;
  const bx = Math.floor(loc.x);
  const bz = Math.floor(loc.z);
  const hintY = clampBlockY(loc.y);
  const chestY = findRoundStartSurfaceY(dimension, bx, bz, hintY);
  const validation =
    findNearbyRoundStartValidation(dimension, bx, bz, hintY, stage.label) ??
    (chestY === null
      ? null
      : buildRoundStartValidation(dimension, bx, chestY, bz, stage.label));

  if (!validation?.ok) {
    robwPlayerMessage(
      host,
      validation?.message ??
        `§c「${stage.label}」を登録できる平坦な足元がありません。`
    );
    logWarn(`stage register blocked: ${stage.id} reason=${validation?.reason ?? "unknown"}`);
    return;
  }

  setCachedStructureCoords(
    dimensionId,
    stage.locate,
    {
      x: validation.center.x,
      y: validation.center.y,
      z: validation.center.z,
    },
    "registered"
  );
  robwPlayerMessage(
    host,
    `§a「${stage.label}」を現在地で登録しました。§7構造物へ移動から即移動できます。`
  );
  logInfo(
    `stage registered: ${stage.locate} (${validation.center.x}, ${validation.center.y}, ${validation.center.z})`
  );
}

function triggerLocateStructureCommand(player, structureId, dimensionId = "overworld", options = {}) {
  const silent = options.silent === true;
  const displayCmd = formatLocateStructureCommand(structureId);

  if (!silent) {
    robwPlayerMessage(player, `§7実行: §f${displayCmd}`);
  }

  const result = runLocateStructureCommandInternal(player, structureId);
  if (result.located && isPlausibleStructureLocate(player, result.located)) {
    setCachedStructureCoords(dimensionId, structureId, result.located, "locate");
  } else if (result.located) {
    result.located = null;
  }

  if (!silent && result.ran && !result.success) {
    robwPlayerMessage(
      player,
      `§c自動実行に失敗しました。チャットに §f${displayCmd} §cを貼って手動実行してください。`
    );
  }

  return result;
}

/**
 * locate の成否だけを使い最寄り構造物のおおよその座標を求める（Script に座標文字列が無いとき）
 */
function surveyStructureCoordsByLocate(player, structureId, origin, dimension) {
  if (!player?.isValid) return null;

  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const maxDist = Math.min(
    4096,
    CONFIG.STAGE_LOCATE_PREFETCH_SCAN_BLOCKS ??
      CONFIG.STAGE_LOCATE_MAX_SCAN_BLOCKS ??
      8192
  );

  const tpForSurvey = (x, y, z) => {
    const bx = Math.floor(x);
    const by = clampBlockY(y, clampBlockY(oy));
    const bz = Math.floor(z);
    if (typeof player.runCommand === "function") {
      try {
        player.runCommand(`tp @s ${bx} ${by} ${bz}`);
        return true;
      } catch {
        // fall through
      }
    }
    try {
      player.teleport(
        { x: bx + 0.5, y: by, z: bz + 0.5 },
        { dimension: dimension ?? player.dimension, keepVelocity: false }
      );
      return true;
    } catch {
      return false;
    }
  };

  const locateStillFindsStructure = () =>
    runLocateStructureCommandInternal(player, structureId, { silent: true }).success;

  let bestRay = { failDist: Infinity, dx: 1, dz: 0 };

  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI * 2 * i) / 4;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let lo = 0;
    let hi = maxDist;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      tpForSurvey(ox + dx * mid, oy, oz + dz * mid);
      if (locateStillFindsStructure()) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const failDist = lo;
    if (failDist < bestRay.failDist) {
      bestRay = { failDist, dx, dz };
    }
  }

  if (bestRay.failDist <= 0 || bestRay.failDist >= maxDist - 16) {
    return null;
  }

  let lo = 0;
  let hi = bestRay.failDist;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    tpForSurvey(ox + bestRay.dx * mid, oy, oz + bestRay.dz * mid);
    if (locateStillFindsStructure()) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const entryDist = Math.max(0, lo - 1);
  const ex = ox + bestRay.dx * entryDist;
  const ez = oz + bestRay.dz * entryDist;
  const y = getStructureScanY(dimension, ex, ez, oy);

  return { x: Math.floor(ex), y, z: Math.floor(ez) };
}

function resolveStructureCoordsForTravel(host, stage, dimension, triggered) {
  if (triggered.located) {
    return triggered.located;
  }
  if (triggered.lastText) {
    const parsed = parseCoordsFromText(triggered.lastText);
    if (parsed) return parsed;
  }
  if (!triggered.success) {
    return null;
  }

  const origin = {
    x: host.location.x,
    y: host.location.y,
    z: host.location.z,
  };

  try {
    const surveyed = surveyStructureCoordsByLocate(
      host,
      stage.locate,
      origin,
      dimension
    );
    if (surveyed && isPlausibleStructureLocate(host, surveyed)) {
      setCachedStructureCoords(
        stage.dimension ?? "overworld",
        stage.locate,
        surveyed,
        "survey"
      );
      logInfo(
        `structure survey ${stage.locate}: (${surveyed.x}, ${surveyed.y}, ${surveyed.z})`
      );
    }
    return surveyed;
  } finally {
    restorePlayerPosition(host, origin, dimension);
  }
}

function triggerLocateStructureCommandAsync(
  player,
  structureId,
  dimensionId = "overworld",
  options = {}
) {
  const silent = options.silent !== false;
  return new Promise((resolve) => {
    system.run(() => {
      if (!player?.isValid) {
        resolve({
          ran: false,
          located: null,
          success: false,
          hintDistance: null,
          lastText: "",
        });
        return;
      }

      if (silent) {
        const result = runLocateStructureCommandInternal(player, structureId, {
          silent: true,
        });
        if (result.located && !isPlausibleStructureLocate(player, result.located)) {
          result.located = null;
        }
        resolve(result);
        return;
      }

      resolve(triggerLocateStructureCommand(player, structureId, dimensionId));
    });
  });
}

function structureEntryToTokens(entry) {
  const tokens = [];
  if (entry == null) return tokens;

  if (typeof entry === "string") {
    tokens.push(normalizeStructureToken(entry));
    return tokens;
  }

  tokens.push(normalizeStructureToken(String(entry)));
  if (typeof entry === "object" && entry.id != null) {
    tokens.push(normalizeStructureToken(entry.id));
  }
  return tokens;
}

/** @type {Record<string, string[]>} */
const STRUCTURE_LOOSE_MATCH_HINTS = {
  pillager_outpost: ["pillager", "outpost"],
  village: ["village"],
  desert_pyramid: ["desert", "pyramid"],
  jungle_pyramid: ["jungle", "pyramid"],
  swamp_hut: ["swamp", "hut"],
  igloo: ["igloo"],
  monument: ["monument"],
  mansion: ["mansion"],
  stronghold: ["stronghold"],
  ruined_portal: ["ruined", "portal"],
  shipwreck: ["shipwreck"],
  buried_treasure: ["buried", "treasure"],
  trail_ruins: ["trail", "ruins"],
  ancient_city: ["ancient", "city"],
};

function structureListMatchesTarget(structures, structureId) {
  if (!Array.isArray(structures) || structures.length <= 0) return false;

  const targets = new Set(
    getStructureLocateAliases(structureId).map((id) => normalizeStructureToken(id))
  );
  const key = normalizeStructureToken(structureId);
  const looseHints = STRUCTURE_LOOSE_MATCH_HINTS[key] ?? [];

  return structures.some((entry) => {
    for (const norm of structureEntryToTokens(entry)) {
      if (targets.has(norm)) return true;
      for (const target of targets) {
        if (norm.includes(target) || target.includes(norm)) return true;
      }
      if (
        looseHints.length >= 2 &&
        looseHints.every((hint) => norm.includes(hint))
      ) {
        return true;
      }
    }
    return false;
  });
}

function getStructureScanY(dimension, x, z, hintY = 64) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);

  if (typeof dimension.getTopmostBlock === "function") {
    try {
      const top = dimension.getTopmostBlock({ x: bx, z: bz });
      if (top?.isValid) {
        return top.location.y;
      }
    } catch {
      // fall through
    }
  }

  const startY = clampBlockY(hintY);
  const probeTop = Math.min(startY + 32, ROBW_WORLD_MAX_Y);
  for (let y = probeTop; y >= ROBW_WORLD_MIN_Y; y--) {
    try {
      const block = dimension.getBlock({ x: bx, y, z: bz });
      if (block?.isValid && !block.isAir && !block.isLiquid) {
        return y;
      }
    } catch {
      // chunk / boundary
    }
  }

  return startY;
}

function findStructureAtBlock(dimension, x, z, structureId, hintY) {
  if (typeof dimension.getGeneratedStructures !== "function") {
    return null;
  }

  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const yCandidates = new Set();
  const baseY = hintY ?? getStructureScanY(dimension, bx, bz);
  yCandidates.add(baseY);
  yCandidates.add(baseY + 16);
  yCandidates.add(baseY + 32);
  yCandidates.add(baseY - 16);
  for (let y = 48; y <= 160; y += 16) {
    yCandidates.add(y);
  }

  for (const y of yCandidates) {
    try {
      const structures = dimension.getGeneratedStructures({ x: bx, y, z: bz });
      if (!structureListMatchesTarget(structures, structureId)) {
        continue;
      }
      return { x: bx, y, z: bz };
    } catch {
      // try next height
    }
  }

  return null;
}

function findStructureAtPlayerColumn(dimension, player, structureId, options = {}) {
  if (!player?.isValid) return null;

  if (structureLocateUsesGeneratedStructuresApi(dimension)) {
    const px = Math.floor(player.location.x);
    const pz = Math.floor(player.location.z);
    const yCandidates = new Set([Math.floor(player.location.y)]);
    for (let dy = -48; dy <= 96; dy += 16) {
      yCandidates.add(Math.floor(player.location.y) + dy);
    }
    for (let y = 48; y <= 200; y += 16) {
      yCandidates.add(y);
    }

    for (const y of yCandidates) {
      try {
        const structures = dimension.getGeneratedStructures({ x: px, y, z: pz });
        if (!Array.isArray(structures) || structures.length <= 0) {
          continue;
        }

        if (options.logSample && typeof options.onSample === "function") {
          options.onSample(structures);
        }

        if (!structureListMatchesTarget(structures, structureId)) {
          continue;
        }

        return { x: px, y, z: pz, via: "api" };
      } catch (error) {
        logWarn(`getGeneratedStructures failed at (${px},${y},${pz}): ${error}`);
      }
    }
  }

  const fallbackHit = findStructureNearPlayerFallback(dimension, player, structureId);
  if (fallbackHit) {
    return { ...fallbackHit, via: "fallback" };
  }

  return null;
}

function findNearestStructureByScan(dimension, origin, structureId, maxRadiusOverride) {
  if (typeof dimension.getGeneratedStructures !== "function") {
    return null;
  }

  const step = Math.max(16, CONFIG.STAGE_LOCATE_SCAN_STEP ?? 128);
  const maxRadius = Math.max(
    step,
    maxRadiusOverride ?? CONFIG.STAGE_LOCATE_MAX_SCAN_BLOCKS ?? 4096
  );
  const originX = Math.floor(origin.x);
  const originZ = Math.floor(origin.z);

  for (let radius = 0; radius <= maxRadius; radius += step) {
    if (radius === 0) {
      const hit = findStructureAtBlock(dimension, originX, originZ, structureId);
      if (hit) {
        logInfo(
          `structure scan hit ${structureId} at (${hit.x}, ${hit.y}, ${hit.z}) r=0`
        );
        return hit;
      }
      continue;
    }

    for (let dx = -radius; dx <= radius; dx += step) {
      for (let dz = -radius; dz <= radius; dz += step) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const hit = findStructureAtBlock(
          dimension,
          originX + dx,
          originZ + dz,
          structureId
        );
        if (hit) {
          logInfo(
            `structure scan hit ${structureId} at (${hit.x}, ${hit.y}, ${hit.z}) r=${radius}`
          );
          return hit;
        }
      }
    }
  }

  return null;
}

function findStructureNearPlayer(dimension, player, structureId) {
  return findStructureAtPlayerColumn(dimension, player, structureId);
}

const activeStructureLocateHostIds = new Set();

function scheduleStructureLocatePrefetch(host, delayTicks = 80) {
  if (CONFIG.STAGE_LOCATE_PREFETCH_ON_JOIN === false) return;
  if (!host?.isValid || !isSessionHost(host)) return;
  if (structurePrefetchScheduled || structurePrefetchRunning) return;
  structurePrefetchScheduled = true;

  system.runTimeout(() => {
    if (!host?.isValid) return;
    runStructureLocatePrefetch(host, 0);
  }, delayTicks);
}

function runStructureLocatePrefetch(host, index) {
  const stages = getRoundStageTravelStages();
  if (!host?.isValid || index >= stages.length) {
    structurePrefetchRunning = false;
    const count = structureLocateCoordCache.size;
    logInfo(`structure prefetch done: cached=${count}`);
    if (host?.isValid && count > 0) {
      robwPlayerMessage(
        host,
        `§7[ROBW] 構造物座標を ${count} 件キャッシュしました。locate メニューからすぐ移動できます。`
      );
    } else if (host?.isValid) {
      robwPlayerMessage(
        host,
        "§7[ROBW] 入場時キャッシュは未作成です。構造物を選ぶと座標を特定して移動します（数秒かかることがあります）。"
      );
    }
    return;
  }

  structurePrefetchRunning = true;
  const stage = stages[index];
  const dimensionId = stage.dimension ?? "overworld";
  let dimension;
  try {
    dimension = world.getDimension(dimensionId);
  } catch (error) {
    logWarn(`structure prefetch dimension failed (${dimensionId}): ${error}`);
    system.runTimeout(() => runStructureLocatePrefetch(host, index + 1), 5);
    return;
  }

  if (!structurePrefetchLoggedApi) {
    structurePrefetchLoggedApi = true;
    logInfo(
      `structure prefetch: getGeneratedStructures=${structureLocateUsesGeneratedStructuresApi(dimension) ? "yes" : "no"}`
    );
  }

  if (!getCachedStructureCoords(dimensionId, stage.locate)) {
    if (structureLocateUsesGeneratedStructuresApi(dimension)) {
      const hit = findNearestStructureByScan(
        dimension,
        host.location,
        stage.locate,
        CONFIG.STAGE_LOCATE_PREFETCH_SCAN_BLOCKS ??
          CONFIG.STAGE_LOCATE_MAX_SCAN_BLOCKS ??
          8192
      );
      if (hit) {
        setCachedStructureCoords(dimensionId, stage.locate, hit, hit.via ?? "scan");
        logInfo(
          `structure prefetch scan ${stage.locate}: (${hit.x}, ${hit.y ?? "~"}, ${hit.z})`
        );
      }
    }
    // locate は Script に座標を返さないため入場時はスキャンのみ。座標はメニュー選択時に survey で取得。
  }

  system.runTimeout(() => runStructureLocatePrefetch(host, index + 1), 40);
}

function restorePlayerPosition(player, origin, dimension) {
  if (!player?.isValid || !origin) return;
  try {
    player.teleport(
      { x: origin.x + 0.5, y: origin.y, z: origin.z + 0.5 },
      { dimension: dimension ?? player.dimension, keepVelocity: false }
    );
  } catch (error) {
    logWarn(`restore position failed: ${error}`);
  }
}

function finishStructureStageLocate(host, stage, dimension, located) {
  const dimensionId = stage.dimension ?? "overworld";
  located = sanitizeLocatedCoords(located);
  if (!located) {
    failStructureStageLocate(host, stage);
    return;
  }

  const cachedEntry = getCachedStructureCoords(dimensionId, stage.locate);
  const skipProximity =
    cachedEntry && !structureLocateCacheTrustsProximity(cachedEntry);
  if (!skipProximity && !isPlausibleStructureLocate(host, located)) {
    failStructureStageLocate(host, stage);
    return;
  }

  if (!cachedEntry || structureLocateCacheTrustsProximity(cachedEntry)) {
    setCachedStructureCoords(dimensionId, stage.locate, located, "travel");
  }

  const validation = buildValidationFromLocatedStage(host, stage, dimension, located);
  if (validation?.ok) {
    robwPlayerMessage(host, `§a「${stage.label}」へ移動しました。`);
    logInfo(
      `stage travel ok: ${stage.locate} -> (${validation.center.x}, ${validation.center.y}, ${validation.center.z})`
    );
    return;
  }

  if (validation?.message) {
    robwPlayerMessage(host, validation.message);
  } else {
    robwPlayerMessage(host, `§c「${stage.label}」へ移動できませんでした。`);
  }
}

function runHostedStructureLocateProbe(host, stage, dimension, origin, triggered, onComplete) {
  if (activeStructureLocateHostIds.has(host.id)) return;
  activeStructureLocateHostIds.add(host.id);

  const manager = world.tickingAreaManager;
  const hasTicking = !!manager?.createTickingArea;
  const points = buildPlayerNearProbePoints(origin, triggered.hintDistance);
  const waitTicks = Math.max(2, CONFIG.STAGE_LOCATE_PROBE_WAIT_TICKS ?? 10);
  let index = 0;
  let cancelled = false;
  let loggedStructureSample = false;

  const probeMode = structureLocateUsesGeneratedStructuresApi(dimension)
    ? "api"
    : "fallback";
  logInfo(
    `stage locate probe begin: structure=${stage.locate} points=${points.length} hint=${triggered.hintDistance ?? "none"} ticking=${hasTicking} mode=${probeMode}`
  );

  const finish = (hit) => {
    if (cancelled) return;
    cancelled = true;
    activeStructureLocateHostIds.delete(host.id);
    onComplete(hit);
  };

  const step = () => {
    if (cancelled || !host?.isValid) {
      finish(null);
      return;
    }

    if (index >= points.length) {
      logInfo(
        `stage locate probe done: structure=${stage.locate} tries=${points.length} hit=0`
      );
      finish(null);
      return;
    }

    const point = points[index++];
    const cx = Math.floor(point.x / 16);
    const cz = Math.floor(point.z / 16);
    const y = getStructureScanY(dimension, point.x, point.z, origin.y) + 1;

    const afterTeleport = () => {
      system.runTimeout(() => {
        if (cancelled || !host?.isValid) {
          finish(null);
          return;
        }

        const hit = findStructureAtPlayerColumn(dimension, host, stage.locate, {
          logSample: !loggedStructureSample,
          onSample: (structures) => {
            loggedStructureSample = true;
            logInfo(
              `stage locate structure sample: ${structures.map((entry) => String(entry)).join("|")}`
            );
          },
        });

        if (index <= 3 || index % 8 === 0 || hit) {
          logInfo(
            `stage locate probe ${index}/${points.length} at (${Math.floor(host.location.x)}, ${Math.floor(host.location.z)}) hit=${hit ? "yes" : "no"}`
          );
        }

        if (hit) {
          const via = hit.via ?? "unknown";
          logInfo(
            `structure probe hit ${stage.locate} at (${hit.x}, ${hit.y}, ${hit.z}) try=${index} via=${via}`
          );
          logInfo(
            `player near probe hit ${stage.locate} at (${hit.x}, ${hit.y}, ${hit.z}) try=${index} via=${via}`
          );
          finish(hit);
          return;
        }

        system.runTimeout(step, 1);
      }, waitTicks);
    };

    const teleportToPoint = () => {
      try {
        host.teleport(
          { x: point.x + 0.5, y, z: point.z + 0.5 },
          { dimension, keepVelocity: false }
        );
        afterTeleport();
      } catch (error) {
        logWarn(`stage locate probe tp failed: ${error}`);
        system.runTimeout(step, 1);
      }
    };

    if (hasTicking) {
      loadChunkWithTickingArea(manager, dimension, cx, cz)
        .then((areaId) => {
          removeTickingAreaSafe(manager, areaId);
          teleportToPoint();
        })
        .catch((error) => {
          logWarn(`stage locate preload failed (${cx},${cz}): ${error}`);
          teleportToPoint();
        });
      return;
    }

    teleportToPoint();
  };

  system.runTimeout(step, 1);
}

function locateNearestStructure(dimension, origin, structureId, player) {
  if (!dimension || !structureId) return null;

  if (player?.isValid) {
    const triggered = triggerLocateStructureCommand(player, structureId);
    if (triggered.located) return triggered.located;
  }

  return findNearestStructureByScan(dimension, origin, structureId);
}

function buildValidationFromLocatedStage(host, stage, dimension, located) {
  const bx = Math.floor(located.x);
  const bz = Math.floor(located.z);
  const hintY = located.y != null ? clampBlockY(located.y) : 64;

  const chestY = findRoundStartSurfaceY(dimension, bx, bz, hintY);
  const validation =
    findNearbyRoundStartValidation(
      dimension,
      bx,
      bz,
      hintY ?? chestY ?? 64,
      stage.label
    ) ??
    (chestY === null
      ? null
      : buildRoundStartValidation(dimension, bx, chestY, bz, stage.label));

  if (!validation?.ok) {
    if (chestY === null) {
      return {
        ok: false,
        message: `§c「${stage.label}」付近の地面が見つかりませんでした。`,
        reason: "no_surface",
      };
    }
    return (
      validation ?? {
        ok: false,
        message: "§cステージ地点の足元にブロックがあり、チェストを置けません。",
        reason: "blocked_feet",
      }
    );
  }

  teleportHostToValidationSpot(host, validation);
  return validation;
}

function failStructureStageLocate(host, stage) {
  activeStructureLocateHostIds.delete(host.id);
  robwPlayerMessage(
    host,
    `§c「${stage.label}」はまだ登録されていません。§7構造物を探す → 移動 → 現在地をステージ登録 の順で登録してください。`
  );
}

function continueStructureStageLocateSearch(
  host,
  stage,
  dimension,
  triggered
) {
  let located = triggered.located;
  if (!located && triggered.lastText) {
    located = parseCoordsFromText(triggered.lastText);
  }

  if (located && isPlausibleStructureLocate(host, located)) {
    logInfo(
      `stage locate coords: (${located.x}, ${located.y ?? "~"}, ${located.z}) from command`
    );
    finishStructureStageLocate(host, stage, dimension, located);
    return;
  }
  located = null;

  if (!triggered.success) {
    failStructureStageLocate(host, stage);
    return;
  }

  robwPlayerMessage(
    host,
    `§7「${stage.label}」の座標を特定中...（数十秒かかることがあります）`
  );
  logInfo(
    `stage locate survey begin: structure=${stage.locate} hint=${triggered.hintDistance ?? "none"}`
  );

  system.runTimeout(() => {
    if (!host?.isValid) return;

    const located = resolveStructureCoordsForTravel(host, stage, dimension, triggered);
    if (located) {
      finishStructureStageLocate(host, stage, dimension, located);
      return;
    }

    logInfo(`stage locate survey miss: structure=${stage.locate}`);
    failStructureStageLocate(host, stage);
  }, 1);
}

function beginStructureStageLocateFlow(host, stage) {
  const dimensionId = stage.dimension ?? "overworld";
  let dimension;
  try {
    dimension = world.getDimension(dimensionId);
  } catch (error) {
    logWarn(`stage dimension failed (${dimensionId}): ${error}`);
    robwPlayerMessage(host, "§cステージ用ディメンションを開けませんでした。");
    return;
  }

  if (isPlayerFlying(host)) {
    robwPlayerMessage(
      host,
      "§c飛行中は移動できません。地面に立ってから試してください。"
    );
    return;
  }

  const cached = getCachedStructureCoords(dimensionId, stage.locate, host);
  if (cached) {
    logInfo(
      `stage locate cache hit: ${stage.locate} (${cached.x}, ${cached.y ?? "~"}, ${cached.z}) via=${cached.source ?? "?"}`
    );
    finishStructureStageLocate(host, stage, dimension, cached);
    return;
  }

  logInfo(`stage travel not registered: ${stage.locate}`);
  failStructureStageLocate(host, stage);
}

function findRoundStartSurfaceY(dimension, x, z, hintY = 64) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);

  if (typeof dimension.getTopmostBlock === "function") {
    try {
      const top = dimension.getTopmostBlock({ x: bx, z: bz });
      if (top?.isValid && isSolidGroundBlock(top)) {
        return top.location.y + 1;
      }
    } catch {
      // fall through
    }
  }

  const startY = clampBlockY(hintY);
  const probeTop = Math.min(startY + 24, ROBW_WORLD_MAX_Y);
  for (let y = probeTop; y >= ROBW_WORLD_MIN_Y; y--) {
    try {
      const ground = dimension.getBlock({ x: bx, y: y - 1, z: bz });
      const feet = dimension.getBlock({ x: bx, y, z: bz });
      if (isSolidGroundBlock(ground) && feet?.isAir) {
        return y;
      }
    } catch {
      // chunk / boundary
    }
  }

  return null;
}

function buildRoundStartValidation(dimension, bx, chestY, bz, stageLabel) {
  if (!isPlausibleBlockY(chestY) || !isPlausibleBlockY(chestY - 1)) {
    return {
      ok: false,
      message: "§cステージ地点の高さがワールド範囲外です。別のステージを選んでください。",
      reason: "out_of_bounds",
    };
  }

  const belowY = chestY - 1;
  let ground;
  let atFeet;
  try {
    ground = dimension.getBlock({ x: bx, y: belowY, z: bz });
    atFeet = dimension.getBlock({ x: bx, y: chestY, z: bz });
  } catch {
    return {
      ok: false,
      message: "§cステージ地点のチャンクを読み込めませんでした。",
      reason: "chunk_unavailable",
    };
  }
  if (!isSolidGroundBlock(ground)) {
    return {
      ok: false,
      message: "§cステージ地点の地面が見つかりません。別のステージを選んでください。",
      reason: "no_ground",
    };
  }

  if (!atFeet?.isAir) {
    return {
      ok: false,
      message: "§cステージ地点の足元にブロックがあり、チェストを置けません。",
      reason: "blocked_feet",
    };
  }

  return {
    ok: true,
    center: {
      x: bx,
      y: chestY,
      z: bz,
      radius: CONFIG.BOX_GATE.radius,
    },
    chestSpot: { x: bx, y: chestY, z: bz, footY: belowY },
    dimension,
    stageLabel: stageLabel ?? null,
  };
}

function findNearbyRoundStartValidation(
  dimension,
  centerX,
  centerZ,
  hintY,
  stageLabel,
  maxRadius = 32
) {
  const trySpot = (dx, dz) => {
    const bx = Math.floor(centerX) + dx;
    const bz = Math.floor(centerZ) + dz;
    const chestY = findRoundStartSurfaceY(dimension, bx, bz, hintY);
    if (chestY === null) return null;
    const validation = buildRoundStartValidation(
      dimension,
      bx,
      chestY,
      bz,
      stageLabel
    );
    return validation.ok ? validation : null;
  };

  const direct = trySpot(0, 0);
  if (direct) return direct;

  for (let radius = 2; radius <= maxRadius; radius += 2) {
    for (let dx = -radius; dx <= radius; dx += radius) {
      for (let dz = -radius; dz <= radius; dz += radius) {
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const hit = trySpot(dx, dz);
        if (hit) {
          logInfo(
            `stage start spot offset (${dx}, ${dz}) from structure at (${Math.floor(centerX)}, ${Math.floor(centerZ)})`
          );
          return hit;
        }
      }
    }
  }

  return null;
}

function teleportHostToValidationSpot(host, validation) {
  if (!host?.isValid || !validation?.ok) return false;

  const { center, dimension } = validation;
  try {
    host.teleport(
      { x: center.x + 0.5, y: center.y + 0.01, z: center.z + 0.5 },
      { dimension, keepVelocity: false }
    );
    return true;
  } catch (error) {
    logWarn(`failed to move host to stage: ${error}`);
    return false;
  }
}

/** @returns {ReturnType<typeof validateRoundStartAtPlayer>} */
function validateRoundStartAtLocateStage(host, stage) {
  const structureId = stage?.locate;
  if (!structureId) {
    return validateRoundStartAtPlayer(host);
  }

  const dimensionId = stage.dimension ?? "overworld";
  let dimension;
  try {
    dimension = world.getDimension(dimensionId);
  } catch (error) {
    logWarn(`stage dimension failed (${dimensionId}): ${error}`);
    return {
      ok: false,
      message: "§cステージ用ディメンションを開けませんでした。",
      reason: "bad_dimension",
    };
  }

  if (isPlayerFlying(host)) {
    return {
      ok: false,
      message: "§c飛行中はゲートを起動できません。地面に立って start してください。",
      reason: "flying",
    };
  }

  const located = locateNearestStructure(
    dimension,
    host.location,
    structureId,
    host
  );
  if (!located) {
    return {
      ok: false,
      message: `§c「${stage.label}」が見つかりませんでした。`,
      reason: "locate_failed",
    };
  }

  return buildValidationFromLocatedStage(host, stage, dimension, located);
}

/** @returns {ReturnType<typeof validateRoundStartAtPlayer>} */
function validateRoundStartForStage(host, stage) {
  if (!stage?.locate) {
    return validateRoundStartAtPlayer(host);
  }
  return validateRoundStartAtLocateStage(host, stage);
}

/** @returns {ReturnType<typeof validateRoundStartAtPlayer>} */
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
    stageLabel: null,
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
  if (typeof block?.setType === "function") {
    block.setType(typeId);
    return;
  }
  if (typeof dimension.setBlockType === "function") {
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
  if (box100.isBox100Mode()) {
    return box100.findNearestBox100Wolf(player, CONFIG.PROTECTION_RADIUS ?? 8);
  }

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
  if (box100.isBox100Mode() && !CONFIG.HAKOINU_ENTITY_TYPES.includes(entityType)) {
    robwPlayerMessage(player, "§7このモードではオオカミだけ捕獲できます。");
    return;
  }

  const kind = CONFIG.HAKOINU_ENTITY_TYPES.includes(entityType)
    ? "hakoinu"
    : "wrong";

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
  if (box100.isBox100Mode()) {
    robwPlayerMessage(player, box100.getBox100CaptureHint(player));
  } else {
    const chest = getActiveSubmissionChestPos();
    robwPlayerMessage(
      player,
      `§a毛皮を手に入れた！ §7${CONFIG.RETURN_BOX_DISPLAY_NAME} を納品チェスト (${chest.x}, ${chest.y}, ${chest.z}) に入れてください。`
    );
  }
  logInfo(`${kind} captured by ${player.name} (entity ${entityId}, ${entityType})`);
  if (!box100.isBox100Mode()) {
    spawnAfterCapture(player);
  }
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
  if (box100.isBox100Mode() && box100.isBox100WolfEntity(entityId)) return true;
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
  if (gameState !== "running" || !box100.shouldApplyHakoinuCombatPenalties()) return;

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
  if (gameState !== "running" || !box100.shouldApplyHakoinuCombatPenalties()) return;

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

function isActiveSubmissionChestBlock(block) {
  if (!block?.isValid || !activeSubmissionChestPos) return false;
  const chest = activeSubmissionChestPos;
  const loc = block.location;
  if (
    Math.floor(loc.x) !== chest.x ||
    Math.floor(loc.y) !== chest.y ||
    Math.floor(loc.z) !== chest.z
  ) {
    return false;
  }
  return isSubmissionChestBlockType(block.typeId);
}

/** @deprecated 互換エイリアス */
function isSubmissionChestBlock(block) {
  return isActiveSubmissionChestBlock(block);
}

function isRoundBlockBreakProtectionActive() {
  return gameState === "running" || gameState === "closing";
}

function shouldCancelProtectedBlockBreak(block) {
  if (!block?.isValid || !isRoundBlockBreakProtectionActive()) return false;
  if (box100.isBox100Mode()) {
    return box100.shouldCancelBox100BlockBreak(block);
  }
  if (CONFIG.PROTECT_SUBMISSION_CHEST === false) return false;
  return isActiveSubmissionChestBlock(block);
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

/** 納品チェストで吸収・減点しない（操作アイテム・骨） */
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
  robwBroadcastSequence(
    [title, ...buildRankingLines().map((line) => `§e${line}`)],
    { priority: "high" }
  );
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

function rememberPlayerPreRoundState() {
  savedPlayerPreRoundState.clear();
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    try {
      const { location } = player;
      const dimensionId = player.dimension?.id ?? "minecraft:overworld";
      const spawn =
        typeof player.getSpawnPoint === "function"
          ? player.getSpawnPoint()
          : undefined;
      savedPlayerPreRoundState.set(player.id, {
        location: { x: location.x, y: location.y, z: location.z },
        dimensionId,
        spawn,
      });
    } catch (error) {
      logWarn(`remember pre-round state failed for ${player.name}: ${error}`);
    }
  }
}

function clearSavedPlayerPreRoundState() {
  savedPlayerPreRoundState.clear();
}

function restorePlayersToPreRoundLocations() {
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    const saved = savedPlayerPreRoundState.get(player.id);
    if (!saved) continue;
    try {
      const dimension = world.getDimension(saved.dimensionId);
      player.teleport(saved.location, { dimension, keepVelocity: false });
      robwPlayerMessage(player, "§7もとの場所に戻しました。");
    } catch (error) {
      logWarn(`restore location failed for ${player.name}: ${error}`);
    }
  }
}

function restorePlayerSpawnPointsAfterRound() {
  restorePlayersToPreRoundLocations();
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    if (!savedPlayerPreRoundState.has(player.id)) continue;
    const spawn = savedPlayerPreRoundState.get(player.id)?.spawn;
    try {
      if (typeof player.setSpawnPoint === "function") {
        player.setSpawnPoint(spawn);
      }
    } catch (error) {
      logWarn(`restore spawn failed for ${player.name}: ${error}`);
    }
  }
  savedPlayerPreRoundState.clear();
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

function beginGameRoundBox100(host) {
  gameState = "running";
  const startedMs = Date.now();
  gameEndWallMs = startedMs + box100.getBox100TimeLimitMs();
  nextTimeNotifyWallMs = startedMs + TIME_NOTIFY_INTERVAL_MS;

  box100.beginBox100Running(host);

  enableRoundImmediateRespawn();

  gameLoopId = system.runInterval(tickGameTimer, TICKS_PER_SECOND);
  startRemainingTimeHudLoop();
  submissionLoopId = system.runInterval(() => {
    if (gameState !== "running" || !box100.isBox100Mode()) return;
    if (lastSubmissionPlayer?.isValid) {
      if (system.currentTick - lastSubmissionTick <= SUBMISSION_CREDIT_WINDOW_TICKS) {
        box100.processBox100ShulkerDeliveries();
      }
    }
    box100.processBox100ShulkerDeliveries();
  }, TICKS_PER_SECOND);

  robwPlayerMessage(host, "§a[ROBW] ハコイヌ100匹チャレンジを開始しました！");
  logInfo(`box100 game started by ${host.name}`);
}

function beginGameRound(host, validation) {
  if (box100.isBox100Mode()) {
    beginGameRoundBox100(host);
    return;
  }

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
  if (validation.stageLabel) {
    broadcast(`§7ステージ: §f${validation.stageLabel}`, { priority: "high" });
  }

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

function assertStartGameAllowed(initiator) {
  if (initiator && !requireSessionHost(initiator, "ゲートの起動")) {
    return false;
  }

  if (gameState === "running") {
    const msg = `§cすでにゲート開放中です。${CONFIG.CHAT_PREFIX} stop で閉鎖できます。`;
    broadcast(msg);
    if (initiator) robwPlayerMessage(initiator, msg);
    logWarn("Start command ignored because game is already running");
    return false;
  }

  if (gameState === "countdown") {
    const msg = "§cカウントダウン中です。しばらくお待ちください。";
    if (initiator) robwPlayerMessage(initiator, msg);
    return false;
  }

  if (gameState === "closing") {
    const msg = "§c閉鎖演出中です。しばらくお待ちください。";
    if (initiator) robwPlayerMessage(initiator, msg);
    return false;
  }

  return true;
}

function continueStartGame(host, validation) {
  stopGameLoops();
  resetAllScores();
  resetTimerState();
  rememberPlayerPreRoundState();
  activeRoundCenter = validation.center;
  activeRoundDimension = validation.dimension;
  applyDaytimeLock();

  runStartCountdown(host, validation, () => {
    beginGameRound(host, validation);
  });
}

function continueStartGameBox100(host, validation) {
  stopGameLoops();
  resetAllScores();
  resetTimerState();
  rememberPlayerPreRoundState();
  activeRoundCenter = validation.center;
  activeRoundDimension = validation.dimension;
  applyDaytimeLock();

  const prepared = box100.prepareBox100Arena(host, validation.dimension);
  if (!prepared.ok) {
    box100.resetBox100State();
    clearSavedPlayerPreRoundState();
    robwPlayerMessage(host, prepared.message ?? "§c部屋の準備に失敗しました。");
    logWarn(`box100 prepare failed: ${prepared.message ?? "unknown"}`);
    return;
  }

  runStartCountdown(host, validation, () => {
    beginGameRound(host, validation);
  });
}

function runManualLocateForStage(initiator, menuIndex) {
  if (initiator && !requireSessionHost(initiator, "構造物へ移動")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないため移動できません。");
    return;
  }

  const stage = getRoundStageTravelStages()[menuIndex];
  if (!stage) {
    robwPlayerMessage(host, "§c構造物が見つかりません。");
    return;
  }

  beginStructureStageLocateFlow(host, stage);
}

function runStructureFindShortcutForStage(initiator, menuIndex) {
  if (initiator && !requireSessionHost(initiator, "構造物を探す")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないため locate できません。");
    return;
  }

  const stage = getStructureLocateShortcutStages()[menuIndex];
  if (!stage?.locate) {
    robwPlayerMessage(host, "§c構造物が見つかりません。");
    return;
  }

  system.run(() => {
    if (!host?.isValid) return;
    showStructureLocateManualGuide(host, stage);
  });
}

function runStructureRegisterForStage(initiator, menuIndex) {
  if (initiator && !requireSessionHost(initiator, "ステージ登録")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないため登録できません。");
    return;
  }

  const stage = getStructureLocateShortcutStages()[menuIndex];
  if (!stage?.locate) {
    robwPlayerMessage(host, "§c構造物が見つかりません。");
    return;
  }

  system.run(() => registerStructureStageFromCurrentLocation(host, stage));
}

function openStructureTravelMenu(initiator) {
  if (initiator && !requireSessionHost(initiator, "構造物へ移動")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないため移動できません。");
    return;
  }

  const entries = getRoundStageTravelMenuEntries();
  if (entries.length <= 0) {
    robwPlayerMessage(host, "§c移動できる構造物がありません。");
    return;
  }

  const showForm = globalThis.robwShowStageSelectMenu;
  if (typeof showForm === "function") {
    showForm(
      host,
      entries,
      (player, stageIndex) => {
        runManualLocateForStage(player, stageIndex);
      },
      {
        title: "構造物へ移動",
        body:
          "登録済みの構造物へテレポートします。\n未登録の場合は「構造物を探す」→移動→「現在地をステージ登録」を行ってください。",
      }
    );
    return;
  }

  runManualLocateForStage(host, 0);
}

function openStructureFindMenu(initiator) {
  if (initiator && !requireSessionHost(initiator, "構造物を探す")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないため locate できません。");
    return;
  }

  const entries = getStructureFindMenuEntries();
  if (entries.length <= 0) {
    robwPlayerMessage(host, "§c locate ショートカット用の構造物がありません。");
    return;
  }

  const showForm = globalThis.robwShowStageSelectMenu;
  if (typeof showForm === "function") {
    showForm(
      host,
      entries,
      (player, stageIndex) => {
        runStructureFindShortcutForStage(player, stageIndex);
      },
      {
        title: "構造物を探す",
        body:
          "選んだ構造物の /locate コマンドを案内します。\nチャットで手動実行 → 座標へ移動 →「現在地をステージ登録」。",
      }
    );
    return;
  }

  runStructureFindShortcutForStage(host, 0);
}

function openStructureRegisterMenu(initiator) {
  if (initiator && !requireSessionHost(initiator, "ステージ登録")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないため登録できません。");
    return;
  }

  const entries = getStructureRegisterMenuEntries();
  if (entries.length <= 0) {
    robwPlayerMessage(host, "§c登録できる構造物がありません。");
    return;
  }

  const showForm = globalThis.robwShowStageSelectMenu;
  if (typeof showForm === "function") {
    showForm(
      host,
      entries,
      (player, stageIndex) => {
        runStructureRegisterForStage(player, stageIndex);
      },
      {
        title: "現在地をステージ登録",
        body: "立っている場所を、選んだ構造物の移動先として保存します。",
      }
    );
    return;
  }

  runStructureRegisterForStage(host, 0);
}

/** @deprecated 互換: travel メニューへ */
function openLocateStructureMenu(initiator) {
  openStructureTravelMenu(initiator);
}

function beginStartGameNormal(initiator) {
  if (!assertStartGameAllowed(initiator)) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないためゲートを起動できません。");
    return;
  }

  system.run(() => {
    if (!host?.isValid) return;
    if (!assertStartGameAllowed(host)) return;

    const validation = validateRoundStartAtPlayer(host);
    if (!validation.ok) {
      robwPlayerMessage(host, validation.message);
      logWarn(`start blocked for ${host.name}: ${validation.reason}`);
      return;
    }

    continueStartGame(host, validation);
  });
}

function beginStartGameBox100(initiator) {
  if (!assertStartGameAllowed(initiator)) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないためゲートを起動できません。");
    return;
  }

  system.run(() => {
    if (!host?.isValid) return;
    if (!assertStartGameAllowed(host)) return;

    if (isPlayerFlying(host)) {
      robwPlayerMessage(host, "§c飛行中は開始できません。地面に立ってから試してください。");
      return;
    }

    const validation = validateRoundStartAtPlayer(host);
    if (!validation.ok) {
      robwPlayerMessage(host, validation.message);
      logWarn(`box100 start blocked for ${host.name}: ${validation.reason}`);
      return;
    }

    continueStartGameBox100(host, validation);
  });
}

function openStartModeMenu(initiator) {
  if (initiator && !requireSessionHost(initiator, "ゲートの起動")) return;

  const host = resolveStartHost(initiator);
  if (!host) {
    broadcast("§cプレイヤーがいないためゲートを起動できません。");
    return;
  }

  const showForm = globalThis.robwShowStartModeMenu;
  if (typeof showForm === "function") {
    showForm(host, (player, modeId) => {
      if (modeId === box100.BOX100_MODE_ID) {
        beginStartGameBox100(player);
      } else {
        beginStartGameNormal(player);
      }
    });
    return;
  }

  beginStartGameNormal(host);
}

function beginStartGame(initiator) {
  openStartModeMenu(initiator);
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
  performFullGameReset({
    announceMessage: `§eリセット完了。${CONFIG.CHAT_PREFIX} start でゲートを起動できます。`,
  });
  logInfo("Game reset");
}

// ---------------------------------------------------------------------------
// チャットコマンド
// ---------------------------------------------------------------------------

function normalizeChatMessage(message) {
  return message.trim().replace(/！/g, "!");
}

function runRobwSubcommand(sub, player, extraArgs = []) {
  switch (sub) {
    case "start":
      if (extraArgs.length > 0) {
        const modeArg = extraArgs[0].toLowerCase();
        if (modeArg === box100.BOX100_MODE_ID || modeArg === "box100") {
          beginStartGameBox100(player);
          break;
        }
        if (modeArg === "normal" || modeArg === "classic") {
          beginStartGameNormal(player);
          break;
        }
        if (player) {
          robwPlayerMessage(
            player,
            `§7開始: §f!robw start §7(メニュー) / §f!robw start box100 §7/ §f!robw start normal`
          );
        }
        break;
      }
      beginStartGame(player);
      break;
    case "find":
      if (extraArgs.length > 0) {
        const findIndex = getStructureLocateShortcutStages().findIndex(
          (stage) => stage.id === extraArgs.join("_")
        );
        if (findIndex < 0) {
          if (player) {
            robwPlayerMessage(
              player,
              `§c不明な構造物: ${extraArgs.join(" ")} §7(メニューから選んでください)`
            );
          }
          break;
        }
        runStructureFindShortcutForStage(player, findIndex);
        break;
      }
      openStructureFindMenu(player);
      break;
    case "register":
      if (extraArgs.length > 0) {
        const regIndex = getStructureLocateShortcutStages().findIndex(
          (stage) => stage.id === extraArgs.join("_")
        );
        if (regIndex < 0) {
          if (player) {
            robwPlayerMessage(
              player,
              `§c不明な構造物: ${extraArgs.join(" ")} §7(メニューから選んでください)`
            );
          }
          break;
        }
        runStructureRegisterForStage(player, regIndex);
        break;
      }
      openStructureRegisterMenu(player);
      break;
    case "locate":
    case "travel":
    case "stage":
      if (extraArgs.length > 0) {
        const locateIndex = findRoundStageTravelIndexById(extraArgs.join("_"));
        if (locateIndex < 0) {
          if (player) {
            robwPlayerMessage(
              player,
              `§c不明な構造物: ${extraArgs.join(" ")} §7(メニューから選ぶか id を指定)`
            );
          }
          break;
        }
        runManualLocateForStage(player, locateIndex);
        break;
      }
      openStructureTravelMenu(player);
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
        robwPlayerMessage(player,
          `§7使用法: ${CONFIG.CHAT_PREFIX} start | locate | find | register | stop | reset | ranking`
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

  const sub = parts[1].toLowerCase();
  const extraArgs = parts.slice(2);
  runRobwSubcommand(sub, player, extraArgs);
  return true;
}

function stripFormatting(text) {
  return text.replace(/§./g, "").trim();
}

function isRobwWandItemType(typeId) {
  return typeId === CONFIG.WAND_ITEM_CUSTOM || typeId === CONFIG.WAND_ITEM;
}

function isRobwLegacyClockItem(item) {
  if (!item || item.typeId !== CONFIG.WAND_ITEM) return false;
  const name = stripFormatting(item.nameTag ?? "");
  if (!name || name === CONFIG.WAND_MENU_NAME) return true;
  if (name.toLowerCase().startsWith("robw")) return true;
  for (const legacy of CONFIG.WAND_LEGACY_MENU_NAMES ?? []) {
    if (name.toLowerCase() === legacy.toLowerCase()) return true;
  }
  for (const wandName of Object.keys(CONFIG.WAND_NAMES ?? {})) {
    if (name.toLowerCase() === wandName.toLowerCase()) return true;
  }
  return false;
}

function removeLegacyRobwClocksFromPlayer(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  let removed = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item || !isRobwLegacyClockItem(item)) continue;
    container.setItem(slot, undefined);
    removed += 1;
  }
  if (removed > 0) {
    logInfo(`removed ${removed} legacy clock(s) from ${player.name}`);
  }
  return removed;
}

function getWandControlHotbarSlot() {
  const slot = CONFIG.WAND_CONTROL_HOTBAR_SLOT ?? 0;
  return Math.min(8, Math.max(0, Math.floor(slot)));
}

/** 操作アイテムをホットバー左端へ固定 @returns {boolean} */
function placeRobwControlInHotbar(player, stack) {
  const container = player.getComponent("inventory")?.container;
  if (!container || !stack) return false;

  const targetSlot = getWandControlHotbarSlot();
  const existing = container.getItem(targetSlot);
  if (
    existing?.typeId === CONFIG.WAND_ITEM_CUSTOM &&
    stripFormatting(existing.nameTag ?? "") === CONFIG.WAND_MENU_NAME
  ) {
    return true;
  }

  if (existing) {
    const leftover = container.addItem(existing);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }
  }

  container.setItem(targetSlot, stack);

  const inventory = player.getComponent("inventory");
  if (inventory && typeof inventory.selectedSlot === "number") {
    try {
      inventory.selectedSlot = targetSlot;
    } catch {
      // ignore
    }
  }
  return true;
}

/** 重複した robw:control を1個にし、左端スロットへ @returns {number} 除去した個数 */
function dedupeRobwControlItems(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;

  const targetSlot = getWandControlHotbarSlot();
  let keeper;
  let extra = 0;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== CONFIG.WAND_ITEM_CUSTOM) continue;
    if (!keeper) {
      keeper = item;
      if (slot !== targetSlot) {
        container.setItem(slot, undefined);
      }
      continue;
    }
    container.setItem(slot, undefined);
    extra += 1;
  }

  if (keeper) {
    const stack = new ItemStack(CONFIG.WAND_ITEM_CUSTOM, 1);
    stack.nameTag = keeper.nameTag ?? CONFIG.WAND_MENU_NAME;
    placeRobwControlInHotbar(player, stack);
  }

  if (extra > 0) {
    logInfo(`deduped ${extra} extra ${CONFIG.WAND_ITEM_CUSTOM} from ${player.name}`);
  }
  return extra;
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
  if (
    sub !== "ranking" &&
    sub !== "locate" &&
    sub !== "travel" &&
    sub !== "find" &&
    sub !== "register"
  ) {
    robwPlayerMessage(player, `§7[ROBW] ${sub} を実行しました`);
  }
}

function openRobwControlMenuChat(player) {
  const state = getRobwMenuStatePlain();
  robwPlayerMessage(player,"§6§l--- Return of BoxWorld ---");
  robwPlayerMessage(player,`§7状態: ${state}`);
  robwPlayerMessage(player,"§e操作 (チート ON で入力):");
  robwPlayerMessage(player,"§f/scriptevent robw:menu run §7- この一覧");
  robwPlayerMessage(player,"§f/scriptevent robw:start run §7- ゲート起動（足元）");
  robwPlayerMessage(player,"§f/scriptevent robw:locate run §7- 構造物へ移動");
  robwPlayerMessage(player,"§f/scriptevent robw:find run §7- 構造物を探す (/locate 案内)");
  robwPlayerMessage(player,"§f/scriptevent robw:register run §7- 現在地をステージ登録");
  robwPlayerMessage(player,"§f/scriptevent robw:stop run §7- ゲート閉鎖");
  robwPlayerMessage(player,"§f/scriptevent robw:reset run §7- リセット");
  robwPlayerMessage(player,"§f/scriptevent robw:ranking run §7- ランキング");
  robwPlayerMessage(player,"§7(パック適用済みなら) §f/function robw/start §7なども可");
  robwPlayerMessage(player,`§7または §f${CONFIG.CHAT_PREFIX} start §7(Beta API 要)`);
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
    robwPlayerMessage(player, "§c操作アイテムはホストだけが使えます。");
    return true;
  }

  const sub = resolveWandSubcommand(held);
  if (!sub) return false;

  if (sub === "menu") {
    openRobwControlMenu(player);
    return true;
  }

  robwPlayerMessage(player, "§7[ROBW] 操作アイテムを使用中...");
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
    if (item?.typeId === CONFIG.WAND_ITEM_CUSTOM) return true;
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
    removeLegacyRobwClocksFromPlayer(player);
    if (notifyIfOwned) {
      robwPlayerMessage(player, "§c操作アイテムはホストだけが持てます。");
    }
    return;
  }

  try {
    removeLegacyRobwClocksFromPlayer(player);
    dedupeRobwControlItems(player);

    if (playerHasStarterWand(player)) {
      dedupeRobwControlItems(player);
      if (notifyIfOwned) {
        robwPlayerMessage(player, "§7[ROBW] 操作アイテムは既に持っています");
      }
      return;
    }

    const stack = new ItemStack(CONFIG.WAND_ITEM_CUSTOM, 1);
    stack.nameTag = CONFIG.WAND_MENU_NAME;
    if (!placeRobwControlInHotbar(player, stack)) {
      addItemStackToPlayer(player, stack);
      dedupeRobwControlItems(player);
    }

    robwPlayerMessage(
      player,
      "§a[ROBW] 操作アイテムを渡しました。§f空中で右クリック§aでメニューを開けます。"
    );
    logInfo(`gave ${CONFIG.WAND_ITEM_CUSTOM} (${CONFIG.WAND_MENU_NAME}) to ${player.name}`);
  } catch (error) {
    logError(`giveStarterWand failed for ${player.name}: ${error}`);
    robwPlayerMessage(player, "§c[ROBW] 操作アイテムの配布に失敗しました");
    robwPlayerMessage(
      player,
      `§7/scriptevent robw:give_wand run または /give @s ${CONFIG.WAND_ITEM_CUSTOM} 1`
    );
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
    id.match(
      /(?:^|[:_/])(start|locate|travel|stage|find|register|coords|copycoords|stop|reset|ranking)$/
    ) ??
    id.match(
      /^robw[:_](start|locate|travel|stage|find|register|coords|copycoords|stop|reset|ranking)$/
    );
  if (!match) {
    logWarn(`unknown scriptevent id: ${eventId}`);
    return;
  }

  const action =
    match[1] === "stage" || match[1] === "travel" ? "locate" : match[1];
  runRobwSubcommand(action, player);
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

function registerRobwControlDropGuard() {
  const before = world.beforeEvents?.playerDropItem;
  if (!before) {
    logWarn("playerDropItem not available for control item guard");
    return;
  }

  before.subscribe((event) => {
    const stack = event.itemStack;
    if (!stack || stack.typeId !== CONFIG.WAND_ITEM_CUSTOM) return;
    event.cancel = true;
    const player = event.source;
    if (!player?.isValid) return;
    system.run(() => {
      dedupeRobwControlItems(player);
      robwPlayerMessage(player, "§c操作アイテムは捨てられません。");
    });
  });
  logInfo("control item drop guard: beforeEvents.playerDropItem");
}

function registerRoundBlockProtection() {
  const before = world.beforeEvents?.playerBreakBlock;
  if (!before) {
    logWarn("playerBreakBlock not available for round block guard");
    return;
  }

  before.subscribe((event) => {
    const block = event.block;
    if (!block || !shouldCancelProtectedBlockBreak(block)) return;
    event.cancel = true;
  });
  logInfo("round block guard: playerBreakBlock (chest / box100 room)");
}

function registerSubmissionChestHandler() {
  const interact = world.afterEvents?.playerInteractWithBlock;
  if (!interact) {
    logWarn("playerInteractWithBlock not available for submission chest");
    return;
  }

  interact.subscribe((event) => {
    const player = event.player;
    if (!player) return;

    if (box100.isBox100Mode() && box100.isBox100ShulkerBlock(event.block, player)) {
      box100.noteBox100ShulkerUse(player);
      lastSubmissionPlayer = player;
      lastSubmissionTick = system.currentTick;
      for (const delay of SUBMISSION_PROCESS_DELAYS) {
        system.runTimeout(() => box100.processBox100ShulkerDeliveries(), delay);
      }
      return;
    }

    if (!isSubmissionChestBlock(event.block)) return;

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
    ["robw:locate", "構造物へ移動", "locate"],
    ["robw:find", "構造物を探す", "find"],
    ["robw:register", "現在地をステージ登録", "register"],
    ["robw:stop", "ゲート閉鎖", "stop"],
    ["robw:reset", "リセット", "reset"],
    ["robw:ranking", "ランキング", "ranking"],
    ["robw:give_wand", "操作アイテムを配布", "give_wand"],
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

  box100.initBox100Mode({
    CONFIG,
    world,
    system,
    logInfo,
    logWarn,
    logError,
    broadcast,
    broadcastSequence: robwBroadcastSequence,
    robwPlayerMessage,
    requestGameEnd,
    countCaptureItemsInContainer,
    clearCaptureItemsFromContainer,
    clearInventoryExceptWand,
    giveBones,
    registerRoundWolf: (entityId) => {
      if (!spawnedRoundEntityIds.includes(entityId)) {
        spawnedRoundEntityIds.push(entityId);
      }
    },
    clearRoundWolfRefs: () => {
      spawnedRoundEntityIds = [];
      scriptRemovedRoundEntityIds.clear();
    },
    noteShulkerSubmission: (player) => {
      lastSubmissionPlayer = player;
      lastSubmissionTick = system.currentTick;
    },
    resolveCommandHost: () => resolveStartHost(undefined),
  });

  registerChatHandlers();
  registerItemUseHandlers();
  registerWandInteractHandlers();
  registerBoneInteractHandlers();
  registerSubmissionChestHandler();
  registerRobwControlDropGuard();
  registerRoundBlockProtection();
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
    "§7(1) 操作アイテム(ROBW:menu)を空中で右クリック -> メニュー",
    "§7(2) start=モード選択 / box100=100匹チャレンジ / locate=構造物へ移動",
    "§7(3) 骨で捕獲 -> 納品チェストに入れる",
    "§7(4) §f/scriptevent robw:start run §7(チートON・推奨)",
    "§7(5) §f/function robw/start §7(ワールドにパック適用時)",
  ];
  if (chatHandlerMode === "none") {
    lines.push("§c(注) !robw は Beta APIs 実験的機能が必要です");
  } else {
    lines.push(`§7(6) チャット: §f!robw start §7/ §f!robw locate village §7(${chatHandlerMode})`);
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
        robwPlayerMessage(player, "§7あなたは§6ホスト§7です。操作アイテムでゲートを起動できます。");
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
      logInfo(`ROBW main.js active (pack ${ROBW_PACK_VERSION})`);
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

  const host = getSessionHost();
  if (host?.isValid) {
    scheduleStructureLocatePrefetch(host, 100);
  }
}

function scheduleAddonReady() {
  system.run(() => onAddonReady());
}

function bootstrapRobwScript() {
  console.warn(`[ROBW] bootstrap (pack ${ROBW_PACK_VERSION})`);
  logInfo(`ROBW script bootstrap start (pack ${ROBW_PACK_VERSION})`);
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
          robwPlayerMessage(player, "§7あなたは§6ホスト§7です。操作アイテムでゲートを起動できます。");
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
      if (event.initialSpawn) {
        scheduleStructureLocatePrefetch(player, 120);
      }
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
