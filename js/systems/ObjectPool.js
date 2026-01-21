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

// Blood Pool
export const bloodPool = new ObjectPool(
    () => ({
        x: 0, y: 0, radius: 0, maxRadius: 0, opacity: 1.0, life: 0,
        particles: [], active: false
    }),
    (blood, x, y) => {
        blood.x = x;
        blood.y = y;
        blood.radius = params.bloodInitialRadius;
        blood.maxRadius = params.bloodMaxRadius;
        blood.opacity = 1.0;
        blood.life = params.bloodLifeDuration;
        blood.active = true;
        
        // Initialize particles
        blood.particles = [];
        for (let i = 0; i < params.bloodParticleCount; i++) {
            const angle = (Math.PI * 2 * i) / params.bloodParticleCount + Math.random() * 0.5;
            const distance = Math.random() * blood.radius * 0.5;
            blood.particles.push({
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance,
                size: params.bloodParticleSizeMin + Math.random() * (params.bloodParticleSizeMax - params.bloodParticleSizeMin),
                angle: angle,
                spreadSpeed: params.bloodParticleSpreadSpeedMin + Math.random() * (params.bloodParticleSpreadSpeedMax - params.bloodParticleSpreadSpeedMin),
                opacity: 1.0
            });
        }
    },
    30
);

// Pooled update/draw functions for blood (slime-like)
export function updatePooledBlood(blood, dt = 1/60) {
    const scale = dt * 60;
    
    // Update main slime blob - slower, more viscous spread
    blood.radius += params.bloodSpreadSpeed * scale * 0.6; // Slower spread for viscosity
    blood.opacity -= params.bloodFadeSpeed * scale * 0.7; // Slower fade for thicker slime
    blood.life -= scale;
    
    // Update particles - more cohesive movement
    for (let particle of blood.particles) {
        // Slower, more viscous particle movement
        const viscousSpeed = particle.spreadSpeed * 0.5;
        particle.x += Math.cos(particle.angle) * viscousSpeed * scale;
        particle.y += Math.sin(particle.angle) * viscousSpeed * scale;
        
        // Particles fade slower (thicker slime)
        particle.opacity = blood.opacity * (1 - (blood.radius / blood.maxRadius) * 0.5);
    }
    
    return blood.life > 0 && blood.opacity > 0;
}

// Helper function to create irregular blob shape using deterministic noise
function createIrregularBlob(ctx, centerX, centerY, baseRadius, points, noiseAmount) {
    ctx.beginPath();
    
    // Create irregular shape using multiple points with deterministic noise
    const pointCount = Math.max(8, Math.min(points, 20));
    const angleStep = (Math.PI * 2) / pointCount;
    
    // Use a simple hash of center position for consistent noise
    const seed = Math.floor(centerX * 100 + centerY * 100);
    
    for (let i = 0; i <= pointCount; i++) {
        const angle = i * angleStep;
        // Deterministic noise based on angle and seed
        const noiseValue = Math.sin(angle * 3.7 + seed) * Math.cos(angle * 5.3 + seed * 0.7);
        const noise = 1 + noiseValue * noiseAmount;
        const radius = baseRadius * noise;
        
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            // Use quadratic curves for smoother but irregular shape
            const prevAngle = (i - 1) * angleStep;
            const prevNoiseValue = Math.sin(prevAngle * 3.7 + seed) * Math.cos(prevAngle * 5.3 + seed * 0.7);
            const prevNoise = 1 + prevNoiseValue * noiseAmount * 0.7;
            const prevRadius = baseRadius * prevNoise;
            const prevX = centerX + Math.cos(prevAngle) * prevRadius;
            const prevY = centerY + Math.sin(prevAngle) * prevRadius;
            
            const midX = (prevX + x) / 2;
            const midY = (prevY + y) / 2;
            
            ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
    }
    
    ctx.closePath();
}

export function drawPooledBlood(blood, ctx) {
    if (blood.opacity <= 0 || blood.radius < 0) return;
    
    ctx.save();
    
    // Collect all points (center + particles) for blob shape
    const allPoints = [{ x: blood.x, y: blood.y, size: Math.min(blood.radius * 0.4, 30) }];
    for (const particle of blood.particles) {
        if (particle.opacity > 0) {
            allPoints.push({ x: particle.x, y: particle.y, size: particle.size * 1.2 });
        }
    }
    
    // Draw main irregular slime blob (thick, viscous center)
    const centerRadius = Math.min(blood.radius * 0.4, 30);
    if (centerRadius > 0 && blood.opacity > 0) {
        // Create irregular blob shape for center
        createIrregularBlob(ctx, blood.x, blood.y, centerRadius, 12, 0.4);
        
        // Thicker, more opaque slime center with irregular shape
        const centerGradient = ctx.createRadialGradient(
            blood.x, blood.y, 0,
            blood.x, blood.y, centerRadius * 1.5
        );
        centerGradient.addColorStop(0, `rgba(100, 15, 15, ${blood.opacity * 0.95})`);
        centerGradient.addColorStop(0.3, `rgba(120, 20, 20, ${blood.opacity * 0.85})`);
        centerGradient.addColorStop(0.6, `rgba(140, 25, 25, ${blood.opacity * 0.7})`);
        centerGradient.addColorStop(1, `rgba(160, 30, 30, ${blood.opacity * 0.4})`);
        
        ctx.fillStyle = centerGradient;
        ctx.fill();
        
        // Add inner highlight for slime shine (irregular)
        createIrregularBlob(ctx, blood.x, blood.y, centerRadius * 0.6, 10, 0.3);
        const highlightGradient = ctx.createRadialGradient(
            blood.x - centerRadius * 0.3, blood.y - centerRadius * 0.3, 0,
            blood.x, blood.y, centerRadius * 0.8
        );
        highlightGradient.addColorStop(0, `rgba(180, 50, 50, ${blood.opacity * 0.3})`);
        highlightGradient.addColorStop(1, 'rgba(140, 25, 25, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.fill();
    }
    
    // Draw spreading slime (irregular outer blob)
    if (blood.radius > centerRadius) {
        createIrregularBlob(ctx, blood.x, blood.y, blood.radius, 16, 0.5);
        
        const fadeOpacity = blood.opacity * (1 - (blood.radius / blood.maxRadius) * 0.6);
        const spreadGradient = ctx.createRadialGradient(
            blood.x, blood.y, centerRadius,
            blood.x, blood.y, blood.radius * 1.2
        );
        spreadGradient.addColorStop(0, `rgba(130, 20, 20, ${fadeOpacity * 0.7})`);
        spreadGradient.addColorStop(0.3, `rgba(150, 30, 30, ${fadeOpacity * 0.6})`);
        spreadGradient.addColorStop(0.6, `rgba(170, 40, 40, ${fadeOpacity * 0.4})`);
        spreadGradient.addColorStop(0.85, `rgba(190, 50, 50, ${fadeOpacity * 0.2})`);
        spreadGradient.addColorStop(1, `rgba(200, 60, 60, 0)`);
        
        ctx.fillStyle = spreadGradient;
        ctx.fill();
    }
    
    // Draw slime particles with connections (gooey, stringy effect)
    for (let i = 0; i < blood.particles.length; i++) {
        const particle = blood.particles[i];
        if (particle.opacity <= 0) continue;
        
        // Draw connections to nearby particles (slime strings)
        for (let j = i + 1; j < blood.particles.length; j++) {
            const other = blood.particles[j];
            if (other.opacity <= 0) continue;
            
            const dx = other.x - particle.x;
            const dy = other.y - particle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Draw stringy connections for close particles
            if (dist < 25 && dist > 0) {
                const connectionOpacity = (1 - dist / 25) * particle.opacity * other.opacity * 0.4;
                ctx.strokeStyle = `rgba(120, 20, 20, ${connectionOpacity})`;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(particle.x, particle.y);
                ctx.lineTo(other.x, other.y);
                ctx.stroke();
            }
        }
        
        // Draw irregular slime blob particles
        const blobSize = particle.size * 1.2;
        createIrregularBlob(ctx, particle.x, particle.y, blobSize, 8, 0.35);
        
        const particleGradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, blobSize * 1.5
        );
        particleGradient.addColorStop(0, `rgba(110, 18, 18, ${particle.opacity * 0.9})`);
        particleGradient.addColorStop(0.4, `rgba(130, 22, 22, ${particle.opacity * 0.8})`);
        particleGradient.addColorStop(0.7, `rgba(150, 28, 28, ${particle.opacity * 0.6})`);
        particleGradient.addColorStop(1, `rgba(170, 35, 35, ${particle.opacity * 0.3})`);
        
        ctx.fillStyle = particleGradient;
        ctx.fill();
        
        // Add small highlight on each blob (irregular)
        createIrregularBlob(ctx, particle.x, particle.y, blobSize * 0.5, 6, 0.25);
        const blobHighlight = ctx.createRadialGradient(
            particle.x - blobSize * 0.3, particle.y - blobSize * 0.3, 0,
            particle.x, particle.y, blobSize * 0.7
        );
        blobHighlight.addColorStop(0, `rgba(180, 50, 50, ${particle.opacity * 0.4})`);
        blobHighlight.addColorStop(1, 'rgba(130, 22, 22, 0)');
        ctx.fillStyle = blobHighlight;
        ctx.fill();
    }
    
    ctx.restore();
}

// Splash Pool (for fish jumping - similar to blood but water-colored)
export const splashPool = new ObjectPool(
    () => ({
        x: 0, y: 0, radius: 0, maxRadius: 0, opacity: 1.0, life: 0,
        particles: [], active: false
    }),
    (splash, x, y) => {
        splash.x = x;
        splash.y = y;
        splash.radius = params.splashInitialRadius;
        splash.maxRadius = params.splashMaxRadius;
        splash.opacity = 1.0;
        splash.life = params.splashLifeDuration;
        splash.active = true;
        
        // Initialize particles
        splash.particles = [];
        for (let i = 0; i < params.splashParticleCount; i++) {
            const angle = (Math.PI * 2 * i) / params.splashParticleCount + Math.random() * 0.5;
            const distance = Math.random() * splash.radius * 0.5;
            splash.particles.push({
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance,
                size: params.splashParticleSizeMin + Math.random() * (params.splashParticleSizeMax - params.splashParticleSizeMin),
                angle: angle,
                spreadSpeed: params.splashParticleSpreadSpeedMin + Math.random() * (params.splashParticleSpreadSpeedMax - params.splashParticleSpreadSpeedMin),
                opacity: 1.0
            });
        }
    },
    30
);

// Pooled update/draw functions for splash (water-like)
export function updatePooledSplash(splash, dt = 1/60) {
    const scale = dt * 60;
    
    // Update main splash blob - faster spread than blood (water is less viscous)
    splash.radius += params.splashSpreadSpeed * scale;
    splash.opacity -= params.splashFadeSpeed * scale;
    splash.life -= scale;
    
    // Update particles - faster movement for water
    for (let particle of splash.particles) {
        const waterSpeed = particle.spreadSpeed * 0.8; // Faster than blood
        particle.x += Math.cos(particle.angle) * waterSpeed * scale;
        particle.y += Math.sin(particle.angle) * waterSpeed * scale;
        
        // Particles fade with splash
        particle.opacity = splash.opacity * (1 - (splash.radius / splash.maxRadius) * 0.4);
    }
    
    return splash.life > 0 && splash.opacity > 0;
}

export function drawPooledSplash(splash, ctx) {
    if (splash.opacity <= 0 || splash.radius < 0) return;
    
    ctx.save();
    
    // Collect all points (center + particles) for blob shape
    const allPoints = [{ x: splash.x, y: splash.y, size: Math.min(splash.radius * 0.3, 20) }];
    for (const particle of splash.particles) {
        if (particle.opacity > 0) {
            allPoints.push({ x: particle.x, y: particle.y, size: particle.size * 1.1 });
        }
    }
    
    // Draw main irregular water splash blob (lighter, more transparent than blood)
    const centerRadius = Math.min(splash.radius * 0.3, 20);
    if (centerRadius > 0 && splash.opacity > 0) {
        // Create irregular blob shape for center
        createIrregularBlob(ctx, splash.x, splash.y, centerRadius, 10, 0.3);
        
        // Water-colored gradient (blues/cyans, lighter than blood, more transparent)
        const centerGradient = ctx.createRadialGradient(
            splash.x, splash.y, 0,
            splash.x, splash.y, centerRadius * 1.5
        );
        centerGradient.addColorStop(0, `rgba(100, 180, 220, ${splash.opacity * 0.4})`);
        centerGradient.addColorStop(0.3, `rgba(120, 200, 240, ${splash.opacity * 0.35})`);
        centerGradient.addColorStop(0.6, `rgba(140, 220, 255, ${splash.opacity * 0.3})`);
        centerGradient.addColorStop(1, `rgba(160, 240, 255, ${splash.opacity * 0.15})`);
        
        ctx.fillStyle = centerGradient;
        ctx.fill();
        
        // Add inner highlight for water shine
        createIrregularBlob(ctx, splash.x, splash.y, centerRadius * 0.6, 8, 0.25);
        const highlightGradient = ctx.createRadialGradient(
            splash.x - centerRadius * 0.2, splash.y - centerRadius * 0.2, 0,
            splash.x, splash.y, centerRadius * 0.7
        );
        highlightGradient.addColorStop(0, `rgba(200, 240, 255, ${splash.opacity * 0.25})`);
        highlightGradient.addColorStop(1, 'rgba(140, 220, 255, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.fill();
    }
    
    // Draw spreading water (irregular outer blob)
    if (splash.radius > centerRadius && splash.opacity > 0) {
        const spreadRadius = Math.min(splash.radius, splash.maxRadius);
        createIrregularBlob(ctx, splash.x, splash.y, spreadRadius, 12, 0.35);
        
        const spreadGradient = ctx.createRadialGradient(
            splash.x, splash.y, centerRadius,
            splash.x, splash.y, spreadRadius * 1.2
        );
        spreadGradient.addColorStop(0, `rgba(120, 200, 240, ${splash.opacity * 0.25})`);
        spreadGradient.addColorStop(0.5, `rgba(140, 220, 255, ${splash.opacity * 0.2})`);
        spreadGradient.addColorStop(1, `rgba(160, 240, 255, ${splash.opacity * 0.08})`);
        
        ctx.fillStyle = spreadGradient;
        ctx.fill();
    }
    
    // Draw splash particles with connections (water droplets)
    for (let i = 0; i < splash.particles.length; i++) {
        const particle = splash.particles[i];
        if (particle.opacity <= 0) continue;
        
        // Draw connections to nearby particles (water strings/droplets)
        for (let j = i + 1; j < splash.particles.length; j++) {
            const other = splash.particles[j];
            if (other.opacity <= 0) continue;
            
            const dx = other.x - particle.x;
            const dy = other.y - particle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Draw stringy connections for close particles (lighter than blood)
            if (dist < 20 && dist > 0) {
                const connectionOpacity = (1 - dist / 20) * particle.opacity * other.opacity * 0.2;
                ctx.strokeStyle = `rgba(150, 210, 250, ${connectionOpacity})`;
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(particle.x, particle.y);
                ctx.lineTo(other.x, other.y);
                ctx.stroke();
            }
        }
        
        // Draw irregular water droplet particles
        const blobSize = particle.size * 1.1;
        createIrregularBlob(ctx, particle.x, particle.y, blobSize, 6, 0.3);
        
        const particleGradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, blobSize * 1.4
        );
        particleGradient.addColorStop(0, `rgba(130, 200, 240, ${particle.opacity * 0.5})`);
        particleGradient.addColorStop(0.4, `rgba(150, 220, 255, ${particle.opacity * 0.4})`);
        particleGradient.addColorStop(0.7, `rgba(170, 240, 255, ${particle.opacity * 0.3})`);
        particleGradient.addColorStop(1, `rgba(190, 250, 255, ${particle.opacity * 0.15})`);
        
        ctx.fillStyle = particleGradient;
        ctx.fill();
        
        // Add small highlight on each droplet
        createIrregularBlob(ctx, particle.x, particle.y, blobSize * 0.5, 5, 0.25);
        const dropletHighlight = ctx.createRadialGradient(
            particle.x - blobSize * 0.2, particle.y - blobSize * 0.2, 0,
            particle.x, particle.y, blobSize * 0.6
        );
        dropletHighlight.addColorStop(0, `rgba(220, 250, 255, ${particle.opacity * 0.3})`);
        dropletHighlight.addColorStop(1, 'rgba(150, 220, 255, 0)');
        ctx.fillStyle = dropletHighlight;
        ctx.fill();
    }
    
    ctx.restore();
}
