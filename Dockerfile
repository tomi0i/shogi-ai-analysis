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

# やねうら王をビルド
RUN git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git /tmp/YaneuraOu && \
    cd /tmp/YaneuraOu/source && \
    make tournament COMPILER=g++ TARGET_CPU=AVX2 && \
    mkdir -p /app/engines && \
    cp YaneuraOu-by-gcc /app/engines/ && \
    chmod +x /app/engines/YaneuraOu-by-gcc && \
    rm -rf /tmp/YaneuraOu

# 評価関数ファイルをダウンロード（水匠5の評価関数）
RUN mkdir -p /app/engines/eval && \
    cd /app/engines/eval && \
    wget -O nn.bin "https://github.com/mizar/YaneuraOu/releases/download/NNUE-eval-20240701/nn-epoch999.nnue" || \
    wget -O nn.bin "https://github.com/nodchip/Stockfish/releases/download/nnue-20230627/nn-0000000000a0.nnue" || \
    echo "評価関数ファイルのダウンロードに失敗しました（エンジンは起動しますが分析できません）" && \
    chmod 644 nn.bin 2>/dev/null || true

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
