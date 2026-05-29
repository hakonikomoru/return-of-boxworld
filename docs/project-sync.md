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
│       ├── functions/
│       ├── manifest.json
│       └── scripts/
├── docs/
│   ├── bedrock-dev-notes.md
│   └── project-sync.md
├── scripts/
│   ├── project-sync-core.mjs
│   └── sync-project-docs.mjs
```
<!-- sync:auto:directory-tree:end -->

---

## 3. ゲーム内ルール（MVP）

> 以下は **`main.js` の `CONFIG` から自動生成** されます。仕様を変えたら `npm run sync:project-docs` を実行（pre-commit でも更新）。

<!-- sync:auto:game-rules:start -->
> behavior_packs/robw_behavior/scripts/main.js の CONFIG から自動生成。仕様変更後は npm run sync:project-docs を実行。

### 用語

| ゲーム内 | 実装 |
|----------|------|
| ハコイヌ | オオカミ（ハコイヌ代用） |
| 捕獲アイテム（ハコイヌ） | minecraft:rabbit_hide（名前: 捕獲したハコイヌ） |
| 捕獲アイテム（別種） | 同 minecraft:rabbit_hide（名前: 捕獲した別種） |
| 納品チェスト | 座標に設置したチェスト（下表） |
| 集合エリア | ゲート起動時の招集先（下表） |
| 帰還ポイント | スコアボード `return_point` |

### ゲート起動時（start）

- 全員の帰還ポイントを **0** にリセット
- ゲート開放 **10 分**（残り 60 秒ごとに通知、残り 60 / 30 / 10 秒で目立つ警告）
- 全員をボックスゲート (0, 86, 0) 付近へテレポート（Y オフセット: 0）
- **骨 ×16** を全員に配布（所持分はいったん消してからセット）
- **ハコイヌ 10 匹** をゲート中心から約 **6 ブロック** にスポーン
- **納品チェスト**を BOX_GATE（Y86）付近 **半径 24** 内の **平坦な 3×3** に **1つだけ** 自動設置（同エリア内の既存チェスト類は起動時に撤去）
- 終了・リセット時にスクリプトが出したハコイヌと納品チェストは片付けられる

### プレイの流れ

1. ゲート起動
2. **minecraft:bone** を持ち、**4 ブロック以内**の動物を **空中で右クリック**（捕獲）
3. ハコイヌ → **捕獲したハコイヌ** / 他の動物 → **捕獲した別種**（minecraft:rabbit_hide）
4. 捕獲アイテムを **自動設置の納品チェスト（1つ）** に入れる → 得点加算のあと **毛皮はチェストから消える**
5. 時間切れまたは stop で閉鎖 → ランキング

### スコア

| 内容 | 点数 |
|------|------|
| ハコイヌを納品チェストに入れる | **+1 pt** / 匹分 |
| 別種の動物を納品チェストに入れる | **-3 pt** / 匹分 |

ペナルティ対象の動物:

- 牛（`minecraft:cow`）
- 豚（`minecraft:pig`）
- 羊（`minecraft:sheep`）
- 鶏（`minecraft:chicken`）
- ヤギ（`minecraft:goat`）
- ウサギ（`minecraft:rabbit`）
- 馬（`minecraft:horse`）
- ロバ（`minecraft:donkey`）
- ラバ（`minecraft:mule`）
- ラマ（`minecraft:llama`）
- キツネ（`minecraft:fox`）
- ネコ（`minecraft:cat`）
- ムーシュルーム（`minecraft:mooshroom`）
- オウム（`minecraft:parrot`）
- ラクダ（`minecraft:camel`）

### 納品チェスト（CONFIG.SUBMISSION_CHEST）

| 項目 | 値 |
|------|-----|
| X | 0 |
| Y | 85 |
| Z | 0 |

> ゲート起動時にスクリプトが平坦な場所を探して **チェストを1つだけ自動設置**（周囲の既存チェスト類は撤去。座標は起動メッセージを参照）。

### 集合エリア（CONFIG.BOX_GATE）

| 項目 | 値 |
|------|-----|
| X | 0 |
| Y | 86 |
| Z | 0 |
| 半径 | 3 |

> ワールドごとに main.js の座標を手動調整する（自動同期はコードのデフォルト）。

### 操作・コマンド

| 種別 | 入力 | 備考 |
|------|------|------|
| チャット | `!robw start` / `stop` / `reset` / `ranking` | **Beta APIs** 必須 |
| 時計（minecraft:clock） | 名前 `ROBW:start` を空中で右クリック | → `start` |
| 時計（minecraft:clock） | 名前 `ROBW:stop` を空中で右クリック | → `stop` |
| 時計（minecraft:clock） | 名前 `ROBW:reset` を空中で右クリック | → `reset` |
| 時計（minecraft:clock） | 名前 `ROBW:ranking` を空中で右クリック | → `ranking` |
| 関数 | `/function robw/ranking` | チート ON |
| 関数 | `/function robw/reset` | チート ON |
| 関数 | `/function robw/start` | チート ON |
| 関数 | `/function robw/stop` | チート ON |
| scriptevent | `/scriptevent robw:start` 等 | チート ON |

### ゲーム状態

- waiting … 待機
- running … ゲート開放中（骨での保護・ゲート帰還のみ有効）
- finished … 閉鎖済み（ランキング表示後）
<!-- sync:auto:game-rules:end -->

---

## 4. 手動で追記する内容

- ワールドごとに `CONFIG.BOX_GATE`（招集）をマップに合わせて変更（納品チェストは起動時に平坦な場所へ **自動設置**）
- v0.2 以降: ハコイヌ自動スポーン強化、金のハコイヌ、残り1分2倍、ゲート演出
- カスタムアイテムテクスチャが必要になったら resource pack 追加

### 開発・動作確認

- **`docs/bedrock-dev-notes.md`** … Launcher パス、ジャンクション、manifest API 版、トラブルシュート、動作確認チェックリスト
