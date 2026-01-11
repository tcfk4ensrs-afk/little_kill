import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            history: {}, // 各キャラクターとの会話履歴 { charId: [{role, text}, ...] }
            flags: {},   // アンロックされた証拠品のフラグ { flagName: true }
            lastSave: null
        };
    }

    /**
     * ゲームの初期化
     */
    async init() {
        try {
            console.log("リトルエンジン号 システム起動中...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState(); // ローカルストレージから進捗を復元
            
            // UIの初期反映
            document.getElementById('case-title').innerText = this.scenario.case.title;
            document.getElementById('case-outline').innerText = this.scenario.case.outline;
            
            this.renderCharacterList();
            this.updateAttributesUI();
            
            console.log("準備完了。");
        } catch (e) {
            console.error("初期化エラー:", e);
            alert("データの読み込みに失敗しました。サーバーの起動状態とファイルパスを確認してください。");
        }
    }

    /**
     * シナリオJSONの読み込み
     */
    async loadScenario(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error("シナリオファイルが見つかりません。");
        this.scenario = await res.json();
    }

    /**
     * キャラクターリストを生成（2行4列対応）
     */
    renderCharacterList() {
        const list = document.getElementById('character-list');
        list.innerHTML = '';
        this.scenario.characters.forEach(char => {
            const card = document.createElement('div');
            card.className = 'character-card';
            card.innerHTML = `
                <span class="char-role">${char.role}</span>
                <span class="char-name">${char.name}</span>
            `;
            card.onclick = () => this.enterInterrogation(char.id);
            list.appendChild(card);
        });
    }

    /**
     * 証拠品リストのUIを更新
     */
    updateAttributesUI() {
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
        
        // 条件を満たしている証拠品（start または フラグがtrue）を抽出
        const availableEvidences = this.scenario.evidences.filter(ev => {
            return ev.unlock_condition === 'start' || this.state.flags[ev.unlock_condition];
        });

        if (availableEvidences.length === 0) {
            list.innerHTML = '<p style="color:#666; font-size:0.85rem; padding:15px; text-align:center;">(まだ証拠はありません)</p>';
            return;
        }

        availableEvidences.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'evidence-item';
            item.style.animation = "fadeIn 0.5s ease"; // アニメーション演出
            item.innerHTML = `
                <div style="color: var(--accent-color); font-weight: bold; margin-bottom: 3px;">【${ev.name}】</div>
                <div style="font-size: 0.85rem; opacity: 0.9;">${ev.description}</div>
            `;
            list.appendChild(item);
        });
    }

    /**
     * 特定のキャラクターとの尋問（チャット）を開始
     */
    enterInterrogation(charId) {
        this.currentCharacterId = charId;
        const char = this.scenario.characters.find(c => c.id === charId);
        
        document.getElementById('target-name').innerText = char.name;
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('interrogation-room').style.display = 'flex';
        
        // チャットログの復元
        const log = document.getElementById('chat-log');
        log.innerHTML = '';
        const history = this.state.history[charId] || [];
        history.forEach(msg => this.appendMessageToUI(msg.role, msg.text));
        
        // 最初なら挨拶を表示
        if (history.length === 0) {
            this.addMessage('model', `……何か用か？ 手短に頼む。`);
        }
    }

    /**
     * メッセージ送信処理
     */
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const userText = input.value.trim();
        if (!userText || !this.currentCharacterId) return;

        // ユーザー入力を表示
        this.addMessage('user', userText);
        input.value = '';

        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        const history = this.state.history[this.currentCharacterId] || [];

        try {
            // ローディング表示（簡易版）
            const loadingMsg = this.addMessage('model', "考え中...");
            
            // ai.jsを介してAIから回答を取得
            let aiResponse = await sendToAI(char.system_prompt, userText, history);
            
            // ローディングを削除
            loadingMsg.remove();

            // --- 証拠品解除の検知 (ここが重要) ---
            const flagMatch = aiResponse.match(/\[UNLOCK:(\w+)\]/);
            if (flagMatch) {
                const flagName = flagMatch[1];
                if (!this.state.flags[flagName]) {
                    this.state.flags[flagName] = true;
                    this.updateAttributesUI(); // 証拠品一覧を即時更新
                    console.log(`新しい証拠をアンロックしました: ${flagName}`);
                }
                // 回答からタグタグを除去してユーザーに見せる
                aiResponse = aiResponse.replace(/\[UNLOCK:(\w+)\]/g, '').trim();
            }

            // AIの回答を表示・保存
            this.addMessage('model', aiResponse);
            this.saveState();
        } catch (error) {
            console.error("Communication Error:", error);
            this.addMessage('model', "……すまない、今は少し考えがまとまらない。 (通信エラーが発生しました)");
        }
    }

    /**
     * メッセージを内部状態に追加し、UIに表示
     */
    addMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) {
            this.state.history[this.currentCharacterId] = [];
        }
        
        // 内部履歴に保存
        this.state.history[this.currentCharacterId].push({ role, text });
        
        // UIに反映
        return this.appendMessageToUI(role, text);
    }

    appendMessageToUI(role, text) {
        const log = document.getElementById('chat-log');
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerText = text;
        log.appendChild(msgDiv);
        
        // 最下部へスクロール
        log.scrollTop = log.scrollHeight;
        return msgDiv;
    }

    /**
     * 犯人指名
     */
    startAccusation() {
        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        if (!char) {
            alert("誰を指名するか決めてから、その者の前で行ってください。");
            return;
        }

        const confirmAccuse = confirm(`${char.name} を真犯人として告発します。よろしいですか？`);
        if (confirmAccuse) {
            if (char.id === this.scenario.case.culprit) {
                alert(`【捜査成功：真実に到達しました】\n\n真犯人はマジシャンのセバスチャンでした！\n\n${this.scenario.case.truth}`);
            } else {
                alert(`【捜査失敗：冤罪】\n\n残念ながら ${char.name} は真犯人ではありません。\n真犯人は暗闇の中に逃げ延び、あなたは異国の大地で責任を問われることになります……。`);
            }
        }
    }

    /**
     * 状態の保存と読み込み（localStorage）
     */
    saveState() {
        const saveData = {
            history: this.state.history,
            flags: this.state.flags
        };
        localStorage.setItem('little_engine_save', JSON.stringify(saveData));
    }

    loadState() {
        const saved = localStorage.getItem('little_engine_save');
        if (saved) {
            const data = JSON.parse(saved);
            this.state.history = data.history || {};
            this.state.flags = data.flags || {};
        }
    }

    resetGame() {
        if (confirm("全ての進捗をリセットして最初からやり直しますか？")) {
            localStorage.removeItem('little_engine_save');
            location.reload();
        }
    }
}

// インスタンス化とイベント登録
const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
    game.init();

    // 送信ボタン
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    
    // 入力欄でEnterキーが押された時
    document.getElementById('chat-input').onkeypress = (e) => {
        if (e.key === 'Enter') game.sendMessage();
    };

    // 戻るボタン
    document.getElementById('back-btn').onclick = () => {
        document.getElementById('interrogation-room').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        game.updateAttributesUI(); // リストを最新にする
    };

    // 指名ボタン（動的に作成）
    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '🚨 犯人を指名する';
    accuseBtn.className = 'accuse-button'; // CSSでデザイン
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:15px; background:#8b0000; color:white; border:1px solid var(--accent-color); border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    document.querySelector('#main-menu .content').appendChild(accuseBtn);

    // リセットボタン
    const resetBtn = document.createElement('button');
    resetBtn.innerText = '最初からやり直す';
    resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#333; color:#888; border:none; border-radius:5px; cursor:pointer; font-size:0.8rem;";
    resetBtn.onclick = () => game.resetGame();
    document.querySelector('#main-menu .content').appendChild(resetBtn);
});
