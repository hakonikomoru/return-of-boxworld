# リターン・オブ・ボックスワールド（Return of BoxWorld）

Minecraft **統合版（Bedrock Edition）** 向けの Script API アドオンです。

ボックスワールドの住人「ハコイヌ」が現世に迷い込んだ世界で、帰還ボックスに保護してボックスゲートから元の世界へ帰す、リスナー参加型ミニゲーム **Return of BoxWorld** の MVP（v0.1）です。

## コンセプト

- 犬を攻撃・倒すゲームではなく、**迷子の同族をボックスワールドへ帰す**救出系ミニゲーム
- 配信者のワールドに behavior pack を入れるだけで、**リスナー側の個別導入は不要**
- 制限時間（ゲート開放時間）内に帰還ポイントを競う

## 用語

| ゲーム内 | 意味 |
|----------|------|
| ハコイヌ | 犬型種族（MVP は `minecraft:wolf` 代用） |
| 帰還ボックス | 保護用の箱（MVP は `minecraft:paper`） |
| ボックスゲート | 帰還地点（座標エリア） |
| 帰還ポイント | スコア（scoreboard: `return_point`） |
| ゲート起動 / 閉鎖 | ゲーム開始 / 終了 |

## 必要環境

- Minecraft Bedrock Edition 1.21 以降
- ワールドで **Beta APIs（Script API）** を有効化
- 実験的機能: **Beta APIs** / **Script API**（ワールド設定 → ゲーム → 実験的機能）

## インストール

1. `behavior_packs/robw_behavior` を Minecraft の behavior packs フォルダにコピーする
   - Windows: `%localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\behavior_packs\`
   - macOS: `~/Library/Application Support/minecraftpe/games/com.mojang/behavior_packs/` またはワールドの `behavior_packs` へ
2. ワールド設定 → ビヘイビア パック → **リターン・オブ・ボックスワールド** を適用
3. `behavior_packs/robw_behavior/scripts/main.js` の **ボックスゲート座標**（`BOX_GATE`）をマップに合わせて変更

Realms でも、ワールドに behavior pack を適用すれば同様に動作する想定です。

## 遊び方（MVP v0.1）

1. マップに **オオカミ（ハコイヌ代用）** を配置（自動スポーンは v0.2 予定）
2. チャットで `!robw start` → ゲート起動（全員の帰還ポイント 0、開放時間 10 分）
3. **骨** を持ち、ハコイヌの近くで使う → **帰還ボックス（紙）** を 1 個獲得
4. **ボックスゲート** 付近に入ると、所持している帰還ボックスが自動で消費され帰還ポイント加算（1 箱 = 1 pt）
5. 時間切れまたは `!robw stop` でゲート閉鎖 → 帰還ランキング表示

### チャットコマンド

| コマンド | 説明 |
|----------|------|
| `!robw start` | ゲート起動（ゲーム開始） |
| `!robw stop` | ゲート閉鎖・ランキング表示 |
| `!robw reset` | 状態リセット・帰還ポイント 0 |
| `!robw ranking` | 現在の帰還ランキング表示 |

### アイテム（暫定）

| 役割 | アイテム |
|------|----------|
| 保護用 | `minecraft:bone`（骨） |
| 帰還ボックス | `minecraft:paper`（名前: 帰還ボックス） |

## 設定の変更

`behavior_packs/robw_behavior/scripts/main.js` 先頭の `CONFIG` を編集します。

```javascript
BOX_GATE: {
  x: 0,      // ボックスゲート X
  y: 64,     // ボックスゲート Y
  z: 0,      // ボックスゲート Z
  radius: 3, // 帰還判定半径
},
```

## ロードマップ

- **v0.1（現在）** … 手動配置のハコイヌ、骨で保護、紙の帰還ボックス、ボックスゲート、帰還ポイント・ゲート開放時間・ランキング
- **v0.2** … 自動スポーン、金のハコイヌ、レアハコイヌ、残り 1 分 2 倍、ゲート演出
- **v0.3** … チーム戦、ランダムイベント、専用テクスチャ、Discord リザルト文

## リポジトリ構成

```
return-of-boxworld/
├── README.md
├── behavior_packs/
│   └── robw_behavior/
│       ├── manifest.json
│       └── scripts/
│           └── main.js
└── docs/
    └── project-sync.md
```

## 配信用説明文

```
ボックスワールドの住人「ハコイヌ」が現世に迷い込んじゃった！
骨でハコイヌを帰還ボックスに保護して、ボックスゲートから
元の世界へ帰してあげよう！

ゲート開放時間内にたくさん帰還させた人が勝ち！
攻撃するゲームじゃないから、やさしく助けてね！
```

## ライセンス

プロジェクト方針に従い、配布・改変はリポジトリオーナーの指示に従ってください。
