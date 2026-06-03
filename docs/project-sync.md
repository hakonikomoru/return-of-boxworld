# return-of-boxworld — Project Sync

> ChatGPT / 他 AI 向けの同期用ドキュメント。実装前に読むこと。

<!-- sync:auto:meta:start -->

最終更新の想定リポジトリ: `hakonikomoru/return-of-boxworld`（`main`・`bc6b2c4`・2026-06-02・`npm run sync:project-docs` 自動反映）

<!-- sync:auto:meta:end -->

---

## 1. 概要

| 項目         | 内容                                                            |
| ------------ | --------------------------------------------------------------- |
| リポジトリ   | hakonikomoru/return-of-boxworld                                 |
| ローカルパス | `/Users/ebata/app/return-of-boxworld`                           |
| 種別         | Minecraft Bedrock Script API アドオン（Return of BoxWorld MVP） |

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
│       ├── items/
│       ├── manifest.json
│       ├── pack_icon.png
│       └── scripts/
├── docs/
│   ├── bedrock-dev-notes.md
│   ├── config-reference.md
│   └── project-sync.md
├── scripts/
│   ├── diagnose-bedrock-log.mjs
│   ├── install-bedrock-pack.mjs
│   ├── install-bedrock-pack.ps1
│   ├── project-sync-core.mjs
│   ├── sync-bedrock-world-pack-lib.mjs
│   ├── sync-bedrock-world-pack.mjs
│   ├── sync-bedrock-world-pack.ps1
│   ├── sync-project-docs.mjs
│   ├── tail-bedrock-log.mjs
│   ├── verify-bedrock-pack.mjs
│   └── watch-bedrock-world-pack.mjs
```

<!-- sync:auto:directory-tree:end -->

---

## 3. ゲーム内ルール（MVP）

> 以下は **`main.js` の `CONFIG` から自動生成** されます。仕様を変えたら `npm run sync:project-docs` を実行（pre-commit でも更新）。

<!-- sync:auto:game-rules:start -->

> behavior_packs/robw_behavior/scripts/main.js の CONFIG から自動生成。仕様変更後は npm run sync:project-docs を実行。

### 用語

| ゲーム内     | 実装                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| ハコイヌ     | オオカミ（ハコイヌ代用）                                                |
| 捕獲アイテム | minecraft:rabbit_hide（表示名: 捕獲した毛皮・正誤は見た目では区別不可） |
| 納品チェスト | start したプレイヤーの足元に 1 つ設置                                   |
| ラウンド中心 | start したプレイヤーの立ち位置（ハコイヌ出現の中心）                    |
| 帰還ポイント | スコアボード `return_point`                                             |

### ゲート起動時（start）

- 全員の帰還ポイントを **0** にリセット
- ゲート開放 **5 分**（残り 60 秒ごとに通知、残り 60 / 30 / 10 秒で目立つ警告）
- **start したプレイヤーの位置**でラウンド開始（テレポートなし・**3・2・1 カウントダウン**のあと本編）
- **地面に立った状態**でのみ起動可（空中・飛行中はエラー）
- **骨 ×12** を全員に配布（所持分はいったん消してからセット）
- ハコイヌ納品で **骨 ×2 / 枚**、別種納品で **骨 ×4 / 枚** を追加
- **ハコイヌ 90 匹** と **別種 20 匹**（ランダム種）をラウンド中心 **6〜40 ブロック** にランダム配置
- **納品チェスト**を起動者の **足元** に **1 つだけ** 設置（半径 12・高さ ±10 内の既存チェスト類は撤去）
- 終了・リセット時にスクリプトが出した動物と納品チェストは片付けられる

### プレイの流れ

1. **地面に立って** start（起動者の位置がラウンド中心）
2. **minecraft:bone** を持ち、**4 ブロック以内**の動物を **空中で右クリック**（捕獲・**骨 ×1 消費**）
3. 骨で捕獲 → どちらも **捕獲した毛皮**（同じ見た目。正解は納品時に +pt / 別種は -pt）
4. 捕獲アイテムを **自動設置の納品チェスト（1つ）** に入れる → 得点加算のあと **毛皮はチェストから消える**
5. 時間切れまたは stop で閉鎖 → ランキング

### スコア

| 内容                             | 点数                       |
| -------------------------------- | -------------------------- |
| ハコイヌを納品チェストに入れる   | **+1 pt** / 匹分           |
| 別種の動物を納品チェストに入れる | **-2 pt** / 匹分           |
| ハコイヌ（オオカミ）を倒す       | **-10 pt** / 1 匹          |
| ハコイヌ（オオカミ）を攻撃する   | **-1 pt** / 1 回のダメージ |

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

### 納品チェスト

> start したプレイヤーの **足元** にチェストを 1 つ設置（座標は起動メッセージを参照）。周囲の既存チェスト類は撤去。

### CONFIG.BOX_GATE（フォールバック）

| 項目 | 値  |
| ---- | --- |
| X    | 0   |
| Y    | 86  |
| Z    | 0   |
| 半径 | 3   |

> 未起動時のフォールバック。通常は **start したプレイヤー位置** がラウンド中心になる。

### 操作・コマンド

| 種別                    | 入力                                         | 備考               |
| ----------------------- | -------------------------------------------- | ------------------ |
| チャット                | `!robw start` / `stop` / `reset` / `ranking` | **Beta APIs** 必須 |
| 時計（minecraft:clock） | 名前 `ROBW:menu` を空中で右クリック          | → `menu`           |
| 時計（minecraft:clock） | 名前 `ROBW:start` を空中で右クリック         | → `menu`           |
| 時計（minecraft:clock） | 名前 `ROBW:stop` を空中で右クリック          | → `stop`           |
| 時計（minecraft:clock） | 名前 `ROBW:reset` を空中で右クリック         | → `reset`          |
| 時計（minecraft:clock） | 名前 `ROBW:ranking` を空中で右クリック       | → `ranking`        |
| 関数                    | `/function robw/give_wand`                   | チート ON          |
| 関数                    | `/function robw/menu`                        | チート ON          |
| 関数                    | `/function robw/ping`                        | チート ON          |
| 関数                    | `/function robw/ranking`                     | チート ON          |
| 関数                    | `/function robw/reset`                       | チート ON          |
| 関数                    | `/function robw/start`                       | チート ON          |
| 関数                    | `/function robw/stop`                        | チート ON          |
| scriptevent             | `/scriptevent robw:start` 等                 | チート ON          |

### ゲーム状態

- waiting … 待機
- countdown … 起動カウントダウン中
- running … ゲート開放中（骨での保護・納品のみ有効）
- closing … 閉鎖カウントダウン中
- finished … 閉鎖済み（ランキング表示後）
<!-- sync:auto:game-rules:end -->

---

## 4. 手動で追記する内容

- ワールドごとに `CONFIG.BOX_GATE`（招集）をマップに合わせて変更（納品チェストは起動時に平坦な場所へ **自動設置**）
- v0.2 以降: ハコイヌ自動スポーン強化、金のハコイヌ、残り1分2倍、ゲート演出
- カスタムアイテムテクスチャが必要になったら resource pack 追加

### 開発・動作確認

- **`docs/bedrock-dev-notes.md`** … Launcher パス、ジャンクション、manifest API 版、トラブルシュート、動作確認チェックリスト
