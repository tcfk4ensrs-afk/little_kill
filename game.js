import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            history: {},
            flags: {}
        };
    }

    async init() {
        try {
            console.log("リトルエンジン号 システム起動中...");
            await this.loadScenario('./scenarios/case1.json');
            
            this.loadState();
            this.renderCharacterList();
            this.updateAttributesUI();
            
            console.log("準備完了。");
        } catch (e) {
            console.error("初期化詳細エラー:", e);
            // エラーの内容を具体的に表示
            alert(`エラーが発生しました:\n内容: ${e.message}\n※ブラウザのF12キーを押して'Console'を確認してください。`);
        }
    }

    /**
     * シナリオとキャラクターデータを読み込む
     */
    async loadScenario(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error("case1.jsonが見つかりません。");
        this.scenario = await res.json();

        // 【重要】charactersが文字列（パス）の配列だった場合、各ファイルを個別にロードする
        if (this.scenario.characters && typeof this.scenario.characters[0] === 'string') {
            console.log("外部キャラクターファイルをロード中...");
            const characterDataArray = await Promise.all(
                this.scenario.characters.map(async (charPath) => {
                    const charRes = await fetch(charPath);
                    if (!charRes.ok) throw new Error(`ファイルが見つかりません: ${charPath}`);
                    return await charRes.json();
                })
            );
            // 読み込んだデータで配列を上書きする
            this.scenario.characters = characterDataArray;
        }
    }

    renderCharacterList() {
        const list = document.getElementById('character-list');
        if (!list) return;
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

    updateAttributesUI() {
        const list = document.getElementById('evidence-list');
        if (!list) return;
        list.innerHTML = '';
        
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
            item.innerHTML = `
                <div style="color: var(--accent-color); font-weight: bold; margin-bottom: 3px;">【${ev.name}】</div>
                <div style="font-size: 0.85rem; opacity: 0.9;">${ev.description}</div>
            `;
            list.appendChild(item);
        });
    }

    enterInterrogation(charId) {
        this.currentCharacterId = charId;
        const char = this.scenario.characters.find(c => c.id === charId);
        
        document.getElementById('target-name').innerText = char.name;
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('interrogation-room').style.display = 'flex';
        
        const log = document.getElementById('chat-log');
        log.innerHTML = '';
        const history = this.state.history[charId] || [];
        history.forEach(msg => this.appendMessageToUI(msg.role, msg.text));
        
        if (history.length === 0) {
            this.addMessage('model', `……何か用か？ 手短に頼む。`);
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const userText = input.value.trim();
        if (!userText || !this.currentCharacterId) return;

        this.addMessage('user', userText);
        input.value = '';

        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        const history = this.state.history[this.currentCharacterId] || [];

        try {
            let aiResponse = await sendToAI(char.system_prompt, userText, history);
            
            const flagMatch = aiResponse.match(/\[UNLOCK:(\w+)\]/);
            if (flagMatch) {
                const flagName = flagMatch[1];
                if (!this.state.flags[flagName]) {
                    this.state.flags[flagName] = true;
                    this.updateAttributesUI();
                }
                aiResponse = aiResponse.replace(/\[UNLOCK:(\w+)\]/g, '').trim();
            }

            this.addMessage('model', aiResponse);
            this.saveState();
        } catch (error) {
            console.error("AI通信エラー:", error);
            this.addMessage('model', "……すまない、今は少し考えがまとまらない。");
        }
    }

    addMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) {
            this.state.history[this.currentCharacterId] = [];
        }
        this.state.history[this.currentCharacterId].push({ role, text });
        return this.appendMessageToUI(role, text);
    }

    appendMessageToUI(role, text) {
        const log = document.getElementById('chat-log');
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerText = text;
        log.appendChild(msgDiv);
        log.scrollTop = log.scrollHeight;
        return msgDiv;
    }

    startAccusation() {
        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        if (!char) return alert("相手を選んでください。");
        if (confirm(`${char.name} を指名しますか？`)) {
            if (char.id === this.scenario.case.culprit) {
                alert(`正解！\n\n${this.scenario.case.truth}`);
            } else {
                alert(`不正解！ ${char.name} は犯人ではありません。`);
            }
        }
    }

    saveState() {
        localStorage.setItem('little_engine_save', JSON.stringify({
            history: this.state.history,
            flags: this.state.flags
        }));
    }

    loadState() {
        const saved = localStorage.getItem('little_engine_save');
        if (saved) {
            const data = JSON.parse(saved);
            this.state.history = data.history || {};
            this.state.flags = data.flags || {};
        }
    }
}

const game = new Game();
window.game = game;
document.addEventListener('DOMContentLoaded', () => {
    game.init();
    document.getElementById('back-btn').onclick = () => {
        document.getElementById('interrogation-room').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
    };
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
