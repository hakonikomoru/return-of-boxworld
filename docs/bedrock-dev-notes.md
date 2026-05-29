# 統合版（Bedrock）開発・動作確認メモ

> このリポジトリで実際にハマった点と解決策の記録。動作確認・トラブルシュート時は **README の前にここを読む**。

---

## 1. データフォルダ（ランチャー版）

Microsoft Store 直起動と **Minecraft Launcher（統合版）** ではパスが違う。

| 起動方法 | ビヘイビアパック置き場（Windows） |
|----------|-----------------------------------|
| **Launcher（本プロジェクトで確認）** | `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\behavior_packs\` |
| Store 直起動（参考） | `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\behavior_packs\` |

- ワールドは `Users\<アカウントID>\games\com.mojang\minecraftWorlds\<ID>\` にあることもある（Shared と別）。
- パック適用は `world_behavior_packs.json` の UUID（`manifest.json` の header.uuid）で紐づく。

### 開発用：ジャンクションでリポジトリ直結

コピーせず、編集を即反映する（PowerShell）:

```powershell
$src = "C:\Users\<you>\app\return-of-boxworld\behavior_packs\robw_behavior"
$dest = "$env:APPDATA\Minecraft Bedrock\Users\Shared\games\com.mojang\behavior_packs\robw_behavior"
New-Item -ItemType Junction -Path $dest -Target $src -Force
```

特定ワールドだけ試す場合は、そのワールド直下にも同様に張れる:

```text
...\minecraftWorlds\<ワールドID>\behavior_packs\robw_behavior
```

---

## 2. ワールド設定（必須）

| 設定 | 理由 |
|------|------|
| ビヘイビアパック **リターン・オブ・ボックスワールド** を適用 | スクリプト本体 |
| **Beta APIs**（実験的機能） | `!robw` チャットコマンド（`chatSend`）に必要 |
| チート ON（代替コマンド用） | `/function`・`/scriptevent` |

- 実験的機能は **ワールド作成時に ON** が確実。後から付けた場合は **新規ワールド** を検討。
- スクリプトや `main.js` を直したあとは **ワールド退出 → 再入場**（できればゲーム再起動）。

---

## 3. manifest の `@minecraft/server` バージョン

`manifest.json` の `dependencies` は **ゲームが提供する API 以下** にする。

| 指定例 | 目安 |
|--------|------|
| `1.11.0` | Minecraft **1.21.0** 以降向けの安定版として採用（本リポジトリ現状） |
| `1.18.0` | それより新しいゲーム専用。古い 1.21 クライアントだと **スクリプト全体が読み込まれない** |

症状: チャットも骨も何も反応しない → Content Log に Script エラー、または無音。

参考: [Microsoft バージョニング表](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Documents/scripting/versioning.md)

---

## 4. Script API 2.x と起動タイミング

Script API 2.x では **スクリプトがワールドより後に読み込まれる** ことがある。

| やってはいけないこと | 結果 |
|----------------------|------|
| `worldLoad` の購読**だけ**で初期化 | `worldLoad` 発火済み → **一度も初期化されない** |
| `world.sendMessage` をワールド未準備時に直叩き | 起動処理が例外で止まることがある |

本リポジトリの対策（`main.js`）:

- `system.run` / `runTimeout` で即時＋遅延初期化
- `worldLoad`・`playerSpawn` でも再試行
- 起動時に `[ROBW] 準備OK` をプレイヤーへ表示

Content Log に `[ROBW] main.js loaded` が出れば **ファイル読み込みは成功**。出ない場合はパック未適用か manifest 不一致。

---

## 5. コマンドの使い分け（重要）

`!robw start` は **`beforeEvents.chatSend` / `afterEvents.chatSend`（Beta APIs 依存）**。Beta が OFF だと **チャットに打っても反応しない**（メッセージはそのまま表示される）。

### 確実な代替（優先順）

| 方法 | 入力・操作 | 備考 |
|------|------------|------|
| **① 操作アイテム** | スポーン時に渡る **時計（ROBW:start）** を **空中で右クリック** | Beta 不要。棒はブロック設置で `itemUse` が出ないことがあるため時計に変更 |
| **② 関数** | `/function robw/start` | `functions/robw/*.mcfunction` → `scriptevent` |
| **③ scriptevent** | `/scriptevent robw:start` | チート ON |
| **④ チャット** | `!robw start` | **Beta APIs ON** が必要 |

時計の名前一覧（入場時に `ROBW:start` の時計を自動配布）:

| 名前 | 動作 |
|------|------|
| `ROBW:start` | ゲート起動 |
| `ROBW:stop` | ゲート閉鎖 |
| `ROBW:reset` | リセット |
| `ROBW:ranking` | ランキング |

- **ブロックを狙って右クリック**すると反応しないことがある → **空を向いて**使う。
- 手動で棒に名前を付けた場合は動かないことがある（スクリプト配布の時計を使う）。

チャットは **スラッシュなし**・**半角** `!`（全角 `！` は正規化するが半角推奨）。

---

## 6. ボックスゲート座標

`CONFIG.BOX_GATE`（`main.js`）を **マップの空いている座標** に合わせる。

- デフォルト `(0, 64, 0)` は地下の土の中になりやすい → **窒息**する。
- 本番テスト例: `(0, 86, 0)` 半径 `3`（ワールドごとに要調整）。
- 確認: 座標表示 ON → `/tp 0 86 0` などで立ち位置を確認してから `BOX_GATE` を書く。
- 変更後は **ワールド再入場**。

---

## 7. 動作確認チェックリスト

1. ワールドに入る → `[ROBW] 準備OK` が出る
2. **時計 `ROBW:start` 右クリック** → 招集 TP ＋**納品チェスト1つ自動設置**（周囲チェスト撤去）＋骨 ＋オオカミ出現
4. オオカミの近くで **骨を空中右クリック** → 茶色の毛皮「捕獲したハコイヌ」。牛・豚など → 「捕獲した別種」
5. チャットの「納品チェストを設置しました (x,y,z)」の座標に捕獲アイテムを入れる → +1pt / -3pt（毛皮は消費される）
6. `ROBW:ranking` または `!robw ranking` → ランキング表示

---

## 8. トラブルシュート早見表

| 症状 | よくある原因 | 対処 |
|------|--------------|------|
| 何も反応しない | パック未適用 / API バージョン不一致 | ビヘイビアパック・manifest `1.11.0`・Content Log |
| `[ROBW]` が出ない | 起動タイミング / スクリプト未読込 | ゲーム再起動・ワールド再入場・ジャンクション切れ確認 |
| `準備OK` は出るが `!robw` だけ無効 | Beta APIs OFF | 時計ワンド or `/function robw/start`、または Beta ON |
| 時計を使っても無反応 | ブロックをクリックしている / イベント未登録 | **空中**で右クリック。Content Log に `item handler` があるか確認。ワールド再入場 |
| 納品しても pt が増えない | 平坦な場所が見つからない / チェスト未生成 | 周囲を平らにするか `CHEST_FLAT_SEARCH_RADIUS` を広げる |
| 骨で毛皮が出ない | ゲート未起動 / 狼が遠い | 先に start、4 ブロック以内 |
| `/tp 0 64 0` で窒息 | 座標がブロック内 | 空いている Y に TP してから `BOX_GATE` 更新 |

### Content Log

設定 → **クリエイター** → **コンテンツログ GUI** を ON。

| ログ例 | 意味 |
|--------|------|
| `[ROBW] main.js loaded` | エントリ読み込み OK |
| `[INFO] registered !robw chat handler` | チャット購読 OK |
| `[WARN] chat handlers unavailable` | Beta OFF → 操作棒等を使う |
| `[ERROR] startup failed:` | 起動処理例外（直後の文言を確認） |

---

## 9. 実装メモ（コードを触る人向け）

- チャット: `beforeEvents.chatSend`（キャンセル）＋ `afterEvents.chatSend`（フォールバック）。二重実行防止に短い debounce あり。
- 代替: `world.afterEvents.scriptEventReceive`（`robw:start` 等）、`functions/robw/*.mcfunction`。
- ログは `console.warn`（`[INFO]` / `[WARN]` / `[ERROR]` プレフィックス）— Content Log に出る。
- ゲーム仕様変更時は **README**・**本ファイル**・`main.js` を揃え、**`npm run sync:project-docs`** で `docs/project-sync.md` のゲーム内ルールを自動更新する。

---

## 10. 変更履歴（メモ）

| 日付 | 内容 |
|------|------|
| 2026-05-29 | 初版: Launcher パス、ジャンクション、API 版、worldLoad 問題、チャット代替、ゲート Y=86、Content Log |
