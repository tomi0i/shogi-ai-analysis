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
            const engineDir = path.dirname(ENGINE_PATH);
            engineProcess = spawn(ENGINE_PATH, [], {
                cwd: engineDir
            });
            
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
    
                    // 無料枠向けにメモリ設定を軽くする
                    console.log('⚙️ メモリ設定を調整中...');
                    engineProcess.stdin.write('setoption name USI_Hash value 128\n');  // 128MBに削減
                    engineProcess.stdin.write('setoption name Threads value 1\n');     // 1スレッドに削減
                    engineProcess.stdin.write('setoption name FV_SCALE value 20\n');   // Háo評価関数の推奨値
    
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

// KIF形式の指し手を抽出
function parseKIFMoves(kifText) {
    const lines = kifText.split('\n');
    const moves = [];
    
    for (const line of lines) {
        // 手数のパターンにマッチ: "   1 ７六歩(77)"
        const match = line.match(/^\s*\d+\s+(.+?)(?:\(|$)/);
        if (match && match[1]) {
            const move = match[1].trim();
            // 終局を示す文字列は除外
            if (move && !['投了', '中断', '持将棋', '詰み', '時間切れ'].includes(move)) {
                moves.push(move);
            }
        }
    }
    
    return moves;
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

// KIF形式の棋譜分析（新エンドポイント）
app.post('/api/analyze-kif', async (req, res) => {
    try {
        const { kifText, depth } = req.body;

        if (!kifText) {
            return res.status(400).json({ error: 'KIF text required' });
        }

        if (!engineHasEvalFile) {
            return res.status(503).json({ 
                error: 'AI analysis unavailable (missing eval file)',
                message: 'やねうら王は起動していますが、評価関数ファイルがないため分析できません'
            });
        }

        console.log('📋 KIF棋譜を受信しました');
        
        // KIF形式から指し手を抽出
        const moves = parseKIFMoves(kifText);
        
        if (moves.length === 0) {
            return res.status(400).json({ 
                error: '有効な指し手が見つかりませんでした',
                message: 'KIF形式の棋譜を確認してください'
            });
        }

        console.log(`📖 ${moves.length}手の棋譜を認識しました`);

        // 初期局面のSFEN
        const initialSFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
        
        const results = [];
        
        // Phase 1: 初期局面のみ分析（完全版は複雑なので段階的に実装）
        console.log('📊 初期局面を分析中...');
        const initialResult = await analyzePosition(initialSFEN, depth || 12);
        
        results.push({
            moveNum: 0,
            move: '初期局面',
            score: initialResult.score,
            bestmove: initialResult.bestmove
        });

        console.log('✅ 分析完了');

        res.json({
            success: true,
            totalMoves: moves.length,
            analyzedMoves: 1,
            message: `${moves.length}手の棋譜を認識しました。現在は初期局面のみ分析します（完全な棋譜分析は次のバージョンで対応予定）`,
            results: results,
            moves: moves // デバッグ用
        });

    } catch (error) {
        console.error('❌ KIF分析エラー:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// SFEN配列での棋譜分析（旧エンドポイント、互換性のため残す）
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

        console.log(`📊 棋譜分析開始: ${moves.length}局面`);

        const results = [];
        
        for (let i = 0; i < moves.length; i++) {
            const sfen = moves[i];
            try {
                const result = await analyzePosition(sfen, depth || 12);
                results.push({
                    moveNum: i,
                    ...result
                });
                
                if ((i + 1) % 10 === 0) {
                    console.log(`📊 進捗: ${i + 1}/${moves.length}`);
                }
            } catch (error) {
                console.error(`❌ ${i + 1}局面目の分析エラー:`, error);
                results.push({
                    moveNum: i,
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
            console.log(`   POST /api/analyze-kif     - KIF棋譜分析`);
            console.log(`   POST /api/analyze-kifu    - SFEN配列分析`);
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
