import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            evidences: [],
            history: {}, // { charId: [{role, text}] }
            flags: {}
        };
    }

    async init() {
        try {
            await this.loadScenario('./scenarios/case1.json');
            this.loadState();
            this.renderCharacterList();
            this.updateAttributesUI();
            
            // ケースタイトルの反映
            document.getElementById('case-title').innerText = this.scenario.case.title;
            document.getElementById('case-outline').innerText = this.scenario.case.outline;
        } catch (e) {
            console.error("Init Error:", e);
        }
    }

    async loadScenario(path) {
        const res = await fetch(path);
        this.scenario = await res.json();
    }

    // --- UI レンダリング ---
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

    updateAttributesUI() {
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
        
        // 条件を満たしている証拠品のみを表示
        const availableEvidences = this.scenario.evidences.filter(ev => {
            return ev.unlock_condition === 'start' || this.state.flags[ev.unlock_condition];
        });

        if (availableEvidences.length === 0) {
            list.innerHTML = '<p style="color:#666; padding:10px;">(まだ証拠はありません)</p>';
            return;
        }

        availableEvidences.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'evidence-item';
            item.innerHTML = `<strong>【${ev.name}】</strong><br>${ev.description}`;
            list.appendChild(item);
        });
    }

    // --- チャット・フラグ処理 ---
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        this.addMessage('user', text);
        input.value = '';

        // AI通信開始
        const history = this.state.history[this.currentCharacterId] || [];
        let aiResponse = await sendToAI(char.system_prompt, text, history);

        // --- フラグ検知ロジック ---
        const flagMatch = aiResponse.match(/\[UNLOCK:(\w+)\]/);
        if (flagMatch) {
            const flagName = flagMatch[1];
            if (!this.state.flags[flagName]) {
                this.state.flags[flagName] = true;
                this.updateAttributesUI(); // 証拠品リストを即座に更新
                console.log(`Flag Unlocked: ${flagName}`);
            }
            // タグを消去して表示
            aiResponse = aiResponse.replace(/\[UNLOCK:(\w+)\]/g, '');
        }

        this.addMessage('model', aiResponse);
        this.saveHistory(this.currentCharacterId, 'user', text);
        this.saveHistory(this.currentCharacterId, 'model', aiResponse);
    }

    // --- 犯人指名 ---
    startAccusation() {
        const target = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        if (!target) {
            alert("尋問する相手を選んでから指名してください。");
            return;
        }

        const confirmAccuse = confirm(`${target.name} を犯人として拘束しますか？`);
        if (confirmAccuse) {
            if (target.id === this.scenario.case.culprit || target.name.includes(this.scenario.case.culprit)) {
                alert(`【正解！】\n真犯人は ${target.name} でした。\n\n真実：\n${this.scenario.case.truth}`);
            } else {
                alert(`【不正解】\n${target.name} は犯人ではありません。誤認逮捕により捜査は失敗しました。`);
            }
        }
    }

    // (以下、addMessage, saveHistory, enterInterrogationなどは共通のため省略)
    // ※ 添付されたgame.jsの基本機能をそのまま引き継いでください。
}

const game = new Game();
window.game = game;
document.addEventListener('DOMContentLoaded', () => {
    game.init();
    // 戻るボタンの設定
    document.getElementById('back-btn').onclick = () => {
        document.getElementById('interrogation-room').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
    };
    // 送信ボタンの設定
    document.getElementById('send-btn').onclick = () => game.sendMessage();
});
