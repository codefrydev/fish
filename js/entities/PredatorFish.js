// Predator Fish class - hunts koi fish

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height, lerp } from '../utils/helpers.js';
import { fishGrid } from '../utils/SpatialGrid.js';
import { ripplePool, bloodPool } from '../systems/ObjectPool.js';

// Math constants
const PI = Math.PI;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// Angle utility functions
function simplifyAngle(angle) {
    while (angle >= TWO_PI) angle -= TWO_PI;
    while (angle < 0) angle += TWO_PI;
    return angle;
}

function relativeAngleDiff(angle, anchor) {
    angle = simplifyAngle(angle + PI - anchor);
    anchor = PI;
    return anchor - angle;
}

function constrainAngle(angle, anchor, constraint) {
    if (Math.abs(relativeAngleDiff(angle, anchor)) <= constraint) return simplifyAngle(angle);
    if (relativeAngleDiff(angle, anchor) > constraint) return simplifyAngle(anchor - constraint);
    return simplifyAngle(anchor + constraint);
}

// Get the shortest angle difference between two angles (-PI to PI)
function angleDifference(target, current) {
    let diff = target - current;
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    return diff;
}

/**
 * Chain class for smooth spine animation with angle constraints
 */
class Chain {
    constructor(origin, jointCount, linkSize, angleConstraint = TWO_PI, trailAngle = 0) {
        this.linkSize = linkSize;
        this.angleConstraint = angleConstraint;
        this.joints = [];
        this.angles = [];
        
        this.joints.push(origin.copy());
        this.angles.push(simplifyAngle(trailAngle + PI));

        let offset = Vector.fromAngle(trailAngle);
        offset.mult(linkSize);

        for (let i = 1; i < jointCount; i++) {
            const prev = this.joints[i - 1];
            const newPos = Vector.add(prev, offset);
            this.joints.push(newPos);
            this.angles.push(simplifyAngle(trailAngle + PI));
        }
    }

    resolve(pos) {
        this.joints[0] = pos.copy();
        for (let i = 1; i < this.joints.length; i++) {
            const diff = Vector.sub(this.joints[i - 1], this.joints[i]);
            const curAngle = Math.atan2(diff.y, diff.x);
            this.angles[i] = constrainAngle(curAngle, this.angles[i - 1], this.angleConstraint);
            const offset = Vector.fromAngle(this.angles[i]);
            offset.mult(this.linkSize);
            this.joints[i] = Vector.sub(this.joints[i - 1], offset);
        }
    }
}

// Shape rendering helpers (Processing-style)
let shapeVertices = [];

function beginShape() {
    shapeVertices = [];
}

function vertex(x, y) {
    shapeVertices.push({ x, y, type: 'vertex' });
}

function curveVertex(x, y) {
    shapeVertices.push({ x, y, type: 'curve' });
}

function bezierVertex(cx1, cy1, cx2, cy2, x, y) {
    shapeVertices.push({ cx1, cy1, cx2, cy2, x, y, type: 'bezier' });
}

function endShape(ctx, fillStyle, patternCallback) {
    if (shapeVertices.length === 0) return;
    ctx.beginPath();
    
    let isSpline = shapeVertices.some(v => v.type === 'curve');

    if (isSpline && shapeVertices.length >= 4) {
        ctx.moveTo(shapeVertices[1].x, shapeVertices[1].y);
        for (let i = 1; i < shapeVertices.length - 2; i++) {
            let p0 = shapeVertices[i - 1];
            let p1 = shapeVertices[i];
            let p2 = shapeVertices[i + 1];
            let p3 = shapeVertices[i + 2];
            
            let cp1x = p1.x + (p2.x - p0.x) / 6;
            let cp1y = p1.y + (p2.y - p0.y) / 6;
            let cp2x = p2.x - (p3.x - p1.x) / 6;
            let cp2y = p2.y - (p3.y - p1.y) / 6;
            
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    } else {
        ctx.moveTo(shapeVertices[0].x, shapeVertices[0].y);
        for (let i = 1; i < shapeVertices.length; i++) {
            let v = shapeVertices[i];
            if (v.type === 'bezier') {
                ctx.bezierCurveTo(v.cx1, v.cy1, v.cx2, v.cy2, v.x, v.y);
            } else {
                ctx.lineTo(v.x, v.y);
            }
        }
    }
    
    ctx.closePath();
    
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }

    if (patternCallback) {
        ctx.save();
        ctx.clip(); 
        patternCallback();
        ctx.restore();
    }
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

export class PredatorFish {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = Vector.fromAngle(rand(0, TWO_PI));
        this.vel.mult(rand(0.3, 0.5));
        this.acc = new Vector(0, 0);
        
        this.size = rand(params.predatorSizeMin, params.predatorSizeMax);
        this.scale = this.size / 10; // Scale factor similar to Koi
        this.baseSpeed = params.predatorBaseSpeed;
        this.maxSpeed = this.baseSpeed;
        this.maxForce = params.predatorMaxForceLurking;
        
        // State machine
        this.state = 'LURKING';
        this.target = null;
        this.stateTimer = 0;
        this.restTimer = 0;
        this.attackStartPos = null;
        
        // Chain-based spine system
        const spineCount = params.spineCount || 12;
        const linkSize = 16 * this.scale;
        const trailAngle = this.vel.heading() + PI;
        this.spine = new Chain(this.pos, spineCount, linkSize, PI / 3, trailAngle);
        this.spineLength = spineCount;
        
        // Swim phase for wiggle animation
        this.swimPhase = rand(0, TWO_PI);
        this.swimTimer = Math.random() * params.fishInitialSwimTimer;
        
        // Smoothed velocity for angle calculation (reduces jitter)
        this.smoothedVel = new Vector(this.vel.x, this.vel.y);
        
        // Track current head angle to prevent sudden 360 rotations
        this.currentHeadAngle = simplifyAngle(this.vel.heading());
        
        // Stats
        this.huntCount = 0;
        this.killCount = 0;
        
        // Trail system for attack phase
        this.trail = [];
        this.lastTrailPos = null;
    }
    
    getDynamicWidth(i) {
        const baseW = params.fishShape[i] !== undefined ? params.fishShape[i] : 10;
        return baseW * this.scale * 0.6 * (params.predatorBodyWidth || 0.4);
    }
    
    applyForce(force) {
        this.acc.add(force);
    }
    
    seek(target, speedMult = 1) {
        let desired = new Vector(target.x - this.pos.x, target.y - this.pos.y);
        desired.normalize();
        desired.mult(this.maxSpeed * speedMult);
        let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
        steer.limit(this.maxForce * speedMult);
        return steer;
    }
    
    findTarget(koiList) {
        const detectionRange = params.predatorDetectionRange;
        let closestDist = detectionRange;
        let closestKoi = null;
        
        // Use spatial grid for efficient lookup
        const nearbyKoi = fishGrid.getNearby(this.pos.x, this.pos.y, detectionRange);
        
        for (const koi of nearbyKoi) {
            const dx = koi.pos.x - this.pos.x;
            const dy = koi.pos.y - this.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            if (d < closestDist) {
                closestDist = d;
                closestKoi = koi;
            }
        }
        
        return closestKoi;
    }
    
    update(koiList, dt = 1/60) {
        const scale = dt * 60;
        
        // State machine
        switch (this.state) {
            case 'LURKING':
                this.maxSpeed = this.baseSpeed * params.speedScale;
                this.maxForce = params.predatorMaxForceLurking;
                
                // Wander slowly
                if (Math.random() < params.predatorWanderProbability) {
                    let wander = new Vector(rand(-1, 1), rand(-1, 1));
                    wander.normalize();
                    wander.mult(params.predatorWanderMagnitude);
                    this.applyForce(wander);
                }
                
                // Stay in bounds
                this.stayInBounds();
                
                // Look for prey
                const target = this.findTarget(koiList);
                if (target) {
                    this.target = target;
                    this.state = 'DETECTING';
                    this.stateTimer = 0;
                }
                break;
                
            case 'DETECTING':
                this.maxSpeed = this.baseSpeed * params.predatorDetectingSpeedMult * params.speedScale;
                this.stateTimer += scale;
                
                // Slowly turn toward target
                if (this.target && koiList.includes(this.target)) {
                    let steer = this.seek(this.target.pos, params.predatorDetectingSeekMult);
                    this.applyForce(steer);
                    
                    // After brief pause, attack!
                    if (this.stateTimer > params.predatorDetectionTime) {
                        this.state = 'ATTACKING';
                        this.attackStartPos = new Vector(this.pos.x, this.pos.y);
                        this.huntCount++;
                        // Create small ripple as predator lunges
                        ripplePool.acquire(this.pos.x, this.pos.y, params.rippleLungeRadius, params.rippleLungeMaxRadius, params.rippleLungeSpeed);
                    }
                } else {
                    this.target = null;
                    this.state = 'LURKING';
                }
                break;
                
            case 'ATTACKING':
                this.maxSpeed = params.predatorAttackSpeed * params.speedScale;
                this.maxForce = params.predatorMaxForceAttacking;
                
                if (this.target && koiList.includes(this.target)) {
                    let steer = this.seek(this.target.pos, params.predatorAttackingSeekMult);
                    this.applyForce(steer);
                    
                    // Check if caught
                    const dx = this.target.pos.x - this.pos.x;
                    const dy = this.target.pos.y - this.pos.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    
                    if (d < this.size * params.predatorCatchDistance) {
                        // Attempt catch
                        if (Math.random() < params.predatorHuntSuccessRate) {
                            // Success! Eat the koi
                            this.state = 'EATING';
                            this.stateTimer = 0;
                            this.killCount++;
                            
                            // Remove koi from array
                            const idx = koiList.indexOf(this.target);
                            if (idx !== -1) {
                                koiList.splice(idx, 1);
                            }
                            
                            // Big splash effect
                            ripplePool.acquire(this.pos.x, this.pos.y, params.rippleKillMainRadius, params.rippleKillMainMaxRadius, params.rippleKillMainSpeed);
                            ripplePool.acquire(this.pos.x, this.pos.y, params.rippleKillSecondaryRadius, params.rippleKillSecondaryMaxRadius, params.rippleKillSecondarySpeed);
                            
                            // Blood spill effect
                            bloodPool.acquire(this.pos.x, this.pos.y);
                        } else {
                            // Failed - koi escaped
                            this.state = 'RESTING';
                            this.restTimer = params.predatorRestTime * params.predatorRestTimeFailMult;
                            ripplePool.acquire(this.pos.x, this.pos.y, params.rippleFailRadius, params.rippleFailMaxRadius, params.rippleFailSpeed);
                        }
                        this.target = null;
                    }
                    
                    // Give up if chase is too long
                    const chaseDistance = dist(this.attackStartPos.x, this.attackStartPos.y, this.pos.x, this.pos.y);
                    if (chaseDistance > params.predatorDetectionRange * params.predatorMaxChaseDistMult) {
                        this.state = 'RESTING';
                        this.restTimer = params.predatorRestTime * params.predatorRestTimeGiveUpMult;
                        this.target = null;
                    }
                } else {
                    this.target = null;
                    this.state = 'RESTING';
                    this.restTimer = params.predatorRestTime * params.predatorRestTimeGiveUpMult;
                }
                break;
                
            case 'EATING':
                this.maxSpeed = params.predatorEatingSpeed;
                this.stateTimer += scale;
                
                // Brief pause while "eating"
                if (this.stateTimer > params.predatorEatingDuration) {
                    this.state = 'RESTING';
                    this.restTimer = params.predatorRestTime;
                }
                break;
                
            case 'RESTING':
                this.maxSpeed = this.baseSpeed * params.predatorRestingSpeedMult * params.speedScale;
                this.maxForce = params.predatorMaxForceResting;
                this.restTimer -= scale;
                
                // Slow drift
                this.stayInBounds();
                
                if (this.restTimer <= 0) {
                    this.state = 'LURKING';
                }
                break;
        }
        
        // Physics update
        this.vel.x += this.acc.x * scale;
        this.vel.y += this.acc.y * scale;
        this.vel.limit(this.maxSpeed);
        
        this.pos.x += this.vel.x * scale;
        this.pos.y += this.vel.y * scale;
        this.acc.mult(0);
        
        // Swim animation
        let speed = this.vel.mag();
        this.swimTimer += (params.waveSpeedBase + (speed * params.waveSpeedMult)) * scale;
        
        // Smooth velocity for angle calculation to reduce jitter
        const smoothFactor = 0.3;
        this.smoothedVel.x = this.smoothedVel.x * (1 - smoothFactor) + this.vel.x * smoothFactor;
        this.smoothedVel.y = this.smoothedVel.y * (1 - smoothFactor) + this.vel.y * smoothFactor;
        
        // Update Chain-based spine - use smoothed velocity heading with shortest path
        const smoothedSpeed = this.smoothedVel.mag();
        if (smoothedSpeed > 0.01) {
            const targetAngle = this.smoothedVel.heading();
            const angleDiff = angleDifference(targetAngle, this.currentHeadAngle);
            this.currentHeadAngle = simplifyAngle(this.currentHeadAngle + angleDiff * 0.2);
            this.spine.angles[0] = this.currentHeadAngle;
        }
        this.spine.resolve(this.pos);
        
        // Update swim phase for wiggle animation (more aggressive when attacking)
        const wiggleMult = this.state === 'ATTACKING' ? params.predatorAttackWaveMult : 1.0;
        this.swimPhase += (0.15 + (speed * 0.05)) * (params.predatorWiggle || 0.2) * wiggleMult * scale;
        
        // Update trail system
        this.updateTrail(dt);
    }
    
    stayInBounds() {
        const margin = params.predatorBoundaryMargin;
        let desired = null;
        
        if (this.pos.x < margin) desired = new Vector(this.maxSpeed, this.vel.y);
        else if (this.pos.x > width - margin) desired = new Vector(-this.maxSpeed, this.vel.y);
        if (this.pos.y < margin) desired = new Vector(this.vel.x, this.maxSpeed);
        else if (this.pos.y > height - margin) desired = new Vector(this.vel.x, -this.maxSpeed);
        
        if (desired) {
            desired.normalize();
            desired.mult(this.maxSpeed);
            let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
            steer.limit(this.maxForce * 2);
            this.applyForce(steer);
        }
    }
    
    updateTrail(dt) {
        const scale = dt * 60;
        
        // Update ages of existing trail points
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const point = this.trail[i];
            point.age += dt;
            
            // Calculate alpha based on age (exponential fade for anime effect)
            const ageFactor = 1 - (point.age / params.predatorTrailFadeTime);
            point.alpha = Math.max(0, params.predatorTrailAlpha * Math.pow(ageFactor, 1.5));
            
            // Remove expired trail points
            if (point.age >= params.predatorTrailFadeTime) {
                this.trail.splice(i, 1);
            }
        }
        
        // Add new trail points only during ATTACKING state
        if (this.state === 'ATTACKING') {
            // Calculate eye positions using Chain
            const j = this.spine.joints;
            const a = this.spine.angles;
            const headAngle = a[0];
            
            const s = this.scale;
            const eyeOffset = 7 * s;
            const w = this.getDynamicWidth(0);
            
            // Calculate world positions of both eyes
            const leftEyeX = j[0].x + Math.cos(headAngle) * eyeOffset + Math.cos(headAngle - HALF_PI) * w * 0.5;
            const leftEyeY = j[0].y + Math.sin(headAngle) * eyeOffset + Math.sin(headAngle - HALF_PI) * w * 0.5;
            
            const rightEyeX = j[0].x + Math.cos(headAngle) * eyeOffset + Math.cos(headAngle + HALF_PI) * w * 0.5;
            const rightEyeY = j[0].y + Math.sin(headAngle) * eyeOffset + Math.sin(headAngle + HALF_PI) * w * 0.5;
            
            // Check if we should add a new trail point based on distance
            let shouldAddPoint = false;
            
            if (!this.lastTrailPos) {
                shouldAddPoint = true;
            } else {
                const dx = j[0].x - this.lastTrailPos.x;
                const dy = j[0].y - this.lastTrailPos.y;
                const distSq = dx * dx + dy * dy;
                const spacingSq = params.predatorTrailSpacing * params.predatorTrailSpacing;
                
                if (distSq >= spacingSq) {
                    shouldAddPoint = true;
                }
            }
            
            if (shouldAddPoint) {
                // Add new trail point with eye positions
                this.trail.push({
                    leftEye: { x: leftEyeX, y: leftEyeY },
                    rightEye: { x: rightEyeX, y: rightEyeY },
                    angle: headAngle,
                    age: 0,
                    alpha: params.predatorTrailAlpha,
                    eyeSize: params.predatorEyeSizeRatio * s,
                    pupilSize: params.predatorEyeSizeRatio * s * params.predatorEyeIrisRatio * params.predatorEyePupilRatio
                });
                
                this.lastTrailPos = { x: j[0].x, y: j[0].y };
                
                // Limit trail length
                if (this.trail.length > params.predatorTrailMaxLength) {
                    this.trail.shift();
                }
            }
        } else {
            // Clear trail when not attacking
            if (this.trail.length > 0) {
                // Fade out existing trail naturally rather than clearing abruptly
                // Trail will fade out on its own through the age update above
            }
            this.lastTrailPos = null;
        }
    }
    
    drawTrail(ctx) {
        if (this.trail.length < 1) return;
        
        ctx.save();
        
        // Draw anime-style blurred eye after-images (oldest to newest for proper layering)
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            
            if (point.alpha <= 0) continue;
            
            // Draw each eye's after-image with blur effect
            this.drawGhostEye(ctx, point.leftEye.x, point.leftEye.y, point.eyeSize, point.pupilSize, point.alpha);
            this.drawGhostEye(ctx, point.rightEye.x, point.rightEye.y, point.eyeSize, point.pupilSize, point.alpha);
        }
        
        ctx.restore();
    }
    
    drawGhostEye(ctx, x, y, eyeSize, pupilSize, alpha) {
        // Anime-style blurred glow effect - multiple layers for soft blur
        const blurLayers = 3;
        
        for (let layer = blurLayers; layer >= 1; layer--) {
            const layerScale = 1 + (layer * 0.4);
            const layerAlpha = alpha / (layer * 1.5);
            
            // Outer glow (red/orange halo)
            const outerRadius = pupilSize * layerScale * 2.5;
            const outerGradient = ctx.createRadialGradient(x, y, pupilSize * 0.3, x, y, outerRadius);
            outerGradient.addColorStop(0, `rgba(255, 60, 40, ${layerAlpha * 0.6})`);
            outerGradient.addColorStop(0.4, `rgba(255, 80, 50, ${layerAlpha * 0.4})`);
            outerGradient.addColorStop(0.7, `rgba(255, 100, 60, ${layerAlpha * 0.2})`);
            outerGradient.addColorStop(1, 'rgba(255, 120, 70, 0)');
            
            ctx.fillStyle = outerGradient;
            ctx.beginPath();
            ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Core bright spot (hot center)
        const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, pupilSize * 1.2);
        coreGradient.addColorStop(0, `rgba(255, 200, 150, ${alpha * 0.9})`);
        coreGradient.addColorStop(0.5, `rgba(255, 100, 80, ${alpha * 0.7})`);
        coreGradient.addColorStop(1, `rgba(255, 60, 40, ${alpha * 0.3})`);
        
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(x, y, pupilSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Add streaky blur effect for motion (anime style)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.4;
        
        const streakLength = pupilSize * 1.5;
        const streakGradient = ctx.createRadialGradient(x, y, 0, x, y, streakLength);
        streakGradient.addColorStop(0, 'rgba(255, 150, 100, 0.8)');
        streakGradient.addColorStop(0.6, 'rgba(255, 80, 60, 0.4)');
        streakGradient.addColorStop(1, 'rgba(255, 60, 40, 0)');
        
        ctx.fillStyle = streakGradient;
        ctx.beginPath();
        ctx.arc(x, y, streakLength, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }
    
    display(ctx) {
        const j = this.spine.joints;
        const a = this.spine.angles;
        
        const getP = (i, angOff, lenOff) => {
            const w = this.getDynamicWidth(i);
            const wiggleMag = (i * 2.0 * this.scale);
            const wiggleMult = this.state === 'ATTACKING' ? params.predatorAttackWaveMult : 1.0;
            const wiggle = Math.sin(this.swimPhase - i * 0.5) * wiggleMag * wiggleMult;
            
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

        // Predator body
        this.drawBodyAndFins(ctx, params.predatorColor, false, getP, j, a);
    }

    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        // Draw trail first (behind the predator)
        this.drawTrail(ctx);
        
        // Draw predator body
        this.display(ctx);
        
        // Draw attack indicator when detecting/attacking
        if (this.state === 'DETECTING' || this.state === 'ATTACKING') {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, params.predatorDetectionRange, 0, Math.PI * 2);
            ctx.strokeStyle = this.state === 'ATTACKING' 
                ? 'rgba(255, 50, 50, 0.15)' 
                : 'rgba(255, 200, 50, 0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }
    
    drawBodyAndFins(ctx, color, isShadow, getP, j, a) {
        // Ensure color is valid - use color directly for shadows, otherwise use predator color
        const baseColor = isShadow ? color : ((color && typeof color === 'string' && color.startsWith('#')) ? color : params.predatorColor || '#1a3d2e');
        
        // FINS
        const drawSingleFin = (idx, angleOffset, rot, len, wid) => {
             const wiggleMag = (idx * 2.0 * this.scale);
             const wiggleMult = this.state === 'ATTACKING' ? params.predatorAttackWaveMult : 1.0;
             const wiggle = Math.sin(this.swimPhase - idx * 0.5) * wiggleMag * wiggleMult;
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
        beginShape();
        for (let i = 8; i < 12; i++) { // Tail Right
           let w = (i - 8) * (i - 8) * 2.5 * this.scale * (params.predatorBodyWidth || 0.4);
           let p = getP(i, -PI/2, w); 
           curveVertex(p.x, p.y);
        }
        for (let i = 11; i >= 8; i--) { // Tail Left
           let w = (i - 8) * (i - 8) * 2.5 * this.scale * (params.predatorBodyWidth || 0.4);
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

        // Render body with gradient (only if not shadow)
        if (isShadow) {
            endShape(ctx, color);
        } else {
            const bodyGradient = ctx.createLinearGradient(
                j[4].x, j[4].y - this.getDynamicWidth(4),
                j[4].x, j[4].y + this.getDynamicWidth(4)
            );
            const shadeDark = params.predatorBodyShadeDark || 0.4;
            const shadeLight = params.predatorBodyShadeLight || 0.15;
            bodyGradient.addColorStop(0, adjustColor(baseColor, -shadeDark));
            bodyGradient.addColorStop(0.45, adjustColor(baseColor, shadeLight * 0.5));
            bodyGradient.addColorStop(0.55, adjustColor(baseColor, shadeLight));
            bodyGradient.addColorStop(1, adjustColor(baseColor, -shadeDark * 0.75));
            endShape(ctx, bodyGradient);
        }
        
        if (!isShadow) {
            // Add solid overlay
            beginShape();
            for (let i = 0; i < 10; i++) {
                let p = getP(i, PI/2, 0);
                curveVertex(p.x, p.y);
            }
            pTail = getP(9, PI, 0);
            curveVertex(pTail.x, pTail.y);
            for (let i = 9; i >= 0; i--) {
                let p = getP(i, -PI/2, 0);
                curveVertex(p.x, p.y);
            }
            pHeadR = getP(0, -PI/6, 0);
            pHeadTip = getP(0, 0, 4 * this.scale);
            pHeadL = getP(0, PI/6, 0);
            curveVertex(pHeadR.x, pHeadR.y);
            curveVertex(pHeadTip.x, pHeadTip.y);
            curveVertex(pHeadL.x, pHeadL.y);
            pStart = getP(0, PI/2, 0);
            pStart2 = getP(1, PI/2, 0);
            curveVertex(pStart.x, pStart.y);
            curveVertex(pStart2.x, pStart2.y);
            endShape(ctx, rgbaFromHex(baseColor, params.predatorBodySolidAlpha || 0.5));
            
            // Specular highlight
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const lightDirX = 0.4;
            const lightDirY = -0.9;
            const lightLen = Math.hypot(lightDirX, lightDirY) || 1;
            const lx = lightDirX / lightLen;
            const ly = lightDirY / lightLen;
            const highlightOffset = this.size * 0.18;
            for (let i = 0; i < 10; i++) {
                const hx = j[i].x + lx * highlightOffset;
                const hy = j[i].y + ly * highlightOffset;
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.strokeStyle = `rgba(255, 255, 255, ${params.predatorSpecularOuterAlpha})`;
            ctx.lineWidth = this.size * params.predatorSpecularWidth;
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 255, 255, ${params.predatorSpecularInnerAlpha})`;
            ctx.lineWidth = this.size * params.predatorSpecularInnerWidth;
            ctx.stroke();
            ctx.restore();
            
            // Outline
            beginShape();
            for (let i = 0; i < 10; i++) {
                let p = getP(i, PI/2, 0);
                curveVertex(p.x, p.y);
            }
            pTail = getP(9, PI, 0);
            curveVertex(pTail.x, pTail.y);
            for (let i = 9; i >= 0; i--) {
                let p = getP(i, -PI/2, 0);
                curveVertex(p.x, p.y);
            }
            pHeadR = getP(0, -PI/6, 0);
            pHeadTip = getP(0, 0, 4 * this.scale);
            pHeadL = getP(0, PI/6, 0);
            curveVertex(pHeadR.x, pHeadR.y);
            curveVertex(pHeadTip.x, pHeadTip.y);
            curveVertex(pHeadL.x, pHeadL.y);
            pStart = getP(0, PI/2, 0);
            pStart2 = getP(1, PI/2, 0);
            curveVertex(pStart.x, pStart.y);
            curveVertex(pStart2.x, pStart2.y);
            const outlineDarken = params.predatorOutlineDarken || 0.6;
            const outlineAlpha = params.predatorOutlineAlpha || 0.35;
            ctx.strokeStyle = rgbaFromHex(adjustColor(baseColor, -outlineDarken), outlineAlpha);
            ctx.lineWidth = Math.max(1, this.size * (params.predatorOutlineWidth || 0.07));
            ctx.stroke();
            
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
            
            // Eye glow when attacking
            if (this.state === 'ATTACKING') {
                const glowPulse = Math.sin(this.swimTimer * params.predatorEyeGlowPulseSpeed) * 0.3 + 0.7;
                const glowRadius = eyeSize * params.predatorEyeGlowOuterRadius * params.predatorEyeGlowIntensity * glowPulse;
                const glowGradient = ctx.createRadialGradient(eyeR.x, eyeR.y, 0, eyeR.x, eyeR.y, glowRadius);
                glowGradient.addColorStop(0, `rgba(255, 60, 40, ${params.predatorEyeAttackGlowAlpha * glowPulse})`);
                glowGradient.addColorStop(0.5, `rgba(255, 80, 50, ${params.predatorEyeAttackGlowAlpha * 0.5 * glowPulse})`);
                glowGradient.addColorStop(1, 'rgba(255, 100, 60, 0)');
                ctx.fillStyle = glowGradient;
                ctx.beginPath();
                ctx.arc(eyeR.x, eyeR.y, glowRadius, 0, TWO_PI);
                ctx.fill();
                
                const glowGradient2 = ctx.createRadialGradient(eyeL.x, eyeL.y, 0, eyeL.x, eyeL.y, glowRadius);
                glowGradient2.addColorStop(0, `rgba(255, 60, 40, ${params.predatorEyeAttackGlowAlpha * glowPulse})`);
                glowGradient2.addColorStop(0.5, `rgba(255, 80, 50, ${params.predatorEyeAttackGlowAlpha * 0.5 * glowPulse})`);
                glowGradient2.addColorStop(1, 'rgba(255, 100, 60, 0)');
                ctx.fillStyle = glowGradient2;
                ctx.beginPath();
                ctx.arc(eyeL.x, eyeL.y, glowRadius, 0, TWO_PI);
                ctx.fill();
            }
            
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.arc(eyeR.x, eyeR.y, eyeSize * 0.5, 0, TWO_PI); ctx.fill();
            ctx.beginPath(); ctx.arc(eyeL.x, eyeL.y, eyeSize * 0.5, 0, TWO_PI); ctx.fill();
        }
    }

    // Same body path as Koi (kept for compatibility, but not used)
    drawBodyPath(ctx, leftPoints, rightPoints, head, headAngle) {
        ctx.beginPath();
        let noseX = head.pos.x + Math.cos(headAngle) * this.spine[0].size;
        let noseY = head.pos.y + Math.sin(headAngle) * this.spine[0].size;
        ctx.moveTo(noseX, noseY);

        ctx.lineTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 0; i < leftPoints.length - 1; i++) {
            const p0 = leftPoints[i];
            const p1 = leftPoints[i + 1];
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        ctx.lineTo(leftPoints[leftPoints.length-1].x, leftPoints[leftPoints.length-1].y);

        let tail = this.spine[this.spineLength-1];
        ctx.quadraticCurveTo(tail.pos.x, tail.pos.y, rightPoints[this.spineLength-1].x, rightPoints[this.spineLength-1].y);
        
        for (let i = rightPoints.length - 1; i > 0; i--) {
            const p0 = rightPoints[i];
            const p1 = rightPoints[i - 1];
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        ctx.lineTo(rightPoints[0].x, rightPoints[0].y);
        
        ctx.lineTo(noseX, noseY);
        ctx.closePath();
    }
    
    drawDorsalFin(ctx) {
        const startIndex = 4;
        const endIndex = this.spineLength - 2;
        
        if (startIndex >= this.spineLength || endIndex >= this.spineLength) return;

        ctx.beginPath();
        let start = this.spine[startIndex];
        ctx.moveTo(start.pos.x, start.pos.y);
        
        for(let i = startIndex + 1; i <= endIndex; i++) {
            let s = this.spine[i];
            ctx.lineTo(s.pos.x, s.pos.y);
        }
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.stroke();
        
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.stroke();
    }
    
    // Same fin style as Koi
    drawFins(ctx, head, angle, topLayer) {
        let shoulder = this.spine[4];
        let a = angle;
        
        ctx.save();
        ctx.translate(shoulder.pos.x, shoulder.pos.y);
        ctx.rotate(a);

        const finBase = adjustColor(params.predatorColor, params.predatorFinShadeLight);
        const finMid = adjustColor(params.predatorColor, params.predatorFinShadeMid);
        const finEdge = adjustColor(params.predatorColor, -params.predatorFinShadeDark);
        const makeFinGradient = (x0, y0, x1, y1) => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, rgbaFromHex(finBase, params.predatorFinAlphaBase));
            g.addColorStop(0.6, rgbaFromHex(finMid, params.predatorFinAlphaMid));
            g.addColorStop(1, rgbaFromHex(finEdge, params.predatorFinAlphaEdge));
            return g;
        };
        
        const s = (this.size / 22) * params.finScale;

        if (!topLayer) {
            let finCycle = Math.sin(this.swimTimer);
            
            ctx.fillStyle = makeFinGradient(6*s, 0, 45*s, 0);
            ctx.beginPath();
            ctx.moveTo(4*s, 0);
            ctx.quadraticCurveTo(45*s, -40*s + finCycle*10*s, -15*s, -25*s + finCycle*5*s);
            ctx.quadraticCurveTo(0, -8*s, 4*s, 0);
            ctx.fill();
            ctx.strokeStyle = rgbaFromHex(adjustColor(params.predatorColor, -0.45), 0.55);
            ctx.lineWidth = Math.max(1, this.size * 0.04);
            ctx.beginPath();
            ctx.moveTo(4*s, -2*s);
            ctx.lineTo(-6*s, -10*s);
            ctx.stroke();
            
            ctx.fillStyle = makeFinGradient(6*s, 0, 45*s, 0);
            ctx.beginPath();
            ctx.moveTo(4*s, 0);
            ctx.quadraticCurveTo(45*s, 40*s - finCycle*10*s, -15*s, 25*s - finCycle*5*s);
            ctx.quadraticCurveTo(0, 8*s, 4*s, 0);
            ctx.fill();
            ctx.strokeStyle = rgbaFromHex(adjustColor(params.predatorColor, -0.45), 0.55);
            ctx.lineWidth = Math.max(1, this.size * 0.04);
            ctx.beginPath();
            ctx.moveTo(4*s, 2*s);
            ctx.lineTo(-6*s, 10*s);
            ctx.stroke();
            
            ctx.translate(-22*s, 0);
            let pelvicCycle = Math.cos(this.swimTimer);
            
            ctx.fillStyle = makeFinGradient(0, 0, 18*s, 0);
            ctx.beginPath();
            ctx.moveTo(0, 3*s);
            ctx.quadraticCurveTo(15*s, 20*s + pelvicCycle*3*s, -5*s, 15*s);
            ctx.fill();
            ctx.strokeStyle = rgbaFromHex(adjustColor(params.predatorColor, -0.45), 0.5);
            ctx.lineWidth = Math.max(1, this.size * 0.035);
            ctx.beginPath();
            ctx.moveTo(0, 3*s);
            ctx.lineTo(-6*s, 10*s);
            ctx.stroke();
            
            ctx.fillStyle = makeFinGradient(0, 0, 18*s, 0);
            ctx.beginPath();
            ctx.moveTo(0, -3*s);
            ctx.quadraticCurveTo(15*s, -20*s - pelvicCycle*3*s, -5*s, -15*s);
            ctx.fill();
            ctx.strokeStyle = rgbaFromHex(adjustColor(params.predatorColor, -0.45), 0.5);
            ctx.lineWidth = Math.max(1, this.size * 0.035);
            ctx.beginPath();
            ctx.moveTo(0, -3*s);
            ctx.lineTo(-6*s, -10*s);
            ctx.stroke();
            
            ctx.restore();
        } else {
            ctx.restore();
            
            let tailIndex = this.spineLength - 1;
            let tailPos = this.spine[tailIndex].pos;
            let prevPos = this.spine[tailIndex - 1].pos;
            let tailAngle = Math.atan2(tailPos.y - prevPos.y, tailPos.x - prevPos.x);
            
            ctx.save();
            ctx.translate(tailPos.x, tailPos.y);
            ctx.rotate(tailAngle);
            
            ctx.fillStyle = makeFinGradient(0, 0, 35*s, 0);
            
            let flutter = Math.sin(this.swimTimer * 1.5);
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            let tipX = 35 * s;
            let tipY = -22 * s;
            
            ctx.bezierCurveTo(10*s, 0, 20*s, tipY + flutter * 5*s, tipX, tipY + flutter * 10*s);
            ctx.lineTo(tipX - 10*s, 0);
            ctx.bezierCurveTo(tipX, -tipY + flutter * 10*s, 20*s, -tipY + flutter * 5*s, 0, 0);
            ctx.fill();
            
            ctx.strokeStyle = rgbaFromHex(adjustColor(params.predatorColor, -0.5), 0.55);
            ctx.lineWidth = Math.max(1, this.size * 0.04);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(12*s, 0);
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0,0); ctx.lineTo(tipX, tipY + flutter*10*s);
            ctx.moveTo(0,0); ctx.lineTo(tipX, -tipY + flutter*10*s);
            ctx.moveTo(0,0); ctx.lineTo(tipX - 10*s, 0);
            ctx.stroke();

            ctx.restore();
        }
    }
    
    drawEyes(ctx, head, angle) {
        ctx.save();
        ctx.translate(head.pos.x, head.pos.y);
        ctx.rotate(angle);
        
        const s = this.size / 22;
        const eyeOffset = 7 * s;
        const eyeSize = params.predatorEyeSizeRatio * s;
        const irisSize = eyeSize * params.predatorEyeIrisRatio;
        const pupilSize = irisSize * params.predatorEyePupilRatio;
        const shadowOffset = 0.6 * s;
        
        const drawSingleEye = (y) => {
            const x = eyeOffset;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(x + shadowOffset, y + shadowOffset, eyeSize * 0.95, eyeSize * 0.75, 0, 0, Math.PI * 2);
            ctx.fill();
            
            const scleraGradient = ctx.createRadialGradient(
                x - eyeSize * 0.2, y - eyeSize * 0.2, eyeSize * 0.2,
                x, y, eyeSize
            );
            scleraGradient.addColorStop(0, '#e9edf2');
            scleraGradient.addColorStop(0.6, '#c2c9d1');
            scleraGradient.addColorStop(1, '#8c97a3');
            ctx.fillStyle = scleraGradient;
            ctx.beginPath();
            ctx.arc(x, y, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            const irisGradient = ctx.createRadialGradient(
                x - irisSize * 0.25, y - irisSize * 0.25, irisSize * 0.1,
                x, y, irisSize
            );
            irisGradient.addColorStop(0, '#5a6d7a');
            irisGradient.addColorStop(0.7, '#24313c');
            irisGradient.addColorStop(1, '#111820');
            ctx.fillStyle = irisGradient;
            ctx.beginPath();
            ctx.arc(x, y, irisSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#0a0f14';
            ctx.beginPath();
            ctx.arc(x, y, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.beginPath();
            ctx.arc(x - pupilSize * 0.4, y - pupilSize * 0.4, pupilSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
            
            if (this.state === 'ATTACKING') {
                // Pulsing glow effect
                const pulsePhase = Math.sin(this.swimTimer * params.predatorEyeGlowPulseSpeed) * 0.5 + 0.5;
                const glowIntensity = (0.6 + pulsePhase * 0.4) * params.predatorEyeGlowIntensity;
                
                // Outer glow halo (largest)
                const outerGlowRadius = pupilSize * params.predatorEyeGlowOuterRadius * 1.5;
                const outerGlowGradient = ctx.createRadialGradient(x, y, pupilSize * 0.5, x, y, outerGlowRadius);
                outerGlowGradient.addColorStop(0, `rgba(255, 40, 40, ${glowIntensity * 0.4})`);
                outerGlowGradient.addColorStop(0.5, `rgba(255, 60, 30, ${glowIntensity * 0.2})`);
                outerGlowGradient.addColorStop(1, 'rgba(255, 80, 0, 0)');
                ctx.fillStyle = outerGlowGradient;
                ctx.beginPath();
                ctx.arc(x, y, outerGlowRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Inner glow ring
                const innerGlowRadius = pupilSize * params.predatorEyeGlowOuterRadius;
                const innerGlowGradient = ctx.createRadialGradient(x, y, pupilSize * 0.3, x, y, innerGlowRadius);
                innerGlowGradient.addColorStop(0, `rgba(255, 50, 50, ${glowIntensity * 0.8})`);
                innerGlowGradient.addColorStop(0.6, `rgba(255, 40, 30, ${glowIntensity * 0.5})`);
                innerGlowGradient.addColorStop(1, 'rgba(255, 60, 0, 0)');
                ctx.fillStyle = innerGlowGradient;
                ctx.beginPath();
                ctx.arc(x, y, innerGlowRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Core bright glow
                ctx.fillStyle = `rgba(255, 60, 60, ${params.predatorEyeAttackGlowAlpha * glowIntensity})`;
                ctx.beginPath();
                ctx.arc(x + pupilSize * 0.1, y + pupilSize * 0.1, pupilSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
                
                // Bright center point
                ctx.fillStyle = `rgba(255, 200, 150, ${glowIntensity * 0.9})`;
                ctx.beginPath();
                ctx.arc(x, y, pupilSize * 0.25, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.beginPath();
                ctx.arc(x + pupilSize * 0.2, y + pupilSize * 0.1, pupilSize * 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        
        drawSingleEye(-eyeOffset);
        drawSingleEye(eyeOffset);

        ctx.restore();
    }
    
    drawShadow(shadowCtx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        const j = this.spine.joints;
        const a = this.spine.angles;
        
        const getP = (i, angOff, lenOff) => {
            const w = this.getDynamicWidth(i);
            const wiggleMag = (i * 2.0 * this.scale);
            const wiggleMult = this.state === 'ATTACKING' ? params.predatorAttackWaveMult : 1.0;
            const wiggle = Math.sin(this.swimPhase - i * 0.5) * wiggleMag * wiggleMult;
            
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
        shadowCtx.translate(params.shadowOffsetX || 20, params.shadowOffsetY || 20);
        this.drawBodyAndFins(shadowCtx, 'rgba(0,0,0,0.5)', true, getP, j, a);
        shadowCtx.restore();
    }
}
