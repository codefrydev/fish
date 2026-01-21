// Frog class - sits on lily pads and can jump

import { Vector } from '../utils/Vector.js';
import { params } from '../config.js';
import { rand, dist, lerp, width, height } from '../utils/helpers.js';
import { ripplePool } from '../systems/ObjectPool.js';

// Function to add ripple (will be set by main)
let addRippleFn = null;
export function setAddRippleFunction(fn) {
    addRippleFn = fn;
}

export class Frog {
    constructor(pad) {
        this.pad = pad; 
        this.pad.hasFrog = true; 
        
        this.pos = new Vector(pad.x, pad.y);
        this.rotation = rand(0, Math.PI * 2);
        this.color = `hsl(${rand(80, 110)}, ${rand(60,80)}%, ${rand(40,50)}%)`;
        this.size = pad.radius / 3;
        
        this.state = 'SITTING'; 
        
        // Swimming physics
        this.vel = new Vector(0, 0);
        this.acc = new Vector(0, 0);
        this.swimSpeed = rand(params.frogSwimSpeedMin, params.frogSwimSpeedMax);
        this.maxSpeed = this.swimSpeed;
        this.maxForce = params.frogSwimForce;
        
        this.targetPad = null;
        this.jumpStartPos = null;
        this.jumpT = 0;
        this.jumpDuration = 40;
        
        this.diveT = 0;
        
        this.idleTime = rand(100, 500);
        this.swimTimer = 0; // For swimming animation
        this.floatTime = 0; // Time spent floating
        this.bobOffset = 0; // Vertical bobbing offset
    }
    
    update(pads, dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        
        if (this.state === 'SITTING') {
            this.pos.x = this.pad.x;
            this.pos.y = this.pad.y;
            this.idleTime -= scale;
            
            if (this.idleTime <= 0) {
                const action = Math.random();
                
                // Random chance to float, swim, or jump
                if (action < params.frogFloatChance) {
                    // Start floating
                    this.pad.hasFrog = false;
                    this.state = 'FLOATING';
                    this.vel = new Vector(rand(-0.2, 0.2), rand(-0.2, 0.2));
                    this.floatTime = 0;
                    ripplePool.acquire(this.pos.x, this.pos.y, 3);
                } else if (action < params.frogFloatChance + params.frogSwimChance) {
                    // Start swimming
                    this.pad.hasFrog = false;
                    this.state = 'SWIMMING';
                    this.vel = new Vector(rand(-1, 1), rand(-1, 1));
                    this.vel.normalize();
                    this.vel.mult(this.swimSpeed * 0.5);
                    this.targetPad = null; // Will find one while swimming
                    ripplePool.acquire(this.pos.x, this.pos.y, 5);
                } else {
                    this.tryJump(pads);
                }
                this.idleTime = rand(200, 600); 
            }
        }
        else if (this.state === 'JUMPING') {
            this.jumpT += scale;
            const t = this.jumpT / this.jumpDuration;
            
            if (t >= 1) {
                this.state = 'SITTING';
                this.pad = this.targetPad;
                this.pos.x = this.pad.x;
                this.pos.y = this.pad.y;
                ripplePool.acquire(this.pos.x, this.pos.y, 5); 
            } else {
                this.pos.x = lerp(this.jumpStartPos.x, this.targetPad.x, t);
                this.pos.y = lerp(this.jumpStartPos.y, this.targetPad.y, t);
                
                const angle = Math.atan2(this.targetPad.y - this.jumpStartPos.y, this.targetPad.x - this.jumpStartPos.x);
                this.rotation = angle + Math.PI/2; 
            }
        }
        else if (this.state === 'DIVING') {
            this.diveT += scale;
            if (this.diveT > params.frogDiveDuration) {
                // Transition to swimming or floating
                if (Math.random() < 0.4) {
                    this.state = 'FLOATING';
                    this.vel = new Vector(rand(-0.3, 0.3), rand(-0.3, 0.3));
                    this.floatTime = 0;
                } else {
                    this.state = 'SWIMMING';
                    this.vel = new Vector(rand(-1, 1), rand(-1, 1));
                    this.vel.normalize();
                    this.vel.mult(this.swimSpeed * 0.5);
                }
                this.diveT = 0;
            }
        }
        else if (this.state === 'SWIMMING') {
            // Update swimming animation timer
            this.swimTimer += scale * 0.1;
            
            // Apply forces for swimming behavior
            this.applySwimBehaviors(pads);
            
            // Update velocity and position
            this.vel.x += this.acc.x * scale;
            this.vel.y += this.acc.y * scale;
            this.vel.limit(this.maxSpeed);
            
            this.pos.x += this.vel.x * scale;
            this.pos.y += this.vel.y * scale;
            this.acc.mult(0);
            
            // Update rotation to face movement direction
            if (this.vel.mag() > 0.1) {
                this.rotation = Math.atan2(this.vel.y, this.vel.x) + Math.PI/2;
            }
            
            // Check if reached a lily pad
            for (let pad of pads) {
                if (!pad.hasFrog && dist(this.pos.x, this.pos.y, pad.x, pad.y) < pad.radius) {
                    this.state = 'SITTING';
                    this.pad = pad;
                    this.pad.hasFrog = true;
                    this.pos.x = pad.x;
                    this.pos.y = pad.y;
                    this.vel.mult(0);
                    ripplePool.acquire(this.pos.x, this.pos.y, 5);
                    break;
                }
            }
            
            // Random chance to stop swimming and start floating
            if (Math.random() < 0.002 * scale && !this.targetPad) {
                this.state = 'FLOATING';
                this.vel.mult(0.2); // Slow down to drift
                this.floatTime = 0;
            }
        }
        else if (this.state === 'FLOATING') {
            // Gentle drifting and bobbing on water surface
            this.floatTime += scale;
            this.swimTimer += scale * params.frogFloatBobSpeed;
            
            // Slow drift with gentle random movement
            this.vel.x += rand(-0.05, 0.05) * scale;
            this.vel.y += rand(-0.05, 0.05) * scale;
            this.vel.limit(params.frogFloatDriftSpeed);
            
            this.pos.x += this.vel.x * scale;
            this.pos.y += this.vel.y * scale;
            
            // Bobbing motion
            this.bobOffset = Math.sin(this.swimTimer) * params.frogFloatBobAmount;
            
            // Slowly rotate to face drift direction
            if (this.vel.mag() > 0.05) {
                let targetRotation = Math.atan2(this.vel.y, this.vel.x) + Math.PI/2;
                // Smooth rotation
                let rotDiff = targetRotation - this.rotation;
                // Normalize to -PI to PI
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
                this.rotation += rotDiff * 0.02 * scale;
            }
            
            // Boundary avoidance - gentle steering back
            const margin = 60;
            if (this.pos.x < margin) this.vel.x += 0.05 * scale;
            if (this.pos.x > width - margin) this.vel.x -= 0.05 * scale;
            if (this.pos.y < margin) this.vel.y += 0.05 * scale;
            if (this.pos.y > height - margin) this.vel.y -= 0.05 * scale;
            
            // Check if floated near a lily pad
            for (let pad of pads) {
                if (!pad.hasFrog && dist(this.pos.x, this.pos.y, pad.x, pad.y) < pad.radius * 1.5) {
                    // Decide to hop on or keep floating
                    if (Math.random() < 0.3 * (dt * 60)) {
                        this.state = 'SITTING';
                        this.pad = pad;
                        this.pad.hasFrog = true;
                        this.pos.x = pad.x;
                        this.pos.y = pad.y;
                        this.vel.mult(0);
                        this.bobOffset = 0;
                        ripplePool.acquire(this.pos.x, this.pos.y, 3);
                        break;
                    }
                }
            }
            
            // After floating for a while, decide to swim or find a pad
            if (this.floatTime > params.frogFloatDuration) {
                if (Math.random() < 0.5) {
                    // Start swimming
                    this.state = 'SWIMMING';
                    this.vel.mult(2); // Boost velocity
                    this.floatTime = 0;
                    this.bobOffset = 0;
                } else {
                    // Keep floating longer
                    this.floatTime = 0;
                }
            }
        }
        return true; 
    }
    
    tryJump(pads) {
        const range = params.frogJumpRange;
        const candidates = pads.filter(p => 
            !p.hasFrog && 
            p !== this.pad && 
            dist(this.pos.x, this.pos.y, p.x, p.y) < range
        );
        
        if (candidates.length > 0) {
            this.targetPad = candidates[Math.floor(Math.random() * candidates.length)];
            this.pad.hasFrog = false; 
            this.targetPad.hasFrog = true; 
            this.jumpStartPos = new Vector(this.pos.x, this.pos.y);
            this.state = 'JUMPING';
            this.jumpT = 0;
        } else {
            // No pads in jump range, try swimming to a farther pad
            const farCandidates = pads.filter(p => 
                !p.hasFrog && 
                p !== this.pad &&
                dist(this.pos.x, this.pos.y, p.x, p.y) < params.frogSwimSeekRange
            );
            
            if (farCandidates.length > 0) {
                this.targetPad = farCandidates[Math.floor(Math.random() * farCandidates.length)];
                this.pad.hasFrog = false;
                this.state = 'SWIMMING';
                this.vel = new Vector(rand(-1, 1), rand(-1, 1));
                this.vel.normalize();
                this.vel.mult(this.swimSpeed * 0.5);
            }
        }
    }
    
    applySwimBehaviors(pads) {
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
            // Wander slightly
            if (Math.random() < 0.03) {
                let wander = new Vector(rand(-1, 1), rand(-1, 1));
                wander.normalize();
                wander.mult(0.3);
                this.applyForce(wander);
            }
        }
        
        // Seek nearest lily pad if we have a target
        if (this.targetPad) {
            let seekForce = this.seek(this.targetPad.x, this.targetPad.y);
            seekForce.mult(1.5);
            this.applyForce(seekForce);
        } else {
            // Look for nearby pads to seek
            const nearbyPads = pads.filter(p => 
                !p.hasFrog && 
                dist(this.pos.x, this.pos.y, p.x, p.y) < params.frogSwimSeekRange
            );
            
            if (nearbyPads.length > 0) {
                // Find closest
                let closest = nearbyPads[0];
                let minDist = dist(this.pos.x, this.pos.y, closest.x, closest.y);
                for (let p of nearbyPads) {
                    let d = dist(this.pos.x, this.pos.y, p.x, p.y);
                    if (d < minDist) {
                        minDist = d;
                        closest = p;
                    }
                }
                this.targetPad = closest;
            }
        }
    }
    
    seek(x, y) {
        let desired = new Vector(x - this.pos.x, y - this.pos.y);
        desired.normalize();
        desired.mult(this.maxSpeed);
        let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
        steer.limit(this.maxForce);
        return steer;
    }
    
    applyForce(force) {
        this.acc.add(force);
    }
    
    scare() {
        if (this.state !== 'DIVING') {
            this.state = 'DIVING';
            this.pad.hasFrog = false; 
            if (addRippleFn) {
                addRippleFn(this.pos.x, this.pos.y);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y + this.bobOffset);
        ctx.rotate(this.rotation);
        
        let scale = 1;
        let opacity = 1;
        
        if (this.state === 'JUMPING') {
            const t = this.jumpT / this.jumpDuration;
            const height = Math.sin(t * Math.PI);
            scale = 1 + height * 0.5;
            
            ctx.save();
            ctx.scale(1/scale, 1/scale); 
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath();
            ctx.ellipse(0, 20 * height, this.size*0.8, this.size*0.8, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        } 
        else if (this.state === 'DIVING') {
            scale = 1 - (this.diveT / params.frogDiveDuration); 
            opacity = 1 - (this.diveT / params.frogDiveDuration);
        }

        ctx.globalAlpha = opacity;
        ctx.scale(scale, scale);

        // Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 1.2, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Legs
        if (this.state === 'JUMPING') {
            ctx.lineWidth = 3;
            ctx.strokeStyle = this.color;
            ctx.lineCap = 'round';
            const legLen = params.frogJumpLegLength;
            // Hind
            ctx.beginPath(); ctx.moveTo(-5, 5); ctx.lineTo(-10, legLen); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(10, legLen); ctx.stroke();
            // Front
            ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(-10, -legLen); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(10, -legLen); ctx.stroke();
        } else if (this.state === 'SWIMMING') {
            // Swimming legs - animated kicking motion
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = this.color;
            ctx.lineCap = 'round';
            const kickCycle = Math.sin(this.swimTimer);
            const legExtend = 12 + kickCycle * 5;
            const legSpread = 8 + Math.abs(kickCycle) * 4;
            
            // Hind legs (extended back, kicking)
            ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-legSpread, legExtend); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(legSpread, legExtend); ctx.stroke();
            
            // Front legs (smaller, tucked)
            const frontKick = Math.sin(this.swimTimer + Math.PI/2);
            const frontExtend = 8 + frontKick * 3;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-6, -frontExtend); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(3, -3); ctx.lineTo(6, -frontExtend); ctx.stroke();
        } else if (this.state === 'FLOATING') {
            // Floating legs - spread out, relaxed
            ctx.fillStyle = this.color;
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.color;
            ctx.lineCap = 'round';
            
            // Gentle floating motion
            const floatSway = Math.sin(this.swimTimer * 0.7);
            
            // Hind legs spread out
            ctx.beginPath();
            ctx.ellipse(-this.size * 1.1 + floatSway, this.size*0.6, this.size*0.35, this.size*0.7, -0.3, 0, Math.PI*2);
            ctx.ellipse(this.size * 1.1 - floatSway, this.size*0.6, this.size*0.35, this.size*0.7, 0.3, 0, Math.PI*2);
            ctx.fill();
            
            // Front legs relaxed
            ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-7 + floatSway*0.5, 4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(7 - floatSway*0.5, 4); ctx.stroke();
        } else {
            ctx.fillStyle = this.color;
            // Hind legs (thighs)
            ctx.beginPath();
            ctx.ellipse(-this.size, this.size*0.5, this.size*0.4, this.size*0.8, -0.5, 0, Math.PI*2);
            ctx.ellipse(this.size, this.size*0.5, this.size*0.4, this.size*0.8, 0.5, 0, Math.PI*2);
            ctx.fill();
        }
        
        // Eyes
        ctx.fillStyle = '#fff';
        const eyeSize = this.size * params.frogEyeSizeRatio;
        const eyeY = -this.size * 0.6;
        const eyeX = this.size * 0.5;
        
        ctx.beginPath(); ctx.arc(-eyeX, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
        
        // Pupils
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-eyeX, eyeY, eyeSize*0.4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX, eyeY, eyeSize*0.4, 0, Math.PI*2); ctx.fill();
        
        // Back pattern
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.arc(0, 5, this.size*0.3, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    }
}
