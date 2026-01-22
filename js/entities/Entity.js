// Base Entity class for all moving entities
// Provides common physics, behaviors, and lifecycle methods

import { Vector } from '../utils/Vector.js';
import { width, height } from '../utils/helpers.js';

export class Entity {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(0, 0);
        this.acc = new Vector(0, 0);
        
        this.maxSpeed = 1.0;
        this.maxForce = 0.1;
        this.size = 10;
        this.rotation = 0;
    }

    /**
     * Apply a force to the entity (adds to acceleration)
     * @param {Vector} force - The force vector to apply
     */
    applyForce(force) {
        this.acc.add(force);
    }

    /**
     * Seek behavior - steer towards a target
     * @param {Object|Vector} target - Target position {x, y} or Vector
     * @param {number} speedMult - Speed multiplier (default: 1)
     * @returns {Vector} Steering force
     */
    seek(target, speedMult = 1) {
        const targetX = target.x !== undefined ? target.x : target.pos?.x;
        const targetY = target.y !== undefined ? target.y : target.pos?.y;
        
        if (targetX === undefined || targetY === undefined) {
            return new Vector(0, 0);
        }
        
        let desired = new Vector(targetX - this.pos.x, targetY - this.pos.y);
        desired.normalize();
        desired.mult(this.maxSpeed * speedMult);
        let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
        steer.limit(this.maxForce * speedMult);
        return steer;
    }

    /**
     * Stay within screen boundaries
     * @param {number} margin - Margin from edges (default: 100)
     * @param {number} forceMultiplier - Multiplier for boundary force (default: 2)
     */
    stayInBounds(margin = 100, forceMultiplier = 2) {
        let desired = null;
        
        if (this.pos.x < margin) {
            desired = new Vector(this.maxSpeed, this.vel.y);
        } else if (this.pos.x > width - margin) {
            desired = new Vector(-this.maxSpeed, this.vel.y);
        }
        
        if (this.pos.y < margin) {
            desired = new Vector(this.vel.x, this.maxSpeed);
        } else if (this.pos.y > height - margin) {
            desired = new Vector(this.vel.x, -this.maxSpeed);
        }
        
        if (desired) {
            desired.normalize();
            desired.mult(this.maxSpeed);
            let steer = new Vector(desired.x - this.vel.x, desired.y - this.vel.y);
            steer.limit(this.maxForce * forceMultiplier);
            this.applyForce(steer);
        }
    }

    /**
     * Update entity state (to be overridden by subclasses)
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Base implementation: basic physics update
        const scale = dt * 60; // Normalize to 60 FPS
        
        // Update velocity
        this.vel.x += this.acc.x * scale;
        this.vel.y += this.acc.y * scale;
        this.vel.limit(this.maxSpeed);
        
        // Update position
        this.pos.x += this.vel.x * scale;
        this.pos.y += this.vel.y * scale;
        
        // Reset acceleration
        this.acc.mult(0);
        
        // Update rotation to face movement direction
        if (this.vel.mag() > 0.1) {
            let targetRotation = Math.atan2(this.vel.y, this.vel.x);
            let rotDiff = targetRotation - this.rotation;
            // Normalize to -PI to PI
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.rotation += rotDiff * 0.1 * scale;
        }
    }

    /**
     * Draw entity (to be overridden by subclasses)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    draw(ctx) {
        // Abstract method - must be implemented by subclasses
        throw new Error('draw() method must be implemented by subclass');
    }

    /**
     * Draw shadow (optional override)
     * @param {CanvasRenderingContext2D} shadowCtx - Shadow canvas context
     */
    drawShadow(shadowCtx) {
        // Optional - subclasses can override if they need shadows
    }
}
