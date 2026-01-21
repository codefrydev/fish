// Crocodile class - apex predator that hunts predator fish

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height } from '../utils/helpers.js';
import { predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool, bloodPool } from '../systems/ObjectPool.js';

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
        // Helper function to create crocodile body path - elongated with flatter stomach
        const createBodyPath = () => {
            ctx.beginPath();
            
            // Define key points for the body shape
            // Start from tail connection (left side) - connects to tail at -length/2
            const tailEndX = -length * 0.5;
            const tailEndY = 0;
            
            // Top curve points (back)
            const topBackX = -length * 0.3;
            const topBackY = -width * 0.85;
            
            // Widest point (middle-top)
            const midTopX = 0;
            const midTopY = -width * 0.9;
            
            // Front-top (near head)
            const frontTopX = length * 0.3;
            const frontTopY = -width * 0.75;
            
            // Head connection point (right side) - head starts at size * 1.2
            const headEndX = length * 0.4;
            const headEndY = 0;
            
            // Front-bottom (near head, flatter)
            const frontBottomX = length * 0.3;
            const frontBottomY = width * 0.7;  // Flatter than top
            
            // Widest point (middle-bottom, flatter stomach)
            const midBottomX = 0;
            const midBottomY = width * 0.75;  // Flatter stomach area
            
            // Back-bottom
            const backBottomX = -length * 0.3;
            const backBottomY = width * 0.7;  // Flatter than top
            
            // Start from tail end, going along top
            ctx.moveTo(tailEndX, tailEndY);
            
            // Top curve: tail -> back -> middle -> front -> head
            ctx.bezierCurveTo(
                tailEndX + length * 0.1, -width * 0.4,  // Control point 1
                topBackX - length * 0.05, topBackY,      // Control point 2
                topBackX, topBackY                       // End point
            );
            ctx.bezierCurveTo(
                topBackX + length * 0.1, topBackY,
                midTopX - length * 0.08, midTopY,
                midTopX, midTopY
            );
            ctx.bezierCurveTo(
                midTopX + length * 0.1, midTopY,
                frontTopX - length * 0.05, frontTopY,
                frontTopX, frontTopY
            );
            ctx.bezierCurveTo(
                frontTopX + length * 0.08, frontTopY,
                headEndX - length * 0.05, -width * 0.3,
                headEndX, headEndY
            );
            
            // Bottom curve: head -> front -> middle (flatter) -> back -> tail
            ctx.bezierCurveTo(
                headEndX - length * 0.05, width * 0.3,
                frontBottomX + length * 0.08, frontBottomY,
                frontBottomX, frontBottomY
            );
            ctx.bezierCurveTo(
                frontBottomX - length * 0.05, frontBottomY,
                midBottomX + length * 0.1, midBottomY,
                midBottomX, midBottomY
            );
            // Flatter stomach area - more horizontal curve
            ctx.bezierCurveTo(
                midBottomX - length * 0.1, midBottomY,
                backBottomX + length * 0.05, backBottomY,
                backBottomX, backBottomY
            );
            ctx.bezierCurveTo(
                backBottomX - length * 0.05, backBottomY,
                tailEndX + length * 0.1, width * 0.4,
                tailEndX, tailEndY
            );
            
            ctx.closePath();
        };
        
        // Main body fill
        ctx.fillStyle = params.crocodileBodyColor;
        createBodyPath();
        ctx.fill();
        
        // Top-down lighting (sun from above, one side)
        const gradient = ctx.createRadialGradient(-length * 0.2, -width * 0.3, 0, 0, 0, length);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
        gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = gradient;
        createBodyPath();
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
        createBodyPath();
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
        
        // Helper function to create triangular elongated head path
        const createHeadPath = () => {
            ctx.beginPath();
            
            // Head base (wider) - where it connects to body
            // Body ends at bodyLength * 0.4, head is positioned at size * 1.2
            // bodyLength = size * 2.2, so body ends at size * 0.88
            // headLength = size * 1.0, head is at size * 1.2
            // So baseX relative to head: -(1.2 - 0.88) * size / headLength = -0.32 * size / (1.0 * size) = -0.32
            // But we need to account for headLength scaling, so: -0.32 * (size/headLength) = -0.32
            // Actually simpler: bodyLength/headLength = 2.2, so body end = headLength * 2.2 * 0.4 = headLength * 0.88
            // Head position in headLength units = 1.2, so baseX = -(1.2 - 0.88) = -0.32 * headLength
            const baseX = -length * 0.32;
            const baseTopY = -width * 1.0;
            const baseBottomY = width * 0.95;
            
            // Head widest point (behind eyes area)
            const wideX = length * 0.15;
            const wideTopY = -width * 1.15;
            const wideBottomY = width * 1.1;
            
            // Snout start (narrowing begins)
            const snoutStartX = length * 0.5;
            const snoutStartTopY = -width * 0.8;
            const snoutStartBottomY = width * 0.75;
            
            // Snout middle
            const snoutMidX = length * 1.0;
            const snoutMidTopY = -width * 0.5;
            const snoutMidBottomY = width * 0.45;
            
            // Snout tip (narrow pointed end)
            const tipX = length * 1.5;
            const tipY = 0;
            
            // Start from base, going along top
            ctx.moveTo(baseX, baseTopY);
            
            // Top curve: base -> wide -> snout start -> snout mid -> tip (triangular taper)
            ctx.bezierCurveTo(
                baseX + length * 0.1, baseTopY,
                wideX - length * 0.05, wideTopY,
                wideX, wideTopY
            );
            ctx.bezierCurveTo(
                wideX + length * 0.1, wideTopY,
                snoutStartX - length * 0.1, snoutStartTopY,
                snoutStartX, snoutStartTopY
            );
            ctx.bezierCurveTo(
                snoutStartX + length * 0.15, snoutStartTopY,
                snoutMidX - length * 0.1, snoutMidTopY,
                snoutMidX, snoutMidTopY
            );
            ctx.bezierCurveTo(
                snoutMidX + length * 0.15, snoutMidTopY,
                tipX - length * 0.08, -width * 0.1,
                tipX, tipY
            );
            
            // Bottom curve: tip -> snout mid -> snout start -> wide -> base (flatter stomach area)
            ctx.bezierCurveTo(
                tipX - length * 0.08, width * 0.1,
                snoutMidX + length * 0.15, snoutMidBottomY,
                snoutMidX, snoutMidBottomY
            );
            ctx.bezierCurveTo(
                snoutMidX - length * 0.1, snoutMidBottomY,
                snoutStartX + length * 0.15, snoutStartBottomY,
                snoutStartX, snoutStartBottomY
            );
            ctx.bezierCurveTo(
                snoutStartX - length * 0.1, snoutStartBottomY,
                wideX + length * 0.1, wideBottomY,
                wideX, wideBottomY
            );
            ctx.bezierCurveTo(
                wideX - length * 0.05, wideBottomY,
                baseX + length * 0.1, baseBottomY,
                baseX, baseBottomY
            );
            
            ctx.closePath();
        };
        
        // Head fill
        ctx.fillStyle = params.crocodileColor;
        createHeadPath();
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
        createHeadPath();
        ctx.fill();
        
        // Head and snout outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 2.5;
        createHeadPath();
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
        
        // Helper function to create tail path - similar to body stomach (flatter bottom) with tapering
        const createTailPath = () => {
            ctx.beginPath();
            
            // Helper to get sway at a given progress (0 = base, 1 = tip)
            const getSway = (progress) => {
                return tailSway * progress * progress;
            };
            
            // Define key points - matching body shape at connection, then tapering
            // Body ends at -bodyLength * 0.5 with:
            // - topBackX = -bodyLength * 0.3, topBackY = -bodyWidth * 0.85
            // - backBottomX = -bodyLength * 0.3, backBottomY = bodyWidth * 0.7
            // Tail is translated to -bodyLength/2, so connection is at 0 relative to tail
            // Match body's width at connection point for smooth transition
            const bodyEndX = 0;
            const bodyEndY = 0 + getSway(0);
            
            // Connection point - match body's shape exactly
            // Body has top at -width * 0.85 and bottom at width * 0.7 at the back
            const connectionTopY = -bodyWidth * 0.85 + getSway(0);
            const connectionBottomY = bodyWidth * 0.7 + getSway(0);
            
            // First quarter - still wide, matching body proportions
            const quarter1Progress = 0.25;
            const quarter1X = -tailLength * quarter1Progress;
            const quarter1Sway = getSway(quarter1Progress);
            const quarter1TopY = -bodyWidth * 0.85 + quarter1Sway;  // Match body top
            const quarter1BottomY = bodyWidth * 0.7 + quarter1Sway;  // Match body stomach
            
            // Middle - tapering
            const midProgress = 0.5;
            const midX = -tailLength * midProgress;
            const midSway = getSway(midProgress);
            const midTopY = -bodyWidth * 0.6 + midSway;
            const midBottomY = bodyWidth * 0.5 + midSway;  // Flatter bottom
            
            // Three quarters - more tapered
            const quarter3Progress = 0.75;
            const quarter3X = -tailLength * quarter3Progress;
            const quarter3Sway = getSway(quarter3Progress);
            const quarter3TopY = -bodyWidth * 0.35 + quarter3Sway;
            const quarter3BottomY = bodyWidth * 0.3 + quarter3Sway;  // Flatter bottom
            
            // Tail tip
            const tipX = -tailLength;
            const tipY = 0 + getSway(1);
            
            // Start from body connection, going along top
            // Match body's curve direction - body curves from tailEndX with control point
            // tailEndX + length * 0.1, -width * 0.4 going to topBackX, topBackY
            ctx.moveTo(bodyEndX, connectionTopY);
            
            // Top curve: body -> quarter1 -> mid -> quarter3 -> tip
            // First curve matches body's curve direction for smooth connection
            ctx.bezierCurveTo(
                bodyEndX - tailLength * 0.1, connectionTopY,  // Match body's control point direction
                quarter1X + tailLength * 0.05, quarter1TopY,
                quarter1X, quarter1TopY
            );
            ctx.bezierCurveTo(
                quarter1X - tailLength * 0.08, quarter1TopY,
                midX + tailLength * 0.06, midTopY,
                midX, midTopY
            );
            ctx.bezierCurveTo(
                midX - tailLength * 0.08, midTopY,
                quarter3X + tailLength * 0.06, quarter3TopY,
                quarter3X, quarter3TopY
            );
            ctx.bezierCurveTo(
                quarter3X - tailLength * 0.08, quarter3TopY,
                tipX + tailLength * 0.05, -bodyWidth * 0.1,
                tipX, tipY
            );
            
            // Bottom curve: tip -> quarter3 -> mid -> quarter1 -> body (flatter stomach area)
            ctx.bezierCurveTo(
                tipX + tailLength * 0.05, bodyWidth * 0.1,
                quarter3X - tailLength * 0.08, quarter3BottomY,
                quarter3X, quarter3BottomY
            );
            ctx.bezierCurveTo(
                quarter3X + tailLength * 0.06, quarter3BottomY,
                midX - tailLength * 0.08, midBottomY,
                midX, midBottomY
            );
            // Flatter stomach area - more horizontal curve (like body)
            ctx.bezierCurveTo(
                midX + tailLength * 0.06, midBottomY,
                quarter1X - tailLength * 0.08, quarter1BottomY,
                quarter1X, quarter1BottomY
            );
            // Last curve matches body's curve direction for smooth connection
            // Body curves from backBottomX with control point tailEndX + length * 0.1, width * 0.4
            ctx.bezierCurveTo(
                quarter1X + tailLength * 0.05, quarter1BottomY,
                bodyEndX - tailLength * 0.1, connectionBottomY,  // Match body's control point direction
                bodyEndX, connectionBottomY
            );
            
            // Close path from bottom connection back to top connection
            ctx.lineTo(bodyEndX, connectionTopY);
            ctx.closePath();
        };
        
        // Draw main tail fill
        ctx.fillStyle = params.crocodileBodyColor;
        createTailPath();
        ctx.fill();
        
        // Tail gradient
        const tailGradient = ctx.createLinearGradient(0, -bodyWidth, -tailLength, bodyWidth * 0.3);
        tailGradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        tailGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        tailGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = tailGradient;
        createTailPath();
        ctx.fill();
        
        // Tail outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.5;
        createTailPath();
        ctx.stroke();
        
        // Distinct darker bands/stripes on tail - more defined toward tip (inspired by image)
        const bandCount = 6;
        for (let i = 0; i < bandCount; i++) {
            const progress = (i + 0.5) / (bandCount + 1);
            const bandX = -progress * tailLength;
            const bandSway = tailSway * progress * progress;
            
            // Calculate band width - wider toward base, narrower toward tip
            const bandWidth = tailLength * 0.12 * (1 - progress * 0.4);
            
            // Calculate band Y positions based on tail shape
            let topY, bottomY;
            if (progress < 0.25) {
                topY = -bodyWidth * 0.85 * (1 - progress * 2) + bandSway;
                bottomY = bodyWidth * 0.7 * (1 - progress * 2) + bandSway;
            } else if (progress < 0.5) {
                topY = -bodyWidth * 0.6 * (1 - (progress - 0.25) * 2) + bandSway;
                bottomY = bodyWidth * 0.5 * (1 - (progress - 0.25) * 2) + bandSway;
            } else if (progress < 0.75) {
                topY = -bodyWidth * 0.35 * (1 - (progress - 0.5) * 2) + bandSway;
                bottomY = bodyWidth * 0.3 * (1 - (progress - 0.5) * 2) + bandSway;
            } else {
                topY = -bodyWidth * 0.1 * (1 - (progress - 0.75) * 2) + bandSway;
                bottomY = bodyWidth * 0.1 * (1 - (progress - 0.75) * 2) + bandSway;
            }
            
            // Draw darker band - more prominent toward tip
            const bandIntensity = 0.3 + progress * 0.4;  // Darker toward tip
            ctx.fillStyle = `rgba(25, 45, 20, ${bandIntensity})`;
            ctx.beginPath();
            ctx.moveTo(bandX - bandWidth/2, topY);
            ctx.lineTo(bandX + bandWidth/2, topY);
            ctx.lineTo(bandX + bandWidth/2, bottomY);
            ctx.lineTo(bandX - bandWidth/2, bottomY);
            ctx.closePath();
            ctx.fill();
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
