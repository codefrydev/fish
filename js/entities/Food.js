// Food pellet class

import { Vector } from '../utils/Vector.js';
import { params } from '../config.js';
import { rand } from '../utils/helpers.js';

export class Food {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.size = params.foodSize * rand(params.foodSizeVariationMin, params.foodSizeVariationMax);
        this.eaten = false;
        this.vel = new Vector(
            rand(params.foodVelocityMin, params.foodVelocityMax), 
            rand(params.foodVelocityMin, params.foodVelocityMax)
        );
    }

    update(dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        this.pos.x += this.vel.x * scale;
        this.pos.y += this.vel.y * scale;
    }

    draw(ctx) {
        if(this.eaten) return;
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fillStyle = params.foodColor;
        ctx.fill();
        ctx.restore();
    }
}
