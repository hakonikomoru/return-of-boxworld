# return-of-boxworld — Project Sync

> ChatGPT / 他 AI 向けの同期用ドキュメント。実装前に読むこと。

<!-- sync:auto:meta:start -->
最終更新の想定リポジトリ: `hakonikomoru/return-of-boxworld`（`main`・`unknown`・2026-05-29・`npm run sync:project-docs` 自動反映）
<!-- sync:auto:meta:end -->

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| リポジトリ | hakonikomoru/return-of-boxworld |
| ローカルパス | `/Users/ebata/app/return-of-boxworld` |
| 種別 | Minecraft Bedrock Script API アドオン（Return of BoxWorld MVP） |

### ゲーム概要

ハコイヌを帰還ボックスに保護し、ボックスゲートからボックスワールドへ帰還させて帰還ポイントを競う配信向けミニゲーム。

---

## 2. ディレクトリ構成

> `<!-- sync:auto:... -->` は **`npm run sync:project-docs`** が上書きします（手編集しない）。

<!-- sync:auto:directory-tree:start -->
```
return-of-boxworld/
├── behavior_packs/
│   └── robw_behavior/
│       ├── manifest.json
│       └── scripts/
├── docs/
│   └── project-sync.md
├── scripts/
│   ├── project-sync-core.mjs
│   └── sync-project-docs.mjs
```
<!-- sync:auto:directory-tree:end -->

---

## 3. 手動で追記する内容

- ワールドごとのボックスゲート座標（`CONFIG.BOX_GATE`）
- v0.2 以降: ハコイヌ自動スポーン、金のハコイヌ、残り1分2倍、ゲート演出
- カスタムアイテムテクスチャが必要になったら resource pack 追加
