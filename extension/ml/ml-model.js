// ml/ml-model.js

// Lightweight, dependency-free ML model (no TensorFlow) to satisfy MV3 CSP.
// Implements enhanced logistic regression with:
// - Model persistence (chrome.storage)
// - Incremental/online learning
// - L2 regularization
// - Mini-batch training with adaptive learning rates
// - Support for 21 features (11 base + 10 polynomial interactions)

class CognitiveLoadMLModel {
  constructor() {
    // Feature vector length expected by the current model version.
    this.featureCount = 46;
    this.weights = new Array(this.featureCount).fill(0);
    this.bias = 0;
    this.isTraining = false;
    this.trainingData = [];
    this.modelLoaded = false;
    this.isInitializing = false;
    
    // Training hyperparameters
    this.initialLearningRate = 0.1;
    this.minLearningRate = 0.001;
    this.l2Lambda = 0.01; // L2 regularization strength
    this.batchSize = 8; // Mini-batch size
    this.minSamplesForBatchTraining = 20; // Minimum samples before batch training
    
    // Adaptive learning rate tracking
    this.learningRate = this.initialLearningRate;
    this.lossHistory = [];
    this.trainingCount = 0;
  }

  normalizeFeatures(features) {
    if (!Array.isArray(features)) return null;

    // Legacy support:
    // - 11 features (base only)
    // - 21 features (11 base + 10 interactions)
    // - current: 46 features
    const out = new Array(this.featureCount).fill(0);
    const copyLen = Math.min(features.length, this.featureCount);
    for (let i = 0; i < copyLen; i++) out[i] = features[i];
    return out;
  }
  
  async initialize() {
    if (this.isInitializing) return;
    this.isInitializing = true;
    
    try {
      // Load saved model from chrome.storage
      await this.loadModel();
      this.modelLoaded = true;
      console.log('✅ ML Model initialized (with persistence)');
    } catch (error) {
      console.error('❌ Failed to load saved model, using defaults:', error);
      this.modelLoaded = true;
    } finally {
      this.isInitializing = false;
    }
  }
  
  async loadModel() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['mlModelWeights', 'mlModelBias', 'mlModelTrainingCount'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (result.mlModelWeights && Array.isArray(result.mlModelWeights)) {
          // Ensure weights array matches expected size
          if (result.mlModelWeights.length === this.featureCount) {
            this.weights = result.mlModelWeights;
            this.bias = result.mlModelBias || 0;
            this.trainingCount = result.mlModelTrainingCount || 0;
            console.log(`📦 Loaded saved model (${this.trainingCount} training sessions)`);
          } else {
            console.warn(`⚠️ Saved model has ${result.mlModelWeights.length} features, expected ${this.featureCount}. Resetting.`);
            this.resetModel();
          }
        }
        resolve();
      });
    });
  }
  
  async saveModel() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({
        mlModelWeights: this.weights,
        mlModelBias: this.bias,
        mlModelTrainingCount: this.trainingCount,
        mlModelLastSaved: Date.now()
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
  
  async predict(features) {
    const normalized = this.normalizeFeatures(features);
    if (!normalized) {
      console.error('Invalid features: not an array');
      return 0.5;
    }

    if (features.length !== this.featureCount) {
      console.warn(`Expected ${this.featureCount} features, got ${features.length}. Padding/truncating.`);
    }

    const z = normalized.reduce((sum, f, i) => sum + f * this.weights[i], this.bias);
    const score = 1 / (1 + Math.exp(-z));
    return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
  }
  
  // Incremental/online learning - update model immediately with new sample
  async updateIncremental(features, label) {
    const normalized = this.normalizeFeatures(features);
    if (!normalized) {
      return;
    }
    
    const pred = await this.predict(normalized);
    const error = pred - label;
    
    // Adaptive learning rate (decay over time)
    const adaptiveLR = Math.max(
      this.minLearningRate,
      this.initialLearningRate / (1 + this.trainingCount * 0.01)
    );
    
    // Online gradient descent with L2 regularization
    for (let i = 0; i < this.weights.length; i++) {
      // Gradient: error * feature[i] + L2 regularization term
      const gradient = error * normalized[i] + this.l2Lambda * this.weights[i];
      this.weights[i] -= adaptiveLR * gradient;
    }
    this.bias -= adaptiveLR * error;
    
    // Track loss for adaptive learning rate
    const loss = error * error;
    this.lossHistory.push(loss);
    if (this.lossHistory.length > 100) {
      this.lossHistory.shift();
    }
  }
  
  // Collect training data with user feedback
  collectTrainingData(features, userFeedback) {
    // userFeedback: 0 (easy), 0.5 (medium), 1 (hard)

    const normalized = this.normalizeFeatures(features);
    if (!normalized) return;
    
    // Immediate incremental update (online learning)
    this.updateIncremental(normalized, userFeedback);
    
    // Also store for potential batch training
    this.trainingData.push({
      features: normalized,
      label: userFeedback,
      timestamp: Date.now()
    });
    
    // Keep only recent training data (last 200 samples)
    if (this.trainingData.length > 200) {
      this.trainingData.shift();
    }
    
    console.log(`📝 Training data collected: ${this.trainingData.length} samples (incremental update applied)`);
    
    // Periodic batch training for refinement (every 50 samples)
    if (this.trainingData.length >= this.minSamplesForBatchTraining && 
        this.trainingData.length % 50 === 0 && 
        !this.isTraining) {
      console.log('🎓 Periodic batch training triggered...');
      this.trainModelBatch();
    }
    
    // Save model periodically (every 10 samples)
    if (this.trainingData.length % 10 === 0) {
      this.saveModel().catch(err => console.warn('Failed to save model:', err));
    }
  }
  
  // Mini-batch training with adaptive learning rate
  async trainModelBatch() {
    if (this.trainingData.length < this.minSamplesForBatchTraining) {
      return;
    }
    
    if (this.isTraining) {
      return;
    }
    
    this.isTraining = true;
    this.trainingCount++;
    
    console.log(`🎓 Batch training with ${this.trainingData.length} samples...`);
    
    try {
      // Adaptive learning rate based on recent loss
      const recentLoss = this.lossHistory.length > 0 
        ? this.lossHistory.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, this.lossHistory.length)
        : 1.0;
      
      // Increase LR if loss is high, decrease if low (but within bounds)
      if (recentLoss > 0.1) {
        this.learningRate = Math.min(0.15, this.learningRate * 1.1);
      } else if (recentLoss < 0.01) {
        this.learningRate = Math.max(this.minLearningRate, this.learningRate * 0.95);
      }
      
      const epochs = 50; // Reduced epochs since we're doing incremental updates
      
      for (let epoch = 0; epoch < epochs; epoch++) {
        // Shuffle training data for better learning
        const shuffled = [...this.trainingData].sort(() => Math.random() - 0.5);
        
        // Mini-batch training
        for (let batchStart = 0; batchStart < shuffled.length; batchStart += this.batchSize) {
          const batch = shuffled.slice(batchStart, batchStart + this.batchSize);
          
          // Average gradients across batch
          const weightGradients = new Array(this.featureCount).fill(0);
          let biasGradient = 0;
          
          for (const { features, label } of batch) {
            const pred = await this.predict(features);
            const error = pred - label;
            
            for (let i = 0; i < this.featureCount; i++) {
              weightGradients[i] += error * features[i];
            }
            biasGradient += error;
          }
          
          // Update weights with batch-averaged gradients + L2 regularization
          const batchSize = batch.length;
          for (let i = 0; i < this.featureCount; i++) {
            const gradient = (weightGradients[i] / batchSize) + (this.l2Lambda * this.weights[i]);
            this.weights[i] -= this.learningRate * gradient;
          }
          this.bias -= this.learningRate * (biasGradient / batchSize);
        }
        
        if (epoch % 10 === 0) {
          const avgLoss = this.lossHistory.length > 0 
            ? this.lossHistory.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, this.lossHistory.length)
            : 0;
          console.log(`Epoch ${epoch}: LR=${this.learningRate.toFixed(4)}, AvgLoss=${avgLoss.toFixed(4)}`);
        }
      }
      
      // Save model after batch training
      await this.saveModel();
      
      console.log('✅ Batch training complete');
      
      chrome.runtime.sendMessage({
        type: 'MODEL_TRAINED',
        sampleCount: this.trainingData.length,
        trainingCount: this.trainingCount
      });
      
    } catch (error) {
      console.error('❌ Batch training error:', error);
    } finally {
      this.isTraining = false;
    }
  }
  
  // Legacy method - kept for compatibility, now uses incremental learning
  async trainModel() {
    return this.trainModelBatch();
  }
  
  async exportModel() {
    // Export model: download JSON with weights/bias/training metadata
    try {
      const data = {
        weights: this.weights,
        bias: this.bias,
        featureCount: this.featureCount,
        samples: this.trainingData.length,
        trainingCount: this.trainingCount,
        learningRate: this.learningRate,
        l2Lambda: this.l2Lambda,
        exportedAt: Date.now(),
        version: '2.0' // Enhanced version with persistence and improvements
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `cognitive-load-model-${Date.now()}.json`
      });
      console.log('✅ Model exported to downloads');
    } catch (error) {
      console.error('❌ Export error:', error);
    }
  }
  
  async resetModel() {
    console.log('🔄 Resetting model...');
    this.weights = new Array(this.featureCount).fill(0);
    this.bias = 0;
    this.trainingData = [];
    this.trainingCount = 0;
    this.learningRate = this.initialLearningRate;
    this.lossHistory = [];
    this.modelLoaded = true;
    
    // Clear saved model from storage
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.remove(['mlModelWeights', 'mlModelBias', 'mlModelTrainingCount', 'mlModelLastSaved'], () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.warn('Failed to clear saved model:', error);
    }
    
    console.log('✅ Model reset complete');
  }
  
  getModelInfo() {
    const avgLoss = this.lossHistory.length > 0
      ? this.lossHistory.reduce((a, b) => a + b, 0) / this.lossHistory.length
      : 0;
    
    return {
      modelLoaded: this.modelLoaded,
      isTraining: this.isTraining,
      trainingDataCount: this.trainingData.length,
      trainingCount: this.trainingCount,
      featureCount: this.featureCount,
      learningRate: this.learningRate,
      averageLoss: avgLoss,
      modelExists: true,
      hasPersistedWeights: this.weights.some(w => w !== 0) // Check if model has been trained
    };
  }
}

// Create global instance
const cognitiveLoadModel = new CognitiveLoadMLModel();

// Initialize on load
cognitiveLoadModel.initialize();