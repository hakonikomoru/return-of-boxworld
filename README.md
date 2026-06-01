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
| 帰還ボックス | 保護用の箱（MVP は `minecraft:rabbit_hide`＝茶色の毛皮） |
| ボックスゲート | 帰還地点（座標エリア） |
| 帰還ポイント | スコア（scoreboard: `return_point`） |
| ゲート起動 / 閉鎖 | ゲーム開始 / 終了 |

## 必要環境

- Minecraft Bedrock Edition 1.21 以降
- ワールドでビヘイビアパックを適用
- **チャット `!robw` を使う場合のみ** 実験的機能 **Beta APIs**（ワールド設定 → ゲーム → 実験的機能）
- 操作棒・`/function` を使う場合は **チート ON** 推奨

開発・トラブルシュートの詳細は **[docs/bedrock-dev-notes.md](docs/bedrock-dev-notes.md)** を参照。

## インストール

1. `behavior_packs/robw_behavior` を Minecraft の behavior packs フォルダへ置く（開発時はジャンクション可。パス例は `docs/bedrock-dev-notes.md`）
   - **Windows（Launcher）**: `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\behavior_packs\`
   - **Windows（Store 直起動）**: `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\behavior_packs\`
   - **macOS**: `~/Library/Application Support/minecraftpe/games/com.mojang/behavior_packs/` またはワールドの `behavior_packs` へ
2. ワールド設定 → ビヘイビア パック → **リターン・オブ・ボックスワールド** を適用
3. `behavior_packs/robw_behavior/scripts/main.js` の **ボックスゲート座標**（`BOX_GATE`）をマップの**空いている座標**に合わせて変更（Y は地面の高さに注意）

Realms でも、ワールドに behavior pack を適用すれば同様に動作する想定です。

## 遊び方（MVP v0.1）

1. **地面に立って** start（時計 `ROBW:start` 等）→ **起動した位置**に納品チェスト1つ・骨配布・オオカミ出現（テレポートなし）
3. **骨**で近くの動物を捕獲 → 茶色の毛皮「**捕獲したハコイヌ**」または「**捕獲した別種**」
4. 捕獲アイテムを **納品チェストに入れる** → ハコイヌ **+1pt** / 別種 **-3pt**（納品後、毛皮はチェストから消える）
5. 時間切れまたは stop で閉鎖 → ランキング（スクリプトが出したオオカミは消える）

### ゲーム操作（開始・停止など）

| 方法 | 例 | 備考 |
|------|-----|------|
| チャット | `!robw start` / `stop` / `reset` / `ranking` | **Beta APIs** が必要 |
| 操作アイテム | スポーン時に渡る時計（`ROBW:start`）を空中で右クリック | Beta 不要・配信向けに手軽 |
| 関数 | `/function robw/start` など | チート ON |
| scriptevent | `/scriptevent robw:start` | チート ON |

時計の名前: `ROBW:start` / `ROBW:stop` / `ROBW:reset` / `ROBW:ranking`（入場時に起動用時計を自動配布）

### アイテム（暫定）

| 役割 | アイテム |
|------|----------|
| 保護用 | `minecraft:bone`（骨） |
| 捕獲したハコイヌ | `minecraft:rabbit_hide`（同名）… 納品で **+1pt** |
| 捕獲した別種 | 同じ毛皮（同名）… 納品で **-3pt** |

## 設定の変更

`behavior_packs/robw_behavior/scripts/main.js` 先頭の `CONFIG` を編集します。

```javascript
BOX_GATE: { x: 0, y: 86, z: 0, radius: 3 },           // 未起動時のフォールバック
SUBMISSION_CHEST: { x: 0, y: 85, z: 0 },            // 未設置時のフォールバック
CHEST_CLEANUP_RADIUS: 3,                          // start 時に足元付近の既存チェスト撤去半径
START_GIVE_BONES: 12,
BONES_PER_HAKOINU_DELIVERY: 4,
START_SPAWN_HAKOINU: 100,
START_SPAWN_PENALTY_ANIMALS: 50,
SPAWN_MIN_DISTANCE: 4,
SPAWN_MAX_DISTANCE: 28,
LOCK_DAYTIME: true,                             // 昼・晴天固定
DAY_TIME_OF_DAY: 6000,                          // 6000 = 真昼
HAKOINU_SPAWN_DISTANCE: 6,
POINTS_PER_BOX: 1,
POINTS_WRONG_ANIMAL: -3,
```

## ロードマップ

- **v0.1（現在）** … 起動時の招集・骨配布・オオカミ出現、骨で保護、茶色の毛皮の帰還ボックス、ボックスゲート、帰還ポイント・ゲート開放時間・ランキング
- **v0.2** … 自動スポーン強化（間隔・上限）、金のハコイヌ、レアハコイヌ、残り 1 分 2 倍、ゲート演出
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
    ├── bedrock-dev-notes.md
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
