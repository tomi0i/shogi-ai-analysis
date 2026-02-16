const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// やねうら王のパス
const ENGINE_PATH = process.env.ENGINE_PATH || path.join(__dirname, 'engines', 'YaneuraOu-by-gcc');

// やねうら王のプロセス管理
let engineProcess = null;
let engineReady = false;
let engineQueue = [];
let engineHasEvalFile = false;

// やねうら王の初期化
function initEngine() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(ENGINE_PATH)) {
            console.error('❌ やねうら王が見つかりません:', ENGINE_PATH);
            console.log('💡 engines/YaneuraOu-by-gcc を配置してください');
            return reject(new Error('Engine not found'));
        }

        console.log('🚀 やねうら王を起動中...');
        
        try {
            engineProcess = spawn(ENGINE_PATH);
            
            engineProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('🤖 エンジン:', output.trim());

                // エラーチェック
                if (output.includes('Error!') || output.includes('failed to read')) {
                    console.log('⚠️ 評価関数ファイルのエラーを検出しましたが、サーバーは継続します');
                    engineHasEvalFile = false;
                }

                if (output.includes('usiok')) {
                    engineReady = true;
                    console.log('✅ やねうら王準備完了');
                    engineProcess.stdin.write('isready\n');
                }

                if (output.includes('readyok')) {
                    console.log('✅ エンジン初期化完了');
                    if (!engineHasEvalFile) {
                        console.log('⚠️ 評価関数ファイルなしで動作（分析機能は制限されます）');
                    }
                    resolve();
                }

                // キューの処理
                processQueue(output);
            });

            engineProcess.stderr.on('data', (data) => {
                console.error('⚠️ エンジンエラー:', data.toString());
            });

            engineProcess.on('error', (error) => {
                console.error('❌ エンジン起動エラー:', error);
                reject(error);
            });

            engineProcess.on('close', (code) => {
                console.log(`⚠️ エンジン終了: コード ${code}`);
                engineReady = false;
                
                // 評価関数ファイルエラーでもサーバーは継続
                if (code === 1) {
                    console.log('⚠️ エンジンが終了しましたが、サーバーは継続します');
                    console.log('💡 AI分析機能は制限されますが、UIは正常に動作します');
                    // プロセスを再起動しない（無限ループ防止）
                }
            });

            // USI初期化
            engineProcess.stdin.write('usi\n');

        } catch (error) {
            console.error('❌ エンジン起動失敗:', error);
            reject(error);
        }
    });
}

// キューの処理
function processQueue(output) {
    if (engineQueue.length === 0) return;

    const current = engineQueue[0];
    
    if (output.includes('score cp')) {
        const match = output.match(/score cp (-?\d+)/);
        if (match) {
            current.score = parseInt(match[1]);
        }
    }

    if (output.includes('bestmove')) {
        const match = output.match(/bestmove (\S+)/);
        if (match) {
            current.bestmove = match[1];
            current.resolve({
                score: current.score || 0,
                bestmove: current.bestmove,
                depth: current.depth
            });
            engineQueue.shift();
            
            if (engineQueue.length > 0) {
                processNextInQueue();
            }
        }
    }
}

function processNextInQueue() {
    if (engineQueue.length === 0) return;
    
    const next = engineQueue[0];
    if (engineProcess && engineProcess.stdin.writable) {
        engineProcess.stdin.write(`position sfen ${next.sfen}\n`);
        engineProcess.stdin.write(`go depth ${next.depth}\n`);
    }
}

function analyzePosition(sfen, depth = 15) {
    return new Promise((resolve, reject) => {
        if (!engineReady || !engineHasEvalFile) {
            return reject(new Error('Engine not ready or eval file missing'));
        }

        const request = {
            sfen,
            depth,
            score: null,
            bestmove: null,
            resolve,
            reject
        };

        engineQueue.push(request);

        if (engineQueue.length === 1) {
            processNextInQueue();
        }

        setTimeout(() => {
            const index = engineQueue.indexOf(request);
            if (index > -1) {
                engineQueue.splice(index, 1);
                reject(new Error('Analysis timeout'));
            }
        }, 30000);
    });
}

// ========== API エンドポイント ==========

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        engine: engineReady ? 'ready' : 'not ready',
        hasEvalFile: engineHasEvalFile,
        queue: engineQueue.length
    });
});

app.post('/api/analyze', async (req, res) => {
    try {
        const { sfen, depth } = req.body;

        if (!sfen) {
            return res.status(400).json({ error: 'SFEN required' });
        }

        if (!engineHasEvalFile) {
            return res.status(503).json({ 
                error: 'AI analysis unavailable (missing eval file)',
                message: 'やねうら王は起動していますが、評価関数ファイルがないため分析できません'
            });
        }

        console.log('📊 分析リクエスト:', sfen.substring(0, 50) + '...');

        const result = await analyzePosition(sfen, depth || 15);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('❌ 分析エラー:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/analyze-kifu', async (req, res) => {
    try {
        const { moves, depth } = req.body;

        if (!moves || !Array.isArray(moves)) {
            return res.status(400).json({ error: 'Moves array required' });
        }

        if (!engineHasEvalFile) {
            return res.status(503).json({ 
                error: 'AI analysis unavailable (missing eval file)',
                message: 'やねうら王は起動していますが、評価関数ファイルがないため分析できません'
            });
        }

        console.log(`📊 棋譜分析開始: ${moves.length}手`);

        const results = [];
        
        for (let i = 0; i < moves.length; i++) {
            const sfen = moves[i];
            try {
                const result = await analyzePosition(sfen, depth || 12);
                results.push({
                    moveNum: i + 1,
                    ...result
                });
                
                if ((i + 1) % 10 === 0) {
                    console.log(`📊 進捗: ${i + 1}/${moves.length}`);
                }
            } catch (error) {
                console.error(`❌ ${i + 1}手目の分析エラー:`, error);
                results.push({
                    moveNum: i + 1,
                    error: error.message
                });
            }
        }

        console.log('✅ 棋譜分析完了');

        res.json({
            success: true,
            results
        });

    } catch (error) {
        console.error('❌ 棋譜分析エラー:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== サーバー起動 ==========

async function startServer() {
    try {
        // やねうら王を初期化（失敗してもサーバーは起動）
        try {
            await initEngine();
            engineHasEvalFile = true;
        } catch (error) {
            console.log('⚠️ やねうら王の初期化に失敗しましたが、サーバーは起動します');
            console.log('💡 評価関数ファイルがない可能性があります');
            console.log('💡 UIは正常に動作しますが、AI分析機能は使用できません');
            engineHasEvalFile = false;
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🎮 将棋AI分析Webサービス');
            console.log('='.repeat(60));
            console.log('');
            console.log(`🌐 サーバー起動: http://localhost:${PORT}`);
            console.log(`🤖 やねうら王: ${engineReady ? '準備完了' : '起動失敗'}`);
            console.log(`📊 AI分析機能: ${engineHasEvalFile ? '利用可能' : '利用不可（評価関数ファイルなし）'}`);
            console.log('');
            console.log('📡 API エンドポイント:');
            console.log(`   GET  /api/health          - ヘルスチェック`);
            console.log(`   POST /api/analyze         - 局面分析`);
            console.log(`   POST /api/analyze-kifu    - 棋譜分析`);
            console.log('');
            console.log('='.repeat(60));
            console.log('');
        });

    } catch (error) {
        console.error('❌ サーバー起動失敗:', error);
        console.log('');
        console.log('💡 やねうら王が見つからない場合:');
        console.log('   1. engines/YaneuraOu-by-gcc を配置');
        console.log('   2. chmod +x engines/YaneuraOu-by-gcc');
        console.log('   3. サーバーを再起動');
        console.log('');
        // サーバーは起動を継続
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`⚠️ サーバーは起動しましたが、AIエンジンは利用できません`);
            console.log(`🌐 http://localhost:${PORT}`);
        });
    }
}

// グレースフルシャットダウン
process.on('SIGTERM', () => {
    console.log('⚠️ シャットダウン開始...');
    if (engineProcess) {
        engineProcess.stdin.write('quit\n');
        engineProcess.kill();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('⚠️ シャットダウン開始...');
    if (engineProcess) {
        engineProcess.stdin.write('quit\n');
        engineProcess.kill();
    }
    process.exit(0);
});

startServer();
