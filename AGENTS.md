# return-of-boxworld — agent instructions

作業前に **`docs/project-sync.md`** を読むこと。統合版の配置・動作確認・トラブルシュートは **`docs/bedrock-dev-notes.md`** も参照。

## 実装時の必須事項

- **リポジトリ構成を変えたら `docs/project-sync.md` を同期する** — `behavior_packs/` や `scripts/` 追加などに該当したら、同じ変更で `npm run sync:project-docs` を実行する。
- ゲーム仕様・配信向け文言の変更は README と `main.js` のコメントを揃え、**`npm run sync:project-docs`** で `docs/project-sync.md` のゲーム内ルール（`<!-- sync:auto:game-rules -->`）を更新する。
- ボックスゲート座標は `behavior_packs/robw_behavior/scripts/main.js` の `CONFIG.BOX_GATE` をマップに合わせて変更する。

## このプロジェクトについて

- Minecraft **Bedrock Edition** の Script API アドオン（behavior pack）
- 企画名: **リターン・オブ・ボックスワールド（Return of BoxWorld）**
- MVP: 骨でハコイヌ保護 → 茶色の毛皮（帰還ボックス）→ ボックスゲートで帰還ポイント化
- ゲーム操作: `!robw start | stop | reset | ranking`（要 Beta APIs）、時計 `ROBW:start`（空中で右クリック）、`/function robw/start`（詳細は `docs/bedrock-dev-notes.md`）
