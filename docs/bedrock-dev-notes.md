# 統合版（Bedrock）開発・動作確認メモ

> このリポジトリで実際にハマった点と解決策の記録。動作確認・トラブルシュート時は **README の前にここを読む**。  
> ゲーム数値の調整は **[config-reference.md](config-reference.md)**（`main.js` の `CONFIG` 各項目の日本語説明）。

---

## 1. データフォルダ（ランチャー版）

Microsoft Store 直起動と **Minecraft Launcher（統合版）** ではパスが違う。

| 起動方法                             | ビヘイビアパック置き場（Windows）                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Launcher（本プロジェクトで確認）** | `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\behavior_packs\`                                |
| Store 直起動（参考）                 | `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\behavior_packs\` |

- ワールドは `Users\<アカウントID>\games\com.mojang\minecraftWorlds\<ID>\` にあることもある（Shared と別）。
- パック適用は `world_behavior_packs.json` の UUID（`manifest.json` の header.uuid）で紐づく。

### 開発用：ジャンクションでリポジトリ直結

コピーせず、編集を即反映する（PowerShell）:

```text
npm run install:bedrock-pack
```

PowerShell で `npm` が実行ポリシーで拒否される場合は **`npm.cmd`** を使う（例: `npm.cmd run install:bedrock-pack`）。スクリプト本体は Node のため、直接 `node scripts/install-bedrock-pack.mjs` でも可。

（手動の場合）Launcher ではワールドが `Users\<アカウントID>\games\com.mojang\` 側にあることが多い。**Shared だけ**にパックを置いても足りない場合があるため、上記スクリプトは **Shared と各アカウント**の `behavior_packs` / `development_behavior_packs` の両方へジャンクションを張ります。

特定ワールドだけ試す場合は、そのワールド直下にも同様に張れる:

```text
...\minecraftWorlds\<ワールドID>\behavior_packs\robw_behavior
```

---

## 2. ワールド設定（必須）

| 設定                                                         | 理由                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| ビヘイビアパック **リターン・オブ・ボックスワールド** を適用 | スクリプト本体                               |
| **Beta APIs**（実験的機能）                                  | `!robw` チャットコマンド（`chatSend`）に必要 |
| チート ON（代替コマンド用）                                  | `/function`・`/scriptevent`                  |

- 実験的機能は **ワールド作成時に ON** が確実。後から付けた場合は **新規ワールド** を検討。
- スクリプトや `main.js` を直したあとは **ワールド退出 → 再入場**（できればゲーム再起動）。

### 2.1 ビヘイビアパックの説明文・名前・アイコンが更新されない

**manifest.json の `description` / `name` / `pack_icon.png`** は、スクリプトと違って **ゲームが UUID + バージョンでキャッシュ** することがある。

| 見ている場所                         | 更新元                                                 |
| ------------------------------------ | ------------------------------------------------------ |
| ワールド設定 → ビヘイビア パック一覧 | `behavior_packs/robw_behavior/manifest.json`           |
| ワールド選択画面の「ワールド説明」   | **ワールド設定 UI で手動入力**（パックでは変わらない） |

パック説明を反映する手順:

1. `node scripts/sync-bedrock-world-pack.mjs`（`world_behavior_packs.json` の version も同期）
2. **`manifest.json` の `header.version` を上げる**（例 `[0,1,0]` → `[0,1,1]`。modules の version も揃える）
3. **マイクラを完全終了**（ワールド退出だけでは足りないことが多い）
4. まだ古い場合: ワールド設定 → ビヘイビア パック → **一度 OFF → ON**、またはパック削除して再適用

`sync-bedrock-world-pack` は manifest の version を読み、該当ワールドの `world_behavior_packs.json` も更新する。

---

## 3. manifest の `@minecraft/server` バージョン

`manifest.json` の `dependencies` は **ゲームが提供する API 以下** にする。

| 指定例 | 目安 |
|--------|------|
| `1.11.0` | **本リポジトリ現状**（`@minecraft/server-ui` 1.2.0 と整合）。ゲーム起動時に 1.19 へ promote される。 |
| `2.3.0` | `getGeneratedStructures` 向けだが **server-ui 1.2.0 とバージョン競合**しスクリプトが起動しない。併用するなら server-ui も上げて要検証。 |
| `1.18.0` | それより新しいゲーム専用。古い 1.21 クライアントだと **スクリプト全体が読み込まれない** |

症状: チャットも骨も何も反応しない → Content Log に Script エラー、または無音。

参考: [Microsoft バージョニング表](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Documents/scripting/versioning.md)

---

## 4. Script API 2.x と起動タイミング

Script API 2.x では **スクリプトがワールドより後に読み込まれる** ことがある。

| やってはいけないこと                           | 結果                                            |
| ---------------------------------------------- | ----------------------------------------------- |
| `worldLoad` の購読**だけ**で初期化             | `worldLoad` 発火済み → **一度も初期化されない** |
| `world.sendMessage` をワールド未準備時に直叩き | 起動処理が例外で止まることがある                |

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
| **① 操作アイテム** | 入場時に **`robw:control`**（`ROBW:menu`）をホストに1個配布。無いときは `/scriptevent robw:give_wand` | **空中**で右クリック |
| **② scriptevent** | `/scriptevent robw:start` ・ `robw:menu` など | **チート ON**。スクリプトが読めていれば常に使える |
| **③ カスタムコマンド** | `/robw:start` ・ `/robw:menu` など | ゲーム **1.21.80 以降** でスクリプト登録。チート不要の設定 |
| **④ 関数** | `/function robw/start` | ワールドに**パック適用済み**のときだけ。`functions/robw/*.mcfunction` → `scriptevent` |
| **⑤ チャット** | `!robw start` | **Beta APIs ON** が必要 |

操作アイテム `robw:control`（入場時にホストへ1個・名前 `ROBW:menu`）:

| 操作 | 動作 |
|------|------|
| 空中で右クリック | 操作メニュー（start / locate / find / register / stop / reset / ranking） |

- **ブロックを狙って右クリック**すると反応しないことがある → **空を向いて**使う。
- 旧バニラ時計（`ROBW:menu` 名付き）は入場時に自動除去。時計は新規配布しない。

チャットは **スラッシュなし**・**半角** `!`（全角 `！` は正規化するが半角推奨）。

### 5.1 `/function` が「関数が見つかりません」（パック有効でも出る場合）

よくある原因は次のとおりです。

| 原因                                                                    | 対処                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| パックが **Shared にしか無い**（Launcher のアカウント別フォルダに無い） | `npm run install:bedrock-pack`                               |
| ワールド内の **古い埋め込みコピー**                                     | `npm run sync:bedrock-world-pack` のあと再入場               |
| `.mcfunction` 内の **`scriptevent` の書式**（メッセージ引数なし）       | 本リポジトリでは `scriptevent robw:start run` 形式に統一済み |
| チート OFF                                                              | チート ON                                                    |

手順:

1. `npm run install:bedrock-pack` → `npm run sync:bedrock-world-pack`（開発中は **自動同期** も可、下記）
2. ワールドを**一度出て再入場**（できれば `/reload` またはゲーム再起動）

### ワールドへの自動同期（開発中）

`behavior_packs/robw_behavior` を保存するたびに、ROBW 適用済みワールドへコピーする:

```text
node scripts/watch-bedrock-world-pack.mjs
```

または `npm.cmd run watch:bedrock-world-pack` / `dev:bedrock`（PowerShell で `npm` が拒否される場合は `node` 直実行）。

- 起動時に 1 回同期し、その後ファイル変更を監視（約 0.35 秒 debounce）
- 特定ワールドだけ: `node scripts/watch-bedrock-world-pack.mjs YOJryCSD27o=`
- Cursor タスク: **Bedrock: watch world pack sync**（`Ctrl+Shift+P` → タスクの実行）

**注意:** スクリプト変更はワールド**再入場**（できればゲーム再起動）後にゲームへ反映される。監視はコピーまで自動。3. 診断: **`/function robw/ping`** → チャットに `[ROBW] function load OK` なら関数登録は成功4. 本番: **`/function robw/menu`** または **`/scriptevent robw:menu run`** 5. ゲーム 1.21.80 以降なら **`/robw:menu`**（Content Log に `registered slash commands`）

```powershell
npm run verify:bedrock-pack
```

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
2. **地面に立って** 時計 `ROBW:menu` → メニューで起動 → **足元**に納品チェスト1つ ＋骨 ＋オオカミ出現
3. オオカミや動物の近くで **骨を空中右クリック** → 「捕獲した毛皮」（ハコイヌか別種かは見た目では分からない）
4. 「納品チェストを足元に設置しました」の座標に捕獲アイテムを入れる → +1pt / -2pt（毛皮は消費される）
5. `ROBW:ranking` または `!robw ranking` → ランキング表示

---

## 8. トラブルシュート早見表

| 症状                                                | よくある原因                                  | 対処                                                                             |
| --------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| 何も反応しない                                      | パック未適用 / API バージョン不一致           | ビヘイビアパック・manifest `1.11.0`・Content Log                                 |
| `[ROBW]` が出ない                                   | 起動タイミング / スクリプト未読込             | ゲーム再起動・ワールド再入場・ジャンクション切れ確認                             |
| `準備OK` は出るが `!robw` だけ無効                  | Beta APIs OFF                                 | 時計ワンド or `/function robw/start`、または Beta ON                             |
| 時計を使っても無反応                                | ブロックをクリックしている / イベント未登録   | **空中**で右クリック。Content Log に `item handler` があるか確認。ワールド再入場 |
| **`/function robw/...` が「関数が見つかりません」** | ワールドにビヘイビアパック未適用 / チート OFF | 下記「§5.1」を参照。まず `/scriptevent robw:menu` を試す                         |
| start できない / チェストが出ない                   | 空中・飛行中 / 足元にブロック                 | **地面に立って** start                                                           |
| 納品しても pt が増えない                            | 別のチェストに入れた / ゲート未起動           | start 時に足元に出たチェストを使う                                               |
| 骨で毛皮が出ない                                    | ゲート未起動 / 狼が遠い                       | 先に start、4 ブロック以内                                                       |

### Content Log

マイクラ内（一度だけ）:

| 設定                                   | 推奨                                 |
| -------------------------------------- | ------------------------------------ |
| **コンテンツログファイルを有効にする** | ON（エディタで tail するために必須） |
| **コンテンツログ GUI**                 | ON（ゲーム画面内でも確認）           |
| **GUI ログレベル**                     | **情報** または **詳細**             |

ログファイルの場所（Launcher / GDK）:

- `%APPDATA%\Minecraft Bedrock\logs\` または `Users\<ID>\games\com.mojang\logs\`
- ファイル名は **`ContentLog2026-05-29_12-00-00_1.txt`** のような **`.txt`**（`.log` ではないことが多い）
- **プロフィール画面**に、有効時は現在のログのフルパスが表示される

（Store 直起動の旧 UWP）`%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\logs\`

#### ログファイルが作られないとき

1. **設定 → クリエイター** で「**コンテンツログファイルを有効にする**」が **ON** か再確認（GUI だけ ON ではファイルはできない）
2. 設定変更後、**ホームに一度戻ってから**ワールドへ入る
3. 診断: `node scripts/diagnose-bedrock-log.mjs`
4. ファイルが無くても **Ctrl+H**（コンテンツログ履歴）→ 全コピーでクリップボードに保存できる
5. 拡張機能 [Minecraft Bedrock Edition Debugger](https://aka.ms/vscodescriptdebugger) + `.vscode/launch.json` → ゲーム内 `/script debugger connect` で Cursor に直結

#### エディタ（Cursor / VS Code）でリアルタイム表示

1. 診断: `node scripts/diagnose-bedrock-log.mjs`（ログの有無とパス）
2. tail: `node scripts/tail-bedrock-log.mjs --mirror`
   - **ファイル**（`ContentLog*.txt`）を監視
   - **ゲーム内 GUI** … クリップボードを監視（`Ctrl+H` → コンテンツログ履歴 → **全コピー** で `logs/bedrock-content.log` に追記、`[gui]` 行）
3. 別タブで **`logs/bedrock-content.log`** を開く（ファイル + GUI コピー分が混ざる）
4. タスク: `Ctrl+Shift+P` → **Bedrock: tail content log**

GUI のログは OS から直接読めないため、履歴画面で「全コピー」するか、表示中の行を選択コピーするとエディタ側に取り込まれます。

| ログ例                                 | 意味                             |
| -------------------------------------- | -------------------------------- |
| `[ROBW] main.js loaded`                | エントリ読み込み OK              |
| `[INFO] registered !robw chat handler` | チャット購読 OK                  |
| `[WARN] chat handlers unavailable`     | Beta OFF → 操作棒等を使う        |
| `[ERROR] startup failed:`              | 起動処理例外（直後の文言を確認） |

`npm run` 用スクリプト: `tail:bedrock-log` / `tail:bedrock-log:robw` / `tail:bedrock-log:mirror`

---

## 9. 実装メモ（コードを触る人向け）

- チャット: `beforeEvents.chatSend`（キャンセル）＋ `afterEvents.chatSend`（フォールバック）。二重実行防止に短い debounce あり。
- 代替: `world.afterEvents.scriptEventReceive`（`robw:start` 等）、`functions/robw/*.mcfunction`。
- ログは `console.warn`（`[INFO]` / `[WARN]` / `[ERROR]` プレフィックス）— Content Log に出る。
- ゲーム仕様変更時は **README**・**本ファイル**・`main.js` を揃え、**`npm run sync:project-docs`** で `docs/project-sync.md` のゲーム内ルールを自動更新する。

---

## 10. 変更履歴（メモ）

| 日付       | 内容                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 2026-05-29 | 初版: Launcher パス、ジャンクション、API 版、worldLoad 問題、チャット代替、ゲート Y=86、Content Log |
