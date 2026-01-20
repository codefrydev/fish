// Object Pooling System for efficient memory management

import { params } from '../config.js';

export class ObjectPool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];
        
        // Pre-allocate objects
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }
    
    acquire(...args) {
        let obj = this.pool.pop();
        if (!obj) {
            obj = this.createFn();
        }
        this.resetFn(obj, ...args);
        this.active.push(obj);
        return obj;
    }
    
    release(obj) {
        const idx = this.active.indexOf(obj);
        if (idx !== -1) {
            this.active.splice(idx, 1);
            this.pool.push(obj);
        }
    }
    
    releaseAll() {
        while (this.active.length > 0) {
            this.pool.push(this.active.pop());
        }
    }
    
    getActive() {
        return this.active;
    }
    
    getActiveCount() {
        return this.active.length;
    }
}

// Ripple Pool
export const ripplePool = new ObjectPool(
    () => ({ x: 0, y: 0, radius: 1, maxRadius: 180, opacity: 0.8, speed: 1.5, life: 120, active: false }),
    (ripple, x, y, radius = 1, maxRadius = 180, speed = 1.5) => {
        ripple.x = x;
        ripple.y = y;
        ripple.radius = radius;
        ripple.maxRadius = maxRadius;
        ripple.opacity = 0.8;
        ripple.speed = speed;
        ripple.life = 120;
        ripple.active = true;
    },
    50
);

// Food Pool
export const foodPool = new ObjectPool(
    () => ({ pos: { x: 0, y: 0 }, size: 4, eaten: false, vel: { x: 0, y: 0 }, active: false }),
    (food, x, y) => {
        food.pos.x = x;
        food.pos.y = y;
        food.size = params.foodSize * (params.foodSizeVariationMin + Math.random() * (params.foodSizeVariationMax - params.foodSizeVariationMin));
        food.eaten = false;
        food.vel.x = params.foodVelocityMin + Math.random() * (params.foodVelocityMax - params.foodVelocityMin);
        food.vel.y = params.foodVelocityMin + Math.random() * (params.foodVelocityMax - params.foodVelocityMin);
        food.active = true;
    },
    100
);

// Pooled update/draw functions for ripples
export function updatePooledRipple(ripple, dt = 1/60) {
    const scale = dt * 60;
    ripple.radius += ripple.speed * scale;
    ripple.opacity -= 0.008 * scale;
    ripple.life -= scale;
    return ripple.life > 0 && ripple.opacity > 0;
}

export function drawPooledRipple(ripple, ctx) {
    if (ripple.opacity <= 0) return;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${ripple.opacity * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Pooled update/draw functions for food
export function updatePooledFood(food, dt = 1/60) {
    const scale = dt * 60;
    food.pos.x += food.vel.x * scale;
    food.pos.y += food.vel.y * scale;
}

export function drawPooledFood(food, ctx) {
    if (food.eaten) return;
    ctx.save();
    ctx.translate(food.pos.x, food.pos.y);
    ctx.beginPath();
    ctx.arc(0, 0, food.size, 0, Math.PI * 2);
    ctx.fillStyle = params.foodColor;
    ctx.fill();
    ctx.restore();
}
