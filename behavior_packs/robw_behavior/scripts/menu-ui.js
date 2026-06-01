/**
 * 操作メニュー (ActionForm) — main.js から import。
 */
import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

console.warn("[ROBW] menu-ui.js loaded");

/**
 * @param {import("@minecraft/server").Player} player
 * @param {string} statePlain
 * @param {(player: import("@minecraft/server").Player, sub: string) => void} onSelect
 * @returns {boolean} フォームを開けたら true
 */
globalThis.robwShowActionMenu = (player, statePlain, onSelect) => {
  if (!player?.isValid) return false;

  // itemUse 等の restricted execution からは form.show 不可 → 次 tick で開く
  system.run(() => {
    if (!player.isValid) return;

    const form = new ActionFormData()
      .title("Return of BoxWorld")
      .body(`${statePlain}\n\n操作を選んでください。`)
      .button("ゲート起動\nstart")
      .button("ゲート閉鎖\nstop")
      .button("リセット\nreset")
      .button("ランキング\nranking");

    form
      .show(player)
      .then((response) => {
        system.run(() => {
          if (!player.isValid) return;
          if (response.canceled || response.selection === undefined) {
            console.warn(
              "[INFO] [ゲーム内] " + player.name + ": [ROBW] メニューを閉じました"
            );
            player.sendMessage("§7[ROBW] メニューを閉じました");
            return;
          }
          const actions = ["start", "stop", "reset", "ranking"];
          const sub = actions[response.selection];
          if (sub) onSelect(player, sub);
        });
      })
      .catch((error) => {
        system.run(() => {
          if (!player.isValid) return;
          console.warn(`[ROBW] menu form failed: ${error}`);
          console.warn(
            `[INFO] [ゲーム内] ${player.name}: [ROBW] メニューUIを開けませんでした`
          );
          player.sendMessage("§c[ROBW] メニューUIを開けませんでした");
        });
      });
  });

  return true;
};
