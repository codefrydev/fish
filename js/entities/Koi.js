// Koi Fish class - main fish entity

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { rand, isInView, width, height } from '../utils/helpers.js';
import { fishGrid, foodGrid, predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool } from '../systems/ObjectPool.js';

// Reference to main canvas context (will be set externally)
let mainCtx = null;

export function setMainContext(ctx) {
    mainCtx = ctx;
}

// Function to add ripple (will be set by main)
let addRippleFn = null;
export function setAddRippleFunction(fn) {
    addRippleFn = fn;
}

export class Koi {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(rand(-1, 1), rand(-1, 1));
        this.acc = new Vector(0, 0);
        
        this.baseSpeed = rand(params.fishBaseSpeedMin, params.fishBaseSpeedMax);
        this.maxSpeed = this.baseSpeed * params.speedScale;
        
        this.maxForce = params.turnForce; 
        
        this.size = rand(params.sizeMin, params.sizeMax); 
        
        this.swimTimer = Math.random() * params.fishInitialSwimTimer;
        this.birthTimer = rand(0, params.fishInitialBirthCooldown);
        
        this.spine = [];
        this.spineLength = params.spineCount; 
        
        this.initSpine(x, y);
        
        const types = ['kohaku', 'showa', 'gold', 'tancho', 'utsuri'];
        this.type = types[Math.floor(Math.random() * types.length)];
        
        this.baseColor = '#f0f0f0'; 
        this.spots = [];

        if (this.type === 'kohaku') { 
            this.baseColor = '#fdfdfd';
            this.generatePatches('#d62828', 'saddle'); 
        } else if (this.type === 'gold') { 
            this.baseColor = '#f4a261';
            this.generatePatches('#e76f51', 'large_wash'); 
        } else if (this.type === 'showa') { 
            this.baseColor = '#1a1a1a'; 
            this.generatePatches('#d62828', 'saddle'); 
            this.generatePatches('#fdfdfd', 'saddle_small'); 
        } else if (this.type === 'tancho') { 
            this.baseColor = '#fdfdfd';
            this.spots.push({ color: '#d62828', t: 0.05, offset: 0, radius: this.size * 0.6 });
        } else if (this.type === 'utsuri') { 
            this.baseColor = '#0f0f0f';
            this.generatePatches('#f4d35e', 'wrapping_bands');
        }

        this.finsAngle = 0;
    }

    initSpine(x, y) {
        this.spine = [];
        const dist = this.size * params.distConstraint;
        for (let i = 0; i < this.spineLength; i++) {
            this.spine.push({
                pos: new Vector(x - i * dist, y), 
                size: this.calculateThickness(i)
            });
        }
    }

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

    generatePatches(color, style) {
        if (style === 'saddle') {
            let count = Math.floor(rand(2, 3));
            for(let i=0; i<count; i++) {
                let centerT = rand(0.2, 0.8);
                let clusterSize = Math.floor(rand(2, 4)); 
                for(let j=0; j<clusterSize; j++) {
                    this.spots.push({
                        color: color,
                        t: centerT + rand(-0.08, 0.08), 
                        offset: rand(-this.size*0.4, this.size*0.4), 
                        radius: rand(this.size * 0.6, this.size * 0.9) 
                    });
                }
            }
        } else if (style === 'saddle_small') {
             let count = Math.floor(rand(2, 4));
             for(let i=0; i<count; i++) {
                 let centerT = rand(0.1, 0.9);
                 this.spots.push({
                     color: color,
                     t: centerT,
                     offset: rand(-3, 3),
                     radius: rand(this.size * 0.4, this.size * 0.7)
                 });
             }
        } else if (style === 'wrapping_bands') {
            let count = Math.floor(rand(2, 3));
            for(let i=0; i<count; i++) {
                let centerT = rand(0.1, 0.9);
                this.spots.push({ color: color, t: centerT, offset: 0, radius: this.size * 0.95 });
            }
        } else if (style === 'large_wash') {
             this.spots.push({
                color: color,
                t: 0.4,
                offset: 0,
                radius: this.size * 1.5
            });
        }
    }

    seek(target) {
        let desired = new Vector(target.x, target.y);
        desired.sub(this.pos);
        desired.normalize();
        desired.mult(this.maxSpeed);
        let steer = desired.sub(this.vel);
        steer.limit(this.maxForce);
        return steer;
    }

    run(fishList, foodList, dt = 1/60) {
        this.behaviors(fishList, foodList);
        this.update(dt);
        // Only draw if fish is in view (with margin for fins/tail)
        if (isInView(this.pos.x, this.pos.y, CULL_MARGIN + this.size * 2)) {
            this.draw(false);
        }
    }
    
    drawShadow(shadowCtx) {
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
        shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        
        this.drawBodyPathOnContext(shadowCtx, leftPoints, rightPoints, head, headAngle);
        shadowCtx.fill();
        this.drawFinsOnContext(shadowCtx, head, headAngle, false, true); 
        this.drawFinsOnContext(shadowCtx, head, headAngle, true, true);  
        this.drawDorsalFinOnContext(shadowCtx, true);
        shadowCtx.restore();
    }

    behaviors(fishList, foodList) {
        this.maxForce = params.turnForce;
        this.maxSpeed = this.baseSpeed * params.speedScale;

        let desired = null;
        const margin = 100;
        
        if (this.pos.x < margin) desired = new Vector(this.maxSpeed, this.vel.y);
        else if (this.pos.x > width - margin) desired = new Vector(-this.maxSpeed, this.vel.y);
        if (this.pos.y < margin) desired = new Vector(this.vel.x, this.maxSpeed);
        else if (this.pos.y > height - margin) desired = new Vector(this.vel.x, -this.maxSpeed);

        if (desired) {
            desired.normalize();
            desired.mult(this.maxSpeed);
            let steer = desired.sub(this.vel);
            steer.limit(this.maxForce * 2);
            this.applyForce(steer);
        } else {
            if (Math.random() < 0.05) {
                let wander = new Vector(rand(-1, 1), rand(-1, 1));
                wander.normalize();
                wander.mult(0.5);
                this.applyForce(wander);
            }
        }

        // Use spatial grid for efficient food searching
        const nearbyFoods = foodGrid.getNearbyFiltered(
            this.pos.x, this.pos.y, 300, 
            food => !food.eaten
        );
        
        if (nearbyFoods.length > 0) {
            // Find closest food from nearby
            let closestFood = null;
            let minDistSq = 300 * 300;
            
            for (const { obj: food, distSq } of nearbyFoods) {
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestFood = food;
                }
            }
            
            if (closestFood) {
                const targetPos = { x: closestFood.pos.x, y: closestFood.pos.y };
                let seekForce = this.seek(targetPos);
                seekForce.mult(2.5); 
                this.applyForce(seekForce);
                
                if (minDistSq < 100) { // 10 * 10
                    closestFood.eaten = true;
                    this.swimTimer += 2;
                    if (addRippleFn) {
                        addRippleFn(closestFood.pos.x, closestFood.pos.y);
                    }
                }
            }
        }
        
        // Use spatial grid for efficient separation (fish avoidance)
        const nearbyFish = fishGrid.getNearby(this.pos.x, this.pos.y, 50);
        
        let separation = new Vector(0, 0);
        let count = 0;
        for (let other of nearbyFish) {
            if (other !== this) {
                const dx = this.pos.x - other.pos.x;
                const dy = this.pos.y - other.pos.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 2500 && distSq > 0) { // 50 * 50
                    const d = Math.sqrt(distSq);
                    separation.x += dx / (d * d);
                    separation.y += dy / (d * d);
                    count++;
                }
            }
        }
        if (count > 0) {
            separation.div(count);
            separation.normalize();
            separation.mult(this.maxSpeed);
            let steer = separation.sub(this.vel);
            steer.limit(this.maxForce * 1.5);
            this.applyForce(steer);
        }
        
        // PREDATOR AVOIDANCE - highest priority
        const nearbyPredators = predatorGrid.getNearby(this.pos.x, this.pos.y, params.predatorDetectionRange * 1.5);
        
        for (const predator of nearbyPredators) {
            const dx = this.pos.x - predator.pos.x;
            const dy = this.pos.y - predator.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            if (d < params.predatorDetectionRange * 1.2 && d > 0) {
                // Strong flee force - inversely proportional to distance
                let fleeForce = new Vector(dx / d, dy / d);
                const urgency = 1 - (d / (params.predatorDetectionRange * 1.2));
                fleeForce.mult(this.maxSpeed * 2 * urgency);
                
                // Extra speed boost when predator is attacking
                if (predator.state === 'ATTACKING' && predator.target === this) {
                    fleeForce.mult(2);
                    this.maxSpeed = this.baseSpeed * params.speedScale * 1.5; // Burst of speed
                }
                
                let steer = new Vector(fleeForce.x - this.vel.x, fleeForce.y - this.vel.y);
                steer.limit(this.maxForce * params.fishFleeForceMultiplier); // High priority flee
                this.applyForce(steer);
            }
        }
    }

    applyForce(force) {
        this.acc.add(force);
    }
    
    update(dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        
        // Scale velocity changes by delta time
        this.vel.x += this.acc.x * scale;
        this.vel.y += this.acc.y * scale;
        this.vel.limit(this.maxSpeed);
        
        // Scale position changes by delta time
        this.pos.x += this.vel.x * scale;
        this.pos.y += this.vel.y * scale;
        this.acc.mult(0);
        
        let speed = this.vel.mag();
        this.swimTimer += (params.waveSpeedBase + (speed * params.waveSpeedMult)) * scale;

        this.spine[0].pos = new Vector(this.pos.x, this.pos.y);
        
        for (let i = 1; i < this.spineLength; i++) {
            let prev = this.spine[i - 1].pos;
            let curr = this.spine[i].pos;
            
            let dx = curr.x - prev.x;
            let dy = curr.y - prev.y;
            
            let angle = Math.atan2(dy, dx);
            
            let waveAmt = Math.min(params.waveAmpMax, i * params.waveAmpGain);
            let wave = Math.sin(this.swimTimer - i * params.fishWavePhaseOffset) * waveAmt;
            
            angle += wave;
            
            const segDist = this.size * params.distConstraint; 
            
            let tx = prev.x + Math.cos(angle) * segDist;
            let ty = prev.y + Math.sin(angle) * segDist;
            
            curr.x = tx;
            curr.y = ty;
            
            curr.size = this.calculateThickness(i);
        }
        
        this.finsAngle = this.swimTimer;
    }

    draw(isShadow) {
        const ctx = mainCtx;
        if (!ctx) return;
        
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

        // Shadows are now handled separately via drawShadow method
        if (isShadow) return;

        this.drawFinsOnContext(ctx, head, headAngle, false, false);

        ctx.save();
        this.drawBodyPathOnContext(ctx, leftPoints, rightPoints, head, headAngle);
        ctx.fillStyle = this.baseColor;
        ctx.fill();
        
        ctx.clip(); 
        
        for(let spot of this.spots) {
            let idx = Math.floor(spot.t * (this.spineLength-1));
            idx = Math.max(0, Math.min(idx, this.spineLength-1));
            let s = this.spine[idx];
            ctx.beginPath();
            ctx.arc(s.pos.x + spot.offset, s.pos.y + spot.offset, spot.radius, 0, Math.PI*2);
            ctx.fillStyle = spot.color;
            ctx.fill();
        }

        ctx.restore(); 

        this.drawDorsalFinOnContext(ctx, false);
        this.drawFinsOnContext(ctx, head, headAngle, true, false);
        this.drawEyes(head, headAngle);
    }
    
    drawBodyPathOnContext(c, leftPoints, rightPoints, head, headAngle) {
        c.beginPath();
        let noseX = head.pos.x + Math.cos(headAngle) * this.spine[0].size;
        let noseY = head.pos.y + Math.sin(headAngle) * this.spine[0].size;
        c.moveTo(noseX, noseY);

        c.lineTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 0; i < leftPoints.length - 1; i++) {
            const p0 = leftPoints[i];
            const p1 = leftPoints[i + 1];
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            c.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        c.lineTo(leftPoints[leftPoints.length-1].x, leftPoints[leftPoints.length-1].y);

        let tail = this.spine[this.spineLength-1];
        c.quadraticCurveTo(tail.pos.x, tail.pos.y, rightPoints[this.spineLength-1].x, rightPoints[this.spineLength-1].y);
        
        for (let i = rightPoints.length - 1; i > 0; i--) {
            const p0 = rightPoints[i];
            const p1 = rightPoints[i - 1];
            const mx = (p0.x + p1.x) * 0.5;
            const my = (p0.y + p1.y) * 0.5;
            c.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        c.lineTo(rightPoints[0].x, rightPoints[0].y);
        
        c.lineTo(noseX, noseY);
        c.closePath();
    }

    drawDorsalFinOnContext(c, isShadow) {
        const startIndex = 4;
        const endIndex = this.spineLength - 2; 
        
        if (startIndex >= this.spineLength || endIndex >= this.spineLength) return;

        c.beginPath();
        let start = this.spine[startIndex];
        c.moveTo(start.pos.x, start.pos.y);
        
        for(let i=startIndex + 1; i <= endIndex; i++) {
             let s = this.spine[i];
             c.lineTo(s.pos.x, s.pos.y);
        }
        
        c.lineCap = 'round';
        c.lineJoin = 'round';
        
        if (isShadow) {
            c.lineWidth = 3;
            c.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            c.stroke();
        } else {
            c.lineWidth = 2;
            c.strokeStyle = 'rgba(0, 0, 0, 0.05)'; 
            c.stroke();
            
            c.lineWidth = 1;
            c.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            c.stroke();
        }
    }

    drawFinsOnContext(c, head, angle, topLayer, isShadow) {
        let shoulder = this.spine[4]; 
        let a = angle; 
        
        c.save();
        c.translate(shoulder.pos.x, shoulder.pos.y);
        c.rotate(a);

        if (!isShadow) {
            c.fillStyle = 'rgba(255, 255, 255, 0.4)';
        }
        
        const s = (this.size / 22) * params.finScale;

        if (!topLayer) {
            let finCycle = Math.sin(this.finsAngle); 
            
            c.beginPath();
            c.moveTo(4*s, 0); 
            c.quadraticCurveTo(45*s, -40*s + finCycle*10*s, -15*s, -25*s + finCycle*5*s);
            c.quadraticCurveTo(0, -8*s, 4*s, 0);
            c.fill();
            
            c.beginPath();
            c.moveTo(4*s, 0);
            c.quadraticCurveTo(45*s, 40*s - finCycle*10*s, -15*s, 25*s - finCycle*5*s);
            c.quadraticCurveTo(0, 8*s, 4*s, 0);
            c.fill();
            
            c.translate(-22*s, 0); 
            let pelvicCycle = Math.cos(this.finsAngle); 
            
            c.beginPath();
            c.moveTo(0, 3*s); 
            c.quadraticCurveTo(15*s, 20*s + pelvicCycle*3*s, -5*s, 15*s);
            c.fill();
            
            c.beginPath();
            c.moveTo(0, -3*s); 
            c.quadraticCurveTo(15*s, -20*s - pelvicCycle*3*s, -5*s, -15*s);
            c.fill();
            
            c.restore();
        } else {
             c.restore(); 
             
             let tailIndex = this.spineLength - 1;
             let tailPos = this.spine[tailIndex].pos;
             let prevPos = this.spine[tailIndex - 1].pos;
             let tailAngle = Math.atan2(tailPos.y - prevPos.y, tailPos.x - prevPos.x);
             
             c.save();
             c.translate(tailPos.x, tailPos.y);
             c.rotate(tailAngle);
             
             if(!isShadow) {
                 c.fillStyle = 'rgba(255, 255, 255, 0.35)';
             }
             
             let flutter = Math.sin(this.finsAngle * 1.5); 
             
             c.beginPath();
             c.moveTo(0, 0);
             let tipX = 35 * s; 
             let tipY = -22 * s;
             
             c.bezierCurveTo(10*s, 0, 20*s, tipY + flutter * 5*s, tipX, tipY + flutter * 10*s);
             c.lineTo(tipX - 10*s, 0); 
             c.bezierCurveTo(tipX, -tipY + flutter * 10*s, 20*s, -tipY + flutter * 5*s, 0, 0);
             c.fill();
             
             if (!isShadow) {
                c.strokeStyle = 'rgba(255,255,255,0.1)';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(0,0); c.lineTo(tipX, tipY + flutter*10*s);
                c.moveTo(0,0); c.lineTo(tipX, -tipY + flutter*10*s);
                c.moveTo(0,0); c.lineTo(tipX - 10*s, 0);
                c.stroke();
             }

             c.restore();
        }
    }

    drawEyes(head, angle) {
        const ctx = mainCtx;
        if (!ctx) return;
        
        ctx.save();
        ctx.translate(head.pos.x, head.pos.y);
        ctx.rotate(angle);
        
        const s = this.size / 22;
        const eyeOffset = 7 * s;
        const eyeSize = 3.5 * s; 
        
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(eyeOffset, -eyeOffset, eyeSize, 0, Math.PI*2); 
        ctx.arc(eyeOffset, eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eyeOffset + 1*s, -eyeOffset - 1*s, eyeSize * 0.35, 0, Math.PI*2); 
        ctx.arc(eyeOffset + 1*s, eyeOffset + 1*s, eyeSize * 0.35, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    }
}
