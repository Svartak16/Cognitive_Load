// // content.js

// let logData = {
//     scrollDepth: 0,
//     hoverCount: 0,
//     clickCount: 0,
//     timeOnPage: 0,
//     confusionScore: 0
// };
// let startTime = Date.now();
// let confusionAlertSent = false;

// chrome.runtime.sendMessage({
//     type: "USER_LOG",
//     log: logData
// });

// const handleScroll = () => {
//     let scrolled = window.scrollY + window.innerHeight;
//     let totalHeight = document.body.scrollHeight;
//     logData.scrollDepth = Math.max(logData.scrollDepth, (scrolled / totalHeight) * 100);
// };

// const handleMouseover = () => {
//     logData.hoverCount++;
// };

// const handleClick = () => {
//     logData.clickCount++;
// };

// window.addEventListener("scroll", handleScroll);
// document.addEventListener("mouseover", handleMouseover);
// document.addEventListener("click", handleClick);

// const logInterval = setInterval(() => {
//     logData.timeOnPage = Math.floor((Date.now() - startTime) / 1000);
//     chrome.runtime.sendMessage({
//         type: "USER_LOG",
//         log: logData
//     });
//    if (logData.timeOnPage > 20 && logData.scrollDepth > 15 && !confusionAlertSent) { 
//     confusionAlertSent = true;

//     const userWantsHelp = confirm("Hey! It looks like you're confused. Would you like to open the help chatbot?");
    
//     if (userWantsHelp) {
//         // Tell background to inject the chatbot file
//         chrome.runtime.sendMessage({ type: "INJECT_CHATBOT" });
//     }
// }

// }, 5000);

// window.addEventListener("beforeunload", () => {
//     clearInterval(logInterval);
//     window.removeEventListener("scroll", handleScroll);
//     document.removeEventListener("mouseover", handleMouseover);
//     document.removeEventListener("click", handleClick);
//     chrome.runtime.sendMessage({
//         type: "USER_LOG",
//         log: logData
//     });
// });

// function summarizeText(text) {
//     const sentences = text.match(/[^.!?]+[.!?]/g) || [];
//     if (sentences.length <= 1) return text;
//     const words = text.toLowerCase().match(/\b\w+\b/g) || [];
//     const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were', 'be', 'of', 'in', 'at', 'on', 'with', 'for', 'from', 'to', 'as', 'it', 'its', 'he', 'she', 'they', 'you', 'i', 'we', 'my', 'your', 'his', 'her', 'their', 'our']);
//     const wordFrequency = {};
//     words.forEach(word => {
//         if (!stopWords.has(word)) {
//             wordFrequency[word] = (wordFrequency[word] || 0) + 1;
//         }
//     });
//     const sentenceScores = {};
//     sentences.forEach((sentence, index) => {
//         const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
//         let score = 0;
//         sentenceWords.forEach(word => {
//             if (wordFrequency[word]) {
//                 score += wordFrequency[word];
//             }
//         });
//         sentenceScores[index] = score;
//     });
//     const sortedSentences = Object.keys(sentenceScores).sort((a, b) => sentenceScores[b] - sentenceScores[a]);
//     const summarySentences = sortedSentences.slice(0, Math.min(3, sentences.length));
//     summarySentences.sort((a, b) => a - b);
//     const summary = summarySentences.map(index => sentences[index]).join(' ');
//     return summary.trim();
// }

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.type === "SUMMARIZE_THIS") {
//         const text = message.text;
//         const summary = summarizeText(text);
//         chrome.runtime.sendMessage({
//             type: "SUMMARIZE_RESPONSE",
//             summary: summary
//         });
//     }
// });

// content.js

// ========== EXISTING LOGGING FUNCTIONALITY ==========

let logData = {
    scrollDepth: 0,
    hoverCount: 0,
    clickCount: 0,
    timeOnPage: 0,
    confusionScore: 0,
    mlCognitiveLoad: 0,
    mlLoadLevel: 'unknown',
    // Additional derived UX metrics (additive; does not affect ML logic)
    strain: 45,
    focus: 80,
    clarity: 90,
    website: window.location.hostname
};
let startTime = Date.now();
let confusionAlertSent = false;

chrome.runtime.sendMessage({
    type: "USER_LOG",
    log: logData
});

// ========== ADDITIONAL METRICS TRACKING (ADDITIVE) ==========
// This section integrates extra features (rage clicks, thrashing, errors, attention density)
// without changing how cognitive load is currently detected (ML score + threshold).

let sidebar = null;
let actionLogs = [];

const clickHistory = new Map(); // key -> timestamps[] (rage clicks)
let rageEventTimes = [];
let thrashEventTimes = [];
let errorEventTimes = [];
let actionCount = 0;
let hoverStart = new Map();
const hoverToClickTimes = [];
let attentionInArea = 0, attentionTotal = 0;
let mouseMovements = []; // {x,y,t}
let mouseSpeedWindow = []; // {speed,t}
let clickPath = []; // click positions for scanpath efficiency
let firstActionTime = null;
let backtrackCount = 0;
let lastClickedLinkTime = 0;
let mutationObserver = null;

function getElementKey(el) {
    if (!el) return 'null';
    const parts = [el.tagName, el.id || '', el.className || ''];
    return parts.join('|').slice(0, 200);
}

function isInImportantZone(x, y) {
    const selectors = ['main', 'article', 'form', '.primary', '#main', '.hero', '.product', '.content'];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
            const r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
    }
    return false;
}

function computeDerivedMetrics() {
    const now = Date.now();

    const since60s = (arr) => arr.filter(ts => now - ts <= 60000).length;
    const rage = since60s(rageEventTimes);
    const thrash = since60s(thrashEventTimes);
    const errs = since60s(errorEventTimes);

    const rageScore = Math.min(1, rage / 4);
    const thrashScore = Math.min(1, thrash / 4);
    const errorScore = Math.min(1, (errs / Math.max(1, Math.floor(actionCount || 1))));
    const strainValue = Math.round(100 * (0.45 * rageScore + 0.35 * thrashScore + 0.2 * errorScore));

    const avgHoverToClick = hoverToClickTimes.length
        ? (hoverToClickTimes.reduce((a, b) => a + b, 0) / hoverToClickTimes.length)
        : 9999;
    const hoverScore = Math.max(0, Math.min(1, 1 - (avgHoverToClick / 3000)));
    const attentionScore = attentionTotal ? (attentionInArea / attentionTotal) : 0.5;

    let pathEff = 0.6;
    if (clickPath.length >= 2) {
        const a = clickPath[0];
        const b = clickPath[clickPath.length - 1];
        const direct = Math.hypot(b.x - a.x, b.y - a.y);
        let pathLen = 0;
        for (let i = 1; i < clickPath.length; i++) {
            pathLen += Math.hypot(
                clickPath[i].x - clickPath[i - 1].x,
                clickPath[i].y - clickPath[i - 1].y
            );
        }
        pathEff = pathLen > 0 ? Math.max(0, Math.min(1, direct / pathLen)) : 1;
    }
    const focusValue = Math.round(100 * (0.45 * hoverScore + 0.35 * attentionScore + 0.2 * pathEff));

    const tfa = firstActionTime !== null ? firstActionTime : Math.floor((now - startTime) / 1000);
    const tfaScore = Math.max(0, Math.min(1, 1 - (tfa / 20)));
    const backtrackScore = Math.max(0, Math.min(1, 1 - (backtrackCount / 3)));

    let stationaryBad = 0;
    for (let i = 0; i < mouseMovements.length - 5; i++) {
        const a = mouseMovements[i];
        const b = mouseMovements[i + 5];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const dt = b.t - a.t;
        if (dt > 3500 && dist < 25) stationaryBad++;
    }
    const readingPenalty = Math.max(0, Math.min(1, stationaryBad / 4));
    const clarityValue = Math.round(100 * (0.6 * tfaScore + 0.3 * backtrackScore - 0.3 * readingPenalty));

    logData.strain = Math.max(0, Math.min(100, strainValue));
    logData.focus = Math.max(0, Math.min(100, focusValue));
    logData.clarity = Math.max(0, Math.min(100, clarityValue));

    const sr = document.querySelector('.strain-ring');
    if (sr) { sr.textContent = `${logData.strain}%`; sr.setAttribute('title', `Strain: ${logData.strain}%`); }
    const fr = document.querySelector('.focus-ring');
    if (fr) { fr.textContent = `${logData.focus}%`; fr.setAttribute('title', `Focus: ${logData.focus}%`); }
    const cr = document.querySelector('.clarity-ring');
    if (cr) { cr.textContent = `${logData.clarity}%`; cr.setAttribute('title', `Clarity: ${logData.clarity}%`); }

    const cleanupCutoff = now - 5 * 60000;
    rageEventTimes = rageEventTimes.filter(t => t >= cleanupCutoff);
    thrashEventTimes = thrashEventTimes.filter(t => t >= cleanupCutoff);
    errorEventTimes = errorEventTimes.filter(t => t >= cleanupCutoff);
    if (clickPath.length > 50) clickPath = clickPath.slice(-50);
    if (hoverToClickTimes.length > 200) hoverToClickTimes.splice(0, hoverToClickTimes.length - 200);
}

const derivedMetricsInterval = setInterval(computeDerivedMetrics, 2500);

const onDocClickDerived = (e) => {
    if (sidebar && sidebar.contains(e.target)) return;

    actionCount++;
    const now = Date.now();

    const key = getElementKey(e.target);
    const arr = clickHistory.get(key) || [];
    arr.push(now);
    const recent = arr.filter(t => now - t <= 3000);
    clickHistory.set(key, recent);
    if (recent.length >= 3) { rageEventTimes.push(now); clickHistory.set(key, []); }

    if (hoverStart.has(key)) {
        hoverToClickTimes.push(now - hoverStart.get(key));
        hoverStart.delete(key);
    }

    clickPath.push({ x: e.clientX, y: e.clientY, t: now });
    if (firstActionTime === null) firstActionTime = Math.floor((now - startTime) / 1000);

    if (e.target?.closest && e.target.closest('a')) {
        lastClickedLinkTime = now;
    }

    const elementName =
        e.target?.innerText?.trim()?.split('\n')?.[0]?.substring(0, 20) ||
        e.target?.ariaLabel ||
        e.target?.getAttribute?.('placeholder') ||
        e.target?.tagName ||
        'UNKNOWN';
    const logMessage = `Clicked: "${elementName}" at ${new Date().toLocaleTimeString()}`;
    actionLogs.push({ time: new Date().toLocaleString(), action: logMessage });
};

const onMouseOverDerived = (e) => {
    if (sidebar && sidebar.contains(e.target)) return;
    const key = getElementKey(e.target);
    hoverStart.set(key, Date.now());
};

const onMouseMoveDerived = (e) => {
    const now = Date.now();
    mouseMovements.push({ x: e.clientX, y: e.clientY, t: now });
    while (mouseMovements.length && now - mouseMovements[0].t > 10000) mouseMovements.shift();

    if (mouseMovements.length >= 2) {
        const a = mouseMovements[mouseMovements.length - 2];
        const b = mouseMovements[mouseMovements.length - 1];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const dt = Math.max(1, b.t - a.t);
        const speed = dist / (dt / 1000);
        mouseSpeedWindow.push({ speed, t: now });
        while (mouseSpeedWindow.length && now - mouseSpeedWindow[0].t > 2000) mouseSpeedWindow.shift();

        const avg = mouseSpeedWindow.reduce((s, p) => s + p.speed, 0) / Math.max(1, mouseSpeedWindow.length);
        if (avg > 1800) { thrashEventTimes.push(now); mouseSpeedWindow = []; }
    }

    attentionTotal++;
    if (isInImportantZone(e.clientX, e.clientY)) attentionInArea++;
};

const onInvalidDerived = () => { errorEventTimes.push(Date.now()); };

document.addEventListener('click', onDocClickDerived, true);
document.addEventListener('mouseover', onMouseOverDerived, true);
document.addEventListener('mousemove', onMouseMoveDerived, { passive: true });
document.addEventListener('invalid', onInvalidDerived, true);

try {
    mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of (m.addedNodes || [])) {
                try {
                    if (!(node instanceof HTMLElement)) continue;
                    const txt = (node.textContent || '').toLowerCase();
                    const cls = (node.className || '').toLowerCase();
                    if (
                        txt.includes('error') ||
                        txt.includes('invalid') ||
                        cls.includes('error') ||
                        (node.getAttribute && node.getAttribute('role') === 'alert')
                    ) {
                        errorEventTimes.push(Date.now());
                    }
                } catch { /* ignore */ }
            }
        }
    });
    const observeTarget = document.body || document.documentElement;
    if (observeTarget) mutationObserver.observe(observeTarget, { childList: true, subtree: true });
} catch { /* ignore */ }

const onPopStateDerived = () => {
    const now = Date.now();
    if (lastClickedLinkTime && now - lastClickedLinkTime < 5000) backtrackCount++;
};
window.addEventListener('popstate', onPopStateDerived);

// ========== SIDEBAR UI + REPORTING (ADDITIVE) ==========

let sidebarStylesInjected = false;
let focusModeActive = false;

function ensureSidebarStyles() {
    if (sidebarStylesInjected) return;
    sidebarStylesInjected = true;

    const style = document.createElement('style');
    style.id = 'cognitive-load-sidebar-styles';
    style.textContent = `
        #premium-sidebar-container {
            position: fixed;
            top: 0;
            right: 0;
            width: 380px;
            height: 100vh;
            background: #0b1220;
            color: #e5e7eb;
            z-index: 2147483646;
            transform: translateX(110%);
            transition: transform 220ms ease;
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            box-shadow: -14px 0 30px rgba(2,6,23,0.45);
            border-left: 1px solid rgba(148,163,184,0.18);
            display: flex;
            flex-direction: column;
        }
        #premium-sidebar-container.active { transform: translateX(0); }

        .sidebar-header { padding: 14px 14px; border-bottom: 1px solid rgba(148,163,184,0.18); display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .header-left { display:flex; align-items:center; gap:10px; }
        .logo-mark { width: 36px; height: 36px; border-radius: 12px; display:flex; align-items:center; justify-content:center; background: rgba(99,102,241,0.18); }
        .app-title { display:block; font-size: 14px; letter-spacing: 0.2px; }
        .app-sub { font-size: 11px; color: rgba(229,231,235,0.75); margin-top: 2px; }
        .close-btn { background: transparent; border: 1px solid rgba(148,163,184,0.25); color: #e5e7eb; border-radius: 10px; padding: 6px 10px; cursor:pointer; }
        .close-btn:hover { background: rgba(148,163,184,0.12); }

        .sidebar-content { padding: 14px; overflow: auto; flex: 1; display:flex; flex-direction: column; gap: 12px; }
        .white-panel { background: rgba(255,255,255,0.06); border: 1px solid rgba(148,163,184,0.16); border-radius: 14px; padding: 12px; }

        .metrics-row { display:flex; gap: 10px; justify-content: space-between; }
        .metric { flex: 1; text-align:center; }
        .metric-circle { width: 74px; height: 74px; border-radius: 999px; margin: 0 auto 6px; display:flex; align-items:center; justify-content:center; font-weight: 800; font-size: 15px; color: #0b1220; background: linear-gradient(135deg,#a5b4fc,#22d3ee); box-shadow: 0 12px 24px rgba(34,211,238,0.16); }
        .metric-label { font-size: 11px; color: rgba(229,231,235,0.85); letter-spacing: 0.6px; }

        .chart-shell { height: 150px; }
        #activityChart { width: 100%; height: 150px; display:block; }

        .sidebar-terminal { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 11px; line-height: 1.45; background: rgba(2,6,23,0.55); border: 1px solid rgba(148,163,184,0.14); border-radius: 12px; padding: 10px; color: rgba(226,232,240,0.9); max-height: 140px; overflow:auto; }

        .btn { border: 1px solid rgba(148,163,184,0.18); background: rgba(255,255,255,0.06); color: #e5e7eb; border-radius: 12px; padding: 10px 12px; cursor:pointer; font-weight: 700; font-size: 12px; }
        .btn:hover { background: rgba(255,255,255,0.10); }
        .btn-primary { background: linear-gradient(90deg,#6366f1,#8b5cf6); border: none; }
        .btn-primary:hover { filter: brightness(1.04); }
        .btn-success { background: linear-gradient(90deg,#10b981,#22c55e); border: none; color: #071017; }
        .btn-success:hover { filter: brightness(1.04); }
        .btn-ghost { background: transparent; }

        .footer-btn { width: 100%; }
        .footer-action-row { display:flex; gap: 10px; }
        .sidebar-footer { padding: 14px; border-top: 1px solid rgba(148,163,184,0.18); display:flex; flex-direction: column; gap: 10px; }

        .sticky-palette { position: relative; }
        .sticky-palette-header { display:flex; align-items:center; justify-content:space-between; font-weight: 800; font-size: 12px; margin-bottom: 8px; }
        .tiny-btn { border: 1px solid rgba(148,163,184,0.18); background: rgba(255,255,255,0.06); color: #e5e7eb; border-radius: 10px; padding: 4px 8px; cursor:pointer; }
        .swatches { display:grid; grid-template-columns: repeat(8, 1fr); gap: 6px; margin: 8px 0 10px; }
        .swatch { height: 20px; border-radius: 8px; border: 1px solid rgba(15,23,42,0.18); cursor:pointer; }
        .swatch.selected { outline: 2px solid rgba(99,102,241,0.9); }

        .sticky-note { width: 260px; background: var(--sticky-bg, #fffaf0); color: #0b1220; border-radius: 14px; border: 1px solid rgba(15,23,42,0.12); padding: 10px; box-shadow: 0 20px 40px rgba(2,6,23,0.20); }
        .sticky-header { display:flex; align-items:center; justify-content: space-between; gap: 8px; cursor: grab; }
        .sticky-title { font-weight: 800; font-size: 12px; }
        .sticky-input { width: 100%; height: 84px; margin-top: 8px; border-radius: 10px; border: 1px solid rgba(15,23,42,0.12); padding: 8px; resize: vertical; font-family: inherit; }
    `;
    document.head.appendChild(style);
}

function appendToTerminal(line) {
    const term = document.getElementById('sidebar-terminal');
    if (!term) return;
    term.innerHTML += `<br>> ${line}`;
    term.scrollTop = term.scrollHeight;
}

function renderChartCanvas() {
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size fix for high-DPI
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 150;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h);

    const labels = ['Time (s)', 'Clicks', 'Hovers'];
    const values = [logData.timeOnPage || 0, logData.clickCount || 0, logData.hoverCount || 0];
    const maxV = Math.max(10, ...values);

    const padding = 14;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2 - 16;
    const barW = chartW / labels.length - 12;
    const colors = ['#60a5fa', '#fb7185', '#fbbf24'];

    // axis
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartH);
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.stroke();

    // bars + labels
    ctx.font = '11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial';
    ctx.textAlign = 'center';
    labels.forEach((lab, i) => {
        const v = values[i];
        const x = padding + i * (barW + 12) + barW / 2 + 6;
        const barH = Math.max(2, (v / maxV) * chartH);
        const y = padding + chartH - barH;

        ctx.fillStyle = colors[i];
        ctx.fillRect(x - barW / 2, y, barW, barH);

        ctx.fillStyle = 'rgba(226,232,240,0.92)';
        ctx.fillText(String(v), x, y - 4);
        ctx.fillStyle = 'rgba(226,232,240,0.75)';
        ctx.fillText(lab, x, padding + chartH + 14);
    });
}

function updateSidebarUI() {
    renderChartCanvas();
    const sr = document.querySelector('.strain-ring');
    if (sr) sr.textContent = `${logData.strain}%`;
    const fr = document.querySelector('.focus-ring');
    if (fr) fr.textContent = `${logData.focus}%`;
    const cr = document.querySelector('.clarity-ring');
    if (cr) cr.textContent = `${logData.clarity}%`;
}

function createSidebar() {
    ensureSidebarStyles();
    if (sidebar) return;

    sidebar = document.createElement('div');
    sidebar.id = 'premium-sidebar-container';
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <div class="header-left">
                <div class="logo-mark">🔬</div>
                <div>
                    <strong class="app-title">Cognitive Load Engine</strong>
                    <div class="app-sub">Interaction insights & visual audits</div>
                </div>
            </div>
            <button id="close-sidebar" class="close-btn" aria-label="Close sidebar">✕</button>
        </div>

        <div class="sidebar-content">
            <div class="metrics-row">
                <div class="metric">
                    <div class="metric-circle strain-ring">${logData.strain}%</div>
                    <small class="metric-label">STRAIN</small>
                </div>
                <div class="metric">
                    <div class="metric-circle focus-ring">${logData.focus}%</div>
                    <small class="metric-label">FOCUS</small>
                </div>
                <div class="metric">
                    <div class="metric-circle clarity-ring">${logData.clarity}%</div>
                    <small class="metric-label">CLARITY</small>
                </div>
            </div>

            <div class="white-panel chart-shell">
                <canvas id="activityChart"></canvas>
            </div>

            <div id="sidebar-terminal" class="sidebar-terminal">> ENGINE ONLINE...</div>

            <div class="white-panel">
                <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
                    <button id="start-capture" class="btn btn-ghost" title="Capture selection">Capture Area</button>
                    <button id="add-sticky-btn" class="btn btn-ghost" title="Add Sticky Note">Add Note</button>
                </div>

                <div id="sticky-palette" class="sticky-palette" style="display:none; margin-top: 10px;">
                    <div class="sticky-palette-header">Sticky Notes <button id="close-sticky-palette" class="tiny-btn">✕</button></div>
                    <div class="swatches" role="list">
                        <button class="swatch selected" data-color="#fffaf0" style="background:#fffaf0" title="Yellow"></button>
                        <button class="swatch" data-color="#fef3c7" style="background:#fef3c7" title="Warm Yellow"></button>
                        <button class="swatch" data-color="#fce7f3" style="background:#fce7f3" title="Pink"></button>
                        <button class="swatch" data-color="#ede9fe" style="background:#ede9fe" title="Lavender"></button>
                        <button class="swatch" data-color="#dff6ff" style="background:#dff6ff" title="Sky"></button>
                        <button class="swatch" data-color="#d1fae5" style="background:#d1fae5" title="Mint"></button>
                        <button class="swatch" data-color="#ffe4dd" style="background:#ffe4dd" title="Peach"></button>
                        <button class="swatch" data-color="#fef2f2" style="background:#fef2f2" title="Light"></button>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="create-sticky-btn" class="btn btn-success" style="flex:1;">Add Note</button>
                        <button id="cancel-sticky-palette" class="btn btn-ghost" style="flex:1;">Cancel</button>
                    </div>
                </div>
            </div>

            <div class="white-panel">
                <div style="font-weight: 900; font-size: 12px; margin-bottom: 8px;">AI Explanation</div>
                <img id="capture-preview" style="display:none; width:100%; border-radius: 12px; border: 1px solid rgba(148,163,184,0.16); margin-bottom: 8px;" />
                <div id="ai-text" style="font-size: 12px; color: rgba(226,232,240,0.9); white-space: pre-wrap;">Capture an area or add a sticky note...</div>
            </div>
        </div>

        <div class="sidebar-footer">
            <div class="footer-action-row">
                <button id="ai-code-btn" class="btn btn-primary footer-btn" title="Open AI Chat">Chatbot</button>
                <button id="focus-mode-btn" class="btn footer-btn" title="Toggle Focus Mode">Focus Mode</button>
            </div>
            <button id="download-report" class="btn btn-success" title="Download report">Download Report</button>
        </div>
    `;

    document.body.appendChild(sidebar);
    updateSidebarUI();

    const closeBtn = document.getElementById('close-sidebar');
    if (closeBtn) closeBtn.onclick = () => sidebar.classList.remove('active');

    const captureBtn = document.getElementById('start-capture');
    if (captureBtn) captureBtn.onclick = () => {
        sidebar.classList.remove('active');
        chrome.runtime.sendMessage({ action: "INIT_OVERLAY" });
        appendToTerminal('Overlay capture initialized');
    };

    const addStickyBtn = document.getElementById('add-sticky-btn');
    if (addStickyBtn) addStickyBtn.onclick = () => {
        const palette = document.getElementById('sticky-palette');
        if (!palette) return;
        palette.style.display = (palette.style.display === 'block') ? 'none' : 'block';
    };

    (function configureStickyPalette() {
        const palette = document.getElementById('sticky-palette');
        if (!palette) return;
        const swatches = palette.querySelectorAll('.swatch');
        let selectedStickyColor = '#fffaf0';
        swatches.forEach(s => {
            s.onclick = () => {
                swatches.forEach(x => x.classList.remove('selected'));
                s.classList.add('selected');
                selectedStickyColor = s.dataset.color;
            };
        });
        const createBtn = document.getElementById('create-sticky-btn');
        if (createBtn) createBtn.onclick = () => {
            palette.style.display = 'none';
            createDraggableNote(selectedStickyColor);
        };
        const cancelBtn = document.getElementById('cancel-sticky-palette');
        if (cancelBtn) cancelBtn.onclick = () => palette.style.display = 'none';
        const closePaletteBtn = document.getElementById('close-sticky-palette');
        if (closePaletteBtn) closePaletteBtn.onclick = () => palette.style.display = 'none';
    })();

    const chatbotBtn = document.getElementById('ai-code-btn');
    if (chatbotBtn) chatbotBtn.onclick = () => {
        // Reuse existing extension flow (background executes `chatbot.js`)
        chrome.runtime.sendMessage({ type: "INJECT_CHATBOT" });
        appendToTerminal('Chatbot requested');
    };

    const focusBtn = document.getElementById('focus-mode-btn');
    if (focusBtn) focusBtn.onclick = () => toggleFocusMode();

    const downloadBtn = document.getElementById('download-report');
    if (downloadBtn) downloadBtn.onclick = () => downloadReport();
}

// --- Sticky Note Logic ---
function createDraggableNote(color = '#fffaf0') {
    const note = document.createElement('div');
    note.id = `sticky-note-${Date.now()}`;
    note.className = 'sticky-note';
    note.style.cssText = `position: fixed; top: 150px; left: 150px; z-index: 2147483647;`;
    note.style.setProperty('--sticky-bg', color);

    note.innerHTML = `
        <div id="note-header" class="sticky-header">
            <div style="display:flex; align-items:center; gap:8px;">
                <div>📌</div>
                <div class="sticky-title">Observation</div>
            </div>
            <div><button id="close-note" class="tiny-btn" aria-label="Close note">✕</button></div>
        </div>
        <textarea id="note-input" class="sticky-input" placeholder="Type your observation..."></textarea>
        <div style="display:flex; gap:10px; margin-top:10px;">
            <button id="save-note-to-report" class="btn btn-success" style="flex:1;">Save to Audit</button>
        </div>
    `;

    document.body.appendChild(note);

    let isDragging = false;
    let offsetX = 0, offsetY = 0;
    const header = note.querySelector('#note-header');
    if (header) {
        header.onmousedown = (e) => {
            isDragging = true;
            header.style.cursor = 'grabbing';
            offsetX = e.clientX - note.offsetLeft;
            offsetY = e.clientY - note.offsetTop;
        };
    }
    const onMove = (e) => {
        if (!isDragging) return;
        note.style.left = (e.clientX - offsetX) + 'px';
        note.style.top = (e.clientY - offsetY) + 'px';
    };
    const onUp = () => {
        isDragging = false;
        if (header) header.style.cursor = 'grab';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    const closeBtn = note.querySelector('#close-note');
    if (closeBtn) closeBtn.onclick = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        note.remove();
    };

    const saveBtn = note.querySelector('#save-note-to-report');
    if (saveBtn) saveBtn.onclick = () => {
        const text = note.querySelector('#note-input')?.value || '';

        // Anchor note to page coordinates for the screenshot
        const rect = note.getBoundingClientRect();
        note.style.position = 'absolute';
        note.style.top = (rect.top + window.scrollY) + 'px';
        note.style.left = (rect.left + window.scrollX) + 'px';
        note.style.right = 'auto';
        note.dataset.saved = '1';

        // Hide header/button for cleaner capture
        if (header) header.style.display = 'none';
        saveBtn.style.display = 'none';

        if (sidebar) sidebar.style.display = 'none';
        setTimeout(() => {
            chrome.runtime.sendMessage(
                { action: "CAPTURE_VISIBLE_TAB", noteContent: text },
                () => {
                    if (sidebar) {
                        sidebar.style.display = '';
                        sidebar.classList.add('active');
                    }
                    appendToTerminal('Screenshot captured with sticky note');
                }
            );
        }, 100);
    };
}

// --- Focus Mode ---
function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    if (focusModeActive) {
        applyFocusMode();
        const btn = document.getElementById('focus-mode-btn');
        if (btn) btn.textContent = 'Exit Focus';
        appendToTerminal('Focus Mode enabled');
    } else {
        removeFocusMode();
        const btn = document.getElementById('focus-mode-btn');
        if (btn) btn.textContent = 'Focus Mode';
        appendToTerminal('Focus Mode disabled');
    }
}

function applyFocusMode() {
    const clutterTags = ['aside', 'footer', 'nav'];
    const clutterPatterns = ['ad', 'sidebar', 'social', 'popup', 'banner', 'promo'];

    clutterTags.forEach(tag => {
        document.querySelectorAll(tag).forEach(el => {
            el.dataset._origDisplay = el.style.display || '';
            el.style.display = 'none';
            el.classList.add('clutter-hidden');
        });
    });

    document.querySelectorAll('div, section, header').forEach(el => {
        const idOrClass = (el.id + ' ' + el.className).toLowerCase();
        if (clutterPatterns.some(p => idOrClass.includes(p))) {
            el.dataset._origOpacity = el.style.opacity || '';
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            el.style.height = '0';
            el.classList.add('clutter-hidden');
        }
    });

    if (!document.getElementById('sidebar-focus-style')) {
        const style = document.createElement('style');
        style.id = 'sidebar-focus-style';
        style.textContent = `
            body { line-height: 1.65 !important; background: #f7f7f8 !important; }
            section, article { max-width: 900px !important; margin: 2rem auto !important; padding: 1.5rem !important; }
            nav, footer { display: none !important; }
            * { animation: none !important; transition: none !important; }
        `;
        document.head.appendChild(style);
    }
}

function removeFocusMode() {
    const fs = document.getElementById('sidebar-focus-style');
    if (fs) fs.remove();

    document.querySelectorAll('.clutter-hidden').forEach(el => {
        if (el.dataset._origDisplay !== undefined) el.style.display = el.dataset._origDisplay;
        if (el.dataset._origOpacity !== undefined) el.style.opacity = el.dataset._origOpacity;
        el.style.pointerEvents = '';
        el.style.height = '';
        el.classList.remove('clutter-hidden');
        delete el.dataset._origDisplay;
        delete el.dataset._origOpacity;
    });
}

// --- Report download (HTML fallback; PDF if jsPDF exists on page) ---
function downloadBlob(filename, mime, content) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadReport() {
    const now = new Date();
    chrome.runtime.sendMessage({ action: "GET_REPORT_DATA" }, (response) => {
        const stickyNotes = response?.data || [];

        // If jsPDF is present in the page context (rare), use it
        if (window.jspdf?.jsPDF) {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                doc.setFontSize(16);
                doc.text("COGNITIVE LOAD ENGINE - AUDIT REPORT", 14, 18);
                doc.setFontSize(10);
                doc.text(`Target Website: ${logData.website}`, 14, 26);
                doc.text(`Generated: ${now.toLocaleString()}`, 14, 32);
                doc.text(`Time: ${logData.timeOnPage}s  Clicks: ${logData.clickCount}  Hovers: ${logData.hoverCount}`, 14, 40);
                doc.text(`Strain: ${logData.strain}%  Focus: ${logData.focus}%  Clarity: ${logData.clarity}%`, 14, 46);
                doc.addPage();
                doc.setFontSize(12);
                doc.text("Sticky Note Observations", 14, 18);
                let y = 28;
                stickyNotes.forEach((note, idx) => {
                    if (y > 260) { doc.addPage(); y = 18; }
                    doc.setFontSize(10);
                    doc.text(`Observation #${idx + 1}: ${note.comment || ''}`.slice(0, 140), 14, y);
                    y += 8;
                });
                doc.save(`Audit_Report_${now.getTime()}.pdf`);
                appendToTerminal('Downloaded PDF report');
                return;
            } catch (e) {
                // Fall through to HTML
                appendToTerminal('PDF unavailable, downloading HTML report');
            }
        }

        // HTML fallback: includes screenshots and notes
        const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));

        const entries = stickyNotes.map((n, i) => `
            <div class="entry">
                <h3>Observation #${i + 1}</h3>
                <p>${esc(n.comment)}</p>
                ${n.screenshot ? `<img src="${n.screenshot}" alt="screenshot" />` : `<div class="missing">No screenshot</div>`}
                <div class="meta">${esc(n.timestamp || '')}</div>
            </div>
        `).join('\n');

        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Audit Report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial; margin: 24px; color: #0f172a; }
    .hero { padding: 16px 18px; border-radius: 14px; background: #0b1220; color: #e5e7eb; }
    .grid { display:flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .pill { background: rgba(255,255,255,0.10); border: 1px solid rgba(148,163,184,0.25); padding: 8px 10px; border-radius: 999px; font-weight: 800; font-size: 12px; }
    .entry { margin-top: 16px; padding: 14px; border: 1px solid rgba(15,23,42,0.12); border-radius: 14px; }
    .entry img { width: 100%; max-width: 980px; border-radius: 12px; border: 1px solid rgba(15,23,42,0.12); margin-top: 10px; }
    .meta { margin-top: 8px; font-size: 12px; color: rgba(15,23,42,0.65); }
    .missing { margin-top: 10px; font-size: 12px; color: rgba(15,23,42,0.6); }
  </style>
</head>
<body>
  <div class="hero">
    <h2 style="margin:0 0 6px 0;">Cognitive Load Engine - Audit Report</h2>
    <div style="opacity:0.85; font-size: 12px;">Target: ${esc(logData.website)} • Generated: ${esc(now.toLocaleString())}</div>
    <div class="grid">
      <div class="pill">Time: ${esc(logData.timeOnPage)}s</div>
      <div class="pill">Clicks: ${esc(logData.clickCount)}</div>
      <div class="pill">Hovers: ${esc(logData.hoverCount)}</div>
      <div class="pill">Strain: ${esc(logData.strain)}%</div>
      <div class="pill">Focus: ${esc(logData.focus)}%</div>
      <div class="pill">Clarity: ${esc(logData.clarity)}%</div>
    </div>
  </div>

  ${stickyNotes.length ? `<h2 style="margin-top: 18px;">Sticky Notes</h2>` : `<p style="margin-top: 18px;">No sticky notes captured yet.</p>`}
  ${entries}
</body>
</html>`;

        downloadBlob(`Audit_Report_${now.getTime()}.html`, 'text/html', html);
        appendToTerminal('Downloaded HTML report');
    });
}

// Keep sidebar chart in sync while open
const sidebarSyncInterval = setInterval(() => {
    if (sidebar && sidebar.classList.contains('active')) updateSidebarUI();
}, 1000);


const handleScroll = () => {
    let scrolled = window.scrollY + window.innerHeight;
    let totalHeight = document.body.scrollHeight;
    logData.scrollDepth = Math.max(logData.scrollDepth, (scrolled / totalHeight) * 100);
};

const handleMouseover = () => {
    logData.hoverCount++;
};

const handleClick = () => {
    logData.clickCount++;
};

window.addEventListener("scroll", handleScroll);
document.addEventListener("mouseover", handleMouseover);
document.addEventListener("click", handleClick);

const safeSendMessage = (payload) => {
    try {
        if (chrome?.runtime?.id) {
            chrome.runtime.sendMessage(payload);
        }
    } catch (err) {
        console.warn('sendMessage failed (extension may be reloading)', err);
        // Stop the interval to avoid spamming errors if the context is invalidated.
        if (logInterval) {
            clearInterval(logInterval);
        }
    }
};

const logInterval = setInterval(() => {
    logData.timeOnPage = Math.floor((Date.now() - startTime) / 1000);
    
    // Get ML cognitive load score if available
    if (window.mlDetector) {
        logData.mlCognitiveLoad = window.mlDetector.getCurrentScore();
        logData.mlLoadLevel = window.mlDetector.getLoadLevel(logData.mlCognitiveLoad);
    }
    
    safeSendMessage({
        type: "USER_LOG",
        log: logData
    });

}, 5000);

window.addEventListener("beforeunload", () => {
    clearInterval(logInterval);
    clearInterval(derivedMetricsInterval);
    clearInterval(sidebarSyncInterval);
    window.removeEventListener("scroll", handleScroll);
    document.removeEventListener("mouseover", handleMouseover);
    document.removeEventListener("click", handleClick);
    document.removeEventListener('click', onDocClickDerived, true);
    document.removeEventListener('mouseover', onMouseOverDerived, true);
    document.removeEventListener('mousemove', onMouseMoveDerived, false);
    document.removeEventListener('invalid', onInvalidDerived, true);
    window.removeEventListener('popstate', onPopStateDerived);
    if (mutationObserver) {
        try { mutationObserver.disconnect(); } catch { /* ignore */ }
        mutationObserver = null;
    }
    
    // Stop ML detector if running
    if (window.mlDetector) {
        window.mlDetector.stopDetection();
    }
    
    safeSendMessage({
        type: "USER_LOG",
        log: logData
    });
});

// ========== SUMMARIZATION FUNCTIONALITY ==========

function summarizeText(text) {
    const sentences = text.match(/[^.!?]+[.!?]/g) || [];
    if (sentences.length <= 1) return text;
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were', 'be', 'of', 'in', 'at', 'on', 'with', 'for', 'from', 'to', 'as', 'it', 'its', 'he', 'she', 'they', 'you', 'i', 'we', 'my', 'your', 'his', 'her', 'their', 'our']);
    const wordFrequency = {};
    words.forEach(word => {
        if (!stopWords.has(word)) {
            wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        }
    });
    const sentenceScores = {};
    sentences.forEach((sentence, index) => {
        const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
        let score = 0;
        sentenceWords.forEach(word => {
            if (wordFrequency[word]) {
                score += wordFrequency[word];
            }
        });
        sentenceScores[index] = score;
    });
    const sortedSentences = Object.keys(sentenceScores).sort((a, b) => sentenceScores[b] - sentenceScores[a]);
    const summarySentences = sortedSentences.slice(0, Math.min(3, sentences.length));
    summarySentences.sort((a, b) => a - b);
    const summary = summarySentences.map(index => sentences[index]).join(' ');
    return summary.trim();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SUMMARIZE_THIS") {
        const text = message.text;
        const summary = summarizeText(text);
        chrome.runtime.sendMessage({
            type: "SUMMARIZE_RESPONSE",
            summary: summary
        });
    }
});

// ========== SIDEBAR / CAPTURE MESSAGE HANDLERS (ADDITIVE) ==========
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === "toggle_sidebar") {
        if (!sidebar) createSidebar();
        sidebar.classList.toggle('active');
        if (sidebar.classList.contains('active')) {
            updateSidebarUI();
            appendToTerminal('Sidebar opened');
        }
    }

    if (msg?.action === "DISPLAY_CAPTURE") {
        if (!sidebar) createSidebar();
        sidebar.classList.add('active');
        const img = document.getElementById('capture-preview');
        if (img) {
            img.src = msg.image;
            img.style.display = 'block';
        }
        const aiText = document.getElementById('ai-text');
        if (aiText) aiText.textContent = "AI is analyzing image...";
        appendToTerminal('Capture received');
    }

    if (msg?.action === "AI_RESULT") {
        const aiText = document.getElementById('ai-text');
        if (aiText) aiText.textContent = msg.text || '';
        appendToTerminal('AI result received');
    }
});

// ========== ML DETECTOR INTEGRATION ==========

// The ML detector (ml-detector.js) is loaded before this file via manifest.json
// It automatically starts detection and is available as window.mlDetector

// Add keyboard shortcut to manually provide feedback
document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+F (or Cmd+Shift+F on Mac) to provide feedback
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        provideFeedbackDialog();
    }
});

function provideFeedbackDialog() {
    // Create a custom dialog for feedback
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 15px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        min-width: 350px;
    `;
    
    dialog.innerHTML = `
        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #333;">
            How difficult is this content?
        </h2>
        <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
            Your feedback helps improve the AI detection system.
        </p>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <button class="feedback-btn" data-difficulty="easy" style="
                flex: 1;
                padding: 15px;
                border: 2px solid #10b981;
                background: #f0fdf4;
                color: #10b981;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            ">
                😊 Easy
            </button>
            <button class="feedback-btn" data-difficulty="medium" style="
                flex: 1;
                padding: 15px;
                border: 2px solid #f59e0b;
                background: #fffbeb;
                color: #f59e0b;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            ">
                😐 Medium
            </button>
            <button class="feedback-btn" data-difficulty="hard" style="
                flex: 1;
                padding: 15px;
                border: 2px solid #ef4444;
                background: #fef2f2;
                color: #ef4444;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            ">
                😓 Hard
            </button>
        </div>
        <button id="cancel-feedback" style="
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            background: white;
            color: #666;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        ">
            Cancel
        </button>
    `;
    
    // Add overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9999999;
        backdrop-filter: blur(4px);
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
    
    // Handle feedback buttons
    dialog.querySelectorAll('.feedback-btn').forEach(btn => {
        btn.addEventListener('mouseenter', (e) => {
            e.target.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', (e) => {
            e.target.style.transform = 'scale(1)';
        });
        btn.addEventListener('click', (e) => {
            const difficulty = e.target.dataset.difficulty;
            
            if (window.mlDetector) {
                window.mlDetector.provideFeedback(difficulty);
            }
            
            // Show thank you message
            dialog.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                    <h2 style="margin: 0 0 10px 0; color: #333;">Thank You!</h2>
                    <p style="margin: 0; color: #666; font-size: 14px;">
                        Your feedback helps improve the cognitive load detection.
                    </p>
                </div>
            `;
            
            setTimeout(() => {
                overlay.remove();
                dialog.remove();
            }, 2000);
        });
    });
    
    // Handle cancel
    document.getElementById('cancel-feedback').addEventListener('click', () => {
        overlay.remove();
        dialog.remove();
    });
    
    overlay.addEventListener('click', () => {
        overlay.remove();
        dialog.remove();
    });
}

// Console info for developers
console.log('%c🧠 Cognitive Load Engine Active', 'background: #667eea; color: white; padding: 8px 12px; border-radius: 4px; font-weight: bold;');
console.log('%cPress Ctrl+Shift+F (Cmd+Shift+F on Mac) to provide feedback', 'color: #667eea; font-size: 12px;');
console.log('%cAccess ML detector: window.mlDetector', 'color: #666; font-size: 11px;');

// Expose useful functions for debugging
window.cognitiveLoadDebug = {
    getCurrentScore: () => window.mlDetector ? window.mlDetector.getCurrentScore() : null,
    getScoreHistory: () => window.mlDetector ? window.mlDetector.getScoreHistory() : null,
    provideFeedback: (difficulty) => window.mlDetector ? window.mlDetector.provideFeedback(difficulty) : null,
    showFeedbackDialog: provideFeedbackDialog,
    getLogData: () => logData
};