// Turtle class - slow swimming creature that eats food and avoids predators

import { Entity } from './Entity.js';
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

export class Turtle extends Entity {
    constructor(x, y) {
        super(x, y);
        
        // Override base class initialization with Turtle-specific values
        this.size = rand(params.turtleSizeMin, params.turtleSizeMax);
        this.baseSpeed = rand(params.turtleBaseSpeedMin, params.turtleBaseSpeedMax);
        this.maxSpeed = this.baseSpeed * params.speedScale;
        this.maxForce = params.turtleTurnForce;
        
        // Initialize velocity
        this.vel = new Vector(rand(-0.5, 0.5), rand(-0.5, 0.5));
        
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
        this.stayInBounds(100, 2);
        
        // Only wander if not at boundary
        if (this.pos.x >= 100 && this.pos.x <= width - 100 && 
            this.pos.y >= 100 && this.pos.y <= height - 100) {
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
                let seekForce = this.seek(followTarget);
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
                    let seekForce = this.seek(closestFood.pos);
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
        
        // Physics update - call parent update which handles physics and rotation
        super.update(dt);
        
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
        
        // Top-down view: shell is circular/oval from above
        const shellRadius = this.size * 1.3;  // Circular shell from top
        
        // Draw legs (behind shell)
        this.drawLegs(ctx, shellRadius, false);
        
        // Draw shell
        ctx.save();
        
        // Shell base (darker outline/shadow)
        ctx.fillStyle = this.patternColor;
        ctx.beginPath();
        ctx.arc(0, 0, shellRadius + 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Main shell - circular from top
        ctx.fillStyle = this.shellColor;
        ctx.beginPath();
        ctx.arc(0, 0, shellRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Shell pattern (hexagonal segments) - visible from top
        ctx.fillStyle = this.patternColor;
        for (const segment of this.shellSegments) {
            const sx = Math.cos(segment.angle) * segment.distance * shellRadius;
            const sy = Math.sin(segment.angle) * segment.distance * shellRadius;
            const sSize = segment.size * shellRadius;
            
            ctx.beginPath();
            // Draw hexagon (scutes visible from above)
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const px = sx + Math.cos(angle) * sSize;
                const py = sy + Math.sin(angle) * sSize;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            
            // Add highlight on each scute (top-down lighting)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.arc(sx - sSize * 0.2, sy - sSize * 0.2, sSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.patternColor;
        }
        
        // Shell highlight - top-down lighting (sun from above)
        const gradient = ctx.createRadialGradient(
            -shellRadius * 0.3, -shellRadius * 0.3, 0,
            0, 0, shellRadius * 1.2
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.08)');
        gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, shellRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Shell rim/edge
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, shellRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        
        // Draw head (from top)
        this.drawHead(ctx, shellRadius);
        
        // Draw legs (in front of shell)
        this.drawLegs(ctx, shellRadius, true);
        
        // Draw tamed indicator (heart)
        if (this.heartScale > 0) {
            this.drawHeart(ctx, shellRadius);
        }
        
        // Draw glow when tamed
        if (this.isTamed) {
            ctx.save();
            ctx.globalAlpha = 0.3 * Math.sin(this.heartBeat * 0.5) * 0.5 + 0.3;
            ctx.strokeStyle = '#ff69b4';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, shellRadius + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.restore();
    }
    
    drawHeart(ctx, shellRadius) {
        ctx.save();
        
        // Heart position above turtle (from top view)
        const heartY = -shellRadius - this.size * 0.8;
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
    
    drawHead(ctx, shellRadius) {
        const headX = shellRadius + this.size * 0.25;
        const headSize = this.size * 0.55;
        
        // Retract head slightly when scared
        const retraction = this.isScared ? this.size * 0.25 : 0;
        
        ctx.save();
        ctx.translate(headX - retraction, 0);
        
        // Neck (visible from top as connecting oval)
        ctx.fillStyle = params.turtleHeadColor;
        ctx.beginPath();
        ctx.ellipse(-headSize * 0.2, 0, headSize * 0.35, headSize * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head - circular/oval from top view
        ctx.beginPath();
        ctx.ellipse(0, 0, headSize, headSize * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head shading (top-down lighting)
        const headGradient = ctx.createRadialGradient(
            -headSize * 0.3, -headSize * 0.3, 0,
            0, 0, headSize
        );
        headGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        headGradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.05)');
        headGradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        ctx.fillStyle = headGradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, headSize, headSize * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, headSize, headSize * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Eyes - on sides of head (visible from top)
        if (!this.isScared || retraction < this.size * 0.2) {
            const eyeSize = headSize * 0.22;
            const eyeSpacing = headSize * 0.7;  // Eyes on left and right sides
            
            // Left eye (negative y = left side when facing forward)
            this.drawSingleEye(ctx, 0, -eyeSpacing, eyeSize);
            
            // Right eye (positive y = right side when facing forward)
            this.drawSingleEye(ctx, 0, eyeSpacing, eyeSize);
        }
        
        // Nose at front tip (visible from top)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(headSize * 0.75, 0, headSize * 0.1, 0, Math.PI * 2);
        ctx.fill();
        
        // Nose highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(headSize * 0.72, -headSize * 0.03, headSize * 0.04, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawSingleEye(ctx, x, y, size) {
        // Eye bulge (raised, visible from top)
        const bulgeGradient = ctx.createRadialGradient(
            x - size * 0.3, y - size * 0.3, 0,
            x, y, size * 1.2
        );
        bulgeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        bulgeGradient.addColorStop(0.6, params.turtleHeadColor);
        bulgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        ctx.fillStyle = bulgeGradient;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.1, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye rim
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
        
        // Eye white
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupil
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye shine (from above)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(x - size * 0.2, y - size * 0.2, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawLegs(ctx, shellRadius, frontLegs) {
        const swimSpeed = this.vel.mag();
        const isSwimming = swimSpeed > 0.1;
        
        // More pronounced kick when swimming
        const kickMultiplier = isSwimming ? 1.5 : 0.5;
        const legKick = Math.sin(this.legPhase) * kickMultiplier;
        const legColor = params.turtleHeadColor;
        
        if (!frontLegs) {
            // Back legs - stick out from sides (top view)
            const backLegX = -shellRadius * 0.25;
            const backLegY = shellRadius * 0.9;
            const backKick = Math.sin(this.legPhase + Math.PI);
            
            // Left back leg
            this.drawSingleLeg(ctx, backLegX, -backLegY, legColor, backKick, true);
            
            // Right back leg
            this.drawSingleLeg(ctx, backLegX, backLegY, legColor, -backKick, true);
        } else {
            // Front legs - stick out from sides (top view)
            const frontLegX = shellRadius * 0.4;
            const frontLegY = shellRadius * 0.75;
            
            // Left front leg
            this.drawSingleLeg(ctx, frontLegX, -frontLegY, legColor, legKick, false);
            
            // Right front leg
            this.drawSingleLeg(ctx, frontLegX, frontLegY, legColor, -legKick, false);
        }
    }
    
    drawSingleLeg(ctx, x, y, color, kick, isBack) {
        const legLength = this.size * 0.6;
        const legWidth = this.size * 0.2;
        const footSize = this.size * 0.3;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Legs stick out perpendicular from shell (top view)
        const baseAngle = y < 0 ? -Math.PI / 2 : Math.PI / 2;
        const angle = baseAngle + (y < 0 ? -0.15 : 0.15) + kick * 0.2;
        ctx.rotate(angle);
        
        // Upper leg - oval from top
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(legLength * 0.25, 0, legLength * 0.3, legWidth, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Leg shading
        const legGradient = ctx.createRadialGradient(
            legLength * 0.15, -legWidth * 0.3, 0,
            legLength * 0.25, 0, legLength * 0.4
        );
        legGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        legGradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.05)');
        legGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = legGradient;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Lower leg/foot
        ctx.save();
        ctx.translate(legLength * 0.55, 0);
        ctx.rotate(kick * 0.1);
        
        // Webbed foot - visible from top
        this.drawWebbedFoot(ctx, footSize, footSize * 0.8, color);
        
        ctx.restore();
        ctx.restore();
    }
    
    drawWebbedFoot(ctx, width, height, color) {
        // Draw webbed flipper - visible from top
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.5;
        
        // Main foot pad - oval from top
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Foot shading (top-down)
        const footGradient = ctx.createRadialGradient(
            -width * 0.2, -height * 0.2, 0,
            0, 0, width
        );
        footGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        footGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.08)');
        footGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = footGradient;
        ctx.fill();
        
        ctx.stroke();
        
        // Webbing detail - visible from top
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        
        // Draw webbing between toes (3 toes visible)
        const toeCount = 3;
        for (let i = 0; i < toeCount; i++) {
            const angle = (i / (toeCount - 1) - 0.5) * Math.PI * 0.5;
            const toeX = Math.sin(angle) * width * 0.75;
            const toeY = Math.cos(angle) * height * 0.85;
            
            // Toe line
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(toeX, toeY);
            ctx.stroke();
            
            // Toe tip
            ctx.beginPath();
            ctx.arc(toeX, toeY, width * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Webbing between toes
        ctx.beginPath();
        ctx.moveTo(0, -height * 0.2);
        for (let i = 0; i < toeCount; i++) {
            const angle = (i / (toeCount - 1) - 0.5) * Math.PI * 0.5;
            const toeX = Math.sin(angle) * width * 0.75;
            const toeY = Math.cos(angle) * height * 0.85;
            ctx.lineTo(toeX, toeY);
        }
        ctx.lineTo(0, -height * 0.2);
        ctx.closePath();
        ctx.fill();
    }
    
    drawShadow(shadowCtx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        shadowCtx.save();
        shadowCtx.translate(
            this.pos.x + params.shadowOffsetX, 
            this.pos.y + params.shadowOffsetY
        );
        shadowCtx.rotate(this.rotation);
        
        const shellRadius = this.size * 1.3;
        
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        shadowCtx.beginPath();
        shadowCtx.arc(0, 0, shellRadius + 4, 0, Math.PI * 2);
        shadowCtx.fill();
        
        shadowCtx.restore();
    }
}
