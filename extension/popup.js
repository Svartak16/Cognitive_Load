document.addEventListener("DOMContentLoaded", () => {

    /* ===============================
       ELEMENT REFERENCES
    =============================== */

    const timeOnPageEl = document.getElementById("time-on-page");
    const scrollDepthEl = document.getElementById("scroll-depth");
    const hoverCountEl = document.getElementById("hover-count");
    const clickCountEl = document.getElementById("click-count");

    const mlScorePercentageEl = document.getElementById("ml-score-percentage");
    const mlLoadLevelEl = document.getElementById("ml-load-level");
    const mlStatusEl = document.getElementById("ml-status");

    const modelStatusEl = document.getElementById("model-status");
    const trainingSamplesEl = document.getElementById("training-samples");
    const modelAccuracyEl = document.getElementById("model-accuracy");
    const topFeaturesEl = document.getElementById("top-features");

    const strainEl = document.getElementById("strain-score");
    const focusEl = document.getElementById("focus-score");
    const clarityEl = document.getElementById("clarity-score");

    const downloadLogsBtn = document.getElementById("download-logs-btn");
    const feedbackBtn = document.getElementById("feedback-btn");
    const resetModelBtn = document.getElementById("reset-model-btn");
    const exportModelBtn = document.getElementById("export-model-btn");
    const openSidebarBtn = document.getElementById("open-sidebar-btn");

    const ctxElement = document.getElementById("activityChart");

    let chartInstance = null;

    /* ===============================
       SIDEBAR TOGGLE
    =============================== */

    if (openSidebarBtn) {
        openSidebarBtn.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return;

                chrome.tabs.sendMessage(tabs[0].id, {
                    type: "TOGGLE_SIDEBAR"
                });
            });
        });
    }

    /* ===============================
       INITIAL LOAD
    =============================== */

    loadData();
    loadModelInfo();

    setInterval(loadData, 2000);

    /* ===============================
       FUNCTIONS
    =============================== */

    function formatPercent(value) {
        if (value === undefined || value === null || isNaN(value)) {
            return "—";
        }

        let num = Number(value);

        // If already 0–100 scale
        if (num > 1) {
            num = Math.min(Math.max(num, 0), 100);
            return `${num.toFixed(0)}%`;
        }

        // If 0–1 scale
        num = Math.min(Math.max(num, 0), 1);
        return `${(num * 100).toFixed(0)}%`;
    }

    function loadData() {
        chrome.storage.local.get(["userLog", "trainingFeedback", "modelAccuracy", "validationHistory"], (data) => {

            const log = data.userLog || {
                timeOnPage: 0,
                scrollDepth: 0,
                hoverCount: 0,
                clickCount: 0,
                mlCognitiveLoad: 0,
                mlLoadLevel: "unknown",
                strain: 0,
                focus: 0,
                clarity: 0,
                lastMLUpdate: null
            };

            updateMetrics(log);
            updateMLDisplay(log);
            updateChart(log);

            const feedbackCount = data.trainingFeedback ? data.trainingFeedback.length : 0;
            if (trainingSamplesEl) {
                trainingSamplesEl.textContent = feedbackCount;
            }

            if (modelAccuracyEl) {
                const accuracy = typeof data.modelAccuracy === "number" ? data.modelAccuracy : null;
                modelAccuracyEl.textContent = accuracy === null ? "--" : `${(accuracy * 100).toFixed(1)}%`;
            }
        });
    }

    function loadModelInfo() {
        chrome.runtime.sendMessage({ type: "GET_MODEL_INFO" }, (response) => {
            if (!response || !modelStatusEl) return;

            if (response.modelLoaded) {
                modelStatusEl.textContent = "✅ Loaded";
                modelStatusEl.style.color = "#10b981";
            } else {
                modelStatusEl.textContent = "⏳ Loading...";
                modelStatusEl.style.color = "#f59e0b";
            }
        });

        chrome.runtime.sendMessage({ type: "GET_FEATURE_IMPORTANCE" }, (response) => {
            if (!response || !topFeaturesEl || !Array.isArray(response.importance)) return;

            const top5 = response.importance.slice(0, 5);
            topFeaturesEl.innerHTML = top5.map((feature) => `
                <span style="
                    display:inline-block;
                    padding:6px 10px;
                    border-radius:999px;
                    background:rgba(255,255,255,0.08);
                    border:1px solid rgba(148,163,184,0.16);
                    color:rgba(229,231,235,0.9);
                    font-size:11px;
                ">
                    ${feature.featureName}
                </span>
            `).join("");
        });
    }

    function updateMetrics(log) {
        if (timeOnPageEl) timeOnPageEl.textContent = `${log.timeOnPage}s`;
        if (scrollDepthEl) scrollDepthEl.textContent = `${Number(log.scrollDepth).toFixed(1)}%`;
        if (hoverCountEl) hoverCountEl.textContent = log.hoverCount;
        if (clickCountEl) clickCountEl.textContent = log.clickCount;
    }

    function updateMLDisplay(log) {
        if (!mlScorePercentageEl || !mlLoadLevelEl || !mlStatusEl) return;

        const score = log.mlCognitiveLoad || 0;
        const level = log.mlLoadLevel || "unknown";

        mlScorePercentageEl.textContent = `${(score * 100).toFixed(0)}%`;

        const levelMap = {
            very_high: "🔴 Very High",
            high: "🟠 High",
            medium: "🟡 Medium",
            low: "🟢 Low",
            unknown: "❓ Unknown"
        };

        mlLoadLevelEl.textContent = levelMap[level] || "❓ Unknown";

        if (log.lastMLUpdate) {
            const diff = Date.now() - log.lastMLUpdate;

            if (diff < 5000) {
                mlStatusEl.textContent = "✅ Active";
                mlStatusEl.style.color = "#10b981";
            } else {
                mlStatusEl.textContent = "⏸️ Paused";
                mlStatusEl.style.color = "#f59e0b";
            }
        } else {
            mlStatusEl.textContent = "⏳ Waiting...";
            mlStatusEl.style.color = "#6b7280";
        }

        if (strainEl) strainEl.textContent = formatPercent(log.strain);
        if (focusEl) focusEl.textContent = formatPercent(log.focus);
        if (clarityEl) clarityEl.textContent = formatPercent(log.clarity);
    }

    function updateChart(log) {
        if (!ctxElement) return;

        const ctx = ctxElement.getContext("2d");

        const chartData = [
            log.timeOnPage,
            Number(log.scrollDepth),
            log.hoverCount,
            log.clickCount
        ];

        if (chartInstance) {
            chartInstance.data.datasets[0].data = chartData;
            chartInstance.update();
            return;
        }

        chartInstance = new Chart(ctx, {
            type: "bar",
            data: {
                labels: ["Time (s)", "Scroll (%)", "Hovers", "Clicks"],
                datasets: [{
                    data: chartData
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    /* ===============================
       BUTTON EVENTS
    =============================== */

    if (downloadLogsBtn) {
        downloadLogsBtn.addEventListener("click", () => {
            chrome.storage.local.get("userLog", (data) => {
                if (!data.userLog) {
                    alert("No log data available.");
                    return;
                }

                const log = data.userLog;

                const content = `
Cognitive Load Report
=====================

Time on Page: ${log.timeOnPage}s
Scroll Depth: ${log.scrollDepth}%
Hovers: ${log.hoverCount}
Clicks: ${log.clickCount}

ML Load: ${(log.mlCognitiveLoad * 100).toFixed(0)}%
Level: ${log.mlLoadLevel}

Generated: ${new Date().toLocaleString()}
                `;

                const blob = new Blob([content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = `cognitive_report_${Date.now()}.txt`;
                a.click();

                URL.revokeObjectURL(url);
            });
        });
    }


// if (feedbackBtn) {
//     feedbackBtn.addEventListener("click", () => {

//         const feedback = prompt("Rate difficulty (1-5):");
//         if (!feedback) return;

//         const value = parseInt(feedback);

//         if (isNaN(value) || value < 1 || value > 5) {
//             alert("Enter number between 1 and 5");
//             return;
//         }

//         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//             if (!tabs[0]) return;

//             chrome.tabs.sendMessage(tabs[0].id, {
//                 type: "PROVIDE_FEEDBACK",
//                 rating: value
//             });
//         });

//     });
// }

if (feedbackBtn) {
    feedbackBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            chrome.tabs.sendMessage(tabs[0].id, {
                type: "TRIGGER_FEEDBACK"
            });
        });
    });
}

    if (resetModelBtn) {
        resetModelBtn.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "RESET_ML_MODEL" });
        });
    }

    if (exportModelBtn) {
        exportModelBtn.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "EXPORT_ML_MODEL" });
        });
    }

});
// ── Phishing Detection Result ─────────────────────────────────
function renderPhishingResult() {
    const box = document.getElementById("phishing-result");
    if (!box) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs?.[0];
        if (!activeTab?.id) {
            box.innerHTML = `
                <div style="font-size:12px; color:rgba(229,231,235,0.5); text-align:center;">
                    Visit a page to scan it
                </div>`;
            return;
        }

        chrome.storage.local.get(["lastScans", "lastScan"], ({ lastScans, lastScan }) => {
            const tabScan = lastScans?.[String(activeTab.id)];
            const activeTabUrl = activeTab.url || "";
            const globalScanMatchesActiveTab = lastScan && lastScan.url === activeTabUrl ? lastScan : null;
            const scan = tabScan || globalScanMatchesActiveTab;

            if (!scan) {
                box.innerHTML = `
                    <div style="font-size:12px; color:rgba(229,231,235,0.5); text-align:center;">
                        Scanning active tab...
                    </div>`;
                return;
            }

            // Dark-theme colors matching your UI
            const configs = {
                SAFE: {
                    bg:     "rgba(16,185,129,0.12)",
                    border: "rgba(16,185,129,0.35)",
                    badge:  "rgba(16,185,129,0.25)",
                    text:   "#34d399",
                    icon:   "✅",
                },
                SUSPICIOUS: {
                    bg:     "rgba(245,158,11,0.12)",
                    border: "rgba(245,158,11,0.35)",
                    badge:  "rgba(245,158,11,0.25)",
                    text:   "#fbbf24",
                    icon:   "⚠️",
                },
                MALICIOUS: {
                    bg:     "rgba(239,68,68,0.12)",
                    border: "rgba(239,68,68,0.35)",
                    badge:  "rgba(239,68,68,0.25)",
                    text:   "#f87171",
                    icon:   "🚨",
                },
            };

            const c = configs[scan.decision] || configs.SAFE;

            box.style.background = c.bg;
            box.style.border     = `1px solid ${c.border}`;

            // Shorten URL for display
            let displayUrl = scan.url || "";
            try {
                const u = new URL(displayUrl);
                displayUrl = u.hostname;
            } catch(e) {}

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">${c.icon}</span>
                        <div>
                            <div style="font-size:15px; font-weight:800; color:${c.text};">
                                ${scan.decision}
                            </div>
                            <div style="font-size:10px; color:rgba(229,231,235,0.5); margin-top:1px;">
                                ${displayUrl}
                            </div>
                        </div>
                    </div>
                    <div style="
                        font-size:11px; font-weight:700;
                        padding:4px 10px; border-radius:20px;
                        background:${c.badge}; color:${c.text};">
                        ${scan.recommended_action}
                    </div>
                </div>

                <div style="font-size:11px; color:rgba(229,231,235,0.75); margin-bottom:8px; line-height:1.5;">
                    ${scan.reason || "No signals detected"}
                </div>

                <div style="display:flex; gap:8px;">
                    <div style="
                        flex:1; text-align:center; padding:6px;
                        background:rgba(255,255,255,0.05);
                        border-radius:8px; border:1px solid rgba(148,163,184,0.15);">
                        <div style="font-size:16px; font-weight:800;
                             background:linear-gradient(90deg,#60a5fa,#a78bfa);
                             -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
                            ${scan.confidence}%
                        </div>
                        <div style="font-size:10px; color:rgba(229,231,235,0.5); text-transform:uppercase; letter-spacing:0.5px;">
                            Confidence
                        </div>
                    </div>
                    <div style="
                        flex:1; text-align:center; padding:6px;
                        background:rgba(255,255,255,0.05);
                        border-radius:8px; border:1px solid rgba(148,163,184,0.15);">
                        <div style="font-size:16px; font-weight:800;
                             background:linear-gradient(90deg,#60a5fa,#a78bfa);
                             -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
                            ${Math.round((scan.phishing_probability || 0) * 100)}%
                        </div>
                        <div style="font-size:10px; color:rgba(229,231,235,0.5); text-transform:uppercase; letter-spacing:0.5px;">
                            Phish Prob
                        </div>
                    </div>
                    <div style="
                        flex:1; text-align:center; padding:6px;
                        background:rgba(255,255,255,0.05);
                        border-radius:8px; border:1px solid rgba(148,163,184,0.15);">
                        <div style="font-size:16px; font-weight:800;
                             background:linear-gradient(90deg,#60a5fa,#a78bfa);
                             -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
                            ${scan.risk_score || 0}
                        </div>
                        <div style="font-size:10px; color:rgba(229,231,235,0.5); text-transform:uppercase; letter-spacing:0.5px;">
                            Risk Score
                        </div>
                    </div>
                </div>
            `;
        });
    });
}

// Run on popup open
renderPhishingResult();

// Auto-refresh every 3 seconds in case a scan just completed
setInterval(renderPhishingResult, 3000);
```

---

After these changes, your popup will look like this for each state:
// ```
// 🛡️ PHISHING DETECTION
// ┌─────────────────────────────────────┐  ← green/amber/red border
// │ ✅ SAFE                    [ALLOW]  │
// │ trusted domain — whitelisted        │
// │  Confidence  │  Phish Prob  │ Risk  │
// │    99%       │     0%       │   0   │
// └─────────────────────────────────────┘
