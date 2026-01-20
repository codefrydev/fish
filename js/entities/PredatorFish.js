// Predator Fish class - hunts koi fish

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height } from '../utils/helpers.js';
import { fishGrid } from '../utils/SpatialGrid.js';
import { ripplePool } from '../systems/ObjectPool.js';

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
    
    draw(ctx) {
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
        
        // Draw fins behind body (same as Koi)
        this.drawFins(ctx, head, headAngle, false);
        
        // Draw body with solid color
        ctx.save();
        this.drawBodyPath(ctx, leftPoints, rightPoints, head, headAngle);
        ctx.fillStyle = params.predatorColor;
        ctx.fill();
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

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        
        const s = (this.size / 22) * params.finScale;

        if (!topLayer) {
            let finCycle = Math.sin(this.swimTimer);
            
            ctx.beginPath();
            ctx.moveTo(4*s, 0);
            ctx.quadraticCurveTo(45*s, -40*s + finCycle*10*s, -15*s, -25*s + finCycle*5*s);
            ctx.quadraticCurveTo(0, -8*s, 4*s, 0);
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(4*s, 0);
            ctx.quadraticCurveTo(45*s, 40*s - finCycle*10*s, -15*s, 25*s - finCycle*5*s);
            ctx.quadraticCurveTo(0, 8*s, 4*s, 0);
            ctx.fill();
            
            ctx.translate(-22*s, 0);
            let pelvicCycle = Math.cos(this.swimTimer);
            
            ctx.beginPath();
            ctx.moveTo(0, 3*s);
            ctx.quadraticCurveTo(15*s, 20*s + pelvicCycle*3*s, -5*s, 15*s);
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(0, -3*s);
            ctx.quadraticCurveTo(15*s, -20*s - pelvicCycle*3*s, -5*s, -15*s);
            ctx.fill();
            
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
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            
            let flutter = Math.sin(this.swimTimer * 1.5);
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            let tipX = 35 * s;
            let tipY = -22 * s;
            
            ctx.bezierCurveTo(10*s, 0, 20*s, tipY + flutter * 5*s, tipX, tipY + flutter * 10*s);
            ctx.lineTo(tipX - 10*s, 0);
            ctx.bezierCurveTo(tipX, -tipY + flutter * 10*s, 20*s, -tipY + flutter * 5*s, 0, 0);
            ctx.fill();
            
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
        const eyeSize = 3.5 * s;
        
        // Dark eyes
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(eyeOffset, -eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.arc(eyeOffset, eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.fill();
        
        // Eye highlight - red when attacking
        if (this.state === 'ATTACKING') {
            ctx.fillStyle = '#ff3333';
        } else {
            ctx.fillStyle = '#fff';
        }
        ctx.beginPath();
        ctx.arc(eyeOffset + 1*s, -eyeOffset - 1*s, eyeSize * 0.35, 0, Math.PI*2);
        ctx.arc(eyeOffset + 1*s, eyeOffset + 1*s, eyeSize * 0.35, 0, Math.PI*2);
        ctx.fill();

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
