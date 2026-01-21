// Ripple water effect class - realistic wave propagation with interference

export class Ripple {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 1;
        this.maxRadius = 180;
        this.opacity = 0.8;
        this.speed = 1.5;
        this.life = 120;
        this.ringCount = 3; // Multiple concentric rings
        this.ringSpacing = 25; // Distance between rings
        this.amplitude = 1.0; // Wave height (for interference calculations)
    }

    update(dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        this.radius += this.speed * scale;
        this.opacity -= 0.008 * scale;
        this.life -= scale;
        
        // Amplitude decreases as wave spreads
        this.amplitude = this.opacity;
    }
    
    // Calculate wave amplitude at a given point (for interference)
    getAmplitudeAt(x, y) {
        const dist = Math.sqrt((x - this.x) ** 2 + (y - this.y) ** 2);
        
        // Check each ring
        for (let i = 0; i < this.ringCount; i++) {
            const ringRadius = this.radius - (i * this.ringSpacing);
            if (ringRadius <= 0) continue;
            
            // Distance from this ring
            const distFromRing = Math.abs(dist - ringRadius);
            
            // If point is near this ring (within wave width)
            const waveWidth = 8;
            if (distFromRing < waveWidth) {
                // Wave amplitude falls off with distance from ring
                const ringStrength = (1 - distFromRing / waveWidth);
                const ringAge = ringRadius / this.maxRadius;
                const ringOpacity = this.opacity * (1 - i * 0.25) * (1 - ringAge * 0.5);
                
                // Sinusoidal wave pattern
                const phase = (distFromRing / waveWidth) * Math.PI * 2;
                return Math.sin(phase) * ringStrength * ringOpacity * this.amplitude;
            }
        }
        
        return 0;
    }

    draw(ctx, allRipples = []) {
        if (this.opacity <= 0 || this.radius < 0) return;
        
        ctx.save();
        
        // Draw multiple concentric rings with interference
        for (let i = 0; i < this.ringCount; i++) {
            const ringRadius = this.radius - (i * this.ringSpacing);
            
            if (ringRadius <= 2) continue; // Skip if too small
            
            // Each ring fades as it expands and is weaker the further from center
            const ringAge = ringRadius / this.maxRadius;
            let ringOpacity = this.opacity * (1 - i * 0.25) * (1 - ringAge * 0.5);
            
            if (ringOpacity <= 0) continue;
            
            // Check for interference with other ripples
            let interferenceBoost = 0;
            for (let other of allRipples) {
                if (other === this || !other.opacity) continue;
                
                // Distance between ripple centers
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const centerDist = Math.sqrt(dx * dx + dy * dy);
                
                // Check if this ring intersects with any of the other ripple's rings
                for (let j = 0; j < other.ringCount; j++) {
                    const otherRingRadius = other.radius - (j * other.ringSpacing);
                    if (otherRingRadius <= 0) continue;
                    
                    // Check if rings are overlapping
                    const ringDiff = Math.abs(centerDist - (ringRadius + otherRingRadius));
                    const ringSum = Math.abs(centerDist - Math.abs(ringRadius - otherRingRadius));
                    
                    // Rings intersect
                    if (ringDiff < 15 || ringSum < 15) {
                        const otherRingAge = otherRingRadius / other.maxRadius;
                        const otherStrength = other.opacity * (1 - j * 0.25) * (1 - otherRingAge * 0.5);
                        
                        // Constructive interference when rings align
                        interferenceBoost += otherStrength * 0.3;
                    }
                }
            }
            
            // Apply interference (can amplify or slightly modify)
            ringOpacity = Math.min(1, ringOpacity + interferenceBoost);
            
            // Calculate line widths with bounds checking
            const mainWidth = Math.max(0.5, 2.5 - (ringAge * 1.5));
            const shadowWidth = Math.max(0.5, 1.5 - (ringAge * 1));
            const blurWidth = Math.max(1, 4 - (ringAge * 2));
            
            // Interference creates brighter spots
            const interferenceColor = interferenceBoost > 0.1 ? 
                `rgba(240, 250, 255, ${ringOpacity * 0.4})` : 
                `rgba(220, 240, 255, ${ringOpacity * 0.35})`;
            
            // Outer bright highlight (light reflecting off wave crest)
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = interferenceColor;
            ctx.lineWidth = mainWidth * (1 + interferenceBoost * 0.5);
            ctx.stroke();
            
            // Inner shadow (wave trough) - only if radius is large enough
            if (ringRadius > 2) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, Math.max(1, ringRadius - 1.5), 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 40, 80, ${ringOpacity * 0.25})`;
                ctx.lineWidth = shadowWidth;
                ctx.stroke();
            }
            
            // Subtle blur effect for the main ring
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringRadius + 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(180, 220, 240, ${ringOpacity * 0.15})`;
            ctx.lineWidth = blurWidth;
            ctx.stroke();
        }
        
        // Center disturbance (where ripple originated)
        if (this.radius > 1 && this.radius < 30) {
            const centerRadius = Math.max(1, this.radius * 0.4);
            const centerOpacity = this.opacity * (1 - this.radius / 30);
            
            if (centerOpacity > 0 && centerRadius > 0) {
                const disturbanceGradient = ctx.createRadialGradient(
                    this.x, this.y, 0,
                    this.x, this.y, centerRadius
                );
                disturbanceGradient.addColorStop(0, `rgba(200, 230, 255, ${centerOpacity * 0.3})`);
                disturbanceGradient.addColorStop(0.6, `rgba(180, 220, 245, ${centerOpacity * 0.15})`);
                disturbanceGradient.addColorStop(1, `rgba(160, 210, 235, 0)`);
                
                ctx.fillStyle = disturbanceGradient;
                ctx.beginPath();
                ctx.arc(this.x, this.y, centerRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
}
