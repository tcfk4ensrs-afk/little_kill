import { sendToAI } from './ai.js';

class Game {
    constructor() {
        // constructor 内に以下を追加
this.state = {
    history: {},
    flags: {},
    startTime: null,      // 追加
    revealedClues: []     // 追加
};

// init 関数内でタイマーの初期化を呼ぶ
async init() {
    // ...既存の処理...
    this.initTimer();
    this.renderTimeClues();
    setInterval(() => this.updateClueTimers(), 1000); // 1秒ごとに更新
}

/**
 * タイマーの初期化（開始時間を保存・復元）
 */
initTimer() {
    const savedTime = localStorage.getItem('little_engine_start_time');
    if (savedTime) {
        this.state.startTime = parseInt(savedTime);
    } else {
        this.state.startTime = Date.now();
        localStorage.setItem('little_engine_start_time', this.state.startTime);
    }
}

/**
 * 手がかりボタンの生成
 */
renderTimeClues() {
    const container = document.getElementById('time-clue-container');
    container.innerHTML = '';
    
    this.scenario.time_clues.forEach((clue, index) => {
        const btn = document.createElement('button');
        btn.id = `clue-btn-${index}`;
        btn.className = 'time-clue-btn';
        btn.innerText = `${clue.title} (ロック中)`;
        btn.onclick = () => this.showTimeClue(index);
        container.appendChild(btn);
    });
    this.updateClueTimers();
}

/**
 * カウントダウンとアンロック判定
 */
updateClueTimers() {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - this.state.startTime) / 1000);
    
    this.scenario.time_clues.forEach((clue, index) => {
        const btn = document.getElementById(`clue-btn-${index}`);
        const unlockSeconds = clue.unlock_minutes * 60;
        const remaining = unlockSeconds - elapsedSeconds;
        
        if (remaining <= 0) {
            btn.disabled = false;
            btn.classList.add('unlocked');
            btn.innerText = clue.title;
        } else {
            btn.disabled = true;
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            btn.innerText = `封印中 (${m}:${s.toString().padStart(2, '0')})`;
        }
    });
}

/**
 * ボタンクリックで内容を表示
 */
showTimeClue(index) {
    const clue = this.scenario.time_clues[index];
    const display = document.getElementById('time-clue-display');
    display.innerHTML = `
        <div class="evidence-item" style="border-color: #d4a373; animation: fadeIn 0.5s;">
            <strong>【調査報告：${clue.title}】</strong><br>
            ${clue.content}
        </div>
    `;
    // 既読フラグを保存したい場合はここに追加
}
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = { history: {}, flags: {} };
    }

    async init() {
        try {
            console.log("Game initialising...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState();
            this.renderCharacterList();
            this.updateAttributesUI();
            
            document.getElementById('case-title').innerText = this.scenario.case.title;
            document.getElementById('case-outline').innerText = this.scenario.case.outline;
            console.log("Game initialised.");
        } catch (e) {
            console.error("Init error:", e);
            alert(`データの読み込みに失敗しました:\n${e.message}`);
        }
    }

    async loadScenario(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`${path} が見つかりません。`);
        this.scenario = await res.json();

        if (this.scenario.characters && typeof this.scenario.characters[0] === 'string') {
            const characterDataArray = await Promise.all(
                this.scenario.characters.map(async (charPath) => {
                    const charRes = await fetch(charPath);
                    if (!charRes.ok) throw new Error(`ファイルが見つかりません: ${charPath}\n(大文字・小文字が合っているか確認してください)`);
                    return await charRes.json();
                })
            );
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
            card.innerHTML = `<span class="char-role">${char.role}</span><span class="char-name">${char.name}</span>`;
            card.onclick = () => this.enterInterrogation(char.id);
            list.appendChild(card);
        });
    }

    updateAttributesUI() {
        const list = document.getElementById('evidence-list');
        if (!list) return;
        const available = this.scenario.evidences.filter(ev => ev.unlock_condition === 'start' || this.state.flags[ev.unlock_condition]);
        list.innerHTML = available.length ? '' : '<p style="color:#888; text-align:center;">(まだ証拠はありません)</p>';
        available.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'evidence-item';
            item.innerHTML = `<div style="color:var(--accent-color); font-weight:bold;">【${ev.name}】</div><div>${ev.description}</div>`;
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
        (this.state.history[charId] || []).forEach(msg => this.appendMessageToUI(msg.role, msg.text));
        if (!this.state.history[charId] || this.state.history[charId].length === 0) {
            this.addMessage('model', `……何か用か？ 手短に頼む。`);
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this.currentCharacterId) return;
        this.addMessage('user', text);
        input.value = '';
        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        try {
            let aiResponse = await sendToAI(char.system_prompt, text, this.state.history[this.currentCharacterId] || []);
            const flagMatch = aiResponse.match(/\[UNLOCK:(\w+)\]/);
            if (flagMatch) {
                this.state.flags[flagMatch[1]] = true;
                this.updateAttributesUI();
                aiResponse = aiResponse.replace(/\[UNLOCK:(\w+)\]/g, '').trim();
            }
            this.addMessage('model', aiResponse);
            this.saveState();
        } catch (e) {
            this.addMessage('model', "通信エラーが発生しました。");
        }
    }

    addMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) this.state.history[this.currentCharacterId] = [];
        this.state.history[this.currentCharacterId].push({ role, text });
        return this.appendMessageToUI(role, text);
    }

    appendMessageToUI(role, text) {
        const log = document.getElementById('chat-log');
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.innerText = text;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    startAccusation() {
        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        if (!char) return alert("相手を選んでください。");
        if (confirm(`${char.name} を指名しますか？`)) {
            if (char.id === this.scenario.case.culprit) {
                alert(`正解！ 真犯人は ${char.name} でした。\n\n${this.scenario.case.truth}`);
            } else {
                alert(`不正解！ ${char.name} は犯人ではありません。`);
            }
        }
    }

    saveState() { localStorage.setItem('little_engine_save', JSON.stringify(this.state)); }
    loadState() {
        const saved = localStorage.getItem('little_engine_save');
        if (saved) Object.assign(this.state, JSON.parse(saved));
    }
    resetGame() { if (confirm("リセットしますか？")) { localStorage.removeItem('little_engine_save'); location.reload(); } }
}

const game = new Game();
window.game = game;
document.addEventListener('DOMContentLoaded', () => {
    game.init();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    document.getElementById('chat-input').onkeypress = (e) => { if (e.key === 'Enter') game.sendMessage(); };
    document.getElementById('back-btn').onclick = () => {
        document.getElementById('interrogation-room').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
    };
    const menuContent = document.querySelector('#main-menu .content');
    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '🚨 犯人を指名する';
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:15px; background:#8b0000; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    menuContent.appendChild(accuseBtn);
    const resetBtn = document.createElement('button');
    resetBtn.innerText = 'リセット';
    resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#333; color:#777; border:none; border-radius:5px; cursor:pointer;";
    resetBtn.onclick = () => game.resetGame();
    menuContent.appendChild(resetBtn);
});
