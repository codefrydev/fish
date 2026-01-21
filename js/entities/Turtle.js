// Turtle class - slow swimming creature that eats food and avoids predators

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height } from '../utils/helpers.js';
import { foodGrid, predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool } from '../systems/ObjectPool.js';

// Function to add ripple (will be set by main)
let addRippleFn = null;
export function setAddRippleFunction(fn) {
    addRippleFn = fn;
}

export class Turtle {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(rand(-0.5, 0.5), rand(-0.5, 0.5));
        this.acc = new Vector(0, 0);
        
        this.size = rand(params.turtleSizeMin, params.turtleSizeMax);
        this.baseSpeed = rand(params.turtleBaseSpeedMin, params.turtleBaseSpeedMax);
        this.maxSpeed = this.baseSpeed * params.speedScale;
        this.maxForce = params.turtleTurnForce;
        
        // Swimming animation
        this.swimTimer = Math.random() * 100;
        this.legPhase = Math.random() * Math.PI * 2;
        
        // Visual properties
        this.shellColor = params.turtleColor;
        this.patternColor = params.turtlePatternColor;
        this.rotation = Math.atan2(this.vel.y, this.vel.x);
        
        // Generate shell pattern
        this.shellSegments = [];
        const segments = 13; // Hexagonal pattern on shell
        for (let i = 0; i < segments; i++) {
            this.shellSegments.push({
                angle: rand(0, Math.PI * 2),
                distance: rand(0.3, 0.7),
                size: rand(0.15, 0.25)
            });
        }
        
        // State
        this.isScared = false;
        this.scaredTimer = 0;
        
        // Taming
        this.isTamed = false;
        this.tamedTimer = 0;
        this.heartScale = 0;
        this.heartBeat = 0;
    }
    
    seek(target) {
        let desired = new Vector(target.x - this.pos.x, target.y - this.pos.y);
        desired.normalize();
        desired.mult(this.maxSpeed);
        let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
        steer.limit(this.maxForce);
        return steer;
    }
    
    applyForce(force) {
        this.acc.add(force);
    }
    
    behaviors(foodList, followTarget, dt = 1/60) {
        const scale = dt * 60;
        
        // Reset scared state
        if (this.scaredTimer > 0) {
            this.scaredTimer -= scale;
            if (this.scaredTimer <= 0) {
                this.isScared = false;
            }
        }
        
        // Handle tamed state
        if (this.isTamed) {
            this.tamedTimer -= scale;
            if (this.tamedTimer <= 0) {
                this.isTamed = false;
                this.heartScale = 0;
            }
        }
        
        // Boundary avoidance
        let desired = null;
        const margin = 100;
        
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
        } else {
            // Gentle wander
            if (Math.random() < 0.03) {
                let wander = new Vector(rand(-1, 1), rand(-1, 1));
                wander.normalize();
                wander.mult(0.3);
                this.applyForce(wander);
            }
        }
        
        // FOLLOW CURSOR when tamed (highest priority)
        let following = false;
        if (this.isTamed && followTarget) {
            const dx = followTarget.x - this.pos.x;
            const dy = followTarget.y - this.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            // Only follow if not too close (to avoid jittering)
            if (d > 50) {
                const targetPos = { x: followTarget.x, y: followTarget.y };
                let seekForce = this.seek(targetPos);
                seekForce.mult(2.0); // Strong follow
                this.applyForce(seekForce);
                following = true;
            }
        }
        
        // PREDATOR AVOIDANCE - high priority (but tamed turtles are braver)
        if (!following) {
            const detectionRange = this.isTamed ? params.turtleDetectionRange * 0.5 : params.turtleDetectionRange;
            const nearbyPredators = predatorGrid.getNearby(
                this.pos.x, 
                this.pos.y, 
                detectionRange
            );
            
            let fleeing = false;
            for (const predator of nearbyPredators) {
                const dx = this.pos.x - predator.pos.x;
                const dy = this.pos.y - predator.pos.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                
                if (d < detectionRange && d > 0) {
                    // Strong flee force (weaker if tamed)
                    let fleeForce = new Vector(dx / d, dy / d);
                    const urgency = 1 - (d / detectionRange);
                    const fleeMultiplier = this.isTamed ? 1.0 : 1.5;
                    fleeForce.mult(this.maxSpeed * fleeMultiplier * urgency);
                    
                    // Extra boost if predator is attacking
                    if (predator.state === 'ATTACKING' || predator.state === 'DETECTING') {
                        fleeForce.mult(1.5);
                        if (!this.isScared && !this.isTamed) {
                            this.isScared = true;
                            this.scaredTimer = 60;
                            // Create ripple when scared
                            if (addRippleFn) {
                                addRippleFn(this.pos.x, this.pos.y);
                            }
                        }
                    }
                    
                    let steer = new Vector(fleeForce.x - this.vel.x, fleeForce.y - this.vel.y);
                    steer.limit(this.maxForce * params.turtleFleeForceMultiplier);
                    this.applyForce(steer);
                    fleeing = true;
                }
            }
        
            // Food seeking (lower priority than fleeing)
            if (!fleeing) {
            const nearbyFoods = foodGrid.getNearbyFiltered(
                this.pos.x, 
                this.pos.y, 
                params.turtleFoodSeekRange,
                food => !food.eaten
            );
            
            if (nearbyFoods.length > 0) {
                // Find closest food
                let closestFood = null;
                let minDistSq = params.turtleFoodSeekRange * params.turtleFoodSeekRange;
                
                for (const { obj: food, distSq } of nearbyFoods) {
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        closestFood = food;
                    }
                }
                
                if (closestFood) {
                    const targetPos = { x: closestFood.pos.x, y: closestFood.pos.y };
                    let seekForce = this.seek(targetPos);
                    seekForce.mult(1.5);
                    this.applyForce(seekForce);
                    
                    // Eat food if close enough
                    if (minDistSq < 100) { // 10 * 10
                        closestFood.eaten = true;
                        this.swimTimer += 3;
                        if (addRippleFn) {
                            addRippleFn(closestFood.pos.x, closestFood.pos.y);
                        }
                    }
                }
            }
            }
        }
    }
    
    tame() {
        if (!this.isTamed) {
            this.isTamed = true;
            this.tamedTimer = params.turtleTamedDuration;
            this.heartScale = 0;
            this.isScared = false;
            this.scaredTimer = 0;
            
            // Create ripple effect when tamed
            if (addRippleFn) {
                addRippleFn(this.pos.x, this.pos.y);
            }
        } else {
            // Re-tame to extend duration
            this.tamedTimer = params.turtleTamedDuration;
        }
    }
    
    isPointInside(x, y) {
        const dx = x - this.pos.x;
        const dy = y - this.pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // Use shell size for hit detection
        return distance < this.size * 2;
    }
    
    update(foodList, followTarget, dt = 1/60) {
        const scale = dt * 60;
        
        this.behaviors(foodList, followTarget, dt);
        
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
            // Smooth rotation
            let rotDiff = targetRotation - this.rotation;
            // Normalize to -PI to PI
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.rotation += rotDiff * 0.1 * scale;
        }
        
        // Swimming animation - faster leg movement when swimming faster
        const swimSpeed = this.vel.mag();
        const animSpeed = swimSpeed > 0.1 ? (0.08 + swimSpeed * 0.15) : 0.03;
        this.swimTimer += animSpeed * scale;
        this.legPhase = this.swimTimer;
        
        // Heart beat animation for tamed turtles
        if (this.isTamed) {
            this.heartBeat += 0.15 * scale;
            this.heartScale = Math.min(1.0, this.heartScale + 0.1 * scale);
        } else {
            this.heartScale = Math.max(0, this.heartScale - 0.15 * scale);
        }
    }
    
    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.rotation);
        
        const shellWidth = this.size * 1.4;
        const shellHeight = this.size * 1.6;
        
        // Draw legs (behind shell)
        this.drawLegs(ctx, shellWidth, shellHeight, false);
        
        // Draw shell
        ctx.save();
        
        // Shell base (darker outline)
        ctx.fillStyle = this.patternColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, shellWidth + 2, shellHeight + 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Main shell
        ctx.fillStyle = this.shellColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, shellWidth, shellHeight, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Shell pattern (hexagonal segments)
        ctx.fillStyle = this.patternColor;
        for (const segment of this.shellSegments) {
            const sx = Math.cos(segment.angle) * segment.distance * shellWidth;
            const sy = Math.sin(segment.angle) * segment.distance * shellHeight;
            const sSize = segment.size * Math.min(shellWidth, shellHeight);
            
            ctx.beginPath();
            // Draw hexagon
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const px = sx + Math.cos(angle) * sSize;
                const py = sy + Math.sin(angle) * sSize;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }
        
        // Shell highlight
        const gradient = ctx.createRadialGradient(
            -shellWidth * 0.3, -shellHeight * 0.3, 0,
            0, 0, Math.max(shellWidth, shellHeight)
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, shellWidth, shellHeight, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Draw head
        this.drawHead(ctx, shellWidth, shellHeight);
        
        // Draw legs (in front of shell)
        this.drawLegs(ctx, shellWidth, shellHeight, true);
        
        // Draw tamed indicator (heart)
        if (this.heartScale > 0) {
            this.drawHeart(ctx, shellWidth, shellHeight);
        }
        
        // Draw glow when tamed
        if (this.isTamed) {
            ctx.save();
            ctx.globalAlpha = 0.3 * Math.sin(this.heartBeat * 0.5) * 0.5 + 0.3;
            ctx.strokeStyle = '#ff69b4';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 0, shellWidth + 4, shellHeight + 4, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.restore();
    }
    
    drawHeart(ctx, shellWidth, shellHeight) {
        ctx.save();
        
        // Heart position above turtle
        const heartY = -shellHeight - this.size * 0.8;
        const bounce = Math.sin(this.heartBeat) * 3;
        ctx.translate(0, heartY + bounce);
        
        const scale = this.heartScale * (0.9 + Math.sin(this.heartBeat) * 0.1);
        ctx.scale(scale, scale);
        
        const heartSize = this.size * 0.6;
        
        // Heart shadow
        ctx.save();
        ctx.translate(2, 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.drawHeartShape(ctx, heartSize);
        ctx.fill();
        ctx.restore();
        
        // Heart
        ctx.fillStyle = '#ff69b4';
        ctx.strokeStyle = '#ff1493';
        ctx.lineWidth = 2;
        this.drawHeartShape(ctx, heartSize);
        ctx.fill();
        ctx.stroke();
        
        // Heart shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(-heartSize * 0.2, -heartSize * 0.2, heartSize * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawHeartShape(ctx, size) {
        ctx.beginPath();
        ctx.moveTo(0, size * 0.3);
        
        // Left curve
        ctx.bezierCurveTo(
            -size, -size * 0.5,
            -size, size * 0.3,
            0, size
        );
        
        // Right curve
        ctx.bezierCurveTo(
            size, size * 0.3,
            size, -size * 0.5,
            0, size * 0.3
        );
        
        ctx.closePath();
    }
    
    drawHead(ctx, shellWidth, shellHeight) {
        const headX = shellWidth + this.size * 0.3;
        const headY = 0;
        const headSize = this.size * 0.5;
        
        // Retract head slightly when scared
        const retraction = this.isScared ? this.size * 0.3 : 0;
        
        ctx.save();
        ctx.translate(headX - retraction, headY);
        
        // Neck
        ctx.fillStyle = params.turtleHeadColor;
        ctx.beginPath();
        ctx.ellipse(-headSize * 0.3, 0, headSize * 0.4, headSize * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head
        ctx.beginPath();
        ctx.ellipse(0, 0, headSize, headSize * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes
        if (!this.isScared || retraction < this.size * 0.2) {
            const eyeSize = headSize * 0.2;
            const eyeY = -headSize * 0.3;
            
            // Eye whites
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(headSize * 0.3, eyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Pupils
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(headSize * 0.3, eyeY, eyeSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Eye shine
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(headSize * 0.35, eyeY - eyeSize * 0.2, eyeSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Nose marks
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(headSize * 0.7, -headSize * 0.1, headSize * 0.08, 0, Math.PI * 2);
        ctx.arc(headSize * 0.7, headSize * 0.1, headSize * 0.08, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawLegs(ctx, shellWidth, shellHeight, frontLegs) {
        const swimSpeed = this.vel.mag();
        const isSwimming = swimSpeed > 0.1;
        
        // More pronounced kick when swimming
        const kickMultiplier = isSwimming ? 1.5 : 0.5;
        const legKick = Math.sin(this.legPhase) * kickMultiplier;
        const legColor = params.turtleHeadColor;
        
        ctx.fillStyle = legColor;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1.5;
        
        if (!frontLegs) {
            // Back legs (more powerful, used for propulsion)
            const backLegX = -shellWidth * 0.3;
            const backLegY = shellHeight * 0.85;
            const backKick = Math.sin(this.legPhase + Math.PI);
            
            // Left back leg
            ctx.save();
            ctx.translate(backLegX, -backLegY);
            const leftBackAngle = -0.4 + backKick * 0.35;
            ctx.rotate(leftBackAngle);
            
            // Upper leg
            ctx.fillStyle = legColor;
            ctx.beginPath();
            ctx.ellipse(-this.size * 0.15, 0, this.size * 0.25, this.size * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Webbed foot (flipper)
            ctx.save();
            ctx.translate(-this.size * 0.35, 0);
            ctx.rotate(backKick * 0.2);
            this.drawWebbedFoot(ctx, this.size * 0.3, this.size * 0.45, legColor);
            ctx.restore();
            
            ctx.restore();
            
            // Right back leg
            ctx.save();
            ctx.translate(backLegX, backLegY);
            const rightBackAngle = 0.4 - backKick * 0.35;
            ctx.rotate(rightBackAngle);
            
            // Upper leg
            ctx.fillStyle = legColor;
            ctx.beginPath();
            ctx.ellipse(-this.size * 0.15, 0, this.size * 0.25, this.size * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Webbed foot (flipper)
            ctx.save();
            ctx.translate(-this.size * 0.35, 0);
            ctx.rotate(-backKick * 0.2);
            this.drawWebbedFoot(ctx, this.size * 0.3, this.size * 0.45, legColor);
            ctx.restore();
            
            ctx.restore();
        } else {
            // Front legs (smaller, used for steering)
            const frontLegX = shellWidth * 0.45;
            const frontLegY = shellHeight * 0.7;
            
            // Left front leg
            ctx.save();
            ctx.translate(frontLegX, -frontLegY);
            const leftFrontAngle = -0.3 + legKick * 0.25;
            ctx.rotate(leftFrontAngle);
            
            // Upper leg
            ctx.fillStyle = legColor;
            ctx.beginPath();
            ctx.ellipse(this.size * 0.12, 0, this.size * 0.2, this.size * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Webbed foot (smaller)
            ctx.save();
            ctx.translate(this.size * 0.3, 0);
            ctx.rotate(legKick * 0.15);
            this.drawWebbedFoot(ctx, this.size * 0.22, this.size * 0.35, legColor);
            ctx.restore();
            
            ctx.restore();
            
            // Right front leg
            ctx.save();
            ctx.translate(frontLegX, frontLegY);
            const rightFrontAngle = 0.3 - legKick * 0.25;
            ctx.rotate(rightFrontAngle);
            
            // Upper leg
            ctx.fillStyle = legColor;
            ctx.beginPath();
            ctx.ellipse(this.size * 0.12, 0, this.size * 0.2, this.size * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Webbed foot (smaller)
            ctx.save();
            ctx.translate(this.size * 0.3, 0);
            ctx.rotate(-legKick * 0.15);
            this.drawWebbedFoot(ctx, this.size * 0.22, this.size * 0.35, legColor);
            ctx.restore();
            
            ctx.restore();
        }
    }
    
    drawWebbedFoot(ctx, width, height, color) {
        // Draw webbed flipper with distinct toes
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        
        // Main foot pad
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Webbing detail (darker, semi-transparent)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        
        // Draw webbing between toes
        const toeCount = 3;
        for (let i = 0; i < toeCount; i++) {
            const angle = (i / (toeCount - 1) - 0.5) * Math.PI * 0.6;
            const toeX = Math.sin(angle) * width * 0.7;
            const toeY = Math.cos(angle) * height * 0.8;
            
            if (i === 0) {
                ctx.moveTo(0, -height * 0.3);
            }
            ctx.lineTo(toeX, toeY);
        }
        ctx.lineTo(0, -height * 0.3);
        ctx.closePath();
        ctx.fill();
        
        // Toe lines for detail
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < toeCount; i++) {
            const angle = (i / (toeCount - 1) - 0.5) * Math.PI * 0.6;
            const toeX = Math.sin(angle) * width * 0.7;
            const toeY = Math.cos(angle) * height * 0.8;
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(toeX, toeY);
            ctx.stroke();
        }
    }
    
    drawShadow(shadowCtx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        shadowCtx.save();
        shadowCtx.translate(
            this.pos.x + params.shadowOffsetX, 
            this.pos.y + params.shadowOffsetY
        );
        shadowCtx.rotate(this.rotation);
        
        const shellWidth = this.size * 1.4;
        const shellHeight = this.size * 1.6;
        
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        shadowCtx.beginPath();
        shadowCtx.ellipse(0, 0, shellWidth + 4, shellHeight + 4, 0, 0, Math.PI * 2);
        shadowCtx.fill();
        
        shadowCtx.restore();
    }
}
