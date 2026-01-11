import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = { history: {}, flags: {}, startTime: null };
    }

    async init() {
        try {
            console.log("Loading scenario...");
            await this.loadScenario('./scenarios/case1.json');
            
            this.loadState();
            this.initTimer();

            // 1. 容疑者リストの表示
            this.renderCharacterList();
            
            // 2. 証拠の表示
            this.updateAttributesUI();
            
            // 3. 手がかりボタンの表示
            this.renderTimeClues();
            
            // 4 & 5. 犯人・リセットボタンの表示
            this.createMenuButtons();

            document.getElementById('case-title').innerText = this.scenario.case.title;
            document.getElementById('case-outline').innerText = this.scenario.case.outline;

            // 1秒ごとにタイマーを更新
            setInterval(() => this.updateClueTimers(), 1000);
            console.log("Game ready.");
        } catch (e) {
            console.error("Critical Init Error:", e);
            alert(`初期化エラー: ${e.message}`);
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
                    if (!charRes.ok) throw new Error(`ファイルが見つかりません: ${charPath}`);
                    return await charRes.json();
                })
            );
            this.scenario.characters = characterDataArray;
        }
    }

    initTimer() {
        const savedTime = localStorage.getItem('little_engine_start_time');
        this.state.startTime = savedTime ? parseInt(savedTime) : Date.now();
        if (!savedTime) localStorage.setItem('little_engine_start_time', this.state.startTime);
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
        const available = this.scenario.evidences.filter(ev => 
            ev.unlock_condition === 'start' || this.state.flags[ev.unlock_condition]
        );
        list.innerHTML = available.length ? '' : '<p style="color:#888; text-align:center; padding:15px;">(まだ証拠はありません)</p>';
        available.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'evidence-item';
            item.innerHTML = `<strong>【${ev.name}】</strong><br>${ev.description}`;
            list.appendChild(item);
        });
    }

    renderTimeClues() {
        const container = document.getElementById('time-clue-container');
        if (!container || !this.scenario.time_clues) return;
        container.innerHTML = '';
        this.scenario.time_clues.forEach((clue, index) => {
            const btn = document.createElement('button');
            btn.id = `clue-btn-${index}`;
            btn.className = 'time-clue-btn';
            btn.onclick = () => this.showTimeClue(index);
            container.appendChild(btn);
        });
    }

    updateClueTimers() {
        if (!this.scenario || !this.scenario.time_clues) return;
        const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
        this.scenario.time_clues.forEach((clue, index) => {
            const btn = document.getElementById(`clue-btn-${index}`);
            if (!btn) return;
            const remaining = (clue.unlock_minutes * 60) - elapsed;
            if (remaining <= 0) {
                btn.disabled = false;
                btn.classList.add('unlocked');
                btn.innerText = clue.title;
            } else {
                btn.disabled = true;
                btn.innerText = `封印中 (${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')})`;
            }
        });
    }

    showTimeClue(index) {
        const clue = this.scenario.time_clues[index];
        document.getElementById('time-clue-display').innerHTML = `
            <div class="evidence-item" style="border-color: #d4a373;">
                <strong>【調査報告：${clue.title}】</strong><br>${clue.content}
            </div>`;
    }

    createMenuButtons() {
        const menuContent = document.querySelector('#main-menu .content');
        if (document.querySelector('.accuse-btn-main')) return;

        const accuseBtn = document.createElement('button');
        accuseBtn.innerText = '🚨 犯人を指名する';
        accuseBtn.className = 'accuse-btn-main';
        accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:15px; background:#8b0000; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
        accuseBtn.onclick = () => this.startAccusation();
        menuContent.appendChild(accuseBtn);

        const resetBtn = document.createElement('button');
        resetBtn.innerText = 'リセット';
        resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#333; color:#777; border:none; border-radius:5px; cursor:pointer;";
        resetBtn.onclick = () => this.resetGame();
        menuContent.appendChild(resetBtn);
    }

    startAccusation() {
        const char = this.scenario.characters.find(c => c.id === this.currentCharacterId);
        if (!char) return alert("相手を選んでから指名してください。");
        if (confirm(`${char.name} を指名しますか？`)) {
            if (char.id === this.scenario.case.culprit) alert(`正解！\n\n${this.scenario.case.truth}`);
            else alert("不正解！ 真犯人は別にいます。");
        }
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
    }

    appendMessageToUI(role, text) {
        const log = document.getElementById('chat-log');
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.innerText = text;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
    }

    saveState() { localStorage.setItem('little_engine_save', JSON.stringify({ history: this.state.history, flags: this.state.flags })); }
    loadState() {
        const saved = localStorage.getItem('little_engine_save');
        if (saved) {
            const data = JSON.parse(saved);
            this.state.history = data.history || {};
            this.state.flags = data.flags || {};
        }
    }
    resetGame() { if (confirm("リセットしますか？")) { localStorage.clear(); location.reload(); } }
}

const game = new Game();
document.addEventListener('DOMContentLoaded', () => game.init());
