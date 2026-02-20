// // popup.js

// document.addEventListener("DOMContentLoaded", () => {
//     const timeOnPageEl = document.getElementById("time-on-page");
//     const scrollDepthEl = document.getElementById("scroll-depth");
//     const hoverCountEl = document.getElementById("hover-count");
//     const clickCountEl = document.getElementById("click-count");
//     const confusionScoreEl = document.getElementById("confusion-score");
//     const helpMessageEl = document.getElementById("help-message");
//     const ctx = document.getElementById('myChart').getContext('2d');
//     let myChart;

//     const summarizeBtn = document.getElementById("process-summary-btn");
//     const downloadLogsBtn = document.getElementById("download-logs-btn");
//     const feedbackBtn = document.getElementById("feedback-btn");
    
//     const textToSummarize = document.getElementById("text-to-summarize");
//     const summarizedOutput = document.getElementById("summarized-output");

//     // Display initial log data
//     chrome.storage.local.get("userLog", (data) => {
//         const log = data.userLog || { scrollDepth: 0, hoverCount: 0, clickCount: 0, timeOnPage: 0, confusionScore: 0 };
//         updatePopupUI(log);
//         updateChart(log);
//     });

//     // Listen for summarization response from background.js
//     chrome.runtime.onMessage.addListener((message) => {
//         if (message.type === "SUMMARIZE_RESPONSE") {
//             summarizedOutput.textContent = message.summary;
//         }
//     });

//     function updatePopupUI(log) {
//         timeOnPageEl.textContent = `${log.timeOnPage}s`;
//         scrollDepthEl.textContent = `${log.scrollDepth.toFixed(1)}%`;
//         hoverCountEl.textContent = log.hoverCount;
//         clickCountEl.textContent = log.clickCount;
//         confusionScoreEl.textContent = log.confusionScore;
//         if (log.confusionScore >= 2) {
//             helpMessageEl.style.display = 'block';
//             helpMessageEl.innerHTML = `<strong>Need help?</strong> It looks like you might be confused.`;
//         } else {
//             helpMessageEl.style.display = 'none';
//         }
//     }

//     function updateChart(log) {
//         const data = [log.timeOnPage, log.scrollDepth.toFixed(1), log.hoverCount, log.clickCount];
//         if (myChart) {
//             myChart.data.datasets[0].data = data;
//             myChart.update();
//         } else {
//             myChart = new Chart(ctx, {
//                 type: 'bar',
//                 data: {
//                     labels: ['Time (s)', 'Scroll (%)', 'Hovers', 'Clicks'],
//                     datasets: [{
//                         label: 'User Activity',
//                         data: data,
//                         backgroundColor: [
//                             'rgba(52, 152, 219, 0.5)',
//                             'rgba(46, 204, 113, 0.5)',
//                             'rgba(241, 196, 15, 0.5)',
//                             'rgba(231, 76, 60, 0.5)'
//                         ],
//                         borderColor: [
//                             'rgba(52, 152, 219, 1)',
//                             'rgba(46, 204, 113, 1)',
//                             'rgba(241, 196, 15, 1)',
//                             'rgba(231, 76, 60, 1)'
//                         ],
//                         borderWidth: 1
//                     }]
//                 },
//                 options: {
//                     responsive: true,
//                     maintainAspectRatio: false,
//                     scales: {
//                         y: {
//                             beginAtZero: true
//                         }
//                     },
//                     plugins: {
//                         legend: {
//                             display: false
//                         }
//                     }
//                 }
//             });
//         }
//     }

//     summarizeBtn.addEventListener("click", () => {
//         if (textToSummarize.value.trim() === "") {
//             summarizedOutput.textContent = "Please paste some text to summarize.";
//             return;
//         }
//         chrome.runtime.sendMessage({
//             type: "SUMMARIZE_REQUEST",
//             text: textToSummarize.value
//         });
//     });

//     downloadLogsBtn.addEventListener("click", () => {
//         chrome.storage.local.get("userLog", (data) => {
//             const log = data.userLog;
//             if (log) {
//                 const logContent = `User Interaction Report
// --------------------------------------
// Time on Page: ${log.timeOnPage}s
// Scroll Depth: ${log.scrollDepth.toFixed(1)}%
// Hovers: ${log.hoverCount}
// Clicks: ${log.clickCount}
// Confusion Score: ${log.confusionScore}
// --------------------------------------
// This report was generated on ${new Date().toLocaleString()}.
// `;
//                 const blob = new Blob([logContent], { type: 'text/plain' });
//                 const url = URL.createObjectURL(blob);
//                 const a = document.createElement('a');
//                 a.href = url;
//                 a.download = `cognitive_load_logs_${Date.now()}.txt`;
//                 document.body.appendChild(a);
//                 a.click();
//                 document.body.removeChild(a);
//                 URL.revokeObjectURL(url);
//             } else {
//                 alert("No log data to download.");
//             }
//         });
//     });
    
//     feedbackBtn.addEventListener("click", () => {
//         const feedback = prompt("How easy was it to understand this page? (1-5)");
//         if (feedback) {
//             chrome.runtime.sendMessage({
//                 type: "USER_FEEDBACK",
//                 feedback: feedback
//             });
//         }
//     });
// });

// popup.js

document.addEventListener("DOMContentLoaded", () => {
    // ========== EXISTING ELEMENTS ==========
    const timeOnPageEl = document.getElementById("time-on-page");
    const scrollDepthEl = document.getElementById("scroll-depth");
    const hoverCountEl = document.getElementById("hover-count");
    const clickCountEl = document.getElementById("click-count");
    const confusionScoreEl = document.getElementById("confusion-score");
    const helpMessageEl = document.getElementById("help-message");
    const ctx = document.getElementById('myChart').getContext('2d');
    let myChart;

    const summarizeBtn = document.getElementById("process-summary-btn");
    const downloadLogsBtn = document.getElementById("download-logs-btn");
    const feedbackBtn = document.getElementById("feedback-btn");
    
    const textToSummarize = document.getElementById("text-to-summarize");
    const summarizedOutput = document.getElementById("summarized-output");

    // ========== NEW ML ELEMENTS ==========
    const mlScorePercentageEl = document.getElementById("ml-score-percentage");
    const mlLoadLevelEl = document.getElementById("ml-load-level");
    const mlStatusEl = document.getElementById("ml-status");
    const mlScoreCircleEl = document.getElementById("ml-score-circle");
    const modelStatusEl = document.getElementById("model-status");
    const trainingSamplesEl = document.getElementById("training-samples");
    
    const resetModelBtn = document.getElementById("reset-model-btn");
    const exportModelBtn = document.getElementById("export-model-btn");
    const viewHistoryBtn = document.getElementById("view-history-btn");

    // ========== INITIALIZE ==========
    
    // Display initial log data
    chrome.storage.local.get("userLog", (data) => {
        const log = data.userLog || { 
            scrollDepth: 0, 
            hoverCount: 0, 
            clickCount: 0, 
            timeOnPage: 0, 
            confusionScore: 0,
            mlCognitiveLoad: 0,
            mlLoadLevel: 'unknown'
        };
        updatePopupUI(log);
        updateChart(log);
        updateMLDisplay(log);
    });

    // Get model info
    chrome.runtime.sendMessage({ type: 'GET_MODEL_INFO' }, (response) => {
        if (response) {
            updateModelInfo(response);
        }
    });

    // Get training feedback count
    chrome.storage.local.get(['trainingFeedback'], (result) => {
        const feedbackCount = result.trainingFeedback ? result.trainingFeedback.length : 0;
        trainingSamplesEl.textContent = feedbackCount;
    });

    // ========== AUTO-REFRESH ML SCORES ==========
    
    // Update ML scores every 2 seconds
    setInterval(() => {
        chrome.storage.local.get("userLog", (data) => {
            if (data.userLog) {
                updateMLDisplay(data.userLog);
                updatePopupUI(data.userLog);
            }
        });
    }, 2000);

    // ========== UPDATE FUNCTIONS ==========

    function updatePopupUI(log) {
        timeOnPageEl.textContent = `${log.timeOnPage}s`;
        scrollDepthEl.textContent = `${log.scrollDepth.toFixed(1)}%`;
        hoverCountEl.textContent = log.hoverCount;
        clickCountEl.textContent = log.clickCount;
        confusionScoreEl.textContent = log.confusionScore;
        
        if (log.confusionScore >= 2) {
            helpMessageEl.style.display = 'block';
            helpMessageEl.innerHTML = `<strong>Need help?</strong> It looks like you might be confused.`;
        } else {
            helpMessageEl.style.display = 'none';
        }
    }

    function updateMLDisplay(log) {
        const mlScore = log.mlCognitiveLoad || 0;
        const mlLevel = log.mlLoadLevel || 'unknown';
        
        // Update score percentage
        const percentage = (mlScore * 100).toFixed(0);
        mlScorePercentageEl.textContent = `${percentage}%`;
        
        // Update load level text with emoji
        let levelText = 'Unknown';
        let levelEmoji = '❓';
        
        if (mlLevel === 'very_high') {
            levelText = 'Very High';
            levelEmoji = '🔴';
            mlScoreCircleEl.className = 'score-circle very-high';
        } else if (mlLevel === 'high') {
            levelText = 'High';
            levelEmoji = '🟠';
            mlScoreCircleEl.className = 'score-circle high';
        } else if (mlLevel === 'medium') {
            levelText = 'Medium';
            levelEmoji = '🟡';
            mlScoreCircleEl.className = 'score-circle medium';
        } else if (mlLevel === 'low') {
            levelText = 'Low';
            levelEmoji = '🟢';
            mlScoreCircleEl.className = 'score-circle low';
        } else {
            mlScoreCircleEl.className = 'score-circle';
        }
        
        mlLoadLevelEl.textContent = `${levelEmoji} ${levelText}`;
        
        // Update status
        if (log.lastMLUpdate) {
            const timeSinceUpdate = Date.now() - log.lastMLUpdate;
            if (timeSinceUpdate < 5000) {
                mlStatusEl.textContent = '✅ Active';
                mlStatusEl.style.color = '#10b981';
            } else {
                mlStatusEl.textContent = '⏸️ Paused';
                mlStatusEl.style.color = '#f59e0b';
            }
        } else {
            mlStatusEl.textContent = '⏳ Waiting for data...';
            mlStatusEl.style.color = '#6b7280';
        }
    }

    function updateModelInfo(info) {
        if (info.modelLoaded) {
            modelStatusEl.textContent = '✅ Loaded';
            modelStatusEl.style.color = '#10b981';
        } else {
            modelStatusEl.textContent = '⏳ Loading...';
            modelStatusEl.style.color = '#f59e0b';
        }
        
        if (info.isTraining) {
            modelStatusEl.textContent = '🎓 Training...';
            modelStatusEl.style.color = '#667eea';
        }
    }

    function updateChart(log) {
        const data = [log.timeOnPage, log.scrollDepth.toFixed(1), log.hoverCount, log.clickCount];
        if (myChart) {
            myChart.data.datasets[0].data = data;
            myChart.update();
        } else {
            myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Time (s)', 'Scroll (%)', 'Hovers', 'Clicks'],
                    datasets: [{
                        label: 'User Activity',
                        data: data,
                        backgroundColor: [
                            'rgba(52, 152, 219, 0.5)',
                            'rgba(46, 204, 113, 0.5)',
                            'rgba(241, 196, 15, 0.5)',
                            'rgba(231, 76, 60, 0.5)'
                        ],
                        borderColor: [
                            'rgba(52, 152, 219, 1)',
                            'rgba(46, 204, 113, 1)',
                            'rgba(241, 196, 15, 1)',
                            'rgba(231, 76, 60, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        }
    }

    // ========== EVENT LISTENERS ==========

    // Listen for summarization response
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "SUMMARIZE_RESPONSE") {
            summarizedOutput.textContent = message.summary;
        }
        
        if (message.type === "MODEL_TRAINED") {
            modelStatusEl.textContent = '✅ Training Complete!';
            modelStatusEl.style.color = '#10b981';
            
            // Update training samples count
            chrome.storage.local.get(['trainingFeedback'], (result) => {
                const feedbackCount = result.trainingFeedback ? result.trainingFeedback.length : 0;
                trainingSamplesEl.textContent = feedbackCount;
            });
        }
    });

    // Summarize button
    summarizeBtn.addEventListener("click", () => {
        if (textToSummarize.value.trim() === "") {
            summarizedOutput.textContent = "Please paste some text to summarize.";
            return;
        }
        summarizedOutput.textContent = "Processing...";
        chrome.runtime.sendMessage({
            type: "SUMMARIZE_REQUEST",
            text: textToSummarize.value
        });
    });

    // Download logs button
    downloadLogsBtn.addEventListener("click", () => {
        chrome.storage.local.get(["userLog", "trainingFeedback", "highLoadEvents"], (data) => {
            const log = data.userLog;
            const feedbackCount = data.trainingFeedback ? data.trainingFeedback.length : 0;
            const highLoadCount = data.highLoadEvents ? data.highLoadEvents.length : 0;
            
            if (log) {
                const logContent = `Cognitive Load Analysis Report
======================================

📊 TRADITIONAL METRICS
--------------------------------------
Time on Page: ${log.timeOnPage}s
Scroll Depth: ${log.scrollDepth.toFixed(1)}%
Hovers: ${log.hoverCount}
Clicks: ${log.clickCount}
Confusion Score: ${log.confusionScore}

🧠 ML COGNITIVE LOAD METRICS
--------------------------------------
ML Cognitive Load: ${(log.mlCognitiveLoad * 100).toFixed(0)}%
Load Level: ${log.mlLoadLevel}
Last Update: ${log.lastMLUpdate ? new Date(log.lastMLUpdate).toLocaleString() : 'N/A'}

📈 MODEL STATISTICS
--------------------------------------
Training Samples Collected: ${feedbackCount}
High Load Events Detected: ${highLoadCount}

======================================
Report Generated: ${new Date().toLocaleString()}
URL: ${log.url || 'N/A'}
======================================
`;
                const blob = new Blob([logContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cognitive_load_report_${Date.now()}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                alert("No log data to download.");
            }
        });
    });
    
    // Feedback button
    feedbackBtn.addEventListener("click", () => {
        const feedback = prompt("How easy was it to understand this page?\n\n1 = Very Easy\n2 = Easy\n3 = Medium\n4 = Hard\n5 = Very Hard");
        
        if (feedback) {
            const numFeedback = parseInt(feedback);
            if (numFeedback >= 1 && numFeedback <= 5) {
                // Convert 1-5 scale to 0-1 scale for ML model
                const normalizedFeedback = (numFeedback - 1) / 4;
                
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            type: "PROVIDE_FEEDBACK",
                            difficulty: normalizedFeedback < 0.33 ? 'easy' : normalizedFeedback < 0.66 ? 'medium' : 'hard'
                        });
                    }
                });
                
                alert("Thank you for your feedback! This helps improve the ML model.");
            } else {
                alert("Please enter a number between 1 and 5.");
            }
        }
    });

    // Reset ML Model button
    resetModelBtn.addEventListener("click", () => {
        const confirmed = confirm(
            "⚠️ WARNING: This will reset the ML model and delete all training data.\n\n" +
            "The model will start learning from scratch.\n\n" +
            "Are you sure you want to continue?"
        );
        
        if (confirmed) {
            resetModelBtn.textContent = "Resetting...";
            resetModelBtn.disabled = true;
            
            chrome.runtime.sendMessage({ type: 'RESET_ML_MODEL' }, (response) => {
                if (response && response.success) {
                    alert("✅ ML Model has been reset successfully!");
                    modelStatusEl.textContent = '✅ Reset Complete';
                    trainingSamplesEl.textContent = '0';
                } else {
                    alert("❌ Failed to reset model. Please try again.");
                }
                
                resetModelBtn.textContent = "🔄 Reset ML Model";
                resetModelBtn.disabled = false;
            });
        }
    });

    // Export Model button
    exportModelBtn.addEventListener("click", () => {
        exportModelBtn.textContent = "Exporting...";
        exportModelBtn.disabled = true;
        
        chrome.runtime.sendMessage({ type: 'EXPORT_ML_MODEL' }, (response) => {
            if (response && response.success) {
                alert("✅ Model exported to Downloads folder!");
            } else {
                alert("❌ Failed to export model. Make sure the model is trained first.");
            }
            
            exportModelBtn.textContent = "Export Model";
            exportModelBtn.disabled = false;
        });
    });

    // View History button
    viewHistoryBtn.addEventListener("click", () => {
        chrome.storage.local.get(['highLoadEvents', 'trainingFeedback'], (data) => {
            const events = data.highLoadEvents || [];
            const feedback = data.trainingFeedback || [];
            
            let historyHTML = `
                <div style="padding: 20px; font-family: sans-serif;">
                    <h2>📊 Cognitive Load History</h2>
                    
                    <h3>🔴 High Load Events (${events.length})</h3>
                    <div style="max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; border-radius: 5px;">
            `;
            
            if (events.length > 0) {
                events.slice(-10).reverse().forEach(event => {
                    historyHTML += `
                        <div style="margin-bottom: 10px; padding: 8px; background: white; border-radius: 4px;">
                            <strong>${(event.score * 100).toFixed(0)}%</strong> - ${event.level}<br>
                            <small>${new Date(event.timestamp).toLocaleString()}</small><br>
                            <small style="color: #666;">${event.url}</small>
                        </div>
                    `;
                });
            } else {
                historyHTML += '<p>No high load events recorded yet.</p>';
            }
            
            historyHTML += `
                    </div>
                    
                    <h3 style="margin-top: 20px;">💬 Training Feedback (${feedback.length})</h3>
                    <div style="max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; border-radius: 5px;">
            `;
            
            if (feedback.length > 0) {
                feedback.slice(-10).reverse().forEach(item => {
                    const difficultyText = item.label === 0 ? 'Easy' : item.label === 0.5 ? 'Medium' : 'Hard';
                    historyHTML += `
                        <div style="margin-bottom: 10px; padding: 8px; background: white; border-radius: 4px;">
                            <strong>${difficultyText}</strong><br>
                            <small>${new Date(item.timestamp).toLocaleString()}</small>
                        </div>
                    `;
                });
            } else {
                historyHTML += '<p>No feedback provided yet. Press Ctrl+Shift+F on any page to provide feedback.</p>';
            }
            
            historyHTML += `
                    </div>
                </div>
            `;
            
            // Create a new window with history
            const historyWindow = window.open('', 'History', 'width=600,height=600');
            historyWindow.document.write(historyHTML);
            historyWindow.document.title = 'Cognitive Load History';
        });
    });
});