import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.timerInterval = null; // タイマー管理用
        this.state = {
            startTime: null,      // 捜査開始時刻
            evidences: [],        // 発見した証拠品ID
            unlockedClues: [],    // 解禁された手がかりID
            history: {},          // 会話履歴
            flags: {}
        };
    }

    async init() {
        try {
            console.log("Game initialising...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState();
            
            // 時間経過による手がかりチェックを開始
            this.startTimeCluesTimer();
            
            this.renderCharacterList();
            this.updateAttributesUI();
            console.log("Game initialised successfully.");
        } catch (e) {
            console.error("Critical error during init:", e);
            this.showError("初期化エラー: " + e.message);
        }
    }

    showError(msg) {
        const errLog = document.getElementById('error-log');
        if (errLog) {
            errLog.style.display = 'block';
            errLog.innerText += msg + "\n";
        }
        alert(msg);
    }

    async loadScenario(path) {
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`ファイルが見つかりません (${res.status}): ${path}`);
            this.scenario = await res.json();

            if (this.scenario.characters) {
                const charPromises = this.scenario.characters.map(async (charPath) => {
                    const fullPath = charPath.startsWith('.') ? charPath : `./${charPath}`;
                    const charRes = await fetch(fullPath);
                    if (!charRes.ok) throw new Error(`キャラファイル不在: ${fullPath}`);
                    return await charRes.json();
                });
                this.scenario.characters = await Promise.all(charPromises);
            }

            if (this.scenario.case) {
                document.getElementById('case-title').innerText = this.scenario.case.title || "No Title";
                document.getElementById('case-outline').innerText = this.scenario.case.outline || "No Outline";
            }
        } catch (e) {
            console.error("Failed to load scenario", e);
            throw e;
        }
    }

    resetGame() {
        if (confirm("全ての捜査記録を破棄し、リトルエンジン号の出発時刻まで時を戻しますか？")) {
            localStorage.clear();
            location.reload();
        }
    }

    loadState() {
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            this.state = JSON.parse(saved);
        } else {
            this.state.startTime = Date.now(); // 最初の起動時刻を記録
            if (this.scenario && this.scenario.evidences) {
                this.scenario.evidences.forEach(ev => {
                    if (ev.unlock_condition === 'start') this.addEvidence(ev.id);
                });
            }
        }
    }

    saveState() {
        localStorage.setItem('mystery_game_state_v1', JSON.stringify(this.state));
    }

    // --- 【新規】時間経過による手がかり解禁ロジック ---
    startTimeCluesTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);

        // 10秒ごとに時間をチェック
        this.timerInterval = setInterval(() => {
            if (!this.scenario || !this.scenario.time_clues) return;

            // 経過時間（分）を計算
            const elapsedMinutes = (Date.now() - this.state.startTime) / 60000;

            this.scenario.time_clues.forEach(clue => {
                // 未解禁かつ、経過時間が設定値を超えた場合
                if (!this.state.unlockedClues.includes(clue.id) && elapsedMinutes >= clue.unlock_minutes) {
                    this.unlockTimeClue(clue);
                }
            });
        }, 10000);
    }

    unlockTimeClue(clue) {
        this.state.unlockedClues.push(clue.id);
        this.saveState();
        this.updateAttributesUI();
        
        // 捜査進展のアラート（よさげな言葉）
        const alertMsg = `【🚨 捜査進展：${clue.title}】\n\n新たな事実が判明しました：\n${clue.content}`;
        alert(alertMsg);
    }

    addEvidence(evidenceId) {
        if (!this.state.evidences.includes(evidenceId)) {
            this.state.evidences.push(evidenceId);
            this.saveState();
        }
    }

    getCharacter(id) {
        return this.scenario.characters.find(c => c.id === id);
    }

    renderCharacterList() {
        if (!this.scenario || !this.scenario.characters) return;
        const list = document.getElementById('character-list');
        list.innerHTML = '';
        const icons = { 'VN': '🎻', 'MC': '🎩', 'TS': '🎾', 'BM': '💼', 'DC': '💉', 'Lo': '🏰', 'PS': '🌾', 'CD': '👮' };

        this.scenario.characters.forEach(char => {
            const div = document.createElement('div');
            div.className = 'character-card';
            div.innerHTML = `
                <div class="char-icon">${icons[char.id] || '👤'}</div>
                <div class="char-name">${char.name}</div>
                <div class="char-role">${char.role}</div>
            `;
            div.onclick = () => this.openInterrogation(char.id);
            list.appendChild(div);
        });
    }

    openInterrogation(charId) {
        this.currentCharacterId = charId;
        const char = this.getCharacter(charId);
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('interrogation-room').style.display = 'flex';
        document.getElementById('target-name').innerText = char.name;
        this.renderChatLog();
    }

    closeInterrogation() {
        this.currentCharacterId = null;
        document.getElementById('interrogation-room').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        this.updateAttributesUI();
    }

    renderChatLog() {
        const logContainer = document.getElementById('chat-log');
        logContainer.innerHTML = '';
        const history = this.state.history[this.currentCharacterId] || [];

        history.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${msg.role}`;
            msgDiv.innerText = msg.text;
            logContainer.appendChild(msgDiv);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        this.appendMessage('user', text);

        const char = this.getCharacter(this.currentCharacterId);
        const systemPrompt = this.constructSystemPrompt(char);
        const history = this.state.history[this.currentCharacterId] || [];

        const responseText = await sendToAI(systemPrompt, text, history);

        this.appendMessage('model', responseText);
        this.checkEvidenceUnlock(text, responseText);
    }

    appendMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) this.state.history[this.currentCharacterId] = [];
        this.state.history[this.currentCharacterId].push({ role, text });
        this.saveState();
        this.renderChatLog();
    }

    constructSystemPrompt(char) {
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `・${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");

        // 時間経過で解禁された手がかりもAIに教える
        const unlockedClues = (this.state.unlockedClues || []).map(cid => {
            const c = (this.scenario.time_clues || []).find(clue => clue.id === cid);
            return c ? `・${c.title}: ${c.content}` : null;
        }).filter(Boolean).join("\n");

        const directives = char.system_prompt_directives || {};
        const timeline = char.detailed_timeline?.map(t => `[${t.time}] ${t.action}`).join("\n") || "";
        
        return `
あなたは「${char.name}」として、19世紀末の列車内の人物として振る舞ってください。

# 行動履歴（タイムライン）
${timeline}

# 性格・背景
${char.personality.join("、")}
${char.background?.summary || ""}

# 嘘と秘匿のルール
- 許可された嘘: ${directives.lying_rules?.allowed.join(", ") || "なし"}
- 秘匿すべき事実: ${directives.lying_rules?.forbidden.join(", ") || "なし"}

# プレイヤーが持っている証拠品
${knownEvidences}

# 現在判明している手がかり
${unlockedClues}

# 指針
- 探偵に追い詰められるまでは保身を優先せよ。
- 決してAIとは認めず、時代背景に合った口調を崩さないこと。
        `.trim();
    }

    updateAttributesUI() {
        if (!this.scenario) return;
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
        
        // 証拠品のレンダリング
        this.state.evidences.forEach(eid => {
            const ev = this.scenario.evidences.find(e => e.id === eid);
            if (ev) this.renderInfoItem(list, ev.name, ev.description, "【証拠品】");
        });

        // 手がかりのレンダリング
        this.state.unlockedClues.forEach(cid => {
            const clue = this.scenario.time_clues.find(c => c.id === cid);
            if (clue) this.renderInfoItem(list, clue.title, clue.content, "【手がかり】");
        });

        if (list.innerHTML === '') {
            list.innerHTML = '<p style="color:#666; font-size:0.9rem; padding:10px;">(まだ有力な情報はありません)</p>';
        }
    }

    renderInfoItem(container, title, desc, label) {
        const div = document.createElement('div');
        div.className = 'evidence-item';
        div.innerHTML = `<span style="color:var(--accent-color); font-weight:bold;">${label}</span> <strong>${title}</strong><br><small>${desc}</small>`;
        div.style.cssText = "padding:8px; border-bottom:1px solid #444; font-size:0.9rem;";
        container.appendChild(div);
    }

    checkEvidenceUnlock(userText, aiText) {
        if (!this.scenario || !this.scenario.evidences) return;
        const unlockMap = {
            'golden_pen': ['万年筆', 'ペン', '刺し傷'],
            'black_rope': ['ロープ', '縄', '縛'],
            'pregnancy_test': ['妊娠', '陽性', '医者'],
            'medicine_bottle': ['中絶薬', 'ピンク', '小瓶'],
            'stolen_cash': ['600ポンド', '札束', '現金'],
            'broken_iron_pipe': ['鉄パイプ', '水道管']
        };

        this.scenario.evidences.forEach(ev => {
            if (this.state.evidences.includes(ev.id)) return;
            const keywords = unlockMap[ev.id];
            if (keywords?.some(kw => userText.includes(kw) || aiText.includes(kw))) {
                this.addEvidence(ev.id);
                this.updateAttributesUI();
                alert(`【🔎 捜査進展：新たな証拠品を確保しました】\n\n物件：${ev.name}`);
            }
        });
    }

    startAccusation() {
        const culpritName = prompt("霧の中に潜む、真犯人の名を告げてください：\n（例：セバスチャン、マジシャン）");
        if (!culpritName) return;

        const target = this.scenario.characters.find(c => 
            c.name.includes(culpritName) || c.role.includes(culpritName)
        );

        if (!target) {
            alert("そのような人物は乗客名簿に存在しません。");
            return;
        }

        if (target.id === this.scenario.case.culprit) {
            alert(`【⚖️ 審判：正解】\n真犯人は ${target.name} で相違ありません。\n\n【真実】\n${this.scenario.case.truth}`);
        } else {
            alert(`【⚖️ 審判：不正解】\n残念ながら ${target.name} は真犯人ではありません。`);
        }
    }
}

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
    game.init();

    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '👉 真犯人を告発する';
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:12px; background:#d32f2f; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    document.querySelector('#main-menu .content').appendChild(accuseBtn);

    const resetBtn = document.createElement('button');
    resetBtn.innerText = '🔄 捜査を最初からやり直す';
    resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#555; color:white; border:none; border-radius:5px; cursor:pointer; font-size:0.9rem;";
    resetBtn.onclick = () => game.resetGame();
    document.querySelector('#main-menu .content').appendChild(resetBtn);

    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') game.sendMessage();
    });
});
