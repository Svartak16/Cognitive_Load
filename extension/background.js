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
importScripts("ort.min.js", "phishing.js");


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
const SEMANTIC_CLASSIFICATION_CACHE_KEY = 'semanticClassificationCache';
const SEMANTIC_CLASSIFICATION_COOLDOWN_MS = 5 * 60 * 1000;

const SEMANTIC_CLASSIFICATION_SYSTEM_PROMPT = `
You are a DOM semantic classifier for a cognitive load reduction system.
Your job is to analyze the structure of a webpage and classify each major section to help a struggling reader focus on what matters.

You will receive a JSON object with page metadata and a DOM element list.

Your task is to classify each element into exactly one of these categories:

CATEGORIES:
- "core_content"     → The primary article, documentation, or information the user came to read. Paragraphs, headings, main text blocks, code blocks, technical explanations.
- "supporting"       → Directly helps understand core content. In-article images, figures, captions, tables, diagrams, footnotes, relevant callout boxes.
- "navigation"       → Helps move around the site. Headers, footers, breadcrumbs, table of contents, pagination, back buttons, site menus.
- "supplementary"    → Related but not essential. Related articles, author bios, tags, categories, share buttons, comment sections, "you might also like" sections.
- "noise"            → Actively harmful to focus. Ads, cookie banners, newsletter popups, social media widgets, floating chat bubbles, promotional banners, notification requests, tracking consent dialogs.

CLASSIFICATION RULES:
1. When in doubt between two categories, always choose the one that better serves someone who is cognitively struggling to understand the page content.
2. A table of contents is "navigation" not "core_content" - even if it contains useful headings.
3. Code examples inside a tutorial are "core_content" not "supporting".
4. Images that illustrate a concept are "supporting". Decorative images or stock photos are "noise".
5. A sticky header with just the site logo and nav links is "navigation". A sticky header that shows reading progress or article title is "supporting".
6. Comment sections are always "supplementary" regardless of quality.
7. If an element contains both core content and noise, classify it by its dominant purpose and note the mixed content in your reasoning.

OUTPUT FORMAT:
Return a single valid JSON object only, with this structure:
{
  "page_type": "article | documentation | search_results | product_page | dashboard | forum | other",
  "confidence": 0.0,
  "reading_complexity": "low | medium | high | very_high",
  "classifications": [
    {
      "element_id": "string",
      "category": "core_content | supporting | navigation | supplementary | noise",
      "confidence": 0.0,
      "reasoning": "one sentence max",
      "hide_in_focus_mode": true,
      "priority": 1
    }
  ],
  "focus_mode_strategy": "A single sentence describing the recommended approach for this specific page type",
  "estimated_core_content_percentage": 0
}

HIDE_IN_FOCUS_MODE RULES:
- "noise" → always true
- "supplementary" → always true
- "navigation" → true UNLESS it is a table of contents or in-page anchor nav
- "supporting" → always false
- "core_content" → always false

PRIORITY FIELD:
1-3  → Never hide, critical to understanding
4-6  → Hide only at very high cognitive load
7-8  → Hide at high cognitive load
9-10 → Hide immediately in focus mode

Return JSON only. No markdown, no explanation outside the JSON.
`.trim();

let auditReport = [];
let validationHistory = [];
let semanticClassificationCache = {};

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
                chrome.storage.local.set({
                    lastMLPrediction: {
                        score,
                        timestamp: Date.now()
                    }
                });
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

        chrome.storage.local.get(['lastMLPrediction'], (result) => {
            const lastPrediction = result.lastMLPrediction;
            if (lastPrediction && typeof lastPrediction.score === 'number') {
                const error = Math.abs(lastPrediction.score - message.label);
                validationHistory.push({
                    predicted: lastPrediction.score,
                    actual: message.label,
                    error,
                    timestamp: Date.now(),
                    metadata: message.metadata || {}
                });

                if (validationHistory.length > 50) {
                    validationHistory.shift();
                }

                const avgError = validationHistory.reduce((sum, item) => sum + item.error, 0) /
                    Math.max(1, validationHistory.length);
                const accuracy = 1 - avgError;

                chrome.storage.local.set({
                    modelAccuracy: accuracy,
                    validationHistory
                });
            }
        });
        
        // Save feedback to storage for analysis
        chrome.storage.local.get(['trainingFeedback'], (result) => {
            const feedback = result.trainingFeedback || [];
            feedback.push({
                features: message.features,
                label: message.label,
                timestamp: message.timestamp || Date.now(),
                metadata: message.metadata || {}
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

        const tabId = sender?.tab?.id;
        if (tabId) {
            const priorityThreshold = message?.data?.level === 'urgent' ? 7 : 9;
            (async () => {
                try {
                    const classification = await runSemanticClassification(tabId, {
                        priorityThreshold,
                        forceRefresh: false
                    });
                    if (classification) {
                        chrome.tabs.sendMessage(tabId, {
                            action: 'APPLY_SEMANTIC_CLASSIFICATION',
                            classification,
                            priorityThreshold
                        });
                    }
                } catch (error) {
                    console.warn('Semantic classification failed:', error?.message || error);
                    chrome.tabs.sendMessage(tabId, {
                        action: 'APPLY_FOCUS_MODE',
                        priorityThreshold
                    });
                }
            })();
        }
        
        sendResponse({ success: true });
    }

    if (message.type === 'REQUEST_SEMANTIC_FOCUS_MODE') {
        const tabId = sender?.tab?.id;
        if (tabId) {
            (async () => {
                try {
                    const classification = await runSemanticClassification(tabId, {
                        forceRefresh: false
                    });
                    if (classification) {
                        chrome.tabs.sendMessage(tabId, {
                            action: 'APPLY_SEMANTIC_CLASSIFICATION',
                            classification,
                            priorityThreshold: Number(message.priorityThreshold) || 9
                        });
                    }
                } catch (error) {
                    console.warn('Semantic focus request failed:', error?.message || error);
                }
            })();
        }
        sendResponse({ success: true });
    }

    if (message.type === 'APPLY_FOCUS_MODE') {
        const tabId = sender?.tab?.id;
        if (tabId) {
            chrome.tabs.sendMessage(tabId, {
                action: 'APPLY_FOCUS_MODE',
                priorityThreshold: Number(message.priorityThreshold) || 9
            });
        }
        sendResponse?.({ success: true });
    }

    if (message.type === 'RESTORE_FOCUS_MODE') {
        const tabId = sender?.tab?.id;
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { action: 'RESTORE_FOCUS_MODE' });
        }
        sendResponse?.({ success: true });
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

    // Handle feature importance request
    if (message.type === 'GET_FEATURE_IMPORTANCE') {
        const importance = cognitiveLoadModel.getFeatureImportance();
        sendResponse({ importance });
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

function parseClassificationResponse(rawText) {
    if (!rawText) return null;
    const cleaned = String(rawText)
        .replace(/```json\s*/gi, '')
        .replace(/```/g, '')
        .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    const jsonText = cleaned.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

function getDefaultPriority(category) {
    switch (category) {
        case 'core_content':
            return 2;
        case 'supporting':
            return 4;
        case 'navigation':
            return 8;
        case 'supplementary':
            return 9;
        case 'noise':
            return 10;
        default:
            return 6;
    }
}

function normalizeClassificationPayload(payload) {
    const result = payload && typeof payload === 'object' ? { ...payload } : {};
    const classifications = Array.isArray(result.classifications) ? result.classifications : [];

    result.classifications = classifications
        .filter((item) => item && typeof item === 'object' && item.element_id)
        .map((item) => {
            const category = String(item.category || 'core_content');
            const priority = Number.isFinite(Number(item.priority))
                ? Number(item.priority)
                : getDefaultPriority(category);

            return {
                element_id: String(item.element_id),
                category,
                confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.5,
                reasoning: String(item.reasoning || '').slice(0, 180),
                hide_in_focus_mode: typeof item.hide_in_focus_mode === 'boolean'
                    ? item.hide_in_focus_mode
                    : ['noise', 'supplementary'].includes(category),
                priority: Math.min(10, Math.max(1, priority))
            };
        });

    if (typeof result.confidence !== 'number') result.confidence = 0.5;
    if (!result.page_type) result.page_type = 'other';
    if (!result.reading_complexity) result.reading_complexity = 'medium';
    if (!result.focus_mode_strategy) {
        result.focus_mode_strategy = 'Hide distracting and non-essential sections first, then progressively reduce navigation if cognitive load remains high.';
    }
    if (typeof result.estimated_core_content_percentage !== 'number') {
        const coreCount = result.classifications.filter((item) => item.category === 'core_content' || item.category === 'supporting').length;
        const total = Math.max(1, result.classifications.length);
        result.estimated_core_content_percentage = Math.round((coreCount / total) * 100);
    }

    return result;
}

async function extractPageStructure(tabId) {
    const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const selectors = [
                'header', 'footer', 'nav', 'main', 'article', 'aside',
                'section', '[role="main"]', '[role="navigation"]',
                '[role="banner"]', '[role="complementary"]',
                '.sidebar', '.ad', '.advertisement', '#comments',
                '.related', '.newsletter', '.popup', '.modal',
                '.cookie', '.banner', '.widget', '.social'
            ];

            const seen = new Set();
            const elements = [];

            const cssEscape = (value) => {
                if (window.CSS && typeof window.CSS.escape === 'function') {
                    return window.CSS.escape(value);
                }
                return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
            };

            const buildSelector = (el) => {
                if (!(el instanceof Element)) return '';
                if (el.id) return `#${cssEscape(el.id)}`;

                const path = [];
                let node = el;
                while (node && node.nodeType === 1 && node !== document.body) {
                    let part = node.tagName.toLowerCase();
                    const parent = node.parentElement;
                    if (!parent) break;
                    const sameTagSiblings = Array.from(parent.children).filter(
                        (child) => child.tagName === node.tagName
                    );
                    if (sameTagSiblings.length > 1) {
                        part += `:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`;
                    }
                    path.unshift(part);
                    node = parent;
                }
                path.unshift('body');
                return path.join(' > ');
            };

            selectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((el, index) => {
                    if (seen.has(el)) return;
                    seen.add(el);

                    const rect = el.getBoundingClientRect();
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220);
                    const selectorId = buildSelector(el) || `${el.tagName.toLowerCase()}-${index}`;

                    elements.push({
                        element_id: selectorId,
                        tag: el.tagName.toLowerCase(),
                        id_attr: el.id || null,
                        classes: el.className || null,
                        text_preview: text,
                        word_count: text ? text.split(/\s+/).length : 0,
                        position: {
                            top: Math.round(rect.top + window.scrollY),
                            left: Math.round(rect.left),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height)
                        },
                        is_visible: rect.width > 0 && rect.height > 0,
                        has_images: el.querySelectorAll('img').length,
                        has_links: el.querySelectorAll('a').length,
                        has_forms: el.querySelectorAll('form,input').length
                    });
                });
            });

            return {
                elements,
                url: window.location.href,
                title: document.title,
                total_word_count: document.body?.innerText ? document.body.innerText.split(/\s+/).length : 0
            };
        }
    });

    return result?.result || null;
}

async function readSemanticClassificationCache() {
    if (semanticClassificationCache && typeof semanticClassificationCache === 'object') {
        return semanticClassificationCache;
    }
    const stored = await getStorageValue(SEMANTIC_CLASSIFICATION_CACHE_KEY);
    semanticClassificationCache = stored && typeof stored === 'object' ? stored : {};
    return semanticClassificationCache;
}

async function writeSemanticClassificationCache(cache) {
    semanticClassificationCache = cache && typeof cache === 'object' ? cache : {};
    await setStorageValue(SEMANTIC_CLASSIFICATION_CACHE_KEY, semanticClassificationCache);
}

async function runSemanticClassification(tabId, options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    const cache = await readSemanticClassificationCache();
    const pageData = await extractPageStructure(tabId);
    if (!pageData?.url) return null;

    const cachedEntry = cache[pageData.url];
    if (!forceRefresh && cachedEntry && (Date.now() - cachedEntry.timestamp) < SEMANTIC_CLASSIFICATION_COOLDOWN_MS) {
        return cachedEntry.result;
    }

    if (!pageData.elements || pageData.elements.length === 0) {
        return null;
    }

    const userMessage = `Classify this webpage for focus mode.

Page title: ${pageData.title}
URL: ${pageData.url}
Total word count: ${pageData.total_word_count}

DOM elements to classify:
${JSON.stringify(pageData.elements, null, 2)}

Remember: return only valid JSON matching the schema.`;

    const data = await callGeminiProxy({
        kind: 'text',
        prompt: `${SEMANTIC_CLASSIFICATION_SYSTEM_PROMPT}\n\n${userMessage}`
    });

    if (data?.error) {
        throw new Error(data.error);
    }

    const parsed = normalizeClassificationPayload(parseClassificationResponse(data?.text));
    if (!parsed) {
        throw new Error('Unable to parse semantic classification response');
    }

    cache[pageData.url] = {
        timestamp: Date.now(),
        result: parsed
    };
    await writeSemanticClassificationCache(cache);

    return parsed;
}

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
// -----------------SCAN MODEL --------------------
async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url:         "offscreen.html",
    reasons:     ["WORKERS"],
    justification: "ONNX phishing model needs WASM",
  });
}
async function checkSafeBrowsing(url) {
  try {
    const res = await fetch('http://localhost:8787/safebrowsing', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (res.ok) {
      return data.isDangerous;
    } else {
      console.error("Safe Browsing API error:", data.error);
      return false;
    }
  } catch(e) {
    console.error("Safe Browsing fetch error:", e);
    return false;
  }
}
async function scanWithModel(url) {
  if (typeof predictURL === "function") {
    try {
      return await predictURL(url);
    } catch (error) {
      console.warn("Direct phishing scan failed, falling back to offscreen:", error);
    }
  }

  await ensureOffscreenDocument();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "PREDICT_URL", url }, (response) => {
      if (response?.success) resolve(response.result);
      else resolve(null);
    });
    // Add to scanWithModel() in background.js — runs in parallel with ML
    // Go to https://console.cloud.google.com → Create a project → Search for "Safe Browsing API" → Enable it → Create credentials → Copy the API key.
  });
}

async function scanAndStore(tabId, url) {
  if (!url || url.startsWith("chrome://")) return null;

  const [result, isGoogleFlagged] = await Promise.all([
    scanWithModel(url),
    checkSafeBrowsing(url),
  ]);

  if (!result) return null;

  const finalResult = { ...result };

  if (isGoogleFlagged) {
    finalResult.decision = "MALICIOUS";
    finalResult.recommended_action = "BLOCK";
    finalResult.confidence = 100;
    finalResult.reason = "Flagged by Google Safe Browsing";
  }

  chrome.storage.local.get(["lastScans"], (storage) => {
    const lastScans = storage?.lastScans && typeof storage.lastScans === "object"
      ? storage.lastScans
      : {};

    lastScans[String(tabId)] = {
      url,
      ...finalResult,
      scannedAt: Date.now(),
    };

    chrome.storage.local.set({
      lastScan: { url, ...finalResult },
      lastScans,
    });
  });

  chrome.tabs.sendMessage(tabId, { type: "PHISHING_RESULT", result: finalResult });
  return finalResult;
}

function cleanupClosedTabScan(tabId) {
  chrome.storage.local.get(["lastScans"], (storage) => {
    const lastScans = storage?.lastScans && typeof storage.lastScans === "object"
      ? storage.lastScans
      : {};

    const tabKey = String(tabId);
    if (!Object.prototype.hasOwnProperty.call(lastScans, tabKey)) return;

    delete lastScans[tabKey];
    chrome.storage.local.set({ lastScans });
  });
}
// ---------------Blocking Website -------------------------------------
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  await scanAndStore(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await scanAndStore(activeInfo.tabId, tab?.url);
  } catch (error) {
    console.warn("Tab activation scan skipped:", error);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupClosedTabScan(tabId);
});
// ```

// ---

// **What changes after this:**
// ```
// kucoidilogin.gitbook.io [testcase aahe hi ek .. like and impressive example]
//   ML model  →  SAFE  (doesn't know the subdomain)
//   Google    →  DANGEROUS ✅  (it's in their database)
//   Final     →  MALICIOUS 100%  ← correct!
