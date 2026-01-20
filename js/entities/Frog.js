// Frog class - sits on lily pads and can jump

import { Vector } from '../utils/Vector.js';
import { params } from '../config.js';
import { rand, dist, lerp } from '../utils/helpers.js';
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
        
        this.targetPad = null;
        this.jumpStartPos = null;
        this.jumpT = 0;
        this.jumpDuration = 40;
        
        this.diveT = 0;
        
        this.idleTime = rand(100, 500);
    }
    
    update(pads, dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        
        if (this.state === 'SITTING') {
            this.pos.x = this.pad.x;
            this.pos.y = this.pad.y;
            this.idleTime -= scale;
            
            if (this.idleTime <= 0) {
                this.tryJump(pads);
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
                return false; 
            }
        }
        return true; 
    }
    
    tryJump(pads) {
        const range = 200;
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
        }
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
        ctx.translate(this.pos.x, this.pos.y);
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
