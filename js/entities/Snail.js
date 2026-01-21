// Snail class - slow creature that crawls on lily pads/stones and retracts from predators

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, dist, isInView, width, height } from '../utils/helpers.js';
import { predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool } from '../systems/ObjectPool.js';

// Function to add ripple (will be set by main)
let addRippleFn = null;
export function setAddRippleFunction(fn) {
    addRippleFn = fn;
}

export class Snail {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(rand(-0.1, 0.1), rand(-0.1, 0.1));
        this.acc = new Vector(0, 0);
        
        this.size = rand(params.snailSizeMin, params.snailSizeMax);
        this.baseSpeed = rand(params.snailSpeedMin, params.snailSpeedMax);
        this.maxSpeed = this.baseSpeed * params.speedScale;
        this.maxForce = 0.01; // Very gentle turning
        
        // Visual properties
        this.shellColor = params.snailShellColor;
        this.bodyColor = params.snailBodyColor;
        this.rotation = Math.atan2(this.vel.y, this.vel.x);
        
        // Generate shell spiral pattern
        this.spiralSegments = [];
        const segments = 8;
        for (let i = 0; i < segments; i++) {
            this.spiralSegments.push({
                angle: (i / segments) * Math.PI * 2,
                radius: 0.3 + (i / segments) * 0.7,
                size: rand(0.15, 0.25)
            });
        }
        
        // State
        this.state = 'CRAWLING'; // CRAWLING, SWIMMING, RETRACTED
        this.retractedTimer = 0;
        this.swimTimer = Math.random() * 100;
        this.stateTimer = rand(200, 500); // Time until state change
        
        // Tentacle animation
        this.tentaclePhase = Math.random() * Math.PI * 2;
        
        // Target surface (lily pad or stone)
        this.targetSurface = null;
        this.onSurface = false;
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
    
    behaviors(pads, stones, dt = 1/60) {
        const scale = dt * 60;
        
        // Handle retracted state
        if (this.retractedTimer > 0) {
            this.retractedTimer -= scale;
            if (this.retractedTimer <= 0) {
                this.state = 'CRAWLING';
            }
            // Stop moving when retracted
            this.vel.mult(0.95);
            return;
        }
        
        // PREDATOR AVOIDANCE - highest priority
        const nearbyPredators = predatorGrid.getNearby(
            this.pos.x, 
            this.pos.y, 
            params.snailDetectionRange
        );
        
        let shouldRetract = false;
        for (const predator of nearbyPredators) {
            const dx = this.pos.x - predator.pos.x;
            const dy = this.pos.y - predator.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            if (d < params.snailDetectionRange && d > 0) {
                // Retract into shell
                if (predator.state === 'ATTACKING' || predator.state === 'DETECTING') {
                    shouldRetract = true;
                    break;
                }
            }
        }
        
        if (shouldRetract && this.state !== 'RETRACTED') {
            this.state = 'RETRACTED';
            this.retractedTimer = params.snailRetractDuration;
            this.vel.mult(0);
            if (addRippleFn) {
                addRippleFn(this.pos.x, this.pos.y);
            }
            return;
        }
        
        // Boundary avoidance
        let desired = null;
        const margin = 80;
        
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
            if (Math.random() < 0.02) {
                let wander = new Vector(rand(-1, 1), rand(-1, 1));
                wander.normalize();
                wander.mult(0.1);
                this.applyForce(wander);
            }
        }
        
        // State-specific behavior
        if (this.state === 'CRAWLING') {
            // Look for nearby surfaces (lily pads or stones)
            if (!this.onSurface || !this.targetSurface) {
                let closestSurface = null;
                let minDist = 150;
                
                // Check lily pads
                for (const pad of pads) {
                    const d = dist(this.pos.x, this.pos.y, pad.x, pad.y);
                    if (d < minDist) {
                        minDist = d;
                        closestSurface = { x: pad.x, y: pad.y, type: 'pad', radius: pad.radius };
                    }
                }
                
                // Check stones
                for (const stone of stones) {
                    const d = dist(this.pos.x, this.pos.y, stone.x, stone.y);
                    if (d < minDist) {
                        minDist = d;
                        closestSurface = { x: stone.x, y: stone.y, type: 'stone', radius: stone.size };
                    }
                }
                
                if (closestSurface) {
                    this.targetSurface = closestSurface;
                    
                    // Seek surface
                    let seekForce = this.seek(closestSurface);
                    seekForce.mult(1.5);
                    this.applyForce(seekForce);
                    
                    // Check if reached surface
                    if (minDist < closestSurface.radius + this.size) {
                        this.onSurface = true;
                    }
                } else {
                    // No surface nearby, consider swimming
                    this.stateTimer -= scale;
                    if (this.stateTimer <= 0 && Math.random() < params.snailSwimChance) {
                        this.state = 'SWIMMING';
                        this.stateTimer = params.snailSwimDuration;
                        this.onSurface = false;
                        this.targetSurface = null;
                    } else if (this.stateTimer <= 0) {
                        this.stateTimer = rand(200, 500);
                    }
                }
            } else {
                // On surface, crawl slowly
                this.stateTimer -= scale;
                
                // Occasionally leave surface
                if (this.stateTimer <= 0) {
                    if (Math.random() < params.snailSwimChance) {
                        this.state = 'SWIMMING';
                        this.stateTimer = params.snailSwimDuration;
                        this.onSurface = false;
                        this.targetSurface = null;
                    } else {
                        this.stateTimer = rand(200, 500);
                        this.onSurface = false;
                        this.targetSurface = null;
                    }
                }
            }
        } else if (this.state === 'SWIMMING') {
            // Swimming in water
            this.stateTimer -= scale;
            
            // Slow swimming motion
            if (Math.random() < 0.03) {
                let swim = new Vector(rand(-1, 1), rand(-1, 1));
                swim.normalize();
                swim.mult(0.2);
                this.applyForce(swim);
            }
            
            // After swimming for a while, look for surface
            if (this.stateTimer <= 0) {
                this.state = 'CRAWLING';
                this.stateTimer = rand(200, 500);
                this.onSurface = false;
                this.targetSurface = null;
            }
        }
    }
    
    update(pads, stones, dt = 1/60) {
        const scale = dt * 60;
        
        this.behaviors(pads, stones, dt);
        
        // Physics update
        this.vel.x += this.acc.x * scale;
        this.vel.y += this.acc.y * scale;
        
        // Slower when crawling
        if (this.state === 'CRAWLING' && this.onSurface) {
            this.vel.limit(this.maxSpeed * params.snailCrawlSpeed);
        } else {
            this.vel.limit(this.maxSpeed);
        }
        
        this.pos.x += this.vel.x * scale;
        this.pos.y += this.vel.y * scale;
        this.acc.mult(0);
        
        // Update rotation to face movement direction
        if (this.vel.mag() > 0.05) {
            let targetRotation = Math.atan2(this.vel.y, this.vel.x);
            // Smooth rotation
            let rotDiff = targetRotation - this.rotation;
            // Normalize to -PI to PI
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.rotation += rotDiff * 0.05 * scale;
        }
        
        // Tentacle animation
        this.tentaclePhase += 0.03 * scale;
        this.swimTimer += 0.05 * scale;
    }
    
    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.rotation);
        
        const shellSize = this.size * 1.2;
        const bodySize = this.size * 0.8;
        
        // Draw body (behind shell when retracted)
        if (this.state !== 'RETRACTED') {
            this.drawBody(ctx, bodySize);
        }
        
        // Draw shell
        this.drawShell(ctx, shellSize);
        
        // Draw tentacles with eyes (only when not retracted)
        if (this.state !== 'RETRACTED') {
            this.drawTentacles(ctx, bodySize);
        }
        
        ctx.restore();
    }
    
    drawBody(ctx, bodySize) {
        // Body extends forward from shell
        const bodyLength = bodySize * 2;
        const bodyWidth = bodySize * 0.8;
        
        ctx.save();
        ctx.translate(bodySize * 0.3, 0);
        
        // Body gradient (soft, slimy appearance)
        const bodyGradient = ctx.createRadialGradient(
            0, 0, 0,
            0, 0, bodyLength
        );
        bodyGradient.addColorStop(0, this.bodyColor);
        bodyGradient.addColorStop(0.5, this.bodyColor);
        bodyGradient.addColorStop(1, 'rgba(150, 130, 110, 0.3)');
        
        // Body shape
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.ellipse(bodyLength * 0.3, 0, bodyLength * 0.6, bodyWidth * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Body texture (subtle slime texture)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.ellipse(bodyLength * 0.4, -bodyWidth * 0.2, bodyLength * 0.3, bodyWidth * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawShell(ctx, shellSize) {
        ctx.save();
        
        // Shell base (darker outline)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, shellSize + 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Main shell
        const shellGradient = ctx.createRadialGradient(
            -shellSize * 0.3, -shellSize * 0.3, 0,
            0, 0, shellSize
        );
        shellGradient.addColorStop(0, this.adjustColor(this.shellColor, 0.2));
        shellGradient.addColorStop(0.7, this.shellColor);
        shellGradient.addColorStop(1, this.adjustColor(this.shellColor, -0.3));
        
        ctx.fillStyle = shellGradient;
        ctx.beginPath();
        ctx.arc(0, 0, shellSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Spiral pattern
        ctx.save();
        ctx.strokeStyle = this.adjustColor(this.shellColor, -0.4);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        // Draw spiral
        ctx.beginPath();
        const spiralTurns = 2.5;
        const points = 50;
        for (let i = 0; i < points; i++) {
            const t = i / points;
            const angle = t * Math.PI * 2 * spiralTurns;
            const radius = t * shellSize * 0.7;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Spiral segments (decorative bands)
        for (const segment of this.spiralSegments) {
            const sx = Math.cos(segment.angle) * segment.radius * shellSize * 0.6;
            const sy = Math.sin(segment.angle) * segment.radius * shellSize * 0.6;
            
            ctx.fillStyle = this.adjustColor(this.shellColor, -0.2);
            ctx.beginPath();
            ctx.arc(sx, sy, segment.size * shellSize * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
        
        // Shell highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(-shellSize * 0.35, -shellSize * 0.35, shellSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawTentacles(ctx, bodySize) {
        ctx.save();
        
        const tentacleLength = bodySize * 1.5;
        const tentacleWidth = bodySize * 0.15;
        const eyeSize = bodySize * 0.25;
        
        // Gentle wave motion
        const wave = Math.sin(this.tentaclePhase);
        
        // Left tentacle
        ctx.save();
        ctx.translate(bodySize * 1.2, -bodySize * 0.3);
        ctx.rotate(wave * 0.1);
        
        // Tentacle stalk
        ctx.fillStyle = this.bodyColor;
        ctx.beginPath();
        ctx.ellipse(tentacleLength * 0.4, 0, tentacleLength * 0.5, tentacleWidth, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye bulb
        ctx.fillStyle = this.bodyColor;
        ctx.beginPath();
        ctx.arc(tentacleLength * 0.8, 0, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(tentacleLength * 0.85, 0, eyeSize * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(tentacleLength * 0.88, -eyeSize * 0.2, eyeSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Right tentacle
        ctx.save();
        ctx.translate(bodySize * 1.2, bodySize * 0.3);
        ctx.rotate(-wave * 0.1);
        
        // Tentacle stalk
        ctx.fillStyle = this.bodyColor;
        ctx.beginPath();
        ctx.ellipse(tentacleLength * 0.4, 0, tentacleLength * 0.5, tentacleWidth, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye bulb
        ctx.fillStyle = this.bodyColor;
        ctx.beginPath();
        ctx.arc(tentacleLength * 0.8, 0, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(tentacleLength * 0.85, 0, eyeSize * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(tentacleLength * 0.88, -eyeSize * 0.2, eyeSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        ctx.restore();
    }
    
    drawShadow(shadowCtx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) return;
        
        shadowCtx.save();
        shadowCtx.translate(
            this.pos.x + params.shadowOffsetX, 
            this.pos.y + params.shadowOffsetY
        );
        
        const shellSize = this.size * 1.2;
        
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        shadowCtx.beginPath();
        shadowCtx.arc(0, 0, shellSize + 2, 0, Math.PI * 2);
        shadowCtx.fill();
        
        shadowCtx.restore();
    }
    
    adjustColor(hex, amount) {
        // Simple color adjustment
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount * 255));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount * 255));
        const b = Math.max(0, Math.min(255, (num & 0xff) + amount * 255));
        return `rgb(${r}, ${g}, ${b})`;
    }
}
