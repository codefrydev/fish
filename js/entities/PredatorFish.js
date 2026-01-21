// Predator Fish class - hunts koi fish

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height } from '../utils/helpers.js';
import { fishGrid } from '../utils/SpatialGrid.js';
import { ripplePool } from '../systems/ObjectPool.js';

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
        this.vel = new Vector(rand(-0.5, 0.5), rand(-0.5, 0.5));
        this.acc = new Vector(0, 0);
        
        this.size = rand(params.predatorSizeMin, params.predatorSizeMax);
        this.baseSpeed = params.predatorBaseSpeed; // Slow when lurking
        this.maxSpeed = this.baseSpeed;
        this.maxForce = params.predatorMaxForceLurking;
        
        // State machine
        this.state = 'LURKING';
        this.target = null;
        this.stateTimer = 0;
        this.restTimer = 0;
        this.attackStartPos = null;
        
        // Spine system (same as Koi)
        this.spine = [];
        this.spineLength = params.spineCount;
        this.swimTimer = Math.random() * params.fishInitialSwimTimer;
        this.initSpine(x, y);
        
        // Stats
        this.huntCount = 0;
        this.killCount = 0;
        
        // Trail system for attack phase
        this.trail = [];
        this.lastTrailPos = null;
    }
    
    initSpine(x, y) {
        this.spine = [];
        const d = this.size * params.distConstraint;
        for (let i = 0; i < this.spineLength; i++) {
            this.spine.push({
                pos: new Vector(x - i * d, y),
                size: this.calculateThickness(i)
            });
        }
    }
    
    // Use same body shape as Koi
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
        
        // Swim animation (same as Koi)
        let speed = this.vel.mag();
        this.swimTimer += (params.waveSpeedBase + (speed * params.waveSpeedMult)) * scale;
        
        // Update spine
        this.updateSpine();
        
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
    
    updateSpine() {
        this.spine[0].pos = new Vector(this.pos.x, this.pos.y);
        
        for (let i = 1; i < this.spineLength; i++) {
            let prev = this.spine[i - 1].pos;
            let curr = this.spine[i].pos;
            
            let dx = curr.x - prev.x;
            let dy = curr.y - prev.y;
            let angle = Math.atan2(dy, dx);
            
            // Use same wave parameters as Koi, but more aggressive when attacking
            let waveAmt = Math.min(params.waveAmpMax, i * params.waveAmpGain);
            if (this.state === 'ATTACKING') waveAmt *= params.predatorAttackWaveMult;
            let wave = Math.sin(this.swimTimer - i * params.fishWavePhaseOffset) * waveAmt;
            angle += wave;
            
            const segDist = this.size * params.distConstraint;
            curr.x = prev.x + Math.cos(angle) * segDist;
            curr.y = prev.y + Math.sin(angle) * segDist;
            
            this.spine[i].size = this.calculateThickness(i);
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
            // Calculate eye positions
            const head = this.spine[0];
            const neck = this.spine[1];
            const headAngle = Math.atan2(head.pos.y - neck.pos.y, head.pos.x - neck.pos.x);
            
            const s = this.size / 22;
            const eyeOffset = 7 * s;
            
            // Calculate world positions of both eyes
            const leftEyeX = head.pos.x + Math.cos(headAngle) * eyeOffset + Math.cos(headAngle - Math.PI/2) * eyeOffset;
            const leftEyeY = head.pos.y + Math.sin(headAngle) * eyeOffset + Math.sin(headAngle - Math.PI/2) * eyeOffset;
            
            const rightEyeX = head.pos.x + Math.cos(headAngle) * eyeOffset + Math.cos(headAngle + Math.PI/2) * eyeOffset;
            const rightEyeY = head.pos.y + Math.sin(headAngle) * eyeOffset + Math.sin(headAngle + Math.PI/2) * eyeOffset;
            
            // Check if we should add a new trail point based on distance
            let shouldAddPoint = false;
            
            if (!this.lastTrailPos) {
                shouldAddPoint = true;
            } else {
                const dx = head.pos.x - this.lastTrailPos.x;
                const dy = head.pos.y - this.lastTrailPos.y;
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
                
                this.lastTrailPos = { x: head.pos.x, y: head.pos.y };
                
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
    
    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        // Draw trail first (behind the predator)
        this.drawTrail(ctx);
        
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
        
        // Draw fins behind body (same as Koi)
        this.drawFins(ctx, head, headAngle, false);
        
        // Draw body with shaded gradient
        ctx.save();
        this.drawBodyPath(ctx, leftPoints, rightPoints, head, headAngle);
        
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
        bodyGradient.addColorStop(0, adjustColor(params.predatorColor, -params.predatorBodyShadeDark));
        bodyGradient.addColorStop(0.45, adjustColor(params.predatorColor, params.predatorBodyShadeLight * 0.5));
        bodyGradient.addColorStop(0.55, adjustColor(params.predatorColor, params.predatorBodyShadeLight));
        bodyGradient.addColorStop(1, adjustColor(params.predatorColor, -params.predatorBodyShadeDark * 0.75));
        ctx.fillStyle = bodyGradient;
        ctx.fill();
        
        ctx.fillStyle = rgbaFromHex(params.predatorColor, params.predatorBodySolidAlpha);
        ctx.fill();
        
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
        ctx.strokeStyle = `rgba(255, 255, 255, ${params.predatorSpecularOuterAlpha})`;
        ctx.lineWidth = this.size * params.predatorSpecularWidth;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${params.predatorSpecularInnerAlpha})`;
        ctx.lineWidth = this.size * params.predatorSpecularInnerWidth;
        ctx.stroke();
        ctx.restore();
        
        ctx.restore();
        
        ctx.save();
        this.drawBodyPath(ctx, leftPoints, rightPoints, head, headAngle);
        ctx.strokeStyle = rgbaFromHex(adjustColor(params.predatorColor, -params.predatorOutlineDarken), params.predatorOutlineAlpha);
        ctx.lineWidth = Math.max(1, this.size * params.predatorOutlineWidth);
        ctx.stroke();
        ctx.restore();
        
        // Draw dorsal fin
        this.drawDorsalFin(ctx);
        
        // Draw fins in front
        this.drawFins(ctx, head, headAngle, true);
        
        // Draw eyes
        this.drawEyes(ctx, head, headAngle);
        
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
    
    // Same body path as Koi
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
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.drawBodyPath(shadowCtx, leftPoints, rightPoints, head, headAngle);
        shadowCtx.fill();
        shadowCtx.restore();
    }
}
