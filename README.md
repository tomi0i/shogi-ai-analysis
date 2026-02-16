# 将棋AI分析Webサービス - デプロイガイド

やねうら王を統合した将棋AI分析サービスをRender.comに無料デプロイする手順

---

## 🚀 クイックスタート

### 1. GitHubリポジトリを作成

1. GitHubで新しいリポジトリを作成
2. このプロジェクトをプッシュ

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Render.comにデプロイ

1. [Render.com](https://render.com/) にアクセス
2. GitHubアカウントでサインアップ/ログイン
3. 「New +」→「Web Service」を選択
4. GitHubリポジトリを接続
5. 以下の設定：
   - **Name**: `shogi-ai-analysis`（任意）
   - **Environment**: `Docker`
   - **Plan**: `Free`
   - **Health Check Path**: `/api/health`

6. 「Create Web Service」をクリック

### 3. デプロイ完了を待つ

- 初回ビルドは15-20分かかります（やねうら王のビルド含む）
- デプロイ成功後、URLが発行されます（例: `https://shogi-ai-analysis.onrender.com`）

---

## 🌐 公開URL

デプロイ後、以下のようなURLでアクセスできます：

```
https://YOUR-SERVICE-NAME.onrender.com
```

---

## 📊 API仕様

### エンドポイント一覧

#### 1. ヘルスチェック
```
GET /api/health
```

レスポンス:
```json
{
  "status": "ok",
  "engine": "ready",
  "queue": 0
}
```

#### 2. 局面分析
```
POST /api/analyze
Content-Type: application/json

{
  "sfen": "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
  "depth": 15
}
```

レスポンス:
```json
{
  "success": true,
  "score": 50,
  "bestmove": "7g7f",
  "depth": 15
}
```

#### 3. 棋譜全体分析
```
POST /api/analyze-kifu
Content-Type: application/json

{
  "moves": [
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 2",
    ...
  ],
  "depth": 12
}
```

---

## 💰 料金

### Render.com 無料枠

- ✅ 完全無料
- ✅ HTTPSで公開
- ⚠️ 15分アクセスがないとスリープ（再起動30秒）
- ⚠️ 月750時間まで（実質無制限）
- ⚠️ メモリ512MB（軽い分析のみ）

### 有料プランにアップグレード（必要な場合）

- **Starter**: $7/月 - メモリ1GB、常時稼働
- **Standard**: $25/月 - メモリ2GB、高速処理

---

## 🔧 ローカル開発

### 必要なもの
- Node.js 18以上
- Docker（推奨）

### Docker で実行

```bash
docker build -t shogi-ai .
docker run -p 3000:3000 shogi-ai
```

ブラウザで `http://localhost:3000` にアクセス

### Node.js で実行

```bash
npm install
node server.js
```

**注意**: ローカル実行の場合、やねうら王のバイナリを手動で配置する必要があります

---

## 📝 カスタマイズ

### 分析の深さを変更

`server.js` の `depth` パラメータを調整：

```javascript
const result = await analyzePosition(sfen, 15); // 15手先まで読む
```

深さを増やすと精度が上がりますが、時間がかかります。

### タイムアウト時間を変更

```javascript
setTimeout(() => {
    reject(new Error('Analysis timeout'));
}, 30000); // 30秒
```

---

## 🐛 トラブルシューティング

### デプロイが失敗する

1. Render.comのログを確認
2. Dockerfileが正しいか確認
3. やねうら王のビルドに時間がかかっている可能性（20分待つ）

### AIが応答しない

1. `/api/health` で状態確認
2. ログでエンジンの起動を確認
3. 無料枠のメモリ制限の可能性

### スリープから復帰が遅い

- 無料枠の制限（30秒かかる）
- 有料プランで解決

---

## 🎯 次のステップ

1. **独自ドメイン設定** - Render.comで独自ドメイン接続可能
2. **認証追加** - API使用量制限のため
3. **キャッシング** - 同じ局面の再計算を避ける
4. **UI改善** - より詳細な分析結果表示

---

## 📄 ライセンス

このサービスは以下のオープンソースソフトウェアを使用しています：

- **やねうら王** (GPLv3) - https://github.com/yaneurao/YaneuraOu
  - 作者: yaneurao
  - ライセンス: GNU General Public License v3.0

本サービスのソースコードもGPLv3に基づき公開されています。
- このプロジェクト: MIT License
- やねうら王: GPLv3

---

## 🤝 サポート

問題が発生した場合:
1. Render.comのログを確認
2. GitHubでIssueを作成
3. やねうら王の公式ドキュメントを参照

---

## 🎉 完成！

これであなたの将棋AI分析サービスが世界中からアクセス可能になりました！

URL をシェアして、友達と使ってみてください！
