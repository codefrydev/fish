// Koi Fish class - main fish entity

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, isInView, width, height } from '../utils/helpers.js';
import { fishGrid, foodGrid, predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool, splashPool } from '../systems/ObjectPool.js';

// Reference to main canvas context (will be set externally)
let mainCtx = null;

export function setMainContext(ctx) {
    mainCtx = ctx;
}

// Function to add ripple (will be set by main)
let addRippleFn = null;
export function setAddRippleFunction(fn) {
    addRippleFn = fn;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return { r, g, b };
}

function rgbToHex({ r, g, b }) {
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColors(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const k = clamp01(t);
    return rgbToHex({
        r: Math.round(ca.r + (cb.r - ca.r) * k),
        g: Math.round(ca.g + (cb.g - ca.g) * k),
        b: Math.round(ca.b + (cb.b - ca.b) * k)
    });
}

function adjustColor(hex, amount) {
    if (amount >= 0) {
        return mixColors(hex, '#ffffff', clamp01(amount));
    }
    return mixColors(hex, '#000000', clamp01(-amount));
}

function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class Koi {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(rand(-1, 1), rand(-1, 1));
        this.acc = new Vector(0, 0);
        
        this.baseSpeed = rand(params.fishBaseSpeedMin, params.fishBaseSpeedMax);
        this.maxSpeed = this.baseSpeed * params.speedScale;
        
        this.maxForce = params.turnForce; 
        
        this.size = rand(params.sizeMin, params.sizeMax); 
        
        this.swimTimer = Math.random() * params.fishInitialSwimTimer;
        this.birthTimer = rand(0, params.fishInitialBirthCooldown);
        
        this.spine = [];
        this.spineLength = params.spineCount; 
        
        this.initSpine(x, y);
        
        const types = ['kohaku', 'showa', 'gold', 'tancho', 'utsuri'];
        this.type = types[Math.floor(Math.random() * types.length)];
        
        this.baseColor = '#f0f0f0'; 
        this.spots = [];

        if (this.type === 'kohaku') { 
            this.baseColor = '#fdfdfd';
            this.generatePatches('#d62828', 'saddle'); 
        } else if (this.type === 'gold') { 
            this.baseColor = '#f4a261';
            this.generatePatches('#e76f51', 'large_wash'); 
        } else if (this.type === 'showa') { 
            this.baseColor = '#1a1a1a'; 
            this.generatePatches('#d62828', 'saddle'); 
            this.generatePatches('#fdfdfd', 'saddle_small'); 
        } else if (this.type === 'tancho') { 
            this.baseColor = '#fdfdfd';
            this.spots.push({ color: '#d62828', t: 0.05, offset: 0, radius: this.size * 0.6 });
        } else if (this.type === 'utsuri') { 
            this.baseColor = '#0f0f0f';
            this.generatePatches('#f4d35e', 'wrapping_bands');
        }

        this.finsAngle = 0;
        
        // Jump state management
        this.jumpState = null; // null, 'JUMPING', or 'LANDING'
        this.jumpTimer = 0;
        this.jumpVelocity = new Vector(0, 0);
        this.jumpCooldown = 0;
        this.lastJumpTime = 0;
        this.jumpStartPos = null;
        this.isExcited = false; // Track if fish is excited (near food or just ate)
    }

    initSpine(x, y) {
        this.spine = [];
        const dist = this.size * params.distConstraint;
        for (let i = 0; i < this.spineLength; i++) {
            this.spine.push({
                pos: new Vector(x - i * dist, y), 
                size: this.calculateThickness(i)
            });
        }
    }

    calculateThickness(i) {
        const t = i / (this.spineLength - 1);
        let thickness = 1.0;
        
        if (t < 0.25) {
            thickness = params.fishThicknessHead + (t / 0.25) * params.fishThicknessNeck; 
        } else {
            let bodyT = (t - 0.25) / 0.75;
            thickness = params.fishThicknessTaper * (1 - Math.pow(bodyT, params.tailTaper) * params.fishThicknessPow);
        }
        thickness = Math.max(params.fishThicknessMin, thickness);
        
        return this.size * thickness * params.fatness;
    }

    generatePatches(color, style) {
        if (style === 'saddle') {
            let count = Math.floor(rand(2, 3));
            for(let i=0; i<count; i++) {
                let centerT = rand(0.2, 0.8);
                let clusterSize = Math.floor(rand(2, 4)); 
                for(let j=0; j<clusterSize; j++) {
                    this.spots.push({
                        color: color,
                        t: centerT + rand(-0.08, 0.08), 
                        offset: rand(-this.size*0.4, this.size*0.4), 
                        radius: rand(this.size * 0.6, this.size * 0.9) 
                    });
                }
            }
        } else if (style === 'saddle_small') {
             let count = Math.floor(rand(2, 4));
             for(let i=0; i<count; i++) {
                 let centerT = rand(0.1, 0.9);
                 this.spots.push({
                     color: color,
                     t: centerT,
                     offset: rand(-3, 3),
                     radius: rand(this.size * 0.4, this.size * 0.7)
                 });
             }
        } else if (style === 'wrapping_bands') {
            let count = Math.floor(rand(2, 3));
            for(let i=0; i<count; i++) {
                let centerT = rand(0.1, 0.9);
                this.spots.push({ color: color, t: centerT, offset: 0, radius: this.size * 0.95 });
            }
        } else if (style === 'large_wash') {
             this.spots.push({
                color: color,
                t: 0.4,
                offset: 0,
                radius: this.size * 1.5
            });
        }
    }

    seek(target) {
        let desired = new Vector(target.x, target.y);
        desired.sub(this.pos);
        desired.normalize();
        desired.mult(this.maxSpeed);
        let steer = desired.sub(this.vel);
        steer.limit(this.maxForce);
        return steer;
    }

    run(fishList, foodList, dt = 1/60) {
        this.behaviors(fishList, foodList);
        this.update(dt);
        // Only draw if fish is in view (with margin for fins/tail)
        if (isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) {
            this.draw(false);
        }
    }
    
    drawShadow(shadowCtx) {
        let leftPoints = [];
        let rightPoints = [];

        let head = this.spine[0];
        let neck = this.spine[1];
        let headAngle = Math.atan2(head.pos.y - neck.pos.y, head.pos.x - neck.pos.x);

        for (let i = 0; i < this.spineLength; i++) {
            let s = this.spine[i];
            
            let a;
            if (i === 0) {
                a = headAngle;
            } else if (i === this.spineLength - 1) {
                let prev = this.spine[i-1];
                a = Math.atan2(s.pos.y - prev.pos.y, s.pos.x - prev.pos.x);
            } else {
                let next = this.spine[i+1];
                let prev = this.spine[i-1];
                a = Math.atan2(next.pos.y - prev.pos.y, next.pos.x - prev.pos.x);
            }
            
            let px = Math.cos(a + Math.PI/2);
            let py = Math.sin(a + Math.PI/2);
            
            leftPoints.push({x: s.pos.x + px * s.size, y: s.pos.y + py * s.size});
            rightPoints.push({x: s.pos.x - px * s.size, y: s.pos.y - py * s.size});
        }
        
        shadowCtx.save();
        shadowCtx.translate(params.shadowOffsetX, params.shadowOffsetY); 
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        
        this.drawBodyPathOnContext(shadowCtx, leftPoints, rightPoints, head, headAngle);
        shadowCtx.fill();
        this.drawFinsOnContext(shadowCtx, head, headAngle, false, true); 
        this.drawFinsOnContext(shadowCtx, head, headAngle, true, true);  
        this.drawDorsalFinOnContext(shadowCtx, true);
        shadowCtx.restore();
    }

    tryJump(context = 'normal') {
        // Don't jump if disabled, already jumping, or on cooldown
        if (!params.fishJumpEnabled || this.jumpState !== null || this.jumpCooldown > 0) {
            return false;
        }
        
        // Determine jump chance based on context
        let jumpChance = params.fishJumpChance;
        if (context === 'fleeing') {
            jumpChance = params.fishJumpFleeChance;
        } else if (context === 'excited') {
            jumpChance = params.fishJumpExcitedChance;
        }
        
        // Check if jump should occur
        if (Math.random() < jumpChance) {
            // For top-down view: fish jumps straight up (vertically) out of water
            // No horizontal movement - just vertical jump
            const verticalSpeed = Math.sqrt(2 * params.fishJumpGravity * params.fishJumpHeight);
            
            // Jump straight up (negative Y is up in screen coordinates)
            this.jumpVelocity = new Vector(0, -verticalSpeed);
            
            // Set jump state
            this.jumpState = 'JUMPING';
            this.jumpTimer = 0;
            this.jumpStartPos = new Vector(this.pos.x, this.pos.y);
            this.jumpCooldown = params.fishJumpCooldown;
            
            return true;
        }
        
        return false;
    }

    behaviors(fishList, foodList) {
        // Don't apply normal behaviors if jumping
        if (this.jumpState !== null) {
            return;
        }
        
        this.maxForce = params.turnForce;
        this.maxSpeed = this.baseSpeed * params.speedScale;

        let desired = null;
        const margin = 100;
        
        if (this.pos.x < margin) desired = new Vector(this.maxSpeed, this.vel.y);
        else if (this.pos.x > width - margin) desired = new Vector(-this.maxSpeed, this.vel.y);
        if (this.pos.y < margin) desired = new Vector(this.vel.x, this.maxSpeed);
        else if (this.pos.y > height - margin) desired = new Vector(this.vel.x, -this.maxSpeed);

        if (desired) {
            desired.normalize();
            desired.mult(this.maxSpeed);
            let steer = desired.sub(this.vel);
            steer.limit(this.maxForce * 2);
            this.applyForce(steer);
        } else {
            if (Math.random() < 0.05) {
                let wander = new Vector(rand(-1, 1), rand(-1, 1));
                wander.normalize();
                wander.mult(0.5);
                this.applyForce(wander);
            }
        }

        // Use spatial grid for efficient food searching
        const nearbyFoods = foodGrid.getNearbyFiltered(
            this.pos.x, this.pos.y, 300, 
            food => !food.eaten
        );
        
        let isExcited = false;
        if (nearbyFoods.length > 0) {
            // Find closest food from nearby
            let closestFood = null;
            let minDistSq = 300 * 300;
            
            for (const { obj: food, distSq } of nearbyFoods) {
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestFood = food;
                }
            }
            
            if (closestFood) {
                const targetPos = { x: closestFood.pos.x, y: closestFood.pos.y };
                let seekForce = this.seek(targetPos);
                seekForce.mult(2.5); 
                this.applyForce(seekForce);
                
                // Mark as excited when near food
                if (minDistSq < 90000) { // 300 * 300
                    isExcited = true;
                }
                
                if (minDistSq < 100) { // 10 * 10
                    closestFood.eaten = true;
                    this.swimTimer += 2;
                    isExcited = true; // Just ate - very excited!
                    if (addRippleFn) {
                        addRippleFn(closestFood.pos.x, closestFood.pos.y);
                    }
                }
            }
        }
        
        this.isExcited = isExcited;
        
        // Use spatial grid for efficient separation (fish avoidance)
        const nearbyFish = fishGrid.getNearby(this.pos.x, this.pos.y, 50);
        
        let separation = new Vector(0, 0);
        let count = 0;
        for (let other of nearbyFish) {
            if (other !== this) {
                const dx = this.pos.x - other.pos.x;
                const dy = this.pos.y - other.pos.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 2500 && distSq > 0) { // 50 * 50
                    const d = Math.sqrt(distSq);
                    separation.x += dx / (d * d);
                    separation.y += dy / (d * d);
                    count++;
                }
            }
        }
        if (count > 0) {
            separation.div(count);
            separation.normalize();
            separation.mult(this.maxSpeed);
            let steer = separation.sub(this.vel);
            steer.limit(this.maxForce * 1.5);
            this.applyForce(steer);
        }
        
        // PREDATOR AVOIDANCE - highest priority
        const nearbyPredators = predatorGrid.getNearby(this.pos.x, this.pos.y, params.predatorDetectionRange * 1.5);
        
        let isFleeing = false;
        for (const predator of nearbyPredators) {
            const dx = this.pos.x - predator.pos.x;
            const dy = this.pos.y - predator.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            if (d < params.predatorDetectionRange * 1.2 && d > 0) {
                isFleeing = true;
                
                // Strong flee force - inversely proportional to distance
                let fleeForce = new Vector(dx / d, dy / d);
                const urgency = 1 - (d / (params.predatorDetectionRange * 1.2));
                fleeForce.mult(this.maxSpeed * 2 * urgency);
                
                // Extra speed boost when predator is attacking
                if (predator.state === 'ATTACKING' && predator.target === this) {
                    fleeForce.mult(2);
                    this.maxSpeed = this.baseSpeed * params.speedScale * 1.5; // Burst of speed
                }
                
                let steer = new Vector(fleeForce.x - this.vel.x, fleeForce.y - this.vel.y);
                steer.limit(this.maxForce * params.fishFleeForceMultiplier); // High priority flee
                this.applyForce(steer);
            }
        }
        
        // Try to jump based on context
        if (isFleeing) {
            this.tryJump('fleeing');
        } else if (this.isExcited) {
            this.tryJump('excited');
        } else {
            // Random jump chance during normal swimming
            this.tryJump('normal');
        }
    }

    applyForce(force) {
        this.acc.add(force);
    }
    
    update(dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        
        // Update jump cooldown
        if (this.jumpCooldown > 0) {
            this.jumpCooldown -= scale;
        }
        
        // Handle jump physics
        if (this.jumpState === 'JUMPING') {
            this.jumpTimer += scale;
            
            // Apply gravity to vertical component
            this.jumpVelocity.y += params.fishJumpGravity * scale;
            
            // Update position with jump velocity
            this.pos.x += this.jumpVelocity.x * scale;
            this.pos.y += this.jumpVelocity.y * scale;
            
            // For top-down view: fish jumps straight up, so keep X position fixed
            // Keep X at starting position (fish doesn't move horizontally during jump)
            this.pos.x = this.jumpStartPos.x;
            
            // Keep fish in bounds (just in case)
            const margin = 50;
            if (this.pos.x < margin) {
                this.pos.x = margin;
                this.jumpStartPos.x = margin;
            } else if (this.pos.x > width - margin) {
                this.pos.x = width - margin;
                this.jumpStartPos.x = width - margin;
            }
            
            // Check if fish has landed (vertical velocity becomes positive = falling down)
            // Or if jump duration exceeded
            if (this.jumpVelocity.y > 0 && this.jumpTimer > params.fishJumpDuration * 0.3) {
                // Check if we've reached water level (or exceeded jump duration)
                const waterLevel = this.jumpStartPos.y; // Starting y is water level
                if (this.pos.y >= waterLevel || this.jumpTimer >= params.fishJumpDuration) {
                    // Ensure fish lands back at starting position
                    this.pos.x = this.jumpStartPos.x;
                    this.pos.y = waterLevel;
                    
                    // Landed - create splash effect (similar to blood but water-colored)
                    splashPool.acquire(this.pos.x, this.pos.y);
                    // Create additional smaller splashes for effect
                    for (let i = 0; i < 2; i++) {
                        const offsetX = (Math.random() - 0.5) * params.fishJumpSplashRadius;
                        const offsetY = (Math.random() - 0.5) * params.fishJumpSplashRadius;
                        splashPool.acquire(this.pos.x + offsetX, this.pos.y + offsetY);
                    }
                    
                    // Reset jump state
                    this.jumpState = null;
                    this.jumpTimer = 0;
                    this.jumpVelocity = new Vector(0, 0);
                    
                    // Reset velocity to normal swimming (preserve any existing velocity)
                    // Fish continues swimming normally after landing
                }
            }
            
            // Update spine for jumping fish (less wavy during jump)
            this.spine[0].pos = new Vector(this.pos.x, this.pos.y);
            for (let i = 1; i < this.spineLength; i++) {
                let prev = this.spine[i - 1].pos;
                let curr = this.spine[i].pos;
                
                let dx = curr.x - prev.x;
                let dy = curr.y - prev.y;
                let angle = Math.atan2(dy, dx);
                
                // Reduced wave during jump
                let waveAmt = Math.min(params.waveAmpMax * 0.3, i * params.waveAmpGain * 0.3);
                let wave = Math.sin(this.swimTimer - i * params.fishWavePhaseOffset) * waveAmt;
                angle += wave;
                
                const segDist = this.size * params.distConstraint;
                curr.x = prev.x + Math.cos(angle) * segDist;
                curr.y = prev.y + Math.sin(angle) * segDist;
                curr.size = this.calculateThickness(i);
            }
            
            // Continue swim timer for animation
            this.swimTimer += (params.waveSpeedBase + (this.jumpVelocity.mag() * params.waveSpeedMult)) * scale;
            this.finsAngle = this.swimTimer;
            
            return; // Skip normal physics update during jump
        }
        
        // Normal physics update (when not jumping)
        // Scale velocity changes by delta time
        this.vel.x += this.acc.x * scale;
        this.vel.y += this.acc.y * scale;
        this.vel.limit(this.maxSpeed);
        
        // Scale position changes by delta time
        this.pos.x += this.vel.x * scale;
        this.pos.y += this.vel.y * scale;
        this.acc.mult(0);
        
        let speed = this.vel.mag();
        this.swimTimer += (params.waveSpeedBase + (speed * params.waveSpeedMult)) * scale;

        this.spine[0].pos = new Vector(this.pos.x, this.pos.y);
        
        for (let i = 1; i < this.spineLength; i++) {
            let prev = this.spine[i - 1].pos;
            let curr = this.spine[i].pos;
            
            let dx = curr.x - prev.x;
            let dy = curr.y - prev.y;
            
            let angle = Math.atan2(dy, dx);
            
            let waveAmt = Math.min(params.waveAmpMax, i * params.waveAmpGain);
            let wave = Math.sin(this.swimTimer - i * params.fishWavePhaseOffset) * waveAmt;
            
            angle += wave;
            
            const segDist = this.size * params.distConstraint; 
            
            let tx = prev.x + Math.cos(angle) * segDist;
            let ty = prev.y + Math.sin(angle) * segDist;
            
            curr.x = tx;
            curr.y = ty;
            
            curr.size = this.calculateThickness(i);
        }
        
        this.finsAngle = this.swimTimer;
    }

    draw(isShadow) {
        const ctx = mainCtx;
        if (!ctx) return;
        
        let leftPoints = [];
        let rightPoints = [];

        let head = this.spine[0];
        let neck = this.spine[1];
        let headAngle = Math.atan2(head.pos.y - neck.pos.y, head.pos.x - neck.pos.x);

        for (let i = 0; i < this.spineLength; i++) {
            let s = this.spine[i];
            
            let a;
            if (i === 0) {
                a = headAngle;
            } else if (i === this.spineLength - 1) {
                let prev = this.spine[i-1];
                a = Math.atan2(s.pos.y - prev.pos.y, s.pos.x - prev.pos.x);
            } else {
                let next = this.spine[i+1];
                let prev = this.spine[i-1];
                a = Math.atan2(next.pos.y - prev.pos.y, next.pos.x - prev.pos.x);
            }
            
            let px = Math.cos(a + Math.PI/2);
            let py = Math.sin(a + Math.PI/2);
            
            leftPoints.push({x: s.pos.x + px * s.size, y: s.pos.y + py * s.size});
            rightPoints.push({x: s.pos.x - px * s.size, y: s.pos.y - py * s.size});
        }

        // Shadows are now handled separately via drawShadow method
        if (isShadow) return;

        this.drawFinsOnContext(ctx, head, headAngle, false, false);

        ctx.save();
        this.drawBodyPathOnContext(ctx, leftPoints, rightPoints, head, headAngle);
        let maxRadius = 0;
        for (const s of this.spine) {
            if (s.size > maxRadius) maxRadius = s.size;
        }
        const midIndex = Math.floor(this.spineLength * 0.4);
        const midPoint = this.spine[midIndex].pos;
        const perpAngle = headAngle + Math.PI / 2;
        const gradRadius = maxRadius * 1.25;
        const gx0 = midPoint.x + Math.cos(perpAngle) * gradRadius;
        const gy0 = midPoint.y + Math.sin(perpAngle) * gradRadius;
        const gx1 = midPoint.x - Math.cos(perpAngle) * gradRadius;
        const gy1 = midPoint.y - Math.sin(perpAngle) * gradRadius;
        
        const bodyGradient = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        const bodyDark = params.fishBodyShadeDark;
        const bodyLight = params.fishBodyShadeLight;
        bodyGradient.addColorStop(0, adjustColor(this.baseColor, -bodyDark));
        bodyGradient.addColorStop(0.45, adjustColor(this.baseColor, bodyLight * 0.5));
        bodyGradient.addColorStop(0.55, adjustColor(this.baseColor, bodyLight));
        bodyGradient.addColorStop(1, adjustColor(this.baseColor, -bodyDark * 0.75));
        ctx.fillStyle = bodyGradient;
        ctx.fill();
        
        ctx.fillStyle = rgbaFromHex(this.baseColor, params.fishBodySolidAlpha);
        ctx.fill();
        
        ctx.clip(); 
        
        for(let spot of this.spots) {
            let idx = Math.floor(spot.t * (this.spineLength-1));
            idx = Math.max(0, Math.min(idx, this.spineLength-1));
            let s = this.spine[idx];
            const spotX = s.pos.x + spot.offset;
            const spotY = s.pos.y + spot.offset;
            const spotGradient = ctx.createRadialGradient(
                spotX, spotY, 0,
                spotX, spotY, spot.radius
            );
            spotGradient.addColorStop(0, adjustColor(spot.color, 0.2));
            spotGradient.addColorStop(0.55, spot.color);
            spotGradient.addColorStop(1, rgbaFromHex(spot.color, params.fishPatternEdgeAlpha));
            ctx.beginPath();
            ctx.arc(spotX, spotY, spot.radius, 0, Math.PI*2);
            ctx.fillStyle = spotGradient;
            ctx.fill();
        }

        const lightDirX = 0.4;
        const lightDirY = -0.9;
        const lightLen = Math.hypot(lightDirX, lightDirY) || 1;
        const lx = lightDirX / lightLen;
        const ly = lightDirY / lightLen;
        const highlightOffset = this.size * 0.18;
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < this.spineLength - 1; i++) {
            const s = this.spine[i];
            const hx = s.pos.x + lx * highlightOffset * (s.size / maxRadius);
            const hy = s.pos.y + ly * highlightOffset * (s.size / maxRadius);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${params.fishSpecularOuterAlpha})`;
        ctx.lineWidth = this.size * params.fishSpecularWidth;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${params.fishSpecularInnerAlpha})`;
        ctx.lineWidth = this.size * params.fishSpecularInnerWidth;
        ctx.stroke();
        ctx.restore();

        ctx.restore(); 

        ctx.save();
        this.drawBodyPathOnContext(ctx, leftPoints, rightPoints, head, headAngle);
        ctx.strokeStyle = rgbaFromHex(adjustColor(this.baseColor, -params.fishOutlineDarken), params.fishOutlineAlpha);
        ctx.lineWidth = Math.max(1, this.size * params.fishOutlineWidth);
        ctx.stroke();
        ctx.restore();

        this.drawDorsalFinOnContext(ctx, false);
        this.drawFinsOnContext(ctx, head, headAngle, true, false);
        this.drawEyes(head, headAngle);
    }
    
    drawBodyPathOnContext(c, leftPoints, rightPoints, head, headAngle) {
        c.beginPath();
        let noseX = head.pos.x + Math.cos(headAngle) * this.spine[0].size;
        let noseY = head.pos.y + Math.sin(headAngle) * this.spine[0].size;
        c.moveTo(noseX, noseY);

        c.lineTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 0; i < leftPoints.length - 1; i++) {
            const p0 = leftPoints[i];
            const p1 = leftPoints[i + 1];
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            c.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        c.lineTo(leftPoints[leftPoints.length-1].x, leftPoints[leftPoints.length-1].y);

        let tail = this.spine[this.spineLength-1];
        c.quadraticCurveTo(tail.pos.x, tail.pos.y, rightPoints[this.spineLength-1].x, rightPoints[this.spineLength-1].y);
        
        for (let i = rightPoints.length - 1; i > 0; i--) {
            const p0 = rightPoints[i];
            const p1 = rightPoints[i - 1];
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            c.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        c.lineTo(rightPoints[0].x, rightPoints[0].y);
        
        c.lineTo(noseX, noseY);
        c.closePath();
    }

    drawDorsalFinOnContext(c, isShadow) {
        const startIndex = 4;
        const endIndex = this.spineLength - 2; 
        
        if (startIndex >= this.spineLength || endIndex >= this.spineLength) return;

        c.beginPath();
        let start = this.spine[startIndex];
        c.moveTo(start.pos.x, start.pos.y);
        
        for(let i=startIndex + 1; i <= endIndex; i++) {
             let s = this.spine[i];
             c.lineTo(s.pos.x, s.pos.y);
        }
        
        c.lineCap = 'round';
        c.lineJoin = 'round';
        
        if (isShadow) {
            c.lineWidth = 3;
            c.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            c.stroke();
        } else {
            c.lineWidth = 2;
            c.strokeStyle = 'rgba(0, 0, 0, 0.05)'; 
            c.stroke();
            
            c.lineWidth = 1;
            c.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            c.stroke();
        }
    }

    drawFinsOnContext(c, head, angle, topLayer, isShadow) {
        let shoulder = this.spine[4]; 
        let a = angle; 
        
        c.save();
        c.translate(shoulder.pos.x, shoulder.pos.y);
        c.rotate(a);

        const finBase = adjustColor(this.baseColor, params.fishFinShadeLight);
        const finMid = adjustColor(this.baseColor, params.fishFinShadeMid);
        const finEdge = adjustColor(this.baseColor, -params.fishFinShadeDark);
        const makeFinGradient = (x0, y0, x1, y1) => {
            const g = c.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, rgbaFromHex(finBase, params.fishFinAlphaBase));
            g.addColorStop(0.6, rgbaFromHex(finMid, params.fishFinAlphaMid));
            g.addColorStop(1, rgbaFromHex(finEdge, params.fishFinAlphaEdge));
            return g;
        };
        
        const s = (this.size / 22) * params.finScale;

        if (!topLayer) {
            let finCycle = Math.sin(this.finsAngle); 
            
            if (!isShadow) {
                c.fillStyle = makeFinGradient(6*s, 0, 45*s, 0);
            }
            c.beginPath();
            c.moveTo(4*s, 0); 
            c.quadraticCurveTo(45*s, -40*s + finCycle*10*s, -15*s, -25*s + finCycle*5*s);
            c.quadraticCurveTo(0, -8*s, 4*s, 0);
            c.fill();
            if (!isShadow) {
                c.strokeStyle = rgbaFromHex(adjustColor(this.baseColor, -0.35), 0.5);
                c.lineWidth = Math.max(1, this.size * 0.04);
                c.beginPath();
                c.moveTo(4*s, -2*s);
                c.lineTo(-6*s, -10*s);
                c.stroke();
            }
            
            if (!isShadow) {
                c.fillStyle = makeFinGradient(6*s, 0, 45*s, 0);
            }
            c.beginPath();
            c.moveTo(4*s, 0);
            c.quadraticCurveTo(45*s, 40*s - finCycle*10*s, -15*s, 25*s - finCycle*5*s);
            c.quadraticCurveTo(0, 8*s, 4*s, 0);
            c.fill();
            if (!isShadow) {
                c.strokeStyle = rgbaFromHex(adjustColor(this.baseColor, -0.35), 0.5);
                c.lineWidth = Math.max(1, this.size * 0.04);
                c.beginPath();
                c.moveTo(4*s, 2*s);
                c.lineTo(-6*s, 10*s);
                c.stroke();
            }
            
            c.translate(-22*s, 0); 
            let pelvicCycle = Math.cos(this.finsAngle); 
            
            if (!isShadow) {
                c.fillStyle = makeFinGradient(0, 0, 18*s, 0);
            }
            c.beginPath();
            c.moveTo(0, 3*s); 
            c.quadraticCurveTo(15*s, 20*s + pelvicCycle*3*s, -5*s, 15*s);
            c.fill();
            if (!isShadow) {
                c.strokeStyle = rgbaFromHex(adjustColor(this.baseColor, -0.35), 0.45);
                c.lineWidth = Math.max(1, this.size * 0.035);
                c.beginPath();
                c.moveTo(0, 3*s);
                c.lineTo(-6*s, 10*s);
                c.stroke();
            }
            
            if (!isShadow) {
                c.fillStyle = makeFinGradient(0, 0, 18*s, 0);
            }
            c.beginPath();
            c.moveTo(0, -3*s); 
            c.quadraticCurveTo(15*s, -20*s - pelvicCycle*3*s, -5*s, -15*s);
            c.fill();
            if (!isShadow) {
                c.strokeStyle = rgbaFromHex(adjustColor(this.baseColor, -0.35), 0.45);
                c.lineWidth = Math.max(1, this.size * 0.035);
                c.beginPath();
                c.moveTo(0, -3*s);
                c.lineTo(-6*s, -10*s);
                c.stroke();
            }
            
            c.restore();
        } else {
             c.restore(); 
             
             let tailIndex = this.spineLength - 1;
             let tailPos = this.spine[tailIndex].pos;
             let prevPos = this.spine[tailIndex - 1].pos;
             let tailAngle = Math.atan2(tailPos.y - prevPos.y, tailPos.x - prevPos.x);
             
             c.save();
             c.translate(tailPos.x, tailPos.y);
             c.rotate(tailAngle);
             
             if(!isShadow) {
                 c.fillStyle = makeFinGradient(0, 0, 35*s, 0);
             }
             
             let flutter = Math.sin(this.finsAngle * 1.5); 
             
             c.beginPath();
             c.moveTo(0, 0);
             let tipX = 35 * s; 
             let tipY = -22 * s;
             
             c.bezierCurveTo(10*s, 0, 20*s, tipY + flutter * 5*s, tipX, tipY + flutter * 10*s);
             c.lineTo(tipX - 10*s, 0); 
             c.bezierCurveTo(tipX, -tipY + flutter * 10*s, 20*s, -tipY + flutter * 5*s, 0, 0);
             c.fill();
             
             if (!isShadow) {
                c.strokeStyle = rgbaFromHex(adjustColor(this.baseColor, -0.4), 0.5);
                c.lineWidth = Math.max(1, this.size * 0.04);
                c.beginPath();
                c.moveTo(0, 0);
                c.lineTo(12*s, 0);
                c.stroke();
             }
             
             if (!isShadow) {
                c.strokeStyle = 'rgba(255,255,255,0.1)';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(0,0); c.lineTo(tipX, tipY + flutter*10*s);
                c.moveTo(0,0); c.lineTo(tipX, -tipY + flutter*10*s);
                c.moveTo(0,0); c.lineTo(tipX - 10*s, 0);
                c.stroke();
             }

             c.restore();
        }
    }

    drawEyes(head, angle) {
        const ctx = mainCtx;
        if (!ctx) return;
        
        ctx.save();
        ctx.translate(head.pos.x, head.pos.y);
        ctx.rotate(angle);
        
        const s = this.size / 22;
        const eyeOffset = 7 * s;
        const eyeSize = params.fishEyeSizeRatio * s; 
        const irisSize = eyeSize * params.fishEyeIrisRatio;
        const pupilSize = irisSize * params.fishEyePupilRatio;
        const shadowOffset = 0.6 * s;
        
        const drawSingleEye = (y) => {
            const x = eyeOffset;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.ellipse(x + shadowOffset, y + shadowOffset, eyeSize * 0.95, eyeSize * 0.75, 0, 0, Math.PI * 2);
            ctx.fill();
            
            const scleraGradient = ctx.createRadialGradient(
                x - eyeSize * 0.2, y - eyeSize * 0.2, eyeSize * 0.2,
                x, y, eyeSize
            );
            scleraGradient.addColorStop(0, '#ffffff');
            scleraGradient.addColorStop(0.6, '#e2e8ee');
            scleraGradient.addColorStop(1, '#b8c2cc');
            ctx.fillStyle = scleraGradient;
            ctx.beginPath();
            ctx.arc(x, y, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            const irisGradient = ctx.createRadialGradient(
                x - irisSize * 0.25, y - irisSize * 0.25, irisSize * 0.1,
                x, y, irisSize
            );
            irisGradient.addColorStop(0, '#7a92a5');
            irisGradient.addColorStop(0.7, '#2c3f52');
            irisGradient.addColorStop(1, '#182431');
            ctx.fillStyle = irisGradient;
            ctx.beginPath();
            ctx.arc(x, y, irisSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#0b0f14';
            ctx.beginPath();
            ctx.arc(x, y, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(x - pupilSize * 0.4, y - pupilSize * 0.4, pupilSize * 0.35, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.beginPath();
            ctx.arc(x + pupilSize * 0.2, y + pupilSize * 0.1, pupilSize * 0.25, 0, Math.PI * 2);
            ctx.fill();
        };
        
        drawSingleEye(-eyeOffset);
        drawSingleEye(eyeOffset);

        ctx.restore();
    }
}
