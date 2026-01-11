/**
 * ミステリ/ai.js
 * Netlify Functionsを経由してGemini APIと通信します。
 */
export async function sendToAI(systemPrompt, userPrompt, history) {
    try {
        // 先ほど設定したNetlifyのサーバーレス関数(gemini.js)を呼び出します
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                systemPrompt, 
                userPrompt, 
                history // game.jsから渡される全履歴
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            // サーバー側でエラーが発生した場合（APIキー不備や回数制限など）
            return `エラー: ${data.error || "通信に失敗しました"}`;
        }
        
        // 正常な応答を返す
        return data.text || "応答がありませんでした。";
    } catch (e) {
        console.error("AI通信エラー:", e);
        return `通信エラー: ${e.message}`;
    }
}
