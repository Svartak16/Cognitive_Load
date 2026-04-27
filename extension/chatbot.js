// ============================
//  GEMINI CHATBOT INJECTION
// ============================
//
// This script is injected by background.js when high cognitive load
// is detected (via the ML detector running in content.js).
//
// Design goals:
// - Idempotent: safe to inject multiple times (no "already declared" errors)
// - Single source of truth for API key: read from chrome.storage.local
// - All chatbot UI lives here; content.js only triggers INJECT_CHATBOT

(function () {
    // If chatbot already exists on the page, do nothing so that
    // re-injecting this script does not create duplicates.
    if (document.getElementById('chatbot-box')) {
        return;
    }

  

    // Create chatbot container dynamically
    const chatbotContainer = document.createElement("div");
    chatbotContainer.setAttribute('data-cognitive-load-ui', 'true');
    chatbotContainer.innerHTML = `
        <div id="chatbot-box">
            <div class="chat-header">
                <i class="fas fa-robot"></i>
                <span>Your Helper Buddy</span>
                <button id="close-chatbot">&times;</button>
            </div>
            <div class="chat-body" id="chat-body">
                <div class="bot-msg">👋 Hi! I'm your Assistant. How can I help you today?</div>
            </div>
            <div class="chat-footer">
                <input type="text" id="user-input" placeholder="Type a message...">
                <button id="send-btn"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
        :root {
            --cl-bg: #0b1220;
            --cl-panel: rgba(255,255,255,0.06);
            --cl-panel-strong: rgba(2,6,23,0.55);
            --cl-border: rgba(148,163,184,0.18);
            --cl-border-soft: rgba(148,163,184,0.12);
            --cl-text: #e5e7eb;
            --cl-text-soft: rgba(229,231,235,0.72);
            --cl-accent-1: #6366f1;
            --cl-accent-2: #8b5cf6;
            --cl-accent-3: #22d3ee;
        }

        @keyframes shimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
        }
        .shimmer-text {
            background: linear-gradient(90deg, #888 25%, #fff 50%, #888 75%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: shimmer 2s linear infinite;
        }

        #chatbot-box {
            position: fixed;
            bottom: 20px;
            left: 20px;
            height: 500px;
            width: 360px;
            background: linear-gradient(180deg, rgba(15,23,42,0.98), rgba(11,18,32,0.98));
            border-radius: 18px;
            box-shadow: -14px 0 30px rgba(2,6,23,0.45), 0 18px 40px rgba(2,6,23,0.35);
            border: 1px solid var(--cl-border);
            overflow: hidden;
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial;
            z-index: 999999;
            display: flex;
            flex-direction: column;
        }
        .chat-header {
            background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.18));
            color: var(--cl-text);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            font-weight: 700;
            letter-spacing: 0.2px;
            border-bottom: 1px solid var(--cl-border);
        }
        #close-chatbot {
            background: transparent;
            border: 1px solid rgba(148,163,184,0.25);
            color: var(--cl-text);
            font-size: 18px;
            width: 30px;
            height: 30px;
            border-radius: 10px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        #close-chatbot:hover {
            background: rgba(148,163,184,0.12);
        }
        .chat-body {
            flex: 1;
            padding: 14px;
            overflow-y: auto;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 25%),
                radial-gradient(circle at bottom right, rgba(34,211,238,0.08), transparent 28%),
                rgba(2,6,23,0.55);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .chat-body::-webkit-scrollbar {
            width: 8px;
        }
        .chat-body::-webkit-scrollbar-thumb {
            background-color: rgba(148,163,184,0.35);
            border-radius: 10px;
        }
        .chat-body::-webkit-scrollbar-thumb:hover {
            background-color: rgba(148,163,184,0.55);
        }
        .chat-footer {
            display: flex;
            border-top: 1px solid var(--cl-border);
            background: rgba(2,6,23,0.6);
        }
        .chat-footer input {
            flex: 1;
            padding: 12px 14px;
            border: none;
            outline: none;
            font-size: 14px;
            background-color: transparent;
            color: var(--cl-text);
        }
        .chat-footer input::placeholder {
            color: rgba(226,232,240,0.42);
        }
        .chat-footer button {
            background: linear-gradient(90deg, var(--cl-accent-1), var(--cl-accent-2));
            color: #fff;
            border: none;
            padding: 10px 16px;
            cursor: pointer;
            transition: 0.2s ease;
        }
        .chat-footer button:hover {
            filter: brightness(1.05);
        }
        .bot-msg, .user-msg {
            padding: 10px 12px;
            border-radius: 14px;
            max-width: 80%;
            line-height: 1.4;
            font-size: 14px;
            white-space: pre-wrap;
            box-shadow: 0 8px 18px rgba(2,6,23,0.16);
        }
        .bot-msg {
            background: rgba(255,255,255,0.07);
            color: var(--cl-text);
            border: 1px solid var(--cl-border-soft);
            align-self: flex-start;
        }
        .user-msg {
            background: linear-gradient(90deg, var(--cl-accent-1), var(--cl-accent-2));
            color: white;
            align-self: flex-end;
            margin-left: auto;
        }
        .bot-msg .shimmer-text, .user-msg .shimmer-text {
            display: inline-block;
        }
        .typing-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .typing-dots {
            display: inline-flex;
            gap: 4px;
        }
        .typing-dots span {
            width: 6px;
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(180deg, #a5b4fc, #22d3ee);
            opacity: 0.4;
            animation: typingDot 1.2s infinite ease-in-out;
        }
        .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.3s; }

        @keyframes typingDot {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
            40% { transform: translateY(-4px); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(chatbotContainer);
    const chatbotBox = document.getElementById('chatbot-box');
    if (chatbotBox) chatbotBox.setAttribute('data-cognitive-load-ui', 'true');

    // Get elements
    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    const chatBody = document.getElementById("chat-body");
    const closeBtn = document.getElementById("close-chatbot");

    function addMessage(msg, type) {
        const msgDiv = document.createElement("div");
        msgDiv.classList.add(type === "user" ? "user-msg" : "bot-msg");
        msgDiv.textContent = msg;
        chatBody.appendChild(msgDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    // Gemini request via background proxy (no client-side API key)
    async function getGeminiReply(userMsg, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = Math.pow(2, retryCount) * 1000;

        try {
            const pageText = document.body.innerText.slice(0, 2000);
            const contextPrompt =
                "You are a helpful assistant on a webpage.\n" +
                "You can see this content snippet:\n\"" +
                pageText +
                "\"\nThe user said: \"" +
                userMsg +
                "\"\nRespond clearly and naturally.";

            const data = await new Promise((resolve) => {
                try {
                    chrome.runtime.sendMessage({ type: 'GEMINI_CHAT', prompt: contextPrompt }, (resp) => {
                        if (chrome.runtime.lastError) {
                            resolve({ error: chrome.runtime.lastError.message || 'SEND_FAILED' });
                            return;
                        }
                        resolve(resp || {});
                    });
                } catch (e) {
                    resolve({ error: e?.message || 'SEND_FAILED' });
                }
            });

            if (data?.text) return data.text;

            if (data?.error) {
                console.error("AI assistant error:", data.error);

                if (retryCount < maxRetries) {
                    const reason = String(data.error || 'AI_UNAVAILABLE');
                    return '🔄 AI request failed (' +
                        reason +
                        '), retrying in ' +
                        (retryDelay / 1000) +
                        's... (attempt ' +
                        (retryCount + 1) +
                        '/' +
                        maxRetries +
                        ')';
                }

                return "Sorry — the AI assistant is temporarily unavailable.";
            }

            return "Sorry — the AI assistant is temporarily unavailable.";

        } catch (err) {
            console.error("Chatbot Fetch Error:", err);

            if (retryCount < maxRetries) {
                return '🔄 Connection failed, retrying in ' +
                    (retryDelay / 1000) +
                    's... (attempt ' +
                    (retryCount + 1) +
                    '/' +
                    maxRetries +
                    ')';
            } else {
                return "🌐 Failed to connect to the AI service. Please check your internet connection and try again.";
            }
        }
    }

    // Send message handler with retry logic
    sendBtn.addEventListener("click", async () => {
        const userMsg = input.value.trim();
        if (!userMsg) return;
        addMessage(userMsg, "user");
        input.value = "";

        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries) {
            const thinkingMsg = document.createElement("div");
            thinkingMsg.classList.add("bot-msg");
            thinkingMsg.innerHTML = `
                <span class="typing-pill">
                    <span class="shimmer-text">${retryCount === 0 ? 'Thinking...' : 'Retrying... (' + retryCount + '/' + maxRetries + ')'}</span>
                    <span class="typing-dots" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </span>
                </span>
            `;
            chatBody.appendChild(thinkingMsg);
            chatBody.scrollTop = chatBody.scrollHeight;

            const reply = await getGeminiReply(userMsg, retryCount);
            thinkingMsg.remove();

            if (reply.includes("🔄") && retryCount < maxRetries) {
                addMessage(reply, "bot");
                retryCount++;
                const backoff = Math.pow(2, retryCount - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, backoff));
            } else {
                addMessage(reply, "bot");
                break;
            }
        }
    });

    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendBtn.click();
    });

    closeBtn.addEventListener("click", () => {
        chatbotContainer.remove();
    });

})(); // end IIFE
