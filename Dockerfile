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
RUN git clone https://github.com/yaneurao/YaneuraOu.git /tmp/YaneuraOu && \
    cd /tmp/YaneuraOu/source && \
    make tournament COMPILER=g++ TARGET_CPU=AVX2 && \
    mkdir -p /app/engines && \
    cp YaneuraOu-by-gcc /app/engines/ && \
    chmod +x /app/engines/YaneuraOu-by-gcc && \
    rm -rf /tmp/YaneuraOu && \
    mkdir -p /app/engines/eval && \
    cd /app/engines/eval && \
    wget https://github.com/mizar/YaneuraOu/releases/download/NNUE-eval-20211103/nn.bin && \
    chmod 644 nn.bin

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
