# リターン・オブ・ボックスワールド

ボックスワールドには、箱荷こもる📦️と同じ種族の犬たちが暮らしている。

しかしある日、ボックスワールドと現世をつなぐゲートに不調が発生。  
まだ人の姿になることができない犬たちが、ゲートの暴走によって大量に現世へ飛び出してしまった。

たどり着いた先は、見知らぬマイクラの世界。

自分たちの力だけではボックスワールドへ帰ることができない犬たちを見つけ、帰還ボックスで保護し、ボックスゲートから元の世界へ帰してあげよう。

これは、現世に迷い込んだ同族たちをボックスワールドへ帰還させる、リスナー参加型ミニゲーム。

Minecraft **統合版（Bedrock Edition）** 向け Script API アドオン **Return of BoxWorld**（MVP v0.1）です。

---

## 世界観

ボックスワールドは、箱と犬たちが暮らすやさしい世界。  
住人たちは、いつか人の姿になれる日を夢見ている。

ところがゲートの不調が起き、まだ小さな犬の姿のまま、次々と現世——プレイヤーのマイクラの世界——へ飛び出してしまう。

プレイヤーは迷子の犬たちを見つけ、**帰還ボックス**でそっと保護し、**ボックスゲート**からボックスワールドへ届けてあげる。  
倒す・狩るのではなく、**元の世界へ帰してあげる**ゲームです。

---

## ゲーム概要

「リターン・オブ・ボックスワールド」は、ゲートの不調によって現世に飛び出してしまった、ボックスワールドの犬たちを元の世界へ帰してあげるミニゲームです。

プレイヤーはマイクラの世界に迷い込んだ犬たちを探し、帰還ボックスで保護して、ボックスゲートまで届けます。

制限時間内にたくさんの犬たちを帰還させ、もっとも多くの帰還ポイントを集めたプレイヤーが勝利です。

- 配信者のワールドに behavior pack を入れるだけで、**リスナー側の個別導入は不要**
- **マルチ**: 先に入った人がホスト（操作時計・ゲート起動/停止/リセット）。参加者は保護・帰還のみ

---

## 遊び方

1. **ホスト**が地面に立ってゲートを起動（操作時計 `ROBW:menu` → メニューで start）  
   → 起動位置に **ボックスゲート用のチェスト** が1つ設置され、骨が配布され、犬たちが周囲に出現
2. **骨**で近くの犬たちを **保護** → どちらも同じ見た目の **帰還ボックス**（正体は帰還して初めてわかる）
3. 帰還ボックスを **ボックスゲート（チェスト）** に入れる → 正解 **+1pt** / 別種 **-3pt**
4. 時間切れまたは stop で閉鎖 → ランキング表示

### アイテム（暫定）

| 役割 | アイテム |
|------|----------|
| 保護用 | `minecraft:bone`（骨） |
| 帰還ボックス | `minecraft:rabbit_hide`（表示名は常に同じ「捕獲した毛皮」） |

---

## コマンド

| 方法 | 例 | 備考 |
|------|-----|------|
| チャット | `!robw start` / `stop` / `reset` / `ranking` | **Beta APIs** が必要。**start/stop/reset はホストのみ** |
| 操作時計 | ホストに渡る `ROBW:menu` を右クリック → メニュー | **ホストのみ**。Beta 不要 |
| scriptevent | `/scriptevent robw:start` ・ `robw:menu` など | チート ON（**推奨**） |
| 関数 | `/function robw/start` など | チート ON・**ワールドにパック適用済み** |
| カスタムコマンド | `/robw:start` ・ `/robw:menu` など | ゲーム 1.21.80 以降 |

時計は **ホストだけ**に配布。右クリックで start / stop / reset / ranking。

### 必要環境

- Minecraft Bedrock Edition 1.21 以降
- ワールドでビヘイビアパック **Return of BoxWorld** を適用
- **チャット `!robw` を使う場合のみ** 実験的機能 **Beta APIs**
- 操作時計・`/function` を使う場合は **チート ON** 推奨

### インストール

1. `behavior_packs/robw_behavior` を Minecraft の behavior packs フォルダへ置く（開発時はジャンクション可。詳細は [docs/bedrock-dev-notes.md](docs/bedrock-dev-notes.md)）
2. ワールド設定 → ビヘイビア パック → **Return of BoxWorld** を適用
3. 必要に応じて `main.js` の `CONFIG.BOX_GATE` をマップに合わせて調整

Realms でも、ワールドに behavior pack を適用すれば同様に動作する想定です。

---

## 用語

- **犬たち** … ボックスワールドの住人。箱荷こもる📦️と同じ種族で、まだ人の姿になることができない存在（MVP では `minecraft:wolf` 等で表現）
- **帰還ボックス** … 犬たちを安全に保護し、ボックスワールドへ帰すための箱
- **ボックスゲート** … 現世とボックスワールドをつなぐ帰還用ゲート（MVP では足元のチェスト）
- **帰還ポイント** … 犬たちを元の世界へ帰してあげた数を示すスコア（scoreboard: `return_point`）
- **ゲート起動 / 閉鎖** … ラウンド開始 / 終了

---

## 開発者

開発：**komolabo - こもらぼ -**

---

## クレジット

- 企画・世界観：**箱荷こもる📦️**
- 開発：**komolabo - こもらぼ -**

---

## 注意事項

- このゲームは **犬を倒す・狩るゲームではありません**。迷子の同族をボックスワールドへ **帰してあげる** 体験です。
- マルチでは **ホストが先にワールドに入る** と、操作時計とゲート起動権がホストに付きます。
- スクリプトを編集したあとは **ワールド再入場**（できればゲーム再起動）が必要です。
- ゲーム数値・挙動は `behavior_packs/robw_behavior/scripts/main.js` の **`CONFIG`** で変更します（[docs/config-reference.md](docs/config-reference.md) 参照）。

---

## 配信用説明文

```
ボックスワールドの犬たちが、ゲートの不調で現世に迷い込んじゃった！
骨で犬たちを帰還ボックスに保護して、ボックスゲートから
元の世界へ帰してあげよう！

ゲート開放時間内にたくさん帰還させた人が勝ち！
攻撃するゲームじゃないから、やさしく助けてね！
```

---

## 開発（セットアップ・ログ）

開発・トラブルシュートの詳細は **[docs/bedrock-dev-notes.md](docs/bedrock-dev-notes.md)** を参照。

### ワールドへの自動同期

```text
node scripts/watch-bedrock-world-pack.mjs
```

| npm スクリプト | 内容 |
|----------------|------|
| `watch:bedrock-world-pack` / `dev:bedrock` | ファイル監視で自動同期 |
| `sync:bedrock-world-pack` | 1 回だけ手動同期 |
| `install:bedrock-pack` | 開発用ジャンクション |

PowerShell で `npm` が拒否される場合は `npm.cmd` または `node scripts/...` を使用。

### パックの説明文・名前・アイコンが変わらないとき

**ビヘイビアパック**の説明（`manifest.json`）と **`pack_icon.png`** は、Bedrock が **バージョン番号付きでキャッシュ** することがあります。  
アイコンは **behavior pack と resource pack の両方** に `pack_icon.png` を置く（本リポジトリは `robw_behavior` + `robw_resources`）。

1. `manifest.json` の **`header.version` を上げる**（`modules` 内の version も同じ値に）
2. `node scripts/sync-bedrock-world-pack.mjs`（BP/RP コピー + `world_*_packs.json` 更新）
3. `node scripts/install-bedrock-pack.mjs`（グローバル配置へのジャンクション）
4. **マイクラを完全終了** → ワールド設定 → **ビヘイビア / リソース パックを OFF → ON**

※ **ワールド選択画面の「ワールド説明」** はパックでは更新されません。ワールド設定から手動で編集してください。

### コンテンツログ（開発の味方）

1. マイクラ: **設定 → クリエイター** → **コンテンツログファイルを有効にする** = ON  
2. `node scripts/diagnose-bedrock-log.mjs`  
3. `node scripts/tail-bedrock-log.mjs --mirror --robw`  
4. Cursor で `logs/bedrock-content.log` を開く  

| npm スクリプト | 内容 |
|----------------|------|
| `diagnose:bedrock-log` | ログパス診断 |
| `tail:bedrock-log:mirror` | ファイル → `logs/bedrock-content.log` にミラー |
| `tail:bedrock-log:robw` | ROBW 行だけ表示 |

---

## ロードマップ

- **v0.1（現在）** … ゲート起動・骨配布・犬出現、骨で保護、帰還ボックス、ボックスゲート、帰還ポイント・制限時間・ランキング
- **v0.2** … 自動スポーン強化、金のハコイヌ、レアハコイヌ、残り 1 分 2 倍、ゲート演出
- **v0.3** … チーム戦、ランダムイベント、専用テクスチャ、Discord リザルト文

---

## リポジトリ構成

```
return-of-boxworld/
├── README.md
├── package.json
├── behavior_packs/robw_behavior/   # manifest.json, pack_icon.png, scripts/
├── scripts/                        # install / sync / tail-bedrock-log など
├── logs/                           # tail --mirror の出力先
└── docs/
    ├── bedrock-dev-notes.md
    ├── config-reference.md
    └── project-sync.md
```

---

## ライセンス

プロジェクト方針に従い、配布・改変はリポジトリオーナーの指示に従ってください。
