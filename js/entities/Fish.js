// Base Fish class for all fish-like entities
// Extends Entity and adds spine system, swim animation, and common fish behaviors

import { Entity } from './Entity.js';
import { Vector } from '../utils/Vector.js';
import { Chain } from '../utils/Chain.js';
import { params } from '../config.js';
import { rand } from '../utils/helpers.js';
import { simplifyAngle, angleDifference } from '../utils/AngleUtils.js';

const PI = Math.PI;
const TWO_PI = Math.PI * 2;

export class Fish extends Entity {
    constructor(x, y) {
        super(x, y);
        
        // Initialize velocity
        this.vel = Vector.fromAngle(rand(0, TWO_PI));
        
        // Fish-specific properties
        this.baseSpeed = 1.0;
        this.scale = 1.0;
        this.size = 10;
        
        // Chain-based spine system
        const spineCount = params.spineCount || 12;
        const linkSize = 16 * this.scale;
        const trailAngle = this.vel.heading() + PI;
        this.spine = new Chain(this.pos, spineCount, linkSize, PI / 3, trailAngle);
        this.spineLength = spineCount;
        
        // Smoothed velocity for angle calculation (reduces jitter)
        this.smoothedVel = new Vector(this.vel.x, this.vel.y);
        
        // Track current head angle to prevent sudden 360 rotations
        this.currentHeadAngle = simplifyAngle(this.vel.heading());
        
        // Swim phase for wiggle animation
        this.swimPhase = rand(0, TWO_PI);
        this.swimTimer = Math.random() * (params.fishInitialSwimTimer || 100);
        
        // Fins animation
        this.finsAngle = 0;
    }

    /**
     * Get dynamic width at spine index i
     * @param {number} i - Spine index
     * @returns {number} Width at that index
     */
    getDynamicWidth(i) {
        const baseW = params.fishShape[i] !== undefined ? params.fishShape[i] : 10;
        const bodyWidth = params.bodyWidth || 0.4;
        return baseW * this.scale * 0.6 * bodyWidth;
    }

    /**
     * Update spine system based on current velocity
     * @param {number} dt - Delta time
     */
    updateSpine(dt) {
        const scale = dt * 60;
        const smoothedSpeed = this.smoothedVel.mag();
        
        if (smoothedSpeed > 0.01) {
            const targetAngle = this.smoothedVel.heading();
            // Use shortest path to prevent 360 degree rotations
            const angleDiff = angleDifference(targetAngle, this.currentHeadAngle);
            // Smoothly transition (0.2 is the smoothing factor)
            this.currentHeadAngle = simplifyAngle(this.currentHeadAngle + angleDiff * 0.2);
            this.spine.angles[0] = this.currentHeadAngle;
        }
        
        this.spine.resolve(this.pos);
    }

    /**
     * Update smoothed velocity
     * @param {number} dt - Delta time
     */
    updateSmoothedVelocity(dt) {
        const scale = dt * 60;
        const smoothFactor = 0.3; // How much to blend (0.3 = 30% new, 70% old)
        this.smoothedVel.x = this.smoothedVel.x * (1 - smoothFactor) + this.vel.x * smoothFactor;
        this.smoothedVel.y = this.smoothedVel.y * (1 - smoothFactor) + this.vel.y * smoothFactor;
    }

    /**
     * Update swim animation
     * @param {number} dt - Delta time
     */
    updateSwimAnimation(dt) {
        const scale = dt * 60;
        let speed = this.vel.mag();
        this.swimTimer += (params.waveSpeedBase + (speed * params.waveSpeedMult)) * scale;
        this.swimPhase += (0.15 + (speed * 0.05)) * (params.wiggle || 0.2) * scale;
        this.finsAngle = this.swimTimer;
    }

    /**
     * Override update to include fish-specific updates
     * @param {number} dt - Delta time
     */
    update(dt) {
        // Call parent update for basic physics
        super.update(dt);
        
        // Update smoothed velocity
        this.updateSmoothedVelocity(dt);
        
        // Update spine
        this.updateSpine(dt);
        
        // Update swim animation
        this.updateSwimAnimation(dt);
    }

    /**
     * Override seek to work with Vector or {x, y} objects
     * @param {Object|Vector} target - Target position
     * @param {number} speedMult - Speed multiplier
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
}
