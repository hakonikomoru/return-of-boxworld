# return-of-boxworld — agent instructions

作業前に **`docs/project-sync.md`** を読むこと。

## 実装時の必須事項

- **リポジトリ構成を変えたら `docs/project-sync.md` を同期する** — `behavior_packs/` や `scripts/` 追加などに該当したら、同じ変更で `npm run sync:project-docs` を実行する。
- ゲーム仕様・配信向け文言の変更は README と `main.js` のコメントを揃える。
- ボックスゲート座標は `behavior_packs/robw_behavior/scripts/main.js` の `CONFIG.BOX_GATE` をマップに合わせて変更する。

## このプロジェクトについて

- Minecraft **Bedrock Edition** の Script API アドオン（behavior pack）
- 企画名: **リターン・オブ・ボックスワールド（Return of BoxWorld）**
- MVP: 骨でハコイヌ保護 → 紙の帰還ボックス → ボックスゲートで帰還ポイント化
- チャットコマンド: `!robw start | stop | reset | ranking`
