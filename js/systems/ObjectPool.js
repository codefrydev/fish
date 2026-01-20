// Object Pooling System for efficient memory management

import { params } from '../config.js';

export class ObjectPool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];
        
        // Pre-allocate objects
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }
    
    acquire(...args) {
        let obj = this.pool.pop();
        if (!obj) {
            obj = this.createFn();
        }
        this.resetFn(obj, ...args);
        this.active.push(obj);
        return obj;
    }
    
    release(obj) {
        const idx = this.active.indexOf(obj);
        if (idx !== -1) {
            this.active.splice(idx, 1);
            this.pool.push(obj);
        }
    }
    
    releaseAll() {
        while (this.active.length > 0) {
            this.pool.push(this.active.pop());
        }
    }
    
    getActive() {
        return this.active;
    }
    
    getActiveCount() {
        return this.active.length;
    }
}

// Ripple Pool
export const ripplePool = new ObjectPool(
    () => ({ 
        x: 0, y: 0, radius: 1, maxRadius: 180, opacity: 0.8, speed: 1.5, 
        life: 120, ringCount: 3, ringSpacing: 25, amplitude: 1.0, active: false 
    }),
    (ripple, x, y, radius = 1, maxRadius = 180, speed = 1.5) => {
        ripple.x = x;
        ripple.y = y;
        ripple.radius = radius;
        ripple.maxRadius = maxRadius;
        ripple.opacity = 0.8;
        ripple.speed = speed;
        ripple.life = 120;
        ripple.ringCount = 3;
        ripple.ringSpacing = 25;
        ripple.amplitude = 1.0;
        ripple.active = true;
    },
    50
);

// Food Pool
export const foodPool = new ObjectPool(
    () => ({ pos: { x: 0, y: 0 }, size: 4, eaten: false, vel: { x: 0, y: 0 }, active: false }),
    (food, x, y) => {
        food.pos.x = x;
        food.pos.y = y;
        food.size = params.foodSize * (params.foodSizeVariationMin + Math.random() * (params.foodSizeVariationMax - params.foodSizeVariationMin));
        food.eaten = false;
        food.vel.x = params.foodVelocityMin + Math.random() * (params.foodVelocityMax - params.foodVelocityMin);
        food.vel.y = params.foodVelocityMin + Math.random() * (params.foodVelocityMax - params.foodVelocityMin);
        food.active = true;
    },
    100
);

// Pooled update/draw functions for ripples
export function updatePooledRipple(ripple, dt = 1/60) {
    const scale = dt * 60;
    ripple.radius += ripple.speed * scale;
    ripple.opacity -= 0.008 * scale;
    ripple.life -= scale;
    ripple.amplitude = ripple.opacity; // Amplitude decreases with opacity
    return ripple.life > 0 && ripple.opacity > 0;
}

export function drawPooledRipple(ripple, ctx, allRipples = []) {
    if (ripple.opacity <= 0 || ripple.radius < 0) return;
    
    ctx.save();
    
    // Draw multiple concentric rings with interference
    for (let i = 0; i < ripple.ringCount; i++) {
        const ringRadius = ripple.radius - (i * ripple.ringSpacing);
        
        if (ringRadius <= 2) continue; // Skip if too small
        
        // Each ring fades as it expands and is weaker the further from center
        const ringAge = ringRadius / ripple.maxRadius;
        let ringOpacity = ripple.opacity * (1 - i * 0.25) * (1 - ringAge * 0.5);
        
        if (ringOpacity <= 0) continue;
        
        // Check for interference with other ripples
        let interferenceBoost = 0;
        for (let other of allRipples) {
            if (other === ripple || !other.opacity) continue;
            
            // Distance between ripple centers
            const dx = other.x - ripple.x;
            const dy = other.y - ripple.y;
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
        ctx.arc(ripple.x, ripple.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = interferenceColor;
        ctx.lineWidth = mainWidth * (1 + interferenceBoost * 0.5);
        ctx.stroke();
        
        // Inner shadow (wave trough) - only if radius is large enough
        if (ringRadius > 2) {
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, Math.max(1, ringRadius - 1.5), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 40, 80, ${ringOpacity * 0.25})`;
            ctx.lineWidth = shadowWidth;
            ctx.stroke();
        }
        
        // Subtle blur effect for the main ring
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ringRadius + 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 220, 240, ${ringOpacity * 0.15})`;
        ctx.lineWidth = blurWidth;
        ctx.stroke();
    }
    
    // Center disturbance (where ripple originated)
    if (ripple.radius > 1 && ripple.radius < 30) {
        const centerRadius = Math.max(1, ripple.radius * 0.4);
        const centerOpacity = ripple.opacity * (1 - ripple.radius / 30);
        
        if (centerOpacity > 0 && centerRadius > 0) {
            const disturbanceGradient = ctx.createRadialGradient(
                ripple.x, ripple.y, 0,
                ripple.x, ripple.y, centerRadius
            );
            disturbanceGradient.addColorStop(0, `rgba(200, 230, 255, ${centerOpacity * 0.3})`);
            disturbanceGradient.addColorStop(0.6, `rgba(180, 220, 245, ${centerOpacity * 0.15})`);
            disturbanceGradient.addColorStop(1, `rgba(160, 210, 235, 0)`);
            
            ctx.fillStyle = disturbanceGradient;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, centerRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.restore();
}

// Pooled update/draw functions for food
export function updatePooledFood(food, dt = 1/60) {
    const scale = dt * 60;
    food.pos.x += food.vel.x * scale;
    food.pos.y += food.vel.y * scale;
}

export function drawPooledFood(food, ctx) {
    if (food.eaten) return;
    ctx.save();
    ctx.translate(food.pos.x, food.pos.y);
    ctx.beginPath();
    ctx.arc(0, 0, food.size, 0, Math.PI * 2);
    ctx.fillStyle = params.foodColor;
    ctx.fill();
    ctx.restore();
}
