// ml/feature-extractor.js - ENHANCED VERSION
// Returns a 49-length numeric feature vector:
// - 11 base features
// - 15 enhanced features (NEW)
// - 10 original polynomial interactions
// - 10 advanced polynomial interactions (NEW)
// - 2 temporal features
// - 1 content-complexity feature

class FeatureExtractor {
  constructor() {
    this.startTime = Date.now();
    
    // ========== ORIGINAL BASE TRACKING ==========
    this.scrollDepth = 0;
    this.maxScrollSpeed = 0;
    this.hoverCount = 0;
    this.clickCount = 0;
    this.keypressCount = 0;
    this.mouseDistance = 0;
    this.selectionLength = 0;
    this.focusChanges = 0;
    this.lastMousePos = null;
    
    // ========== NEW: ENHANCED TRACKING ==========
    this.scrollReversals = 0;        // Back-and-forth scrolling (confusion indicator)
    this.lastScrollDirection = 0;
    this.lastScrollY = 0;
    this.lastScrollTime = undefined;
    
    this.rapidClicks = 0;            // Clicks within 500ms (frustration)
    this.lastClickTime = 0;
    
    this.mouseStops = 0;             // Mouse stationary >2s (reading/stuck)
    this.lastMouseMoveTime = Date.now();
    
    this.textCopies = 0;             // Copy events (note-taking/comprehension check)
    this.rightClicks = 0;            // Context menu usage (looking up definitions)
    
    this.scrollPauses = 0;           // Pauses >3s between scrolls (reading)
    
    this.errorClicks = 0;            // Clicks on non-interactive elements (confusion)
    
    this.tabSwitchDuration = 0;      // Time spent away from page (distraction)
    this.lastVisibilityChange = Date.now();
    
    this.mouseAcceleration = [];     // Track sudden movements (uncertainty)
    this.lastVelocity = undefined;
    
    this.clickPositions = [];        // For calculating click entropy
    this.contentComplexityCache = { value: 0.5, timestamp: 0 };
    
    // ========== LISTENERS ==========
    this.onScroll = this.handleScroll.bind(this);
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseOver = () => this.hoverCount++;
    this.onClick = this.handleClick.bind(this);
    this.onKeyPress = () => this.keypressCount++;
    this.onSelectionChange = this.handleSelection.bind(this);
    this.onVisibilityChange = this.handleVisibility.bind(this);
    this.onCopy = () => this.textCopies++;
    this.onContextMenu = () => this.rightClicks++;

    // Attach event listeners
    window.addEventListener('scroll', this.onScroll, { passive: false });
    window.addEventListener('mousemove', this.onMouseMove, { passive: false });
    document.addEventListener('mouseover', this.onMouseOver);
    document.addEventListener('click', this.onClick, true); // Capture phase for all clicks
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('keypress', this.onKeyPress);
    document.addEventListener('selectionchange', this.onSelectionChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('copy', this.onCopy);
  }

  // ========== ENHANCED SCROLL HANDLER ==========
  handleScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total = Math.max(document.body.scrollHeight, 1);
    const depth = scrolled / total;
    const now = performance.now();
    
    if (this.lastScrollTime !== undefined) {
      const deltaT = (now - this.lastScrollTime) / 1000;
      const deltaY = Math.abs(scrolled - (this.lastScrollY || 0));
      const speed = deltaY / Math.max(deltaT, 0.001);
      this.maxScrollSpeed = Math.max(this.maxScrollSpeed, speed);
      
      // NEW: Detect scroll reversals (back-and-forth = confusion)
      const currentDirection = Math.sign(scrolled - this.lastScrollY);
      if (this.lastScrollDirection !== 0 && 
          currentDirection !== 0 && 
          currentDirection !== this.lastScrollDirection) {
        this.scrollReversals++;
      }
      this.lastScrollDirection = currentDirection;
      
      // NEW: Detect scroll pauses (>3s between scrolls = reading/thinking)
      if (deltaT > 3) {
        this.scrollPauses++;
      }
    }
    
    this.lastScrollTime = now;
    this.lastScrollY = scrolled;
    this.scrollDepth = Math.max(this.scrollDepth, depth);
  }

  // ========== ENHANCED MOUSE MOVE HANDLER ==========
  handleMouseMove(e) {
    const now = performance.now();
    
    if (this.lastMousePos) {
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.mouseDistance += distance;
      
      // NEW: Track mouse acceleration (sudden movements = uncertainty)
      const dt = Math.max(1, now - this.lastMouseMoveTime);
      const velocity = distance / dt;
      
      if (this.lastVelocity !== undefined) {
        const acceleration = Math.abs(velocity - this.lastVelocity);
        this.mouseAcceleration.push(acceleration);
        
        // Keep only recent acceleration data (last 50 points)
        if (this.mouseAcceleration.length > 50) {
          this.mouseAcceleration.shift();
        }
      }
      this.lastVelocity = velocity;
      
      // NEW: Detect mouse stops (stationary >2s = reading or stuck)
      if (distance < 5 && dt > 2000) {
        this.mouseStops++;
      }
    }
    
    this.lastMousePos = { x: e.clientX, y: e.clientY };
    this.lastMouseMoveTime = now;
  }

  // ========== NEW: ENHANCED CLICK HANDLER ==========
  handleClick(e) {
    const now = performance.now();
    this.clickCount++;
    
    // NEW: Detect rapid clicking (frustration/errors)
    if (this.lastClickTime && (now - this.lastClickTime) < 500) {
      this.rapidClicks++;
    }
    this.lastClickTime = now;
    
    // NEW: Track click positions for entropy calculation
    this.clickPositions.push({ x: e.clientX, y: e.clientY });
    if (this.clickPositions.length > 20) {
      this.clickPositions.shift();
    }
    
    // NEW: Detect error clicks (clicking non-interactive elements)
    const isInteractive = e.target.matches('a, button, input, select, textarea, [onclick], [role="button"], [tabindex]');
    if (!isInteractive && e.target.tagName !== 'BODY' && e.target.tagName !== 'HTML') {
      this.errorClicks++;
    }
  }

  handleSelection() {
    const selection = window.getSelection();
    this.selectionLength = selection ? selection.toString().length : 0;
  }

  // ========== NEW: ENHANCED VISIBILITY HANDLER ==========
  handleVisibility() {
    const now = Date.now();
    
    if (document.visibilityState === 'hidden') {
      this.lastVisibilityChange = now;
    } else {
      // Page became visible again - track how long user was away
      const awayTime = now - this.lastVisibilityChange;
      this.tabSwitchDuration += awayTime;
    }
    
    this.focusChanges++;
  }

  // ========== NEW: CALCULATE CLICK ENTROPY ==========
  // High entropy = random clicking (confusion), Low entropy = focused clicking
  calculateClickEntropy() {
    if (this.clickPositions.length < 3) return 0;
    
    // Divide screen into 4x4 grid
    const gridSize = 4;
    const cellWidth = window.innerWidth / gridSize;
    const cellHeight = window.innerHeight / gridSize;
    const cells = new Array(gridSize * gridSize).fill(0);
    
    // Count clicks per cell
    this.clickPositions.forEach(pos => {
      const cellX = Math.min(Math.floor(pos.x / cellWidth), gridSize - 1);
      const cellY = Math.min(Math.floor(pos.y / cellHeight), gridSize - 1);
      const cellIndex = cellY * gridSize + cellX;
      cells[cellIndex]++;
    });
    
    // Calculate Shannon entropy
    const total = this.clickPositions.length;
    let entropy = 0;
    cells.forEach(count => {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    });
    
    // Normalize to 0-1 (max entropy for 4x4 grid is log2(16) = 4)
    return entropy / 4;
  }

  // ========== NEW: CALCULATE MOUSE ACCELERATION VARIANCE ==========
  getMouseAccelerationVariance() {
    if (this.mouseAcceleration.length < 5) return 0;
    
    const mean = this.mouseAcceleration.reduce((a, b) => a + b, 0) / this.mouseAcceleration.length;
    const variance = this.mouseAcceleration.reduce((sum, val) => {
      return sum + Math.pow(val - mean, 2);
    }, 0) / this.mouseAcceleration.length;
    
    return Math.sqrt(variance); // Standard deviation
  }

  countSyllables(text) {
    const words = String(text || '').toLowerCase().match(/\b\w+\b/g) || [];
    return words.reduce((count, word) => {
      const syllables = word.match(/[aeiouy]{1,2}/g) || [];
      return count + Math.max(1, syllables.length);
    }, 0);
  }

  countTechnicalWords(text) {
    const words = String(text || '').match(/\b\w+\b/g) || [];
    return words.filter((word) => (
      word.length >= 12 ||
      /[A-Z]{2,}/.test(word) ||
      /\d+\.\d+/.test(word) ||
      /\w+-\w+-\w+/.test(word)
    )).length;
  }

  calculateContentComplexity() {
    const now = Date.now();
    if (now - this.contentComplexityCache.timestamp < 10_000) {
      return this.contentComplexityCache.value;
    }

    const text = document?.body?.innerText || '';
    const sentences = (text.match(/[.!?]+/g) || []).length;
    const words = (text.match(/\b\w+\b/g) || []).length;

    if (sentences === 0 || words === 0) {
      this.contentComplexityCache = { value: 0.5, timestamp: now };
      return 0.5;
    }

    const syllables = this.countSyllables(text);
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;

    const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    const fleschNormalized = Math.max(0, Math.min(1, (100 - fleschScore) / 100));

    const technicalDensity = Math.min(this.countTechnicalWords(text) / words, 0.3) / 0.3;
    const avgWordLength = text.replace(/\s+/g, '').length / words;
    const wordLengthComplexity = Math.min(avgWordLength / 10, 1);

    const combined = (fleschNormalized * 0.5) + (technicalDensity * 0.3) + (wordLengthComplexity * 0.2);
    const normalized = Math.max(0, Math.min(1, combined));

    this.contentComplexityCache = { value: normalized, timestamp: now };
    return normalized;
  }

  getTemporalFeatures(timeOnPageSeconds) {
    const fatigueFactor = Math.min(timeOnPageSeconds / 600, 1);
    const recentInteractionRate = this.clickCount / Math.max(1, timeOnPageSeconds);
    const expectedInteractionRate = 0.5;
    const interactionDecay = 1 - Math.min(recentInteractionRate / expectedInteractionRate, 1);

    return [fatigueFactor, interactionDecay];
  }

  // ========== ENHANCED FEATURE ARRAY (49 features) ==========
  toArray() {
    const now = Date.now();
    const timeOnPage = (now - this.startTime) / 1000; // seconds

    // ========== BASE FEATURES (11) - ORIGINAL ==========
    const scrollDepth = Math.min(this.scrollDepth, 1);
    const scrollSpeed = Math.tanh(this.maxScrollSpeed / 1000);
    const hoverDensity = Math.tanh(this.hoverCount / 100);
    const clickDensity = Math.tanh(this.clickCount / 50);
    const timeNorm = Math.tanh(timeOnPage / 600);
    const typingActivity = Math.tanh(this.keypressCount / 200);
    const mouseTravel = Math.tanh(this.mouseDistance / 50000);
    const isUnfocused = document.visibilityState === 'visible' ? 0 : 1;
    const focusChurn = Math.tanh(this.focusChanges / 20);
    const selectionLength = Math.tanh(this.selectionLength / 2000);
    const noise = Math.random() * 0.01;

    // ========== ENHANCED FEATURES (15) - NEW ==========
    const scrollReversalRate = Math.tanh(this.scrollReversals / 10);           // 12: Confusion indicator
    const rapidClickRate = Math.tanh(this.rapidClicks / 5);                    // 13: Frustration
    const mouseStopFrequency = Math.tanh(this.mouseStops / 8);                 // 14: Reading pauses
    const textCopyRate = Math.tanh(this.textCopies / 3);                       // 15: Note-taking
    const rightClickRate = Math.tanh(this.rightClicks / 5);                    // 16: Looking up definitions
    const scrollPauseRate = Math.tanh(this.scrollPauses / 10);                 // 17: Reading comprehension
    const errorClickRate = Math.tanh(this.errorClicks / 10);                   // 18: Confusion/errors
    const awayTimeRatio = Math.min(this.tabSwitchDuration / Math.max(1, timeOnPage * 1000), 1); // 19: Distraction
    const clickEntropy = this.calculateClickEntropy();                         // 20: Click randomness
    const mouseAccelVar = Math.tanh(this.getMouseAccelerationVariance() / 100); // 21: Jerky movements
    
    // Derived composite features
    const scrollConsistency = 1 - scrollReversalRate;                          // 22: Smooth scrolling
    const engagementScore = (typingActivity + textCopyRate) / 2;               // 23: Active learning
    const frustrationScore = (rapidClickRate + errorClickRate) / 2;            // 24: Error patterns
    const attentionScore = 1 - awayTimeRatio;                                  // 25: Focus
    const explorationScore = (hoverDensity + clickEntropy) / 2;                // 26: Searching vs reading

    // Base features array (11)
    const baseFeatures = [
      scrollDepth,           // 1
      scrollSpeed,           // 2
      hoverDensity,          // 3
      clickDensity,          // 4
      timeNorm,              // 5
      typingActivity,        // 6
      mouseTravel,           // 7
      isUnfocused,           // 8
      focusChurn,            // 9
      selectionLength,       // 10
      noise                  // 11
    ];

    // Enhanced features array (15)
    const enhancedFeatures = [
      scrollReversalRate,    // 12
      rapidClickRate,        // 13
      mouseStopFrequency,    // 14
      textCopyRate,          // 15
      rightClickRate,        // 16
      scrollPauseRate,       // 17
      errorClickRate,        // 18
      awayTimeRatio,         // 19
      clickEntropy,          // 20
      mouseAccelVar,         // 21
      scrollConsistency,     // 22
      engagementScore,       // 23
      frustrationScore,      // 24
      attentionScore,        // 25
      explorationScore       // 26
    ];

    // ========== ORIGINAL POLYNOMIAL INTERACTIONS (10) ==========
    const polynomialFeatures = [
      scrollDepth * hoverDensity,                    // 27: High scroll + hovers = confusion
      scrollSpeed * clickDensity,                    // 28: Fast scrolling + clicks = searching
      timeNorm * hoverDensity,                       // 29: Long time + hovers = struggling
      clickDensity * focusChurn,                     // 30: Many clicks + focus changes = task switching
      mouseTravel * hoverDensity,                    // 31: Mouse movement + hovers = exploration
      scrollDepth * selectionLength,                 // 32: Deep scroll + selection = reading difficulty
      typingActivity * focusChurn,                   // 33: Typing + focus changes = distraction
      scrollSpeed * timeNorm,                        // 34: Fast scroll + time = skimming vs reading
      hoverDensity * selectionLength,                // 35: Hovers + selection = comprehension struggle
      clickDensity * typingActivity                  // 36: Clicks + typing = form filling
    ];

    // ========== ADVANCED POLYNOMIAL INTERACTIONS (10) - NEW ==========
    const advancedInteractions = [
      scrollReversalRate * hoverDensity,             // 37: Confusion + exploration
      rapidClickRate * errorClickRate,               // 38: Frustration patterns
      mouseStopFrequency * selectionLength,          // 39: Reading difficulty
      scrollPauseRate * timeNorm,                    // 40: Careful reading
      clickEntropy * focusChurn,                     // 41: Distracted searching
      frustrationScore * attentionScore,             // 42: Struggling but focused
      explorationScore * scrollReversalRate,         // 43: Lost navigation
      engagementScore * scrollConsistency,           // 44: Smooth learning
      textCopyRate * typingActivity,                 // 45: Active note-taking
      awayTimeRatio * focusChurn                     // 46: Multitasking load
    ];

    const temporalFeatures = this.getTemporalFeatures(timeOnPage);
    const contentComplexity = this.calculateContentComplexity();

    // TOTAL: 11 + 15 + 10 + 10 + 2 + 1 = 49 features
    return [
      ...baseFeatures,
      ...enhancedFeatures,
      ...polynomialFeatures,
      ...advancedInteractions,
      ...temporalFeatures,
      contentComplexity
    ];
  }

  // ========== ENHANCED DEBUG INFO ==========
  getDebugInfo() {
    return {
      // Original
      scrollDepth: this.scrollDepth,
      maxScrollSpeed: this.maxScrollSpeed,
      hoverCount: this.hoverCount,
      clickCount: this.clickCount,
      keypressCount: this.keypressCount,
      mouseDistance: this.mouseDistance,
      selectionLength: this.selectionLength,
      focusChanges: this.focusChanges,
      timeOnPage: (Date.now() - this.startTime) / 1000,
      
      // NEW
      scrollReversals: this.scrollReversals,
      rapidClicks: this.rapidClicks,
      mouseStops: this.mouseStops,
      textCopies: this.textCopies,
      rightClicks: this.rightClicks,
      scrollPauses: this.scrollPauses,
      errorClicks: this.errorClicks,
      tabSwitchDuration: this.tabSwitchDuration,
      clickEntropy: this.calculateClickEntropy(),
      mouseAccelVariance: this.getMouseAccelerationVariance(),
      contentComplexity: this.calculateContentComplexity()
    };
  }

  dispose() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseover', this.onMouseOver);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('keypress', this.onKeyPress);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('copy', this.onCopy);
  }
}
