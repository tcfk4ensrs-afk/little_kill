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
            console.log("Game initialising...");
            // シナリオのメインファイルをロード
            await this.loadScenario('./scenarios/case1.json');
            this.loadState();
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

            const text = await res.text();
            this.scenario = JSON.parse(text);

            // キャラクター個別ファイルのロード処理
            if (this.scenario.characters) {
                const charPromises = this.scenario.characters.map(async (charOrPath) => {
                    if (typeof charOrPath === 'string') {
                        // パスを調整して fetch
                        const fullPath = charOrPath.startsWith('.') ? charOrPath : `./${charOrPath}`;
                        const charRes = await fetch(fullPath);
                        if (!charRes.ok) throw new Error(`キャラファイル不在: ${fullPath}`);
                        return await charRes.json();
                    }
                    return charOrPath;
                });
                this.scenario.characters = await Promise.all(charPromises);
            }

            if (this.scenario.case) {
                document.getElementById('case-title').innerText = this.scenario.case.title || "No Title";
                document.getElementById('case-outline').innerText = this.scenario.case.outline || "No Outline";
            }
        } catch (e) {
            console.error("Failed to load scenario", e);
            document.getElementById('case-title').innerText = "Load Error";
            document.getElementById('case-outline').innerText = e.message;
            throw e;
        }
    }

    resetGame() {
        if (confirm("本当にリセットしますか？\n履歴や証拠がすべて失われます。")) {
            localStorage.clear();
            location.reload();
        }
    }

    loadState() {
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            this.state = JSON.parse(saved);
        } else {
            // ゲーム開始時に解禁されている証拠を設定
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
        
        // アイコンマップの定義
        const icons = {
            'VN': '🎻', 'MC': '🎩', 'TS': '🎾', 'BM': '💼', 
            'DC': '💉', 'Lo': '🏰', 'PS': '🌾', 'CD': '👮'
        };

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

        // AIからの応答を取得
        const responseText = await sendToAI(systemPrompt, text, history);

        this.appendMessage('model', responseText);
        this.checkEvidenceUnlock(text, responseText);
    }

    appendMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) {
            this.state.history[this.currentCharacterId] = [];
        }
        this.state.history[this.currentCharacterId].push({ role, text });
        this.saveState();
        this.renderChatLog();
    }

    // 【マイナーチェンジ】新シナリオのJSON構造に最適化
    constructSystemPrompt(char) {
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `・${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");

        const directives = char.system_prompt_directives || {};
        const timeline = char.detailed_timeline?.map(t => `[${t.time}] ${t.action} (心境: ${t.note})`).join("\n") || "記録なし";
        
        return `
あなたはミステリーの登場人物「${char.name}」として振る舞ってください。

# あなたの世界観
${directives.world_view || ""}

# 行動履歴（タイムライン）
${timeline}

# 性格・背景
${char.personality.join("、")}
${char.background?.summary || ""}

# 嘘と秘匿のルール
- 許可されている嘘: ${directives.lying_rules?.allowed.join(", ") || "特になし"}
- 絶対に隠すべき事実: ${directives.lying_rules?.forbidden.join(", ") || "なし"}
- 秘密事項: ${(char.secrets || []).join("、")}

# 口調・セリフの指針
${directives.language || "役柄に相応しい言葉遣い"}
- セリフ例: ${directives.format?.outer_voice || ""}
- 心の声（参考）: ${directives.format?.inner_voice || ""}

# プレイヤーが所持している証拠品
${knownEvidences}

# ルール
- 探偵（プレイヤー）に追い詰められるまでは、嘘をついたり話をはぐらかしたりして保身に努めてください。
- 決してAIであることを明かさず、常に19世紀末の列車内にいる人物として応答してください。
        `.trim();
    }

    updateAttributesUI() {
        if (!this.scenario || !this.scenario.evidences) return;
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
        if (this.state.evidences.length === 0) {
            list.innerHTML = '<p style="color:#666; font-size:0.9rem; padding:10px;">(まだ証拠はありません)</p>';
            return;
        }

        this.state.evidences.forEach(eid => {
            const ev = this.scenario.evidences.find(e => e.id === eid);
            if (ev) {
                const div = document.createElement('div');
                div.className = 'evidence-item';
                div.innerHTML = `<strong>${ev.name}</strong><br><small>${ev.description}</small>`;
                div.style.cssText = "padding:8px; border-bottom:1px solid #444; font-size:0.9rem;";
                list.appendChild(div);
            }
        });
    }

    // 【マイナーチェンジ】キーワードによる証拠解禁を汎用化
    checkEvidenceUnlock(userText, aiText) {
        if (!this.scenario || !this.scenario.evidences) return;
        
        const unlockMap = {
            'golden_pen': ['万年筆', 'ペン', '刺し傷', 'インク'],
            'black_rope': ['ロープ', '縄', '縛る', 'ゴム'],
            'pregnancy_test': ['妊娠', '陽性', '医者', '検査'],
            'medicine_bottle': ['中絶薬', 'ピンク', 'コート'],
            'stolen_cash': ['600ポンド', '札束', '現金', '恐喝'],
            'broken_iron_pipe': ['鉄パイプ', '水道管', '破裂']
        };

        this.scenario.evidences.forEach(ev => {
            if (this.state.evidences.includes(ev.id)) return;
            
            const keywords = unlockMap[ev.id];
            if (keywords) {
                const isUserTalking = keywords.some(kw => userText.includes(kw));
                const isAiRevealing = keywords.some(kw => aiText.includes(kw));
                
                if (isUserTalking || isAiRevealing) {
                    this.addEvidence(ev.id);
                    this.updateAttributesUI();
                    alert(`【新証拠】\n${ev.name}`);
                }
            }
        });
    }

    startAccusation() {
        const culpritName = prompt("犯人だと思う人物名を入力してください：\n（例：セバスチャン、マジシャン）");
        if (!culpritName) return;

        // 全キャラクターから入力された名前を含む人物を探す
        const target = this.scenario.characters.find(c => 
            c.name.includes(culpritName) || c.role.includes(culpritName)
        );

        if (!target) {
            alert("そのような人物は乗船名簿にありません。");
            return;
        }

        if (target.id === this.scenario.case.culprit) {
            alert(`【正解！】\n真犯人は ${target.name} でした。\n\n【真実】\n${this.scenario.case.truth}`);
        } else {
            alert(`【不正解】\n${target.name} は犯人ではありません。`);
        }
    }
}

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
    game.init();

    // 犯人指名ボタンの追加
    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '👉 犯人を指名する';
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:12px; background:#d32f2f; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    document.querySelector('#main-menu .content').appendChild(accuseBtn);

    // リセットボタンの追加
    const resetBtn = document.createElement('button');
    resetBtn.innerText = '🔄 最初からやり直す';
    resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#555; color:white; border:none; border-radius:5px; cursor:pointer; font-size:0.9rem;";
    resetBtn.onclick = () => game.resetGame();
    document.querySelector('#main-menu .content').appendChild(resetBtn);

    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') game.sendMessage();
    });
});
