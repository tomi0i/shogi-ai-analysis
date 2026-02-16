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
    unzip \
    && rm -rf /var/lib/apt/lists/*

# やねうら王と評価関数を一緒にビルド
RUN git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git /tmp/YaneuraOu && \
    cd /tmp/YaneuraOu/source && \
    make tournament COMPILER=g++ TARGET_CPU=AVX2 && \
    mkdir -p /app/engines && \
    cp YaneuraOu-by-gcc /app/engines/ && \
    chmod +x /app/engines/YaneuraOu-by-gcc && \
    mkdir -p /app/engines/eval && \
    echo "評価関数ファイルを探しています..." && \
    (find /tmp/YaneuraOu -type f \( -name "*.nnue" -o -name "nn.bin" \) | head -1 | xargs -I {} cp {} /app/engines/eval/nn.bin && echo "✅ リポジトリから評価関数をコピーしました") || \
    (echo "⚠️ リポジトリに評価関数がないため、Stockfishからダウンロードします" && \
     wget -O /app/engines/eval/nn.bin https://tests.stockfishchess.org/api/nn/nn-0000000000a0.nnue && echo "✅ Stockfish評価関数をダウンロードしました") && \
    ls -lh /app/engines/eval/nn.bin && \
    chmod 644 /app/engines/eval/nn.bin && \
    rm -rf /tmp/YaneuraOu

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
