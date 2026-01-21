// Crocodile class - apex predator that hunts predator fish

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height } from '../utils/helpers.js';
import { predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool } from '../systems/ObjectPool.js';

export class Crocodile {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(rand(-0.3, 0.3), rand(-0.3, 0.3));
        this.acc = new Vector(0, 0);
        
        this.size = rand(params.crocodileSizeMin, params.crocodileSizeMax);
        this.baseSpeed = params.crocodileBaseSpeed;
        this.maxSpeed = this.baseSpeed;
        this.maxForce = params.crocodileMaxForceLurking;
        
        // State machine
        this.state = 'LURKING';
        this.target = null;
        this.stateTimer = 0;
        this.restTimer = 0;
        this.attackStartPos = null;
        
        // Animation
        this.swimTimer = Math.random() * 100;
        this.legPhase = Math.random() * Math.PI * 2;
        this.tailPhase = Math.random() * Math.PI * 2;
        this.rotation = Math.atan2(this.vel.y, this.vel.x);
        
        // Stats
        this.huntCount = 0;
        this.killCount = 0;
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
    
    findTarget(predatorList) {
        const detectionRange = params.crocodileDetectionRange;
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
    
    update(predatorList, dt = 1/60) {
        const scale = dt * 60;
        
        // State machine
        switch (this.state) {
            case 'LURKING':
                this.maxSpeed = this.baseSpeed * params.speedScale;
                this.maxForce = params.crocodileMaxForceLurking;
                
                if (Math.random() < params.crocodileWanderProbability) {
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
                }
                break;
                
            case 'DETECTING':
                this.maxSpeed = this.baseSpeed * params.crocodileDetectingSpeedMult * params.speedScale;
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
                this.stateTimer += scale;
                
                if (this.stateTimer > params.crocodileEatingDuration) {
                    this.state = 'RESTING';
                    this.restTimer = params.crocodileRestTime;
                }
                break;
                
            case 'RESTING':
                this.maxSpeed = this.baseSpeed * params.crocodileRestingSpeedMult * params.speedScale;
                this.maxForce = params.crocodileMaxForceResting;
                this.restTimer -= scale;
                
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
        
        // Update rotation to face movement direction
        if (this.vel.mag() > 0.1) {
            let targetRotation = Math.atan2(this.vel.y, this.vel.x);
            let rotDiff = targetRotation - this.rotation;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.rotation += rotDiff * 0.08 * scale;
        }
        
        // Animation
        const speed = this.vel.mag();
        const animSpeed = speed > 0.1 ? (0.06 + speed * 0.12) : 0.02;
        this.swimTimer += animSpeed * scale;
        this.legPhase = this.swimTimer;
        this.tailPhase = this.swimTimer * 0.8;
    }
    
    stayInBounds() {
        const margin = params.crocodileBoundaryMargin;
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
    
    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 3)) return;
        
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.rotation);
        
        // Top-down view proportions
        const bodyLength = this.size * 2.2;
        const bodyWidth = this.size * 1.0;  // Width from above (broader)
        const tailLength = this.size * 2.2;
        const headLength = this.size * 1.0;
        const headWidth = this.size * 0.7;  // Head wider from top view
        
        // Draw tail
        this.drawTail(ctx, bodyLength, bodyWidth, tailLength);
        
        // Draw legs (back)
        this.drawLegs(ctx, bodyLength, bodyWidth, false);
        
        // Draw body
        this.drawBody(ctx, bodyLength, bodyWidth);
        
        // Draw dorsal ridges
        this.drawDorsalRidges(ctx, bodyLength, bodyWidth);
        
        // Draw head
        this.drawHead(ctx, headLength, headWidth);
        
        // Draw legs (front)
        this.drawLegs(ctx, bodyLength, bodyWidth, true);
        
        // Draw eyes
        this.drawEyes(ctx, headLength, headWidth);
        
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
    
    drawBody(ctx, length, width) {
        // Main body - viewed from above (broader, more rectangular)
        ctx.fillStyle = params.crocodileBodyColor;
        ctx.beginPath();
        // More rectangular body shape for top view
        ctx.ellipse(-length * 0.1, 0, length / 2.5, width, 0, 0, Math.PI * 2);
        ctx.ellipse(length * 0.15, 0, length / 3, width * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Top-down lighting (sun from above, one side)
        const gradient = ctx.createRadialGradient(-length * 0.2, -width * 0.3, 0, 0, 0, length);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
        gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-length * 0.1, 0, length / 2.5, width, 0, 0, Math.PI * 2);
        ctx.ellipse(length * 0.15, 0, length / 3, width * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Osteoderms (armor plates) texture - larger and more prominent
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 0.5;
        
        for (let x = -length / 2.2; x < length / 2.2; x += this.size * 0.18) {
            for (let y = -width * 0.7; y < width * 0.7; y += this.size * 0.16) {
                const offset = (Math.floor(x / (this.size * 0.18)) % 2) * this.size * 0.09;
                const px = x + offset;
                const py = y;
                
                // Draw rounded rectangular scutes
                ctx.beginPath();
                ctx.roundRect(px - this.size * 0.06, py - this.size * 0.065, 
                             this.size * 0.12, this.size * 0.13, this.size * 0.02);
                ctx.fill();
                ctx.stroke();
                
                // Add ridge detail on each scute
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.beginPath();
                ctx.roundRect(px - this.size * 0.04, py - this.size * 0.045, 
                             this.size * 0.08, this.size * 0.09, this.size * 0.015);
                ctx.fill();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            }
        }
        ctx.restore();
        
        // Body outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, length / 2, width, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    drawDorsalRidges(ctx, bodyLength, bodyWidth) {
        // Prominent ridges along the back - TOP VIEW (circular bumps)
        ctx.fillStyle = 'rgba(35, 55, 25, 0.9)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        
        const ridgeCount = 8;
        const ridgeSize = this.size * 0.18;
        const rowSpacing = bodyWidth * 0.35;
        
        // Draw two rows of circular scutes (viewed from top)
        for (let row = 0; row < 2; row++) {
            const yOffset = row === 0 ? -rowSpacing : rowSpacing;
            
            for (let i = 0; i < ridgeCount; i++) {
                const x = -bodyLength / 3 + (i * bodyLength / (ridgeCount + 1));
                const y = yOffset;
                
                // Draw as raised circular bumps
                ctx.fillStyle = 'rgba(35, 55, 25, 0.95)';
                ctx.beginPath();
                ctx.arc(x, y, ridgeSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // Top highlight (light from above)
                const highlightGradient = ctx.createRadialGradient(
                    x - ridgeSize * 0.3, y - ridgeSize * 0.3, 0,
                    x, y, ridgeSize
                );
                highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
                highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
                highlightGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
                ctx.fillStyle = highlightGradient;
                ctx.beginPath();
                ctx.arc(x, y, ridgeSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawHead(ctx, length, width) {
        const headX = this.size * 1.2;
        
        ctx.save();
        ctx.translate(headX, 0);
        
        // Head base - broad from top view
        ctx.fillStyle = params.crocodileColor;
        ctx.beginPath();
        ctx.ellipse(-length * 0.1, 0, length * 0.4, width * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Snout - tapered from above (narrower at tip)
        ctx.beginPath();
        ctx.ellipse(length * 0.5, 0, length * 1.0, width * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Top-down lighting on head and snout
        const headGradient = ctx.createRadialGradient(
            -length * 0.2, -width * 0.4, 0,
            length * 0.2, 0, length * 1.2
        );
        headGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        headGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)');
        headGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
        headGradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = headGradient;
        ctx.beginPath();
        ctx.ellipse(-length * 0.1, 0, length * 0.4, width * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(length * 0.5, 0, length * 1.0, width * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head and snout outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(-length * 0.1, 0, length * 0.4, width * 1.15, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(length * 0.5, 0, length * 1.0, width * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Nostrils at tip - visible from top
        const nostrilX = length * 1.4;
        const nostrilSpacing = width * 0.25;
        
        // Nostril bumps
        ctx.fillStyle = 'rgba(50, 70, 40, 0.8)';
        ctx.beginPath();
        ctx.arc(nostrilX, -nostrilSpacing, this.size * 0.12, 0, Math.PI * 2);
        ctx.arc(nostrilX, nostrilSpacing, this.size * 0.12, 0, Math.PI * 2);
        ctx.fill();
        
        // Nostril holes
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.beginPath();
        ctx.arc(nostrilX, -nostrilSpacing, this.size * 0.07, 0, Math.PI * 2);
        ctx.arc(nostrilX, nostrilSpacing, this.size * 0.07, 0, Math.PI * 2);
        ctx.fill();
        
        // Nostril highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(nostrilX - this.size * 0.03, -nostrilSpacing - this.size * 0.03, this.size * 0.03, 0, Math.PI * 2);
        ctx.arc(nostrilX - this.size * 0.03, nostrilSpacing - this.size * 0.03, this.size * 0.03, 0, Math.PI * 2);
        ctx.fill();
        
        // Jaw texture detail (from above - looks like seams)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 1.5;
        
        for (let i = 0; i < 8; i++) {
            const tx = length * 0.2 + i * length * 0.15;
            const indent = this.size * 0.04;
            
            // Top jaw seam
            ctx.beginPath();
            ctx.moveTo(tx, -width * 0.48);
            ctx.lineTo(tx + indent, -width * 0.45);
            ctx.stroke();
            
            // Bottom jaw seam
            ctx.beginPath();
            ctx.moveTo(tx + length * 0.05, width * 0.48);
            ctx.lineTo(tx + length * 0.05 + indent, width * 0.45);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawEyes(ctx, headLength, headWidth) {
        const headX = this.size * 1.2;
        const eyeX = headX + headLength * 0.1;
        const eyeY = headWidth * 0.95;  // Eyes on sides of head (visible from top)
        const eyeSize = this.size * 0.22;  // Slightly larger from top view
        
        // Left eye
        this.drawSingleEye(ctx, eyeX, -eyeY, eyeSize);
        
        // Right eye
        this.drawSingleEye(ctx, eyeX, eyeY, eyeSize);
    }
    
    drawSingleEye(ctx, x, y, size) {
        // Eye bulge (raised, visible from top)
        const bulgeGradient = ctx.createRadialGradient(
            x - size * 0.3, y - size * 0.3, 0,
            x, y, size * 1.4
        );
        bulgeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        bulgeGradient.addColorStop(0.5, params.crocodileColor);
        bulgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = bulgeGradient;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye rim
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        
        // Eye - golden/yellow iris
        const eyeGradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        eyeGradient.addColorStop(0, params.crocodileEyeColor);
        eyeGradient.addColorStop(0.7, 'rgba(180, 160, 80, 0.9)');
        eyeGradient.addColorStop(1, 'rgba(120, 100, 40, 0.8)');
        ctx.fillStyle = eyeGradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        
        // Vertical slit pupil (reptilian - rotated for viewing angle)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.15, size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye shine (from above - sun reflection)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(x + size * 0.15, y - size * 0.1, size * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        // Attack glow
        if (this.state === 'ATTACKING' || this.state === 'DETECTING') {
            const glowIntensity = (0.5 + Math.sin(this.swimTimer * 0.2) * 0.5);
            ctx.save();
            ctx.fillStyle = `rgba(230, 200, 80, ${glowIntensity * 0.3})`;
            ctx.beginPath();
            ctx.arc(x, y, size * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    
    drawTail(ctx, bodyLength, bodyWidth, tailLength) {
        const tailStartX = -bodyLength / 2;
        const tailSway = Math.sin(this.tailPhase) * this.size * 0.5;
        
        ctx.save();
        ctx.translate(tailStartX, 0);
        
        // Tail segments (4 segments for smoother taper)
        const segments = 4;
        for (let i = 0; i < segments; i++) {
            const segmentProgress = i / segments;
            const nextProgress = (i + 1) / segments;
            
            const x = -i * tailLength / segments;
            const nextX = -(i + 1) * tailLength / segments;
            
            const widthStart = bodyWidth * (1 - segmentProgress * 0.75);
            const widthEnd = bodyWidth * (1 - nextProgress * 0.75);
            
            const swayStart = tailSway * segmentProgress * segmentProgress;
            const swayEnd = tailSway * nextProgress * nextProgress;
            
            ctx.fillStyle = params.crocodileBodyColor;
            
            ctx.beginPath();
            ctx.moveTo(x, -widthStart + swayStart);
            ctx.lineTo(nextX, -widthEnd + swayEnd);
            ctx.lineTo(nextX, widthEnd + swayEnd);
            ctx.lineTo(x, widthStart + swayStart);
            ctx.closePath();
            ctx.fill();
            
            // Gradient on tail
            const tailGradient = ctx.createLinearGradient(x, -widthStart, x, widthStart);
            tailGradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
            tailGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
            tailGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
            ctx.fillStyle = tailGradient;
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Tail ridges (smaller version of dorsal ridges)
            if (i < segments - 1) {
                const ridgeX = (x + nextX) / 2;
                const ridgeY = swayStart * 0.5;
                const ridgeHeight = this.size * 0.15;
                const ridgeWidth = this.size * 0.12;
                
                ctx.fillStyle = 'rgba(35, 55, 25, 0.8)';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(ridgeX - ridgeWidth/2, -widthStart * 0.9 + ridgeY);
                ctx.lineTo(ridgeX, -widthStart * 0.9 - ridgeHeight + ridgeY);
                ctx.lineTo(ridgeX + ridgeWidth/2, -widthStart * 0.9 + ridgeY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
        
        // Tail fin - more prominent
        const finX = -tailLength * 1.15;
        const finSway = tailSway * 1.8;
        const finHeight = this.size * 1.0;
        
        ctx.fillStyle = 'rgba(55, 75, 40, 0.85)';
        ctx.beginPath();
        ctx.moveTo(-tailLength * 0.95, finSway);
        ctx.bezierCurveTo(
            finX * 0.7, -finHeight * 0.8 + finSway,
            finX, -finHeight + finSway,
            finX, -finHeight + finSway
        );
        ctx.lineTo(finX - this.size * 0.2, finSway);
        ctx.bezierCurveTo(
            finX, finHeight + finSway,
            finX * 0.7, finHeight * 0.8 + finSway,
            -tailLength * 0.95, finSway
        );
        ctx.closePath();
        ctx.fill();
        
        // Fin gradient
        const finGradient = ctx.createLinearGradient(finX, -finHeight, finX, finHeight);
        finGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
        finGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
        finGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = finGradient;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Fin texture lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const lineY = -finHeight * 0.6 + i * finHeight * 0.6;
            ctx.beginPath();
            ctx.moveTo(-tailLength * 0.95, finSway);
            ctx.lineTo(finX - this.size * 0.1, lineY + finSway);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawLegs(ctx, bodyLength, bodyWidth, frontLegs) {
        const legColor = 'rgba(70, 90, 55, 0.9)';
        const legKick = Math.sin(this.legPhase);
        
        if (!frontLegs) {
            // Back legs
            const backX = -bodyLength * 0.15;
            const backY = bodyWidth * 1.05;
            const backKick = Math.sin(this.legPhase + Math.PI);
            
            // Left back leg
            this.drawSingleLeg(ctx, backX, -backY, legColor, backKick, true);
            
            // Right back leg
            this.drawSingleLeg(ctx, backX, backY, legColor, -backKick, true);
        } else {
            // Front legs
            const frontX = bodyLength * 0.25;
            const frontY = bodyWidth * 0.9;
            
            // Left front leg
            this.drawSingleLeg(ctx, frontX, -frontY, legColor, legKick, false);
            
            // Right front leg
            this.drawSingleLeg(ctx, frontX, frontY, legColor, -legKick, false);
        }
    }
    
    drawSingleLeg(ctx, x, y, color, kick, isBack) {
        const legLength = this.size * 0.65;
        const legWidth = this.size * 0.2;
        const footSize = this.size * 0.28;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Legs stick out perpendicular (viewed from top)
        const baseAngle = y < 0 ? -Math.PI / 2 : Math.PI / 2;
        const angle = baseAngle + (y < 0 ? -0.2 : 0.2) + kick * 0.25;
        ctx.rotate(angle);
        
        // Upper leg - visible from top, oval shape
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(legLength * 0.3, 0, legLength * 0.35, legWidth, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Shading on leg
        const legGradient = ctx.createRadialGradient(
            legLength * 0.2, -legWidth * 0.3, 0,
            legLength * 0.3, 0, legLength * 0.5
        );
        legGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        legGradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.05)');
        legGradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        ctx.fillStyle = legGradient;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Lower leg/foot
        ctx.save();
        ctx.translate(legLength * 0.6, 0);
        ctx.rotate(kick * 0.15);
        
        // Foot - webbed, visible from top
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(footSize * 0.4, 0, footSize * 0.9, footSize * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Foot gradient
        const footGradient = ctx.createRadialGradient(
            footSize * 0.2, -footSize * 0.2, 0,
            footSize * 0.4, 0, footSize
        );
        footGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        footGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
        footGradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = footGradient;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Toe claws (visible from top)
        ctx.fillStyle = 'rgba(40, 35, 30, 0.9)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        
        for (let c = -1; c <= 1; c++) {
            const clawAngle = c * 0.35;
            const clawLength = footSize * 0.35;
            const clawX = footSize * 1.1 + Math.cos(clawAngle) * clawLength;
            const clawY = Math.sin(clawAngle) * clawLength;
            
            // Draw claw as small triangle
            ctx.beginPath();
            ctx.moveTo(footSize * 1.0, Math.sin(clawAngle) * footSize * 0.4);
            ctx.lineTo(clawX, clawY);
            ctx.lineTo(footSize * 0.95, Math.sin(clawAngle) * footSize * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        
        // Webbing lines between toes
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        for (let c = -1; c <= 1; c++) {
            ctx.beginPath();
            ctx.moveTo(footSize * 0.3, 0);
            ctx.lineTo(footSize * 0.9, Math.sin(c * 0.35) * footSize * 0.6);
            ctx.stroke();
        }
        
        ctx.restore();
        ctx.restore();
    }
    
    drawShadow(shadowCtx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 3)) return;
        
        shadowCtx.save();
        shadowCtx.translate(
            this.pos.x + params.shadowOffsetX,
            this.pos.y + params.shadowOffsetY
        );
        shadowCtx.rotate(this.rotation);
        
        const bodyLength = this.size * 2.2;
        const bodyWidth = this.size * 0.9;
        
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        shadowCtx.beginPath();
        shadowCtx.ellipse(0, 0, bodyLength / 2 + 4, bodyWidth + 4, 0, 0, Math.PI * 2);
        shadowCtx.fill();
        
        shadowCtx.restore();
    }
}
