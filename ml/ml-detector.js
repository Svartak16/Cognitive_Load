// ml/ml-detector.js

class MLCognitiveLoadDetector {
    constructor() {
      this.featureExtractor = new FeatureExtractor();
      this.detectionInterval = null;
      this.currentScore = 0.5;
      this.scoreHistory = [];
      this.isRunning = false;
      this.debugMode = true; // Set to false to hide debug indicator
    }
    
    startDetection() {
      if (this.isRunning) {
        console.log('Detection already running');
        return;
      }
      
      this.isRunning = true;
      console.log('🧠 ML Cognitive Load Detection started');
      
      // Create debug indicator if enabled
      if (this.debugMode) {
        this.createDebugIndicator();
      }
      
      // Extract features and predict every 3 seconds
      this.detectionInterval = setInterval(async () => {
        try {
          const features = this.featureExtractor.toArray();
          
          // Send features to background script for ML prediction
          this.sendMessageSafe({
            type: 'PREDICT_COGNITIVE_LOAD',
            features: features
          }, (response) => {
            if (response && response.score !== undefined) {
              this.currentScore = response.score;
              this.handleLoadScore(response.score, features);
            }
          });
          
        } catch (error) {
          console.error('❌ Detection error:', error);
        }
      }, 3000); // Every 3 seconds
    }
    
    handleLoadScore(score, features) {
      // Store score history
      this.scoreHistory.push({
        score: score,
        timestamp: Date.now(),
        features: features
      });
      
      // Keep only last 20 scores
      if (this.scoreHistory.length > 20) {
        this.scoreHistory.shift();
      }
      
      // Log score
      const percentage = (score * 100).toFixed(0);
      console.log(`🧠 Cognitive Load: ${percentage}%`);
      
      // Update debug indicator
      if (this.debugMode) {
        this.updateDebugIndicator(score);
      }
      
      // Trigger assistance at different thresholds
      if (score > 0.75) {
        console.log('🔴 VERY HIGH LOAD - Triggering urgent assistance');
        this.triggerGeminiAssistance(score, 'urgent');
      } else if (score > 0.65) {
        console.log('🟠 HIGH LOAD - Triggering assistance');
        this.triggerGeminiAssistance(score, 'high');
      } else if (score > 0.50) {
        console.log('🟡 Medium load - Monitoring');
      } else {
        console.log('🟢 Normal load');
      }
      
      // Send score to background for logging
      this.sendMessageSafe({
        type: 'ML_COGNITIVE_LOAD_UPDATE',
        data: {
          score: score,
          percentage: percentage,
          level: this.getLoadLevel(score),
          timestamp: Date.now()
        }
      });
    }
    
    getLoadLevel(score) {
      if (score > 0.75) return 'very_high';
      if (score > 0.65) return 'high';
      if (score > 0.50) return 'medium';
      return 'low';
    }
    
    createDebugIndicator() {
      // Remove existing indicator if any
      const existing = document.getElementById('ml-cognitive-load-indicator');
      if (existing) existing.remove();
      
      const indicator = document.createElement('div');
      indicator.id = 'ml-cognitive-load-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 12px 18px;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1);
        transition: all 0.3s ease;
      `;
      
      indicator.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px;">🧠</span>
          <div>
            <div style="font-weight: 600; margin-bottom: 2px;">Cognitive Load</div>
            <div id="ml-load-value" style="font-size: 16px; font-weight: 700; color: #10b981;">--</div>
          </div>
        </div>
      `;
      
      document.body.appendChild(indicator);
    }
    
    updateDebugIndicator(score) {
      const indicator = document.getElementById('ml-cognitive-load-indicator');
      if (!indicator) return;
      
      const valueEl = document.getElementById('ml-load-value');
      if (!valueEl) return;
      
      const percentage = (score * 100).toFixed(0);
      let color, bgColor, emoji;
      
      if (score > 0.75) {
        color = '#ef4444';
        bgColor = 'rgba(239, 68, 68, 0.1)';
        emoji = '🔴';
      } else if (score > 0.65) {
        color = '#f97316';
        bgColor = 'rgba(249, 115, 22, 0.1)';
        emoji = '🟠';
      } else if (score > 0.50) {
        color = '#f59e0b';
        bgColor = 'rgba(245, 158, 11, 0.1)';
        emoji = '🟡';
      } else {
        color = '#10b981';
        bgColor = 'rgba(16, 185, 129, 0.1)';
        emoji = '🟢';
      }
      
      valueEl.innerHTML = `${emoji} ${percentage}%`;
      valueEl.style.color = color;
      indicator.style.background = `linear-gradient(135deg, rgba(0,0,0,0.9), ${bgColor})`;
    }
    
    triggerGeminiAssistance(score, level) {
      // Prevent triggering too frequently (max once per 30 seconds)
      const now = Date.now();
      if (this.lastTriggerTime && (now - this.lastTriggerTime) < 30000) {
        console.log('⏳ Waiting before next trigger...');
        return;
      }
      
      this.lastTriggerTime = now;
      
      // Send message to background to trigger chatbot
      this.sendMessageSafe({
        type: 'HIGH_COGNITIVE_LOAD_DETECTED',
        data: {
          score: score,
          level: level,
          url: window.location.href,
          timestamp: now,
          features: this.featureExtractor.getDebugInfo()
        }
      });
      
      // Show subtle notification to user
      this.showLoadNotification(score, level);
    }
    
    showLoadNotification(score, level) {
      // Create a subtle notification the user can click to open the AI assistant
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 10px;
        padding: 15px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        z-index: 999998;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
        cursor: pointer;
      `;
      
      notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 5px;">
          ${level === 'urgent' ? '⚠️ High Cognitive Load Detected' : '💡 Need Help?'}
        </div>
        <div style="font-size: 12px; opacity: 0.9;">
          Click here to open AI assistant for help with this content.
        </div>
      `;
      
      // Add animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(400px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
      
      // Click handler
      notification.addEventListener('click', () => {
        // Ask background script to toggle the Cognitive Load sidebar UI
        // (contains focus mode, sticky notes, capture + image analysis preview, and audit report).
        this.sendMessageSafe({ type: 'REQUEST_TOGGLE_SIDEBAR' });
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      });
      
      document.body.appendChild(notification);
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => notification.remove(), 300);
        }
      }, 10000);
    }
    
    provideFeedback(difficulty) {
      // difficulty: 'easy' (0), 'medium' (0.5), 'hard' (1)
      const labelMap = {
        'easy': 0,
        'medium': 0.5,
        'hard': 1
      };
      
      const label = labelMap[difficulty] !== undefined ? labelMap[difficulty] : 0.5;
      const features = this.featureExtractor.toArray();
      
      console.log(`📝 User feedback: ${difficulty} (${label})`);
      
      this.sendMessageSafe({
        type: 'TRAINING_FEEDBACK',
        features: features,
        label: label,
        timestamp: Date.now()
      });
    }
    
    stopDetection() {
      if (this.detectionInterval) {
        clearInterval(this.detectionInterval);
        this.detectionInterval = null;
        this.isRunning = false;
        console.log('🛑 ML Cognitive Load Detection stopped');
      }
      
      // Remove debug indicator
      const indicator = document.getElementById('ml-cognitive-load-indicator');
      if (indicator) indicator.remove();
    }
    
    getCurrentScore() {
      return this.currentScore;
    }
    
    getScoreHistory() {
      return this.scoreHistory;
    }

    sendMessageSafe(message, callback) {
      if (!chrome?.runtime?.id) {
        console.warn('Chrome runtime unavailable; message skipped.', message.type);
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          // If caller expects a response, surface errors; otherwise, stay silent to avoid noisy
          // "message port closed before a response was received" warnings for fire-and-forget calls.
          if (lastError) {
            if (callback) {
              if (lastError.message && lastError.message.includes('Extension context invalidated')) {
                console.warn('Extension context invalidated; stopping detection until reload.');
                this.stopDetection();
              } else {
                console.warn('Runtime message error:', lastError);
              }
              callback(null);
            }
            return;
          }

          if (callback) callback(response);
        });
      } catch (error) {
        console.warn('sendMessage threw an error:', error);
        if (callback) callback(null);
      }
    }
  }
  
  // Initialize detector when page loads
  let mlDetector = null;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mlDetector = new MLCognitiveLoadDetector();
      mlDetector.startDetection();
      
      // Make it globally accessible for debugging
      window.mlDetector = mlDetector;
    });
  } else {
    mlDetector = new MLCognitiveLoadDetector();
    mlDetector.startDetection();
    window.mlDetector = mlDetector;
  }