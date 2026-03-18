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
        chrome.storage.local.get(["userLog", "trainingFeedback"], (data) => {

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