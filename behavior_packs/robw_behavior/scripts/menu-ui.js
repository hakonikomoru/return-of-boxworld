/**
 * 操作メニュー (ActionForm) — main.js から import。
 */
import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

console.warn("[ROBW] menu-ui.js loaded (imported by main.js)");

/**
 * @param {import("@minecraft/server").Player} player
 * @param {string} statePlain
 * @param {(player: import("@minecraft/server").Player, sub: string) => void} onSelect
 * @returns {boolean} フォームを開けたら true
 */
globalThis.robwShowActionMenu = (player, statePlain, onSelect) => {
  if (!player?.isValid) return false;

  system.run(() => {
    if (!player.isValid) return;

    const form = new ActionFormData()
      .title("Return of BoxWorld")
      .body(`${statePlain}\n\n操作を選んでください。`)
      .button("ゲート起動\nstart")
      .button("構造物へ移動")
      .button("構造物を探す")
      .button("現在地をステージ登録")
      .button("ゲート閉鎖\nstop")
      .button("リセット\nreset")
      .button("ランキング\nranking");

    form
      .show(player)
      .then((response) => {
        system.run(() => {
          if (!player.isValid) return;
          if (response.canceled || response.selection === undefined) {
            console.warn("[INFO] [ゲーム内] " + player.name + ": [ROBW] メニューを閉じました");
            player.sendMessage("§7[ROBW] メニューを閉じました");
            return;
          }
          const actions = [
            "start",
            "locate",
            "find",
            "register",
            "stop",
            "reset",
            "ranking",
          ];
          const sub = actions[response.selection];
          if (sub) onSelect(player, sub);
        });
      })
      .catch((error) => {
        system.run(() => {
          if (!player.isValid) return;
          console.warn(`[ROBW] menu form failed: ${error}`);
          console.warn(`[INFO] [ゲーム内] ${player.name}: [ROBW] メニューUIを開けませんでした`);
          player.sendMessage("§c[ROBW] メニューUIを開けませんでした");
        });
      });
  });

  return true;
};

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{ id: string, label: string }[]} stages
 * @param {(player: import("@minecraft/server").Player, stageIndex: number) => void} onSelect
 * @returns {boolean}
 */
/**
 * @param {import("@minecraft/server").Player} player
 * @param {(player: import("@minecraft/server").Player, modeId: string) => void} onSelect
 */
globalThis.robwShowStartModeMenu = (player, onSelect) => {
  if (!player?.isValid) return false;

  system.run(() => {
    if (!player.isValid) return;

    const form = new ActionFormData()
      .title("ゲームモードを選ぶ")
      .body("開始するモードを選んでください。\n地面に立った状態で開始してください。")
      .button("通常モード\n（探索・ポイント制）")
      .button("ハコイヌ100匹チャレンジ\n（個室タイムアタック）");

    form
      .show(player)
      .then((response) => {
        system.run(() => {
          if (!player.isValid) return;
          if (response.canceled || response.selection === undefined) {
            player.sendMessage("§7[ROBW] キャンセルしました");
            return;
          }
          const modeId = response.selection === 1 ? "box100" : "normal";
          onSelect(player, modeId);
        });
      })
      .catch((error) => {
        system.run(() => {
          if (!player.isValid) return;
          console.warn(`[ROBW] start mode menu failed: ${error}`);
          player.sendMessage("§c[ROBW] メニューを開けませんでした");
        });
      });
  });

  return true;
};

globalThis.robwShowStageSelectMenu = (player, stages, onSelect, options = {}) => {
  if (!player?.isValid || !Array.isArray(stages) || stages.length <= 0) {
    return false;
  }

  const title = options.title ?? "構造物を選ぶ";
  const body = options.body ?? "項目を選んでください。";

  system.run(() => {
    if (!player.isValid) return;

    const form = new ActionFormData().title(title).body(body);

    for (const stage of stages) {
      form.button(stage.label);
    }

    form
      .show(player)
      .then((response) => {
        system.run(() => {
          if (!player.isValid) return;
          if (response.canceled || response.selection === undefined) {
            player.sendMessage("§7[ROBW] キャンセルしました");
            return;
          }
          if (response.selection < 0 || response.selection >= stages.length) {
            return;
          }
          onSelect(player, response.selection);
        });
      })
      .catch((error) => {
        system.run(() => {
          if (!player.isValid) return;
          console.warn(`[ROBW] stage menu failed: ${error}`);
          player.sendMessage("§c[ROBW] メニューを開けませんでした");
        });
      });
  });

  return true;
};
