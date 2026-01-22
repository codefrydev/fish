// Crocodile class - apex predator that hunts predator fish
// Redesigned with kinematic chain spine system

import { Entity } from './Entity.js';
import { Vector } from '../utils/Vector.js';
import { Chain } from '../utils/Chain.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height, lerp } from '../utils/helpers.js';
import { predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool, bloodPool } from '../systems/ObjectPool.js';

const PI = Math.PI;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export class Crocodile extends Entity {
    constructor(x, y) {
        super(x, y);
        
        // Override base class initialization with Crocodile-specific values
        this.size = rand(params.crocodileSizeMin, params.crocodileSizeMax);
        this.scale = this.size / 20; // Scale factor matching sample code
        this.baseSpeed = params.crocodileBaseSpeed;
        this.maxSpeed = this.baseSpeed;
        this.maxForce = params.crocodileMaxForceLurking;
        this.currentSpeed = params.crocodileBaseSpeed;
        
        // Initialize velocity
        this.vel = new Vector(rand(-0.3, 0.3), rand(-0.3, 0.3));
        
        // Kinematic chain spine system
        const linkSize = params.crocodileLinkSize * (this.size / 20); // Scale with size
        const trailAngle = this.vel.heading() + PI;
        this.spine = new Chain(
            this.pos,
            params.crocodileSpineCount,
            linkSize,
            params.crocodileAngleConstraint,
            trailAngle
        );
        
        // Head angle (separate from rotation for car-like steering)
        this.headAngle = this.vel.heading();
        
        // State machine
        this.state = 'LURKING';
        this.subState = 'SWIM'; // SWIM or IDLE
        this.target = null;
        this.stateTimer = 0;
        this.restTimer = 0;
        this.attackStartPos = null;
        this.subStateTimer = rand(100, 300); // Timer for SWIM/IDLE transitions
        
        // Animation
        this.swimPhase = rand(0, TWO_PI);
        this.swimTimer = Math.random() * 100;
        this.legPhase = Math.random() * Math.PI * 2;
        this.tailPhase = Math.random() * Math.PI * 2;
        this.noiseOffset = rand(0, 1000);
        this.rotation = this.headAngle; // Keep for compatibility
        
        // Appearance
        this.setupAppearance();
        
        // Stats
        this.huntCount = 0;
        this.killCount = 0;
    }
    
    setupAppearance() {
        let pType = params.crocodilePattern;
        if (pType === 'Mixed') {
            const r = Math.random();
            if (r < 0.4) pType = 'Swamp';
            else if (r < 0.7) pType = 'Mud';
            else if (r < 0.9) pType = 'Saltwater';
            else if (r < 0.98) pType = 'Black';
            else pType = 'Albino';
        }

        if (pType === 'Swamp') {
            this.colorMain = '#4a5d23';
            this.colorDark = '#2f3a16';
        } else if (pType === 'Mud') {
            this.colorMain = '#5d4a23';
            this.colorDark = '#3a2e16';
        } else if (pType === 'Saltwater') {
            this.colorMain = '#5a6265';
            this.colorDark = '#33383a';
        } else if (pType === 'Black') {
            this.colorMain = '#222222';
            this.colorDark = '#000000';
        } else if (pType === 'Albino') {
            this.colorMain = '#f0e6d2';
            this.colorDark = '#dcbfa3';
        }
    }
    
    seek(target, speedMult = 1) {
        let desired = new Vector(target.x - this.pos.x, target.y - this.pos.y);
        desired.normalize();
        desired.mult(this.maxSpeed * speedMult);
        let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
        steer.limit(this.maxForce * speedMult);
        return steer;
    }
    
    findTarget(predatorList) {
        // Scale detection range with size (smaller crocs have smaller range)
        const detectionRange = params.crocodileDetectionRange * (this.size / 20);
        let closestDist = detectionRange;
        let closestPredator = null;
        
        const nearbyPredators = predatorGrid.getNearby(this.pos.x, this.pos.y, detectionRange);
        
        for (const predator of nearbyPredators) {
            const dx = predator.pos.x - this.pos.x;
            const dy = predator.pos.y - this.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            if (d < closestDist) {
                closestDist = d;
                closestPredator = predator;
            }
        }
        
        return closestPredator;
    }
    
    // Get dynamic width from shape array (top-down view)
    getDynamicWidth(i) {
        // Map spine index to shape array index
        const shapeIndex = Math.floor((i / (this.spine.joints.length - 1)) * (params.crocodileShape.length - 1));
        const safeIndex = Math.min(shapeIndex, params.crocodileShape.length - 1);
        const baseW = params.crocodileShape[safeIndex];
        // Scale for top-down view - width should be visible from above
        return baseW * this.size * 0.08;
    }
    
    update(predatorList, crocodileList = [], dt = 1/60) {
        const scale = dt * 60;
        
        // State machine
        switch (this.state) {
            case 'LURKING':
                this.maxSpeed = this.baseSpeed * params.speedScale;
                this.maxForce = params.crocodileMaxForceLurking;
                
                // Handle SWIM/IDLE substate
                this.subStateTimer--;
                if (this.subStateTimer <= 0) {
                    if (this.subState === 'SWIM') {
                        this.subState = 'IDLE';
                        this.subStateTimer = rand(120, 350);
                    } else {
                        this.subState = 'SWIM';
                        this.subStateTimer = rand(200, 500);
                    }
                }
                
                if (Math.random() < params.crocodileWanderProbability && this.subState === 'SWIM') {
                    let wander = new Vector(rand(-1, 1), rand(-1, 1));
                    wander.normalize();
                    wander.mult(params.crocodileWanderMagnitude);
                    this.applyForce(wander);
                }
                
                this.stayInBounds();
                
                const target = this.findTarget(predatorList);
                if (target) {
                    this.target = target;
                    this.state = 'DETECTING';
                    this.stateTimer = 0;
                    this.subState = 'SWIM'; // Always swim when detecting
                }
                break;
                
            case 'DETECTING':
                this.maxSpeed = this.baseSpeed * params.crocodileDetectingSpeedMult * params.speedScale;
                this.subState = 'SWIM'; // Always swim when detecting
                this.stateTimer += scale;
                
                if (this.target && predatorList.includes(this.target)) {
                    let steer = this.seek(this.target.pos, params.crocodileDetectingSeekMult);
                    this.applyForce(steer);
                    
                    if (this.stateTimer > params.crocodileDetectionTime) {
                        this.state = 'ATTACKING';
                        this.attackStartPos = new Vector(this.pos.x, this.pos.y);
                        this.huntCount++;
                        ripplePool.acquire(this.pos.x, this.pos.y, 8, 100, 2.5);
                    }
                } else {
                    this.target = null;
                    this.state = 'LURKING';
                }
                break;
                
            case 'ATTACKING':
                this.maxSpeed = params.crocodileAttackSpeed * params.speedScale;
                this.maxForce = params.crocodileMaxForceAttacking;
                this.subState = 'SWIM'; // Always swim when attacking
                
                if (this.target && predatorList.includes(this.target)) {
                    let steer = this.seek(this.target.pos, params.crocodileAttackingSeekMult);
                    this.applyForce(steer);
                    
                    const dx = this.target.pos.x - this.pos.x;
                    const dy = this.target.pos.y - this.pos.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    
                    if (d < this.size * params.crocodileCatchDistance) {
                        if (Math.random() < params.crocodileHuntSuccessRate) {
                            this.state = 'EATING';
                            this.stateTimer = 0;
                            this.killCount++;
                            
                            const idx = predatorList.indexOf(this.target);
                            if (idx !== -1) {
                                predatorList.splice(idx, 1);
                            }
                            
                            ripplePool.acquire(this.pos.x, this.pos.y, 15, 200, 3.5);
                            ripplePool.acquire(this.pos.x, this.pos.y, 8, 140, 4.5);
                            
                            // Blood spill effect
                            bloodPool.acquire(this.pos.x, this.pos.y);
                        } else {
                            this.state = 'RESTING';
                            this.restTimer = params.crocodileRestTime * params.crocodileRestTimeFailMult;
                            ripplePool.acquire(this.pos.x, this.pos.y, 8, 120, 2.5);
                        }
                        this.target = null;
                    }
                    
                    const chaseDistance = dist(this.attackStartPos.x, this.attackStartPos.y, this.pos.x, this.pos.y);
                    if (chaseDistance > params.crocodileDetectionRange * params.crocodileMaxChaseDistMult) {
                        this.state = 'RESTING';
                        this.restTimer = params.crocodileRestTime * params.crocodileRestTimeGiveUpMult;
                        this.target = null;
                    }
                } else {
                    this.target = null;
                    this.state = 'RESTING';
                    this.restTimer = params.crocodileRestTime * params.crocodileRestTimeGiveUpMult;
                }
                break;
                
            case 'EATING':
                this.maxSpeed = params.crocodileEatingSpeed;
                this.subState = 'IDLE'; // Float while eating
                this.stateTimer += scale;
                
                if (this.stateTimer > params.crocodileEatingDuration) {
                    this.state = 'RESTING';
                    this.restTimer = params.crocodileRestTime;
                }
                break;
                
            case 'RESTING':
                this.maxSpeed = this.baseSpeed * params.crocodileRestingSpeedMult * params.speedScale;
                this.maxForce = params.crocodileMaxForceResting;
                this.subState = 'IDLE'; // Float while resting
                this.restTimer -= scale;
                
                this.stayInBounds();
                
                if (this.restTimer <= 0) {
                    this.state = 'LURKING';
                    this.subStateTimer = rand(100, 300);
                }
                break;
        }
        
        // Calculate forces
        let acc = new Vector(0, 0);
        
        // Separation behavior (always active)
        const desiredSeparation = params.crocodileSeparationDistance * (this.size / 20);
        let separationSum = new Vector(0, 0);
        let separationCount = 0;
        
        for (let other of crocodileList) {
            if (other === this) continue;
            const d = Vector.dist(this.pos, other.pos);
            if (d > 0 && d < desiredSeparation) {
                let diff = Vector.sub(this.pos, other.pos);
                diff.normalize();
                diff.div(d); // Weight by distance
                separationSum.add(diff);
                separationCount++;
            }
        }
        
        if (separationCount > 0) {
            separationSum.div(separationCount);
            separationSum.normalize();
            separationSum.mult(this.maxSpeed);
            let steer = Vector.sub(separationSum, this.vel);
            steer.limit(this.maxForce * 1.5);
            acc.add(steer);
        }
        
        // Add accumulated forces
        acc.add(this.acc);
        
        // Car-like steering physics
        if (this.subState === 'SWIM') {
            // Calculate desired heading from forces
            let targetVec = this.vel.copy().add(acc);
            let desiredHeading = targetVec.heading();
            
            // Smooth rotation (inertia)
            let angleDiff = desiredHeading - this.headAngle;
            while (angleDiff <= -PI) angleDiff += TWO_PI;
            while (angleDiff > PI) angleDiff -= TWO_PI;
            
            // Limit turning speed (heaviness)
            const maxTurnRate = 0.008;
            if (Math.abs(angleDiff) < maxTurnRate) {
                this.headAngle = desiredHeading;
            } else {
                this.headAngle += Math.sign(angleDiff) * maxTurnRate;
            }
            
            // Accelerate/Brake
            let turnSeverity = Math.min(Math.abs(angleDiff) / (PI / 2), 1.0);
            let targetSpeed = this.maxSpeed * (1.0 - (turnSeverity * 0.6));
            this.currentSpeed = lerp(this.currentSpeed, targetSpeed, 0.05);
            
            // Apply active propulsion
            this.vel = Vector.fromAngle(this.headAngle).mult(this.currentSpeed);
        } else {
            // IDLE: Momentum + Drag
            this.currentSpeed = lerp(this.currentSpeed, 0, 0.01);
            
            // Forward drift
            let forwardDrift = Vector.fromAngle(this.headAngle).mult(0.05);
            this.vel.mult(0.96); // Friction
            this.vel.add(forwardDrift);
            
            // Strict forward constraint
            let forward = Vector.fromAngle(this.headAngle);
            let mag = this.vel.dot(forward);
            if (mag < 0) mag = 0; // Never move backward
            this.vel = forward.mult(mag);
            
            // Subtle rotation drift
            this.noiseOffset += 0.002;
            this.headAngle += Math.cos(this.noiseOffset * 0.5) * 0.001;
        }
        
        // Update position
        this.pos.add(this.vel);
        
        // Update spine
        this.spine.angles[0] = this.headAngle;
        this.spine.resolve(this.pos);
        
        // Update animation phases
        let speedRatio = this.vel.mag() / (this.maxSpeed || 1);
        this.swimPhase += (0.02 + speedRatio * 0.18) * params.crocodileWiggle;
        this.swimTimer += (speedRatio > 0.1 ? (0.06 + speedRatio * 0.12) : 0.02) * scale;
        this.legPhase = this.swimTimer;
        this.tailPhase = this.swimTimer * 0.8;
        
        // Update rotation for compatibility
        this.rotation = this.headAngle;
        
        // Reset acceleration
        this.acc.mult(0);
    }
    
    stayInBounds() {
        const margin = params.crocodileBoundaryMargin || 100;
        super.stayInBounds(margin, 2);
        
        // Wake up if floating (crocodile-specific)
        if (this.subState === 'IDLE') {
            this.subState = 'SWIM';
            this.subStateTimer = rand(200, 400);
        }
    }
    
    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 3)) return;
        
        ctx.save();
        ctx.translate(20, 20);
        this.drawCrocodile(ctx, 'rgba(0,0,0,0.3)', true);
        ctx.restore();
        
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.headAngle);
        this.drawCrocodile(ctx, this.colorMain, false);
        
        // Draw attack indicator
        if (this.state === 'DETECTING' || this.state === 'ATTACKING') {
            ctx.strokeStyle = this.state === 'ATTACKING' 
                ? 'rgba(180, 50, 30, 0.15)' 
                : 'rgba(220, 180, 50, 0.1)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, params.crocodileDetectionRange, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawShadow(shadowCtx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 3)) return;
        
        const j = this.spine.joints;
        const a = this.spine.angles;
        const jointCount = j.length;
        
        // Use same getP function as main drawing
        const getP = (i, angOff, lenOff) => {
            const w = this.getDynamicWidth(i);
            let amp = 0;
            if (i > 5) amp = (i - 5) * 2.0 * this.scale;
            const wiggle = Math.sin(this.swimPhase - i * 0.4) * amp * params.crocodileWiggle;
            const px = Math.cos(a[i] + HALF_PI) * wiggle;
            const py = Math.sin(a[i] + HALF_PI) * wiggle;
            const baseX = j[i].x + px;
            const baseY = j[i].y + py;
            return {
                x: baseX + Math.cos(a[i] + angOff) * (w + lenOff),
                y: baseY + Math.sin(a[i] + angOff) * (w + lenOff),
                baseX: baseX, baseY: baseY, angle: a[i]
            };
        };
        
        shadowCtx.save();
        shadowCtx.translate(params.shadowOffsetX, params.shadowOffsetY);
        
        // Draw shadow using same shape as body
        shadowCtx.beginPath();
        
        let pTip = getP(0, 0, 0);
        shadowCtx.moveTo(pTip.x, pTip.y);

        for (let i = 0; i < jointCount; i++) {
            let p = getP(i, HALF_PI, 0);
            if (i === 0) {
                shadowCtx.lineTo(p.x, p.y);
            } else {
                const prevP = getP(i - 1, HALF_PI, 0);
                const cp1x = prevP.x + (p.x - prevP.x) / 6;
                const cp1y = prevP.y + (p.y - prevP.y) / 6;
                const cp2x = p.x - (p.x - prevP.x) / 6;
                const cp2y = p.y - (p.y - prevP.y) / 6;
                shadowCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p.x, p.y);
            }
        }
        
        let pTail = getP(jointCount-1, PI, 0);
        shadowCtx.lineTo(pTail.x, pTail.y);

        for (let i = jointCount - 1; i >= 0; i--) {
            let p = getP(i, -HALF_PI, 0);
            if (i === jointCount - 1) {
                shadowCtx.lineTo(p.x, p.y);
            } else {
                const prevP = getP(i + 1, -HALF_PI, 0);
                const cp1x = prevP.x + (p.x - prevP.x) / 6;
                const cp1y = prevP.y + (p.y - prevP.y) / 6;
                const cp2x = p.x - (p.x - prevP.x) / 6;
                const cp2y = p.y - (p.y - prevP.y) / 6;
                shadowCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p.x, p.y);
            }
        }
        
        let pSnout = getP(0, 0, 0);
        shadowCtx.lineTo(pSnout.x, pSnout.y);
        shadowCtx.closePath();
        
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        shadowCtx.fill();
        
        shadowCtx.restore();
    }
    
    // READS FROM GLOBAL "crocodileShape" - copied exactly from sample
    getDynamicWidth(i) {
        const safeIndex = Math.min(i, params.crocodileShape.length - 1);
        const baseW = params.crocodileShape[safeIndex];
        // For top-down view, make it wider (scale up width significantly)
        return baseW * this.scale * params.bodyWidth * 2.5;
    }

    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 3)) return;
        
        const j = this.spine.joints;
        const a = this.spine.angles;
        
        // Exact copy from sample - no coordinate transformation needed
        const getP = (i, angOff, lenOff) => {
            const w = this.getDynamicWidth(i);
            let amp = 0;
            if (i > 5) amp = (i - 5) * 2.0 * this.scale;
            const wiggle = Math.sin(this.swimPhase - i * 0.4) * amp * params.crocodileWiggle;
            const px = Math.cos(a[i] + HALF_PI) * wiggle;
            const py = Math.sin(a[i] + HALF_PI) * wiggle;
            const baseX = j[i].x + px;
            const baseY = j[i].y + py;
            return {
                x: baseX + Math.cos(a[i] + angOff) * (w + lenOff),
                y: baseY + Math.sin(a[i] + angOff) * (w + lenOff),
                baseX: baseX, baseY: baseY, angle: a[i]
            };
        };

        ctx.save();
        ctx.translate(20, 20);
        this.drawCrocodile(ctx, 'rgba(0,0,0,0.3)', true, getP, j.length);
        ctx.restore();
        
        this.drawCrocodile(ctx, this.colorMain, false, getP, j.length);
        
        // Draw attack indicator
        if (this.state === 'DETECTING' || this.state === 'ATTACKING') {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            const detectionRange = params.crocodileDetectionRange * (this.size / 20);
            ctx.strokeStyle = this.state === 'ATTACKING' 
                ? 'rgba(180, 50, 30, 0.15)' 
                : 'rgba(220, 180, 50, 0.1)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, detectionRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    drawCrocodile(ctx, color, isShadow, getP, jointCount) {
        const drawLeg = (jointIdx, side, phaseOffset) => {
            const p = getP(jointIdx, side * HALF_PI, -5); 
            const legAngle = p.angle + (side * HALF_PI) + (Math.sin(this.swimPhase + phaseOffset) * 0.3 * side);
            const kneeX = p.x + Math.cos(legAngle) * 20 * this.scale * params.limbSize;
            const kneeY = p.y + Math.sin(legAngle) * 20 * this.scale * params.limbSize;
            const footAngle = legAngle + (side * 0.5) + (Math.cos(this.swimPhase + phaseOffset) * 0.5 * side);
            const footX = kneeX + Math.cos(footAngle) * 15 * this.scale * params.limbSize;
            const footY = kneeY + Math.sin(footAngle) * 15 * this.scale * params.limbSize;

            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            const thick = 8 * this.scale * params.bodyWidth * params.limbSize;
            ctx.lineWidth = thick;
            ctx.lineCap = 'round';
            ctx.strokeStyle = color;
            ctx.lineTo(kneeX, kneeY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.lineWidth = thick * 0.7;
            ctx.moveTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();

            if (!isShadow) {
                ctx.lineWidth = 1;
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                for(let k=-1; k<=1; k++) {
                    const cx = footX + Math.cos(footAngle + k*0.3) * 5 * this.scale * params.limbSize;
                    const cy = footY + Math.sin(footAngle + k*0.3) * 5 * this.scale * params.limbSize;
                    ctx.beginPath(); ctx.arc(cx, cy, 2*this.scale, 0, TWO_PI); ctx.fill();
                }
            }
        };

        drawLeg(5, 1, 0); 
        drawLeg(5, -1, PI); 
        drawLeg(10, 1, PI); 
        drawLeg(10, -1, 0); 

        // Begin shape using curve vertices (exact copy from sample)
        ctx.beginPath();
        let pTip = getP(0, 0, 0);
        ctx.moveTo(pTip.x, pTip.y);

        for (let i = 0; i < jointCount; i++) {
            let p = getP(i, HALF_PI, 0);
            if (i === 0) {
                ctx.lineTo(p.x, p.y);
            } else {
                const prevP = getP(i - 1, HALF_PI, 0);
                const cp1x = prevP.x + (p.x - prevP.x) / 6;
                const cp1y = prevP.y + (p.y - prevP.y) / 6;
                const cp2x = p.x - (p.x - prevP.x) / 6;
                const cp2y = p.y - (p.y - prevP.y) / 6;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p.x, p.y);
            }
        }
        
        let pTail = getP(jointCount-1, PI, 0);
        ctx.lineTo(pTail.x, pTail.y);

        for (let i = jointCount - 1; i >= 0; i--) {
            let p = getP(i, -HALF_PI, 0);
            if (i === jointCount - 1) {
                ctx.lineTo(p.x, p.y);
            } else {
                const prevP = getP(i + 1, -HALF_PI, 0);
                const cp1x = prevP.x + (p.x - prevP.x) / 6;
                const cp1y = prevP.y + (p.y - prevP.y) / 6;
                const cp2x = p.x - (p.x - prevP.x) / 6;
                const cp2y = p.y - (p.y - prevP.y) / 6;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p.x, p.y);
            }
        }
        
        let pSnout = getP(0, 0, 0);
        ctx.lineTo(pSnout.x, pSnout.y);
        ctx.closePath();
        
        if (color) {
            ctx.fillStyle = color;
            ctx.fill();
        }

        if (!isShadow) {
            ctx.save();
            ctx.clip(); 
            this.drawDetailsInClip(ctx, getP, jointCount);
            ctx.restore();
        }
    }
    
    drawDetailsInClip(ctx, getP, jointCount) {
        ctx.fillStyle = this.colorDark;
        ctx.globalAlpha = params.scuteAlpha || 0.8;

        for (let i = 4; i < jointCount - 5; i++) {
            const p = getP(i, 0, 0); 
            const w = this.getDynamicWidth(i);
            const leftRidge = { x: p.baseX + Math.cos(p.angle - HALF_PI) * (w * 0.4), y: p.baseY + Math.sin(p.angle - HALF_PI) * (w * 0.4) };
            const rightRidge = { x: p.baseX + Math.cos(p.angle + HALF_PI) * (w * 0.4), y: p.baseY + Math.sin(p.angle + HALF_PI) * (w * 0.4) };
            
            const scuteSize = 4 * this.scale;
            const drawScute = (x, y, angle) => {
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(angle)*scuteSize*1.5, y + Math.sin(angle)*scuteSize*1.5);
                ctx.lineTo(x + Math.cos(angle + 2)*scuteSize, y + Math.sin(angle + 2)*scuteSize);
                ctx.lineTo(x + Math.cos(angle - 2)*scuteSize, y + Math.sin(angle - 2)*scuteSize);
                ctx.fill();
            }
            drawScute(leftRidge.x, leftRidge.y, p.angle);
            drawScute(rightRidge.x, rightRidge.y, p.angle);
        }
        ctx.globalAlpha = 1.0;

        const eyeIdx = 3;
        const pEye = getP(eyeIdx, 0, 0);
        const eyeW = this.getDynamicWidth(eyeIdx);
        
        const eyeLeft = { x: pEye.baseX + Math.cos(pEye.angle - HALF_PI) * (eyeW * 0.7), y: pEye.baseY + Math.sin(pEye.angle - HALF_PI) * (eyeW * 0.7) };
        const eyeRight = { x: pEye.baseX + Math.cos(pEye.angle + HALF_PI) * (eyeW * 0.7), y: pEye.baseY + Math.sin(pEye.angle + HALF_PI) * (eyeW * 0.7) };
        const eyeSize = 4 * this.scale * params.eyeSize;
        
        ctx.fillStyle = this.colorMain;
        ctx.beginPath(); ctx.arc(eyeLeft.x, eyeLeft.y, eyeSize*1.5, 0, TWO_PI); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeRight.x, eyeRight.y, eyeSize*1.5, 0, TWO_PI); ctx.fill();

        ctx.fillStyle = '#d4c066';
        ctx.beginPath(); ctx.arc(eyeLeft.x, eyeLeft.y, eyeSize, 0, TWO_PI); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeRight.x, eyeRight.y, eyeSize, 0, TWO_PI); ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.ellipse(eyeLeft.x, eyeLeft.y, eyeSize*0.8, eyeSize*0.2, pEye.angle, 0, TWO_PI); ctx.fill();
        ctx.beginPath(); ctx.ellipse(eyeRight.x, eyeRight.y, eyeSize*0.8, eyeSize*0.2, pEye.angle, 0, TWO_PI); ctx.fill();
    }
}
