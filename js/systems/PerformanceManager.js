// Performance Manager - FPS tracking and frame timing

export class PerformanceManager {
    constructor() {
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.actualFPS = 0;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
    }
    
    // Returns true if we should render this frame, false to skip
    shouldRender(currentTime, targetFPS) {
        const targetFrameTime = 1000 / targetFPS;
        this.deltaTime = currentTime - this.lastFrameTime;
        
        if (this.deltaTime < targetFrameTime) {
            return false;
        }
        
        // Adjust lastFrameTime to avoid drift
        this.lastFrameTime = currentTime - (this.deltaTime % targetFrameTime);
        return true;
    }
    
    // Update FPS counter (call once per second)
    updateFPS(currentTime) {
        this.frameCount++;
        
        if (currentTime - this.fpsUpdateTime >= 1000) {
            this.actualFPS = Math.round(this.frameCount * 1000 / (currentTime - this.fpsUpdateTime));
            this.frameCount = 0;
            this.fpsUpdateTime = currentTime;
            return true; // Signal that FPS was updated
        }
        return false;
    }
    
    // Get delta time in seconds (capped to prevent huge jumps)
    getDeltaSeconds() {
        return Math.min(this.deltaTime / 1000, 0.1);
    }
    
    getActualFPS() {
        return this.actualFPS;
    }
}

// Singleton instance
export const performanceManager = new PerformanceManager();
