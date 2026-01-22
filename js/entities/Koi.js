// Koi Fish class - main fish entity

import { Fish } from './Fish.js';
import { Vector } from '../utils/Vector.js';
import { Chain } from '../utils/Chain.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, isInView, width, height, lerp } from '../utils/helpers.js';
import { fishGrid, foodGrid, predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool, splashPool } from '../systems/ObjectPool.js';
import { adjustColor, rgbaFromHex, hexToRgba } from '../utils/ColorUtils.js';
import { simplifyAngle, angleDifference } from '../utils/AngleUtils.js';
import { beginShape, vertex, curveVertex, bezierVertex, endShape } from '../utils/ShapeRenderer.js';

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

// Math constants
const PI = Math.PI;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export class Koi extends Fish {
    constructor(x, y) {
        super(x, y);
        
        // Override base class initialization with Koi-specific values
        this.baseSpeed = rand(params.fishBaseSpeedMin, params.fishBaseSpeedMax);
        this.maxSpeed = this.baseSpeed * params.speedScale;
        this.maxForce = params.turnForce; 
        
        // Scale factor (0.6-0.9 range like example, but respect config)
        const baseScale = rand(0.6, 0.9);
        this.scale = baseScale * (params.sizeMin + params.sizeMax) / 20; // Scale by average size
        this.size = this.scale * 10; // Keep size for compatibility with existing code
        
        // Reinitialize spine with correct scale (base class initialized with scale=1)
        const spineCount = params.spineCount || 12;
        const linkSize = 16 * this.scale;
        const trailAngle = this.vel.heading() + PI;
        this.spine = new Chain(this.pos, spineCount, linkSize, PI / 3, trailAngle);
        this.spineLength = spineCount;
        
        // Reinitialize smoothed velocity and head angle
        this.smoothedVel = new Vector(this.vel.x, this.vel.y);
        this.currentHeadAngle = simplifyAngle(this.vel.heading());
        
        // Koi-specific properties
        this.birthTimer = rand(0, params.fishInitialBirthCooldown);
        this.noiseOffset = rand(0, 1000);
        
        // Pattern setup
        this.setupPattern();
        
        // Jump state management
        this.jumpState = null; // null, 'JUMPING', or 'LANDING'
        this.jumpTimer = 0;
        this.jumpVelocity = new Vector(0, 0);
        this.jumpCooldown = 0;
        this.lastJumpTime = 0;
        this.jumpStartPos = null;
        this.isExcited = false; // Track if fish is excited (near food or just ate)
    }

    setupPattern() {
        this.spots = []; // Clear previous spots
        let pType = params.pattern || 'Random';

        if (pType === 'Random') {
            const rnd = Math.random();
            if (rnd < 0.3) pType = 'Kohaku';
            else if (rnd < 0.5) pType = 'Sanke';
            else if (rnd < 0.7) pType = 'Showa';
            else if (rnd < 0.8) pType = 'Utsuri';
            else if (rnd < 0.9) pType = 'Ogon';
            else pType = 'Orenji';
        }

        // Default Base Colors
        this.baseColor = '#f0f0f0'; // White base default
        
        if (pType === 'Kohaku') {
            this.baseColor = '#f2f2f2';
            this.generateSpots('#FF4500', 3, 5); // Red/Orange
        } else if (pType === 'Sanke') {
            this.baseColor = '#f5f5f5';
            this.generateSpots('#FF3300', 2, 4); // Red
            this.generateSpots('#222222', 1, 3, 0.6); // Small Black
        } else if (pType === 'Showa') {
            this.baseColor = '#222222'; // Black base
            this.generateSpots('#FF3300', 3, 5); // Red
            this.generateSpots('#FFFFFF', 2, 4); // White
        } else if (pType === 'Utsuri') {
            this.baseColor = '#111111'; // Black base
            this.generateSpots('#FFD700', 3, 6); // Yellow/Gold
        } else if (pType === 'Ogon') {
            this.baseColor = '#FFD700'; // Gold
        } else if (pType === 'Orenji') {
            this.baseColor = '#FF8C00'; // Orange
        }
    }

    generateSpots(color, minCount, maxCount, sizeMult = 1.0) {
        const count = Math.floor(rand(minCount, maxCount));
        for(let i=0; i<count; i++) {
            this.spots.push({
                segment: rand(1, 9), 
                offsetY: rand(-0.5, 0.5), 
                size: rand(0.8, 1.5) * sizeMult, 
                color: color
            });
        }
    }

    getDynamicWidth(i) {
        const baseW = params.fishShape[i] !== undefined ? params.fishShape[i] : 10;
        return baseW * this.scale * 0.6 * (params.bodyWidth || 0.4);
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
        const j = this.spine.joints;
        const a = this.spine.angles;
        
        const getP = (i, angOff, lenOff) => {
            const w = this.getDynamicWidth(i);
            const wiggleMag = (i * 2.0 * this.scale); 
            const wiggle = Math.sin(this.swimPhase - i * 0.5) * wiggleMag;
            
            const px = Math.cos(a[i] + HALF_PI) * wiggle;
            const py = Math.sin(a[i] + HALF_PI) * wiggle;
            
            const baseX = j[i].x + px;
            const baseY = j[i].y + py;

            return {
                x: baseX + Math.cos(a[i] + angOff) * (w + lenOff),
                y: baseY + Math.sin(a[i] + angOff) * (w + lenOff)
            };
        };
        
        shadowCtx.save();
        shadowCtx.translate(params.shadowOffsetX, params.shadowOffsetY); 
        this.drawBodyAndFins(shadowCtx, 'rgba(0,0,0,0.3)', true, getP, j, a);
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
            
            // Update Chain for jumping fish - use jump velocity directly with shortest path
            if (this.jumpVelocity.mag() > 0.01) {
                const targetAngle = Math.atan2(this.jumpVelocity.y, this.jumpVelocity.x);
                const angleDiff = angleDifference(targetAngle, this.currentHeadAngle);
                this.currentHeadAngle = simplifyAngle(this.currentHeadAngle + angleDiff * 0.2);
                this.spine.angles[0] = this.currentHeadAngle;
            }
            this.spine.resolve(this.pos);
            
            // Update smoothed velocity during jump
            this.smoothedVel.x = this.jumpVelocity.x;
            this.smoothedVel.y = this.jumpVelocity.y;
            
            // Continue swim timer for animation
            this.swimTimer += (params.waveSpeedBase + (this.jumpVelocity.mag() * params.waveSpeedMult)) * scale;
            this.swimPhase += (0.15 + (this.jumpVelocity.mag() * 0.05)) * (params.wiggle || 0.2) * scale * 0.3; // Reduced wiggle during jump
            this.finsAngle = this.swimTimer;
            
            return; // Skip normal physics update during jump
        }
        
        // Normal physics update (when not jumping) - call parent update
        super.update(dt);
    }

    display(ctx) {
        const j = this.spine.joints;
        const a = this.spine.angles;
        
        const getP = (i, angOff, lenOff) => {
            const w = this.getDynamicWidth(i);
            const wiggleMag = (i * 2.0 * this.scale); 
            const wiggle = Math.sin(this.swimPhase - i * 0.5) * wiggleMag;
            
            const px = Math.cos(a[i] + HALF_PI) * wiggle;
            const py = Math.sin(a[i] + HALF_PI) * wiggle;
            
            const baseX = j[i].x + px;
            const baseY = j[i].y + py;

            return {
                x: baseX + Math.cos(a[i] + angOff) * (w + lenOff),
                y: baseY + Math.sin(a[i] + angOff) * (w + lenOff)
            };
        };

        // Shadow
        ctx.save();
        ctx.translate(20, 20);
        this.drawBodyAndFins(ctx, 'rgba(0,0,0,0.2)', true, getP, j, a);
        ctx.restore();

        // Fish
        this.drawBodyAndFins(ctx, this.baseColor, false, getP, j, a);
    }

    draw(isShadow) {
        // Shadows are now handled separately via drawShadow method
        if (isShadow) return;
        this.display(mainCtx);
    }
    
    drawBodyAndFins(ctx, color, isShadow, getP, j, a) {
        // FINS
        const drawSingleFin = (idx, angleOffset, rot, len, wid) => {
             const wiggleMag = (idx * 2.0 * this.scale);
             const wiggle = Math.sin(this.swimPhase - idx * 0.5) * wiggleMag;
             const px = Math.cos(a[idx] + HALF_PI) * wiggle;
             const py = Math.sin(a[idx] + HALF_PI) * wiggle;
             const w = this.getDynamicWidth(idx) * 0.8;
             const bx = j[idx].x + px + Math.cos(a[idx] + angleOffset) * w;
             const by = j[idx].y + py + Math.sin(a[idx] + angleOffset) * w;

             ctx.save();
             ctx.translate(bx, by);
             ctx.rotate(rot);
             ctx.beginPath();
             ctx.ellipse(0, 0, len, wid, 0, 0, TWO_PI);
             ctx.fillStyle = isShadow ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0.4)';
             ctx.fill();
             ctx.restore();
        }

        drawSingleFin(3, PI/3, a[2] - PI/4, 40 * this.scale, 16 * this.scale);
        drawSingleFin(3, -PI/3, a[2] + PI/4, 40 * this.scale, 16 * this.scale);
        drawSingleFin(7, PI/2, a[6] - PI/4, 24 * this.scale, 8 * this.scale);
        drawSingleFin(7, -PI/2, a[6] + PI/4, 24 * this.scale, 8 * this.scale);

        // BODY CONSTRUCTION
        // 1. Build shape array
        beginShape();
        for (let i = 8; i < 12; i++) { // Tail Right
           let w = (i - 8) * (i - 8) * 2.5 * this.scale * (params.bodyWidth || 0.4);
           let p = getP(i, -PI/2, w); 
           curveVertex(p.x, p.y);
        }
        for (let i = 11; i >= 8; i--) { // Tail Left
           let w = (i - 8) * (i - 8) * 2.5 * this.scale * (params.bodyWidth || 0.4);
           let p = getP(i, PI/2, w);
           curveVertex(p.x, p.y);
        }
        endShape(ctx, isShadow ? color : 'rgba(255, 255, 255, 0.4)');

        beginShape();
        for (let i = 0; i < 10; i++) { // Body Right
            let p = getP(i, PI/2, 0);
            curveVertex(p.x, p.y);
        }
        let pTail = getP(9, PI, 0);
        curveVertex(pTail.x, pTail.y);
        for (let i = 9; i >= 0; i--) { // Body Left
            let p = getP(i, -PI/2, 0);
            curveVertex(p.x, p.y);
        }
        let pHeadR = getP(0, -PI/6, 0); // Head
        let pHeadTip = getP(0, 0, 4 * this.scale);
        let pHeadL = getP(0, PI/6, 0);
        curveVertex(pHeadR.x, pHeadR.y);
        curveVertex(pHeadTip.x, pHeadTip.y);
        curveVertex(pHeadL.x, pHeadL.y);
        let pStart = getP(0, PI/2, 0); // Close
        let pStart2 = getP(1, PI/2, 0);
        curveVertex(pStart.x, pStart.y);
        curveVertex(pStart2.x, pStart2.y);

        // 2. Render Body + Spots
        const renderSpots = () => {
            if (isShadow) return;

            // Draw spots if they exist
            if (this.spots) {
                this.spots.forEach(spot => {
                    const idx = spot.segment;
                    const iFloor = Math.floor(idx);
                    const t = idx - iFloor;

                    const getPosAt = (k) => {
                        const wiggleMag = (k * 2.0 * this.scale);
                        const wiggle = Math.sin(this.swimPhase - k * 0.5) * wiggleMag;
                        return {
                            x: j[k].x + Math.cos(a[k] + HALF_PI) * wiggle,
                            y: j[k].y + Math.sin(a[k] + HALF_PI) * wiggle,
                            w: this.getDynamicWidth(k)
                        };
                    };

                    const p1 = getPosAt(iFloor);
                    const p2 = getPosAt(Math.min(iFloor + 1, 11));

                    const x = lerp(p1.x, p2.x, t);
                    const y = lerp(p1.y, p2.y, t);
                    const widthAtSeg = lerp(p1.w, p2.w, t);
                    
                    // Offset spot from center based on spine rotation
                    const ang = a[iFloor]; 
                    const perpX = Math.cos(ang + HALF_PI) * spot.offsetY * widthAtSeg;
                    const perpY = Math.sin(ang + HALF_PI) * spot.offsetY * widthAtSeg;

                    // BLENDING LOGIC: Use Radial Gradient for Soft Edges
                    const radius = widthAtSeg * spot.size * (params.spotSize || 0.7);
                    const cx = x + perpX;
                    const cy = y + perpY;

                    const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
                    grad.addColorStop(0, hexToRgba(spot.color, 0.95)); // Nearly opaque center
                    grad.addColorStop(0.6, hexToRgba(spot.color, 0.7)); // Fade starts
                    grad.addColorStop(1, hexToRgba(spot.color, 0.0)); // Transparent edge

                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, TWO_PI);
                    ctx.fillStyle = grad;
                    ctx.fill();
                });
            }
        };

        endShape(ctx, color, renderSpots);

        if (!isShadow) {
            // Dorsal Fin
            beginShape();
            vertex(j[4].x, j[4].y);
            bezierVertex(j[5].x, j[5].y, j[6].x, j[6].y, j[7].x, j[7].y);
            let cp2x = j[5].x + Math.cos(a[5]+HALF_PI) * 15 * this.scale;
            let cp2y = j[5].y + Math.sin(a[5]+HALF_PI) * 15 * this.scale;
            bezierVertex(j[7].x, j[7].y, cp2x, cp2y, j[4].x, j[4].y); 
            endShape(ctx, 'rgba(255, 255, 255, 0.4)');

            // Eyes
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            let eyeR = getP(0, PI/2, -6 * this.scale);
            let eyeL = getP(0, -PI/2, -6 * this.scale);
            let eyeSize = 5 * this.scale;
            ctx.beginPath(); ctx.arc(eyeR.x, eyeR.y, eyeSize, 0, TWO_PI); ctx.fill();
            ctx.beginPath(); ctx.arc(eyeL.x, eyeL.y, eyeSize, 0, TWO_PI); ctx.fill();
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.arc(eyeR.x, eyeR.y, eyeSize * 0.5, 0, TWO_PI); ctx.fill();
            ctx.beginPath(); ctx.arc(eyeL.x, eyeL.y, eyeSize * 0.5, 0, TWO_PI); ctx.fill();
        }
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
