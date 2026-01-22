// Boat class - rowboat with animated oars and wake effects

import { Vector } from '../utils/Vector.js';
import { params, CULL_MARGIN } from '../config.js';
import { isInView, width, height, rand } from '../utils/helpers.js';
import { ripplePool } from '../systems/ObjectPool.js';
import { fishGrid } from '../utils/SpatialGrid.js';

// Function to add ripple (will be set by main)
let addRippleFn = null;
export function setAddRippleFunction(fn) {
    addRippleFn = fn;
}

// Helper function for linear interpolation
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

export class Boat {
    constructor(x, y, wakeRipplesArray) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(0, 0);
        this.acc = new Vector(0, 0);
        
        this.angle = -Math.PI / 2; // Facing up initially
        this.speed = 0;
        this.maxSpeed = params.boatMaxSpeed;
        this.rotationSpeed = params.boatRotationSpeed;
        this.acceleration = params.boatAcceleration;
        this.friction = params.boatFriction;
        
        // Oar animation
        this.oarPhase = 0;
        this.rowing = false;
        
        // Control state
        this.controlMode = params.boatControlMode || 'auto';
        this.keys = {
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            w: false, s: false, a: false, d: false
        };
        
        // Auto-pilot state
        this.autoTime = Math.random() * 1000; // Random starting phase
        
        // Reference to wake ripples array (shared across all boats)
        this.wakeRipples = wakeRipplesArray;
    }
    
    // Set keyboard state (called from main.js)
    setKeyState(key, pressed) {
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = pressed;
        }
    }
    
    // Set control mode
    setControlMode(mode) {
        this.controlMode = mode;
    }
    
    update(dt, fishList = [], boatList = []) {
        const scale = dt * 60; // Normalize to 60 FPS
        
        // Get current config values
        const targetSpeed = params.boatSpeed || 0.7;
        const tempo = params.boatRowingTempo || 0.4;
        const wakeIntensity = params.boatWakeIntensity || 0.2;
        const rippleLife = params.boatRippleLife || 3.6;
        const boatSize = params.boatSize || 1.0;
        
        // Control logic
        if (this.controlMode === 'keyboard') {
            // Keyboard control
            let forward = false;
            let backward = false;
            let left = false;
            let right = false;
            
            if (this.keys.w || this.keys.ArrowUp) forward = true;
            if (this.keys.s || this.keys.ArrowDown) backward = true;
            if (this.keys.a || this.keys.ArrowLeft) left = true;
            if (this.keys.d || this.keys.ArrowRight) right = true;
            
            this.rowing = forward || backward;
            
            // Rotation
            if (left) {
                this.angle -= this.rotationSpeed * scale;
            }
            if (right) {
                this.angle += this.rotationSpeed * scale;
            }
            
            // Acceleration
            if (forward) {
                if (this.speed < targetSpeed) {
                    this.speed += this.acceleration * scale;
                }
            } else if (backward) {
                if (this.speed > -targetSpeed * 0.5) {
                    this.speed -= this.acceleration * scale;
                }
            } else {
                // Decelerate
                this.speed *= Math.pow(this.friction, scale);
            }
        } else {
            // Auto-pilot mode
            this.rowing = true;
            this.autoTime += dt * 1000; // Increment time
            
            // Accelerate/decelerate to target speed
            if (this.speed < targetSpeed) {
                this.speed += this.acceleration * scale;
            } else if (this.speed > targetSpeed) {
                this.speed -= this.acceleration * scale;
            }
            
            // Meandering movement using sine waves
            const time = this.autoTime * 0.0005;
            const turn = Math.sin(time) * 0.01 + (Math.sin(time * 2.5) * 0.005);
            this.angle += turn * scale;
        }
        
        // Boat-to-boat collision avoidance (prevent boats from overlapping)
        // Do this BEFORE position update to prevent overlap
        if (boatList && boatList.length > 1) {
            const boatRadius = 30 * boatSize; // Approximate boat radius
            const minDistance = boatRadius * 2.5; // Minimum distance between boats
            
            for (const otherBoat of boatList) {
                if (otherBoat === this) continue;
                
                const dx = this.pos.x - otherBoat.pos.x;
                const dy = this.pos.y - otherBoat.pos.y;
                const distSq = dx * dx + dy * dy;
                const minDistSq = minDistance * minDistance;
                
                if (distSq < minDistSq && distSq > 0) {
                    // Boats are too close - apply separation force
                    const dist = Math.sqrt(distSq);
                    const separationStrength = (1 - dist / minDistance) * 2.0; // Stronger when closer
                    
                    // Calculate separation direction
                    let separation = new Vector(dx / dist, dy / dist);
                    separation.mult(separationStrength);
                    
                    // Apply separation by adjusting angle and reducing speed
                    const avoidanceAngle = Math.atan2(separation.y, separation.x);
                    let angleDiff = avoidanceAngle - this.angle;
                    
                    // Normalize angle difference to -PI to PI
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    // Turn away from other boat
                    if (Math.abs(angleDiff) > 0.1) {
                        if (angleDiff > 0) {
                            this.angle += this.rotationSpeed * scale * 2;
                        } else {
                            this.angle -= this.rotationSpeed * scale * 2;
                        }
                    }
                    
                    // Reduce speed when too close
                    this.speed *= 0.8;
                    
                    // Push boats apart if they're very close (immediate separation)
                    if (dist < boatRadius * 1.5) {
                        const pushStrength = (1 - dist / (boatRadius * 1.5)) * 5;
                        this.pos.x += separation.x * pushStrength;
                        this.pos.y += separation.y * pushStrength;
                    }
                }
            }
        }
        
        // Apply friction
        this.speed *= Math.pow(this.friction, scale);
        
        // Update position
        this.pos.x += Math.cos(this.angle) * this.speed * scale;
        this.pos.y += Math.sin(this.angle) * this.speed * scale;
        
        // Boundary collision with reflection
        const margin = 40 * boatSize;
        
        if (this.pos.x > width - margin) {
            this.pos.x = width - margin;
            this.angle = Math.PI - this.angle; // Reflect X direction
        } else if (this.pos.x < margin) {
            this.pos.x = margin;
            this.angle = Math.PI - this.angle; // Reflect X direction
        }
        
        if (this.pos.y > height - margin) {
            this.pos.y = height - margin;
            this.angle = -this.angle; // Reflect Y direction
        } else if (this.pos.y < margin) {
            this.pos.y = margin;
            this.angle = -this.angle; // Reflect Y direction
        }
        
        // Oar animation
        if (this.rowing || Math.abs(this.speed) > 0.1) {
            // Row faster if speed is higher, adjusted by tempo
            this.oarPhase += (0.1 + (Math.abs(this.speed) * 0.05)) * tempo * scale;
        } else {
            // Return oars to neutral slowly
            this.oarPhase = this.oarPhase % (Math.PI * 2);
            const target = 0;
            this.oarPhase = lerp(this.oarPhase, target, 0.1 * scale);
        }
        
        // Wake particles (using simple ripple system like the example)
        const wakeChance = 1.0 - (wakeIntensity * 0.8); // Scale chance
        
        if (Math.abs(this.speed) > 0.5 && Math.random() > wakeChance) {
            // Create wake ripples at back of boat
            const backX = this.pos.x - Math.cos(this.angle) * 20;
            const backY = this.pos.y - Math.sin(this.angle) * 20;
            
            // Create wake ripple (simple object like the example)
            if (this.wakeRipples) {
                this.wakeRipples.push({
                    x: backX + Math.cos(this.angle + Math.PI/2) * (Math.random() * 10 - 5),
                    y: backY + Math.sin(this.angle + Math.PI/2) * (Math.random() * 10 - 5),
                    radius: 2,
                    alpha: 0.5,
                    growth: 0.2
                });
            }
        }
        
        // Fish interaction (scare fish away)
        if (params.boatScareFish && fishList && fishList.length > 0) {
            const detectionRange = 200;
            const nearbyFish = fishGrid.getNearby(this.pos.x, this.pos.y, detectionRange);
            
            for (const fish of nearbyFish) {
                const dx = fish.pos.x - this.pos.x;
                const dy = fish.pos.y - this.pos.y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq < detectionRange * detectionRange && distSq > 0) {
                    const d = Math.sqrt(distSq);
                    // Flee force proportional to distance
                    const fleeStrength = (1 - d / detectionRange) * 3;
                    let flee = new Vector(dx / d, dy / d);
                    flee.mult(fleeStrength);
                    fish.applyForce(flee);
                }
            }
        }
    }
    
    draw(ctx) {
        if (!isInView(this.pos.x, this.pos.y, CULL_MARGIN + 50)) return;
        
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);
        
        // Apply scale from config
        const scale = params.boatSize || 1.0;
        const paddleScale = params.boatPaddleSize || 1.0;
        const paddleLengthScale = params.boatPaddleLength || 0.5;
        
        ctx.scale(scale, scale);
        
        // Shadow on water
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(2, 5, 25, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Calculate oar swing angle
        const oarSwing = Math.sin(this.oarPhase) * 0.6;
        
        // Helper to draw a single oar
        const drawOar = (baseAngle, swingOffset) => {
            ctx.save();
            ctx.rotate(baseAngle + swingOffset);
            
            const shaftLength = 22 * paddleLengthScale;
            
            // Shaft
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#5d4037'; // Dark wood shaft
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(shaftLength, 0);
            ctx.stroke();
            
            // Blade
            ctx.fillStyle = '#8d6e63'; // Slightly lighter wood for blade
            ctx.beginPath();
            ctx.ellipse(shaftLength + 4, 0, 8 * paddleScale, 3 * paddleScale, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        };
        
        // Left Oar
        ctx.save();
        ctx.translate(0, -10);
        drawOar(-Math.PI/2, oarSwing);
        ctx.restore();
        
        // Right Oar
        ctx.save();
        ctx.translate(0, 10);
        drawOar(Math.PI/2, -oarSwing);
        ctx.restore();
        
        // Hull (Rowboat Shape)
        ctx.fillStyle = '#8d6e63'; // Wood color (Hull exterior)
        ctx.beginPath();
        ctx.moveTo(28, 0); // Sharp Bow
        
        // Starboard side
        ctx.bezierCurveTo(10, 14, -15, 14, -22, 9);
        
        // Transom (Stern)
        ctx.lineTo(-22, -9); // Flat back
        
        // Port side
        ctx.bezierCurveTo(-15, -14, 10, -14, 28, 0);
        
        ctx.fill();
        
        // Gunwale (Rim)
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Interior
        ctx.fillStyle = '#5d4037'; // Darker inner wood
        ctx.beginPath();
        ctx.moveTo(24, 0);
        ctx.bezierCurveTo(8, 11, -14, 11, -19, 7);
        ctx.lineTo(-19, -7);
        ctx.bezierCurveTo(-14, -11, 8, -11, 24, 0);
        ctx.fill();
        
        // Seats (Thwarts)
        ctx.fillStyle = '#795548'; // Seat color
        
        // Rear Seat (Stern sheets)
        ctx.fillRect(-20, -7, 6, 14);
        
        // Middle Seat (Rower's seat)
        ctx.fillRect(-5, -11, 6, 22);
        
        // Front Seat (Bow seat)
        ctx.beginPath();
        ctx.moveTo(10, -8);
        ctx.lineTo(10, 8);
        ctx.lineTo(18, 0);
        ctx.fill();
        
        // The Person
        // Shoulders/Shirt
        ctx.fillStyle = '#1e88e5'; // Blue Shirt
        ctx.beginPath();
        ctx.ellipse(-2, 0, 6, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head/Hat
        ctx.fillStyle = '#fdd835'; // Straw Hat
        ctx.beginPath();
        ctx.arc(-2, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Hat rim detail
        ctx.strokeStyle = '#fbc02d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-2, 0, 5, 0, Math.PI * 2);
        ctx.stroke();
        
        // Hands holding oars
        ctx.fillStyle = '#ffcc80'; // Skin
        ctx.beginPath();
        ctx.arc(5, -6, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, 6, 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// Update and draw wake ripples (called from RenderManager)
export function updateWakeRipples(wakeRipples, dt) {
    const duration = params.boatRippleLife || 3.6;
    const decay = 0.02 / duration; // Calculate decay based on duration slider
    
    for (let i = wakeRipples.length - 1; i >= 0; i--) {
        const r = wakeRipples[i];
        r.radius += r.growth;
        r.alpha -= decay;
        if (r.alpha <= 0) {
            wakeRipples.splice(i, 1);
        }
    }
}

export function drawWakeRipples(wakeRipples, ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    
    wakeRipples.forEach(r => {
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${r.alpha})`;
        ctx.fill();
    });
}
