// Stone/Pebble class for pond floor decoration

import { params } from '../config.js';
import { rand, hexToHSL, width, height } from '../utils/helpers.js';

export class Stone {
    constructor() {
        this.x = rand(0, width);
        this.y = rand(0, height);
        this.size = rand(params.stoneSizeMin, params.stoneSizeMax); 
        this.rotation = rand(0, Math.PI);
        
        const color = params.pebbleColors[Math.floor(Math.random() * params.pebbleColors.length)];
        const hsl = hexToHSL(color);
        
        this.hue = hsl.h + rand(-5, 5);
        this.sat = Math.max(0, Math.min(100, hsl.s + rand(-5, 5)));
        this.lig = Math.max(0, Math.min(100, hsl.l + rand(-5, 5)));
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 0.75, 0, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${this.hue}, ${this.sat}%, ${this.lig}%)`;
        ctx.fill();
        ctx.restore();
    }
}
