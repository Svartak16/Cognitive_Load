// Lightweight feature extractor used by the ML detector.
// Returns a 21-length numeric feature vector (11 base features + 10 polynomial interactions).
class FeatureExtractor {
  constructor() {
    this.startTime = Date.now();
    this.scrollDepth = 0;
    this.maxScrollSpeed = 0;
    this.hoverCount = 0;
    this.clickCount = 0;
    this.keypressCount = 0;
    this.mouseDistance = 0;
    this.selectionLength = 0;
    this.focusChanges = 0;
    this.lastMousePos = null;

    // Listeners
    this.onScroll = this.handleScroll.bind(this);
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseOver = () => this.hoverCount++;
    this.onClick = () => this.clickCount++;
    this.onKeyPress = () => this.keypressCount++;
    this.onSelectionChange = this.handleSelection.bind(this);
    this.onVisibilityChange = () => this.focusChanges++;

    // Use non-passive listeners so preventDefault is allowed if needed (avoids
    // "Unable to preventDefault inside passive event listener" warnings).
    window.addEventListener('scroll', this.onScroll, { passive: false });
    window.addEventListener('mousemove', this.onMouseMove, { passive: false });
    document.addEventListener('mouseover', this.onMouseOver);
    document.addEventListener('click', this.onClick);
    document.addEventListener('keypress', this.onKeyPress);
    document.addEventListener('selectionchange', this.onSelectionChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

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
    }
    this.lastScrollTime = now;
    this.lastScrollY = scrolled;
    this.scrollDepth = Math.max(this.scrollDepth, depth);
  }

  handleMouseMove(e) {
    if (this.lastMousePos) {
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.mouseDistance += Math.sqrt(dx * dx + dy * dy);
    }
    this.lastMousePos = { x: e.clientX, y: e.clientY };
  }

  handleSelection() {
    const selection = window.getSelection();
    this.selectionLength = selection ? selection.toString().length : 0;
  }

  // Normalize features and return expanded array with polynomial features for non-linearity
  // Original 11 features + 10 interaction features = 21 total features
  toArray() {
    const now = Date.now();
    const timeOnPage = (now - this.startTime) / 1000; // seconds

    // Base features (normalized to 0-1 range)
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

    // Base features (11)
    const baseFeatures = [
      scrollDepth,           // 1) scroll depth
      scrollSpeed,           // 2) scroll speed
      hoverDensity,          // 3) hover density
      clickDensity,          // 4) click density
      timeNorm,              // 5) time on page
      typingActivity,        // 6) typing activity
      mouseTravel,           // 7) mouse travel
      isUnfocused,           // 8) currently unfocused
      focusChurn,            // 9) focus churn
      selectionLength,       // 10) text selection length
      noise                  // 11) small noise term
    ];

    //ha navin approach aahe
    // Polynomial feature interactions (10 key interactions)
    // These capture non-linear relationships important for cognitive load
    const interactions = [
      scrollDepth * hoverDensity,        // 12) High scroll + many hovers = confusion
      scrollSpeed * clickDensity,         // 13) Fast scrolling + clicks = searching
      timeNorm * hoverDensity,            // 14) Long time + hovers = struggling
      clickDensity * focusChurn,          // 15) Many clicks + focus changes = task switching
      mouseTravel * hoverDensity,         // 16) Mouse movement + hovers = exploration
      scrollDepth * selectionLength,      // 17) Deep scroll + selection = reading difficulty
      typingActivity * focusChurn,        // 18) Typing + focus changes = distraction
      scrollSpeed * timeNorm,             // 19) Fast scroll + time = skimming vs reading
      hoverDensity * selectionLength,     // 20) Hovers + selection = comprehension struggle
      clickDensity * typingActivity       // 21) Clicks + typing = form filling/interaction
    ];

    return [...baseFeatures, ...interactions];
  }

  getDebugInfo() {
    return {
      scrollDepth: this.scrollDepth,
      maxScrollSpeed: this.maxScrollSpeed,
      hoverCount: this.hoverCount,
      clickCount: this.clickCount,
      keypressCount: this.keypressCount,
      mouseDistance: this.mouseDistance,
      selectionLength: this.selectionLength,
      focusChanges: this.focusChanges,
      timeOnPage: (Date.now() - this.startTime) / 1000
    };
  }

  dispose() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseover', this.onMouseOver);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('keypress', this.onKeyPress);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
