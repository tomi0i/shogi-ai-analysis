# Node.js 18をベースイメージとして使用
FROM node:18-bullseye

# 作業ディレクトリを設定
WORKDIR /app

# ビルドツールとやねうら王のビルドに必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    g++ \
    make \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# やねうら王をビルド
RUN git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git /tmp/YaneuraOu && \
    cd /tmp/YaneuraOu/source && \
    make tournament COMPILER=g++ TARGET_CPU=AVX2 && \
    mkdir -p /app/engines && \
    cp YaneuraOu-by-gcc /app/engines/ && \
    chmod +x /app/engines/YaneuraOu-by-gcc && \
    rm -rf /tmp/YaneuraOu

# 評価関数ファイルをGitHub Releasesからダウンロード
RUN mkdir -p /app/engines/eval && \
    cd /app/engines/eval && \
    echo "📥 評価関数ファイルをダウンロード中..." && \
    wget --timeout=60 --tries=3 --progress=bar:force \
         -O nn.bin \
         https://github.com/tomi0i/shogi-ai-analysis/releases/download/v1.0/nn.bin && \
    echo "✅ ダウンロード完了" && \
    FILE_SIZE=$(stat -c%s nn.bin) && \
    echo "📦 ファイルサイズ: $FILE_SIZE バイト" && \
    if [ "$FILE_SIZE" -lt 10000000 ]; then \
        echo "❌ エラー: ファイルサイズが小さすぎます（10MB未満）" && \
        exit 1; \
    fi && \
    chmod 644 nn.bin && \
    ls -lh nn.bin && \
    echo "🎉 評価関数ファイル準備完了（Háo - 標準NNUE）"

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install --production

# アプリケーションファイルをコピー
COPY . .

# ポート3000を公開
EXPOSE 3000

# 環境変数を設定
ENV NODE_ENV=production
ENV ENGINE_PATH=/app/engines/YaneuraOu-by-gcc

# サーバーを起動
CMD ["node", "server.js"]
