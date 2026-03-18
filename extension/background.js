// // background.js

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.type === "USER_LOG") {
//         let log = message.log;
//         let confusionScore = 0;
        
//         if (log.hoverCount > 100 && log.scrollDepth < 30) confusionScore += 2;
//         if (log.scrollDepth > 90 && log.timeOnPage < 30) confusionScore += 2;
//         if (log.clickCount > 50) confusionScore += 1;

//         log.confusionScore = confusionScore;
//         chrome.storage.local.set({ userLog: log });
        
//         if (log.confusionScore >= 3) {
//             chrome.notifications.create({
//                 type: "basic",
//                 iconUrl: "images/icon48.png",
//                 title: "Cognitive Load Engine",
//                 message: "It looks like you're struggling. Try scanning the headings to find what you're looking for.",
//                 priority: 2
//             });
//         }
//     }

//     if (message.type === "SUMMARIZE_REQUEST") {
//         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//             if (tabs[0]) {
//                 chrome.tabs.sendMessage(tabs[0].id, {
//                     type: "SUMMARIZE_THIS",
//                     text: message.text
//                 });
//             }
//         });
//     }

//     if (message.type === "USER_FEEDBACK") {
//         console.log("User feedback received:", message.feedback);
//         chrome.notifications.create({
//             type: "basic",
//             iconUrl: "images/icon48.png",
//             title: "Thank You!",
//             message: "Your feedback has been received.",
//             priority: 1
//         });
//     }
    
//     // This is the crucial fix for summarization
//     if (message.type === "SUMMARIZE_RESPONSE") {
//         chrome.runtime.sendMessage(message);
//     }
// });
// chrome.runtime.onMessage.addListener((message, sender) => {
//     if (message.type === "INJECT_CHATBOT") {
//         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//             if (tabs[0]) {
//                 chrome.scripting.executeScript({
//                     target: { tabId: tabs[0].id },
//                     files: ["chatbot.js"]
//                 });
//             }
//         });
//     }
// });


// background.js

// Import the ML model
importScripts('ml/ml-model.js');

// Wait for model to initialize
let modelReady = false;

// =========================
// Overlay + Capture + Gemini
// =========================
// NOTE: Do NOT hardcode API keys in source control.
// If you need Gemini, call a backend proxy that keeps the key server-side.
const AUDIT_REPORT_STORAGE_KEY = 'auditReport';
const LAST_GEMINI_CALL_STORAGE_KEY = 'lastGeminiCall';
const GEMINI_COOLDOWN_MS = 60_000; // 60 seconds
const GEMINI_PROXY_URL_STORAGE_KEY = 'geminiProxyUrl';

let auditReport = [];

chrome.action.onClicked.addListener((tab) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
});

// Initialize model on extension load
(async () => {
  try {
    await cognitiveLoadModel.initialize();
    modelReady = true;
    console.log('✅ ML Model initialized in background');
  } catch (error) {
    console.error('❌ Failed to initialize ML model:', error);
  }
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // =========================
    // Overlay + Capture actions
    // =========================
    if (message?.action) {
        // STEP 1: Overlay Initialization
        if (message.action === "INIT_OVERLAY") {
            const tabId = sender?.tab?.id;
            if (!tabId) {
                sendResponse?.({ status: "error", error: "No sender tab id available." });
                return true;
            }

            chrome.scripting.executeScript(
                { target: { tabId }, files: ['overlay.js'] },
                () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        sendResponse?.({ status: "error", error: err.message });
                    } else {
                        sendResponse?.({ status: "success" });
                    }
                }
            );
            return true;
        }

        // STEP 2: Cropped Selection Capture
        if (message.action === "FINALIZE_CAPTURE") {
            const tabId = sender?.tab?.id;
            if (!tabId) {
                sendResponse?.({ status: "error", error: "No sender tab id available." });
                return true;
            }

            chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    sendResponse?.({ status: "error", error: err.message });
                    return;
                }
                processCrop(dataUrl, message.area, tabId)
                    .then(() => sendResponse?.({ status: "success" }))
                    .catch((e) => sendResponse?.({ status: "error", error: e?.message || String(e) }));
            });
            return true;
        }

        // STEP 3: Full Screen Capture (Sticky Notes)
        if (message.action === "CAPTURE_VISIBLE_TAB") {
            const tabId = sender?.tab?.id;
            if (!tabId) {
                sendResponse?.({ status: "error", error: "No sender tab id available." });
                return true;
            }

            chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    sendResponse?.({ status: "error", error: err.message });
                    return;
                }

                const newEntry = {
                    type: "Sticky Note Observation",
                    timestamp: new Date().toLocaleString(),
                    screenshot: dataUrl,
                    comment: message.noteContent,
                };

                try {
                    await appendAuditReportEntry(newEntry);
                    sendResponse?.({ status: "success", count: auditReport.length });
                } catch (e) {
                    sendResponse?.({ status: "error", error: e?.message || String(e) });
                }
            });
            return true;
        }

        // STEP 4: Fetch Report Data
        if (message.action === "GET_REPORT_DATA") {
            chrome.storage.local.get([AUDIT_REPORT_STORAGE_KEY], (result) => {
                const list = result?.[AUDIT_REPORT_STORAGE_KEY] || [];
                auditReport = Array.isArray(list) ? list : [];
                sendResponse?.({ data: auditReport });
            });
            return true;
        }
    }
    
    // ========== EXISTING FUNCTIONALITY ==========
    
    if (message.type === "USER_LOG") {
        let log = message.log;
        let confusionScore = 0;
        
        if (log.hoverCount > 100 && log.scrollDepth < 30) confusionScore += 2;
        if (log.scrollDepth > 90 && log.timeOnPage < 30) confusionScore += 2;
        if (log.clickCount > 50) confusionScore += 1;

        log.confusionScore = confusionScore;
        chrome.storage.local.set({ userLog: log });
        
        if (log.confusionScore >= 3) {
            chrome.notifications.create({
                type: "basic",
                iconUrl: "images/icon48.png",
                title: "Cognitive Load Engine",
                message: "It looks like you're struggling. Try scanning the headings to find what you're looking for.",
                priority: 2
            });
        }
    }

    if (message.type === "SUMMARIZE_REQUEST") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: "SUMMARIZE_THIS",
                    text: message.text
                });
            }
        });
    }

    if (message.type === "USER_FEEDBACK") {
        console.log("User feedback received:", message.feedback);
        chrome.notifications.create({
            type: "basic",
            iconUrl: "images/icon48.png",
            title: "Thank You!",
            message: "Your feedback has been received.",
            priority: 1
        });
    }
    
    if (message.type === "SUMMARIZE_RESPONSE") {
        chrome.runtime.sendMessage(message);
    }
    
    if (message.type === "INJECT_CHATBOT") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ["chatbot.js"]
                });
            }
        });
    }

    // Chatbot requests AI text completion via backend proxy.
    if (message.type === 'GEMINI_CHAT') {
        (async () => {
            const prompt = String(message?.prompt || '');
            if (!prompt) return sendResponse({ text: '' });

            const data = await callGeminiProxy({
                kind: 'text',
                prompt
            });

            if (data?.error) return sendResponse({ error: 'AI_UNAVAILABLE' });
            return sendResponse({ text: data?.text || '' });
        })();
        return true;
    }
    
    // ========== NEW ML FUNCTIONALITY ==========
    
    // Handle ML prediction requests
    if (message.type === 'PREDICT_COGNITIVE_LOAD') {
        if (!modelReady) {
            console.log('⏳ Model not ready yet, returning default score');
            sendResponse({ score: 0.5 });
            return true;
        }
        
        // Make prediction using ML model
        cognitiveLoadModel.predict(message.features)
            .then(score => {
                console.log(`🎯 ML Prediction: ${(score * 100).toFixed(0)}%`);
                sendResponse({ score: score });
            })
            .catch(error => {
                console.error('❌ Prediction error:', error);
                sendResponse({ score: 0.5, error: error.message });
            });
        
        return true; // Keep channel open for async response
    }
    
    // Handle training feedback from user
    if (message.type === 'TRAINING_FEEDBACK') {
        console.log('📝 Training feedback received');
        
        cognitiveLoadModel.collectTrainingData(message.features, message.label);
        
        // Save feedback to storage for analysis
        chrome.storage.local.get(['trainingFeedback'], (result) => {
            const feedback = result.trainingFeedback || [];
            feedback.push({
                features: message.features,
                label: message.label,
                timestamp: message.timestamp || Date.now()
            });
            
            // Keep only last 100 feedbacks
            if (feedback.length > 100) {
                feedback.shift();
            }
            
            chrome.storage.local.set({ trainingFeedback: feedback });
        });
        
        sendResponse({ success: true });
    }
    
    // Handle high cognitive load detection
    if (message.type === 'HIGH_COGNITIVE_LOAD_DETECTED') {
        console.log('🔴 High cognitive load detected:', message.data);
        
        // Log the event
        chrome.storage.local.get(['highLoadEvents'], (result) => {
            const events = result.highLoadEvents || [];
            events.push({
                score: message.data.score,
                level: message.data.level,
                url: message.data.url,
                timestamp: message.data.timestamp
            });
            
            // Keep only last 50 events
            if (events.length > 50) {
                events.shift();
            }
            
            chrome.storage.local.set({ highLoadEvents: events });
        });
        
        // Show notification
        chrome.notifications.create({
            type: "basic",
            iconUrl: "images/icon48.png",
            title: "High Cognitive Load Detected",
            message: "The AI assistant is available to help you understand this content better.",
            priority: 2
        });
        
        sendResponse({ success: true });
    }
    
    // Toggle in-page Cognitive Load sidebar on request (from ml-detector banner click)
    if (message.type === 'REQUEST_TOGGLE_SIDEBAR') {
        const tabId = sender?.tab?.id;
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { action: "toggle_sidebar" });
        }
        // Fire-and-forget; no response needed
    }
    
    // Update ML cognitive load score in storage
    if (message.type === 'ML_COGNITIVE_LOAD_UPDATE') {
        chrome.storage.local.get(['userLog'], (result) => {
            const log = result.userLog || {};
            
            // Add ML score to existing log
            log.mlCognitiveLoad = message.data.score;
            log.mlLoadLevel = message.data.level;
            log.mlLoadPercentage = message.data.percentage;
            log.lastMLUpdate = message.data.timestamp;
            
            chrome.storage.local.set({ userLog: log });
        });
        
        sendResponse({ success: true });
    }
    
    // Handle model info request
    if (message.type === 'GET_MODEL_INFO') {
        const info = cognitiveLoadModel.getModelInfo();
        sendResponse(info);
        return true;
    }
    
    // Handle model training status
    if (message.type === 'MODEL_TRAINED') {
        console.log(`✅ Model training complete with ${message.sampleCount} samples`);
        
        chrome.notifications.create({
            type: "basic",
            iconUrl: "images/icon48.png",
            title: "ML Model Updated",
            message: `Your cognitive load detection model has been improved with ${message.sampleCount} training samples.`,
            priority: 1
        });
    }
    
    // Handle model reset request
    if (message.type === 'RESET_ML_MODEL') {
        cognitiveLoadModel.resetModel()
            .then(() => {
                console.log('✅ Model reset complete');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('❌ Model reset error:', error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
    
    // Handle model export request
    if (message.type === 'EXPORT_ML_MODEL') {
        cognitiveLoadModel.exportModel()
            .then(() => {
                sendResponse({ success: true });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
});

async function appendAuditReportEntry(entry) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([AUDIT_REPORT_STORAGE_KEY], (result) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message));

            const current = result?.[AUDIT_REPORT_STORAGE_KEY];
            const list = Array.isArray(current) ? current : [];
            list.push(entry);
            auditReport = list;

            chrome.storage.local.set({ [AUDIT_REPORT_STORAGE_KEY]: list }, () => {
                const err2 = chrome.runtime.lastError;
                if (err2) return reject(new Error(err2.message));
                resolve();
            });
        });
    });
}

// ---------- IMAGE CROPPING ----------
async function processCrop(dataUrl, area, tabId) {
    try {
        if (!area || typeof area.x !== 'number' || typeof area.y !== 'number' || typeof area.w !== 'number' || typeof area.h !== 'number') {
            throw new Error('Invalid crop area.');
        }

        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(area.w, area.h);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);

        const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
        const croppedUrl = await blobToDataUrl(croppedBlob, 'image/png');

        chrome.tabs.sendMessage(tabId, { action: "DISPLAY_CAPTURE", image: croppedUrl });
        await analyzeWithGemini(croppedUrl, tabId);
    } catch (e) {
        console.error("Cropping Error:", e);
        chrome.tabs.sendMessage(tabId, {
            action: "AI_RESULT",
            text: `Cropping error: ${e?.message || String(e)}`
        });
        throw e;
    }
}

async function blobToDataUrl(blob, mimeType) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return `data:${mimeType};base64,${base64}`;
}

function getStorageValue(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], (result) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message));
            resolve(result?.[key]);
        });
    });
}

function setStorageValue(key, value) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message));
            resolve();
        });
    });
}

// ---------- GEMINI AI (via backend proxy) ----------
async function getGeminiProxyUrl() {
    // Prefer enterprise-managed config if available; fall back to local.
    const managed = await new Promise((resolve) => {
        try {
            if (!chrome?.storage?.managed) return resolve(null);
            chrome.storage.managed.get([GEMINI_PROXY_URL_STORAGE_KEY], (result) => {
                resolve(result?.[GEMINI_PROXY_URL_STORAGE_KEY] || null);
            });
        } catch {
            resolve(null);
        }
    });
    if (managed) return managed;
    return (await getStorageValue(GEMINI_PROXY_URL_STORAGE_KEY)) || '';
}

async function callGeminiProxy(payload) {
    const proxyUrl = await getGeminiProxyUrl();
    if (!proxyUrl) return { error: 'AI_UNAVAILABLE' };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);
    try {
        const res = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { error: data?.error || `HTTP_${res.status}` };
        }
        return data;
    } catch (e) {
        return { error: e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || 'NETWORK_ERROR') };
    } finally {
        clearTimeout(t);
    }
}

async function analyzeWithGemini(dataUrl, tabId) {
    // STEP 1: Cooldown Check (Rate Limiting)
    const now = Date.now();
    const lastGeminiCall = (await getStorageValue(LAST_GEMINI_CALL_STORAGE_KEY)) || 0;
    if (now - lastGeminiCall < GEMINI_COOLDOWN_MS) {
        chrome.tabs.sendMessage(tabId, {
            action: "AI_RESULT",
            text: "Please wait before making another AI request (rate limit applied)."
        });
        return;
    }
    await setStorageValue(LAST_GEMINI_CALL_STORAGE_KEY, now);

    const base64 = String(dataUrl).split(",")[1];
    if (!base64) {
        chrome.tabs.sendMessage(tabId, {
            action: "AI_RESULT",
            text: "Could not read image data for analysis."
        });
        return;
    }

    try {
        const prompt = `You are a visual analysis assistant.

1. Identify the image type:
- Text/Notes
- Question or Problem
- UI/App Screenshot
- Chart/Graph/Table
- Other

2. Summarize the image briefly in simple language.
Do not assume missing information.

3. If the image contains a question or problem:
- Do not give the final answer unless asked
- Explain the solving approach step-by-step
- Mention key concepts or formulas
- Prefer the best approach if multiple exist

4. If it is not a problem:
- Explain the main idea
- Highlight important elements

Rules:
- Say if the image is unclear
- Do not hallucinate
- Keep it beginner-friendly`;

        const data = await callGeminiProxy({
            kind: 'vision',
            mimeType: 'image/png',
            imageBase64: base64,
            prompt
        });

        if (data?.error) {
            chrome.tabs.sendMessage(tabId, { action: "AI_RESULT", text: "AI is temporarily unavailable." });
            return;
        }

        chrome.tabs.sendMessage(tabId, {
            action: "AI_RESULT",
            text: data?.text || "AI is temporarily unavailable."
        });
    } catch (e) {
        chrome.tabs.sendMessage(tabId, {
            action: "AI_RESULT",
            text: "AI is temporarily unavailable."
        });
        console.error("Gemini Fetch Error:", e);
    }
}

// Log when extension is installed/updated
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('🎉 Cognitive Load Engine installed!');
        console.log('📚 ML model will learn from your usage patterns.');
    } else if (details.reason === 'update') {
        console.log('🔄 Cognitive Load Engine updated!');
    }
});

// Clean up old data periodically (every hour)
setInterval(() => {
    chrome.storage.local.get(['highLoadEvents', 'trainingFeedback'], (result) => {
        const now = Date.now();
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        
        // Clean old high load events (keep only last week)
        if (result.highLoadEvents) {
            const filtered = result.highLoadEvents.filter(e => e.timestamp > oneWeekAgo);
            chrome.storage.local.set({ highLoadEvents: filtered });
        }
        
        // Clean old training feedback (keep only last week)
        if (result.trainingFeedback) {
            const filtered = result.trainingFeedback.filter(f => f.timestamp > oneWeekAgo);
            chrome.storage.local.set({ trainingFeedback: filtered });
        }
        
        console.log('🧹 Cleaned up old data');
    });
}, 60 * 60 * 1000); // Every hour