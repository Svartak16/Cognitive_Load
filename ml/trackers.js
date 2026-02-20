// ml/trackers.js

class MouseMovementTracker {
    constructor() {
      this.positions = [];
      this.maxHistorySize = 50;
      this.lastTimestamp = 0;
      this.init();
    }
    
    init() {
      document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    }
    
    handleMouseMove(event) {
      const now = performance.now();
      const timeDelta = now - this.lastTimestamp;
      
      if (timeDelta < 16) return; // Throttle to ~60fps
      
      const position = {
        x: event.clientX,
        y: event.clientY,
        timestamp: now,
        timeDelta: timeDelta
      };
      
      this.positions.push(position);
      
      if (this.positions.length > this.maxHistorySize) {
        this.positions.shift();
      }
      
      this.lastTimestamp = now;
    }
    
    calculateVelocity(pos1, pos2) {
      const distance = Math.sqrt(
        Math.pow(pos2.x - pos1.x, 2) + 
        Math.pow(pos2.y - pos1.y, 2)
      );
      const timeSeconds = (pos2.timestamp - pos1.timestamp) / 1000;
      return timeSeconds > 0 ? distance / timeSeconds : 0;
    }
    
    calculateJitter() {
      if (this.positions.length < 5) return 0;
      
      const recent = this.positions.slice(-10);
      let totalDeviation = 0;
      
      for (let i = 1; i < recent.length - 1; i++) {
        const prev = recent[i - 1];
        const curr = recent[i];
        const next = recent[i + 1];
        
        const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
        const angleDiff = Math.abs(angle2 - angle1);
        
        totalDeviation += angleDiff;
      }
      
      return totalDeviation / (recent.length - 2);
    }
    
    getVelocityMean() {
      if (this.positions.length < 2) return 0;
      
      let total = 0;
      for (let i = 1; i < this.positions.length; i++) {
        total += this.calculateVelocity(this.positions[i - 1], this.positions[i]);
      }
      return total / (this.positions.length - 1);
    }
    
    getVelocityStd() {
      if (this.positions.length < 2) return 0;
      
      const mean = this.getVelocityMean();
      let variance = 0;
      
      for (let i = 1; i < this.positions.length; i++) {
        const vel = this.calculateVelocity(this.positions[i - 1], this.positions[i]);
        variance += Math.pow(vel - mean, 2);
      }
      
      return Math.sqrt(variance / (this.positions.length - 1));
    }
    
    getPathEfficiency() {
      if (this.positions.length < 3) return 1;
      
      let actualPath = 0;
      for (let i = 1; i < this.positions.length; i++) {
        const dx = this.positions[i].x - this.positions[i-1].x;
        const dy = this.positions[i].y - this.positions[i-1].y;
        actualPath += Math.sqrt(dx * dx + dy * dy);
      }
      
      const first = this.positions[0];
      const last = this.positions[this.positions.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const directDistance = Math.sqrt(dx * dx + dy * dy);
      
      return directDistance / (actualPath || 1);
    }
  }
  
  class ScrollBehaviorTracker {
    constructor() {
      this.scrollEvents = [];
      this.maxHistorySize = 30;
      this.lastScrollY = window.pageYOffset;
      this.lastTimestamp = performance.now();
      this.init();
    }
    
    init() {
      let scrollTimeout;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.handleScroll();
        }, 50);
      });
    }
    
    handleScroll() {
      const now = performance.now();
      const currentScrollY = window.pageYOffset;
      const timeDelta = now - this.lastTimestamp;
      
      const scrollData = {
        position: currentScrollY,
        timestamp: now,
        distance: currentScrollY - this.lastScrollY,
        velocity: (currentScrollY - this.lastScrollY) / (timeDelta / 1000),
        direction: Math.sign(currentScrollY - this.lastScrollY)
      };
      
      this.scrollEvents.push(scrollData);
      
      if (this.scrollEvents.length > this.maxHistorySize) {
        this.scrollEvents.shift();
      }
      
      this.lastScrollY = currentScrollY;
      this.lastTimestamp = now;
    }
    
    getVelocityMean() {
      if (this.scrollEvents.length < 2) return 0;
      const velocities = this.scrollEvents.map(e => Math.abs(e.velocity));
      return velocities.reduce((a, b) => a + b, 0) / velocities.length;
    }
    
    getDirectionChanges() {
      if (this.scrollEvents.length < 3) return 0;
      
      let changes = 0;
      for (let i = 1; i < this.scrollEvents.length; i++) {
        if (this.scrollEvents[i].direction !== this.scrollEvents[i - 1].direction) {
          changes++;
        }
      }
      return changes / this.scrollEvents.length;
    }
  }
  
  class ClickHesitationTracker {
    constructor() {
      this.hesitations = [];
      this.maxHistorySize = 20;
      this.currentHover = null;
      this.init();
    }
    
    init() {
      document.addEventListener('mouseover', (e) => {
        if (this.isClickable(e.target)) {
          this.currentHover = {
            element: e.target,
            startTime: performance.now(),
            clicked: false
          };
        }
      }, true);
      
      document.addEventListener('mouseout', (e) => {
        if (this.currentHover && e.target === this.currentHover.element) {
          const hesitationTime = performance.now() - this.currentHover.startTime;
          
          if (hesitationTime > 100 && !this.currentHover.clicked) {
            this.hesitations.push({
              hesitationTime: hesitationTime,
              abandoned: true,
              timestamp: performance.now()
            });
          }
          
          this.currentHover = null;
        }
      }, true);
      
      document.addEventListener('click', (e) => {
        if (this.currentHover && e.target === this.currentHover.element) {
          const hesitationTime = performance.now() - this.currentHover.startTime;
          this.currentHover.clicked = true;
          
          this.hesitations.push({
            hesitationTime: hesitationTime,
            abandoned: false,
            timestamp: performance.now()
          });
          
          this.currentHover = null;
        }
      }, true);
    }
    
    isClickable(element) {
      const clickableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
      const isClickableTag = clickableTags.includes(element.tagName);
      const hasClickHandler = element.onclick !== null;
      const hasCursor = window.getComputedStyle(element).cursor === 'pointer';
      
      return isClickableTag || hasClickHandler || hasCursor;
    }
    
    getHesitationMean() {
      if (this.hesitations.length === 0) return 0;
      const recent = this.hesitations.slice(-10);
      return recent.reduce((sum, h) => sum + h.hesitationTime, 0) / recent.length;
    }
    
    getAbandonmentRate() {
      if (this.hesitations.length === 0) return 0;
      const recent = this.hesitations.slice(-10);
      return recent.filter(h => h.abandoned).length / recent.length;
    }
  }
  
  // Make trackers available globally
  window.MouseMovementTracker = MouseMovementTracker;
  window.ScrollBehaviorTracker = ScrollBehaviorTracker;
  window.ClickHesitationTracker = ClickHesitationTracker;