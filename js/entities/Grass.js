// Underwater grass class with swaying animation

import { params, CULL_MARGIN } from '../config.js';
import { rand, hexToHSL, isInView, width, height } from '../utils/helpers.js';

export class Grass {
    constructor(x, y) {
        this.x = x !== undefined ? x : rand(0, width);
        this.y = y !== undefined ? y : rand(0, height);
        this.size = rand(params.grassHeightMin, params.grassHeightMax);
        
        // Parse base color and create variations
        const baseHsl = hexToHSL(params.grassColor);
        this.baseHue = baseHsl.h;
        this.baseSat = baseHsl.s;
        this.baseLig = baseHsl.l;
        
        // Phase offset for this clump's sway animation
        this.phaseOffset = rand(0, Math.PI * 2);
        
        // Generate 5-12 leaves radiating from center (top-down view)
        this.leafCount = Math.floor(rand(5, 13));
        this.leaves = [];
        
        for (let i = 0; i < this.leafCount; i++) {
            // Distribute leaves around the center
            const baseAngle = (i / this.leafCount) * Math.PI * 2 + rand(-0.3, 0.3);
            this.leaves.push({
                angle: baseAngle,
                length: rand(0.5, 1.0),  // Relative to size
                width: rand(0.08, 0.15), // Relative to length
                curve: rand(-0.3, 0.3),  // Curve direction
                hueOffset: rand(-15, 15),
                satOffset: rand(-10, 10),
                ligOffset: rand(-10, 10),
                phaseOffset: rand(0, Math.PI * 2)
            });
        }
    }
    
    draw(ctx, time) {
        // Skip if out of view
        if (!isInView(this.x, this.y, CULL_MARGIN + this.size)) return;
        
        // Gentle rotation sway for the whole clump
        const rotationSway = Math.sin(time * params.grassSwaySpeed + this.phaseOffset) * params.grassSwayAmount * 0.5;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(rotationSway);
        
        for (let leaf of this.leaves) {
            const leafLength = this.size * leaf.length;
            const leafWidth = leafLength * leaf.width;
            
            // Individual leaf sway
            const leafSway = Math.sin(time * params.grassSwaySpeed * 0.8 + leaf.phaseOffset) * params.grassSwayAmount * 0.3;
            const currentAngle = leaf.angle + leafSway;
            
            // Calculate leaf color
            const hue = this.baseHue + leaf.hueOffset;
            const sat = Math.max(0, Math.min(100, this.baseSat + leaf.satOffset));
            const lig = Math.max(0, Math.min(100, this.baseLig + leaf.ligOffset));
            
            ctx.save();
            ctx.rotate(currentAngle);
            
            // Draw elongated leaf shape (top-down view)
            ctx.beginPath();
            
            // Start at center
            ctx.moveTo(0, 0);
            
            // Curved leaf shape using bezier
            const tipX = leafLength;
            const tipY = 0;
            const curveOffset = leafLength * leaf.curve;
            
            // Left edge of leaf
            ctx.quadraticCurveTo(
                leafLength * 0.5, -leafWidth + curveOffset,
                tipX, tipY
            );
            
            // Right edge of leaf back to center
            ctx.quadraticCurveTo(
                leafLength * 0.5, leafWidth + curveOffset,
                0, 0
            );
            
            ctx.closePath();
            
            // Gradient from center (darker) to tip (lighter)
            const gradient = ctx.createLinearGradient(0, 0, leafLength, 0);
            gradient.addColorStop(0, `hsla(${hue}, ${sat}%, ${lig - 8}%, 0.85)`);
            gradient.addColorStop(0.4, `hsla(${hue}, ${sat}%, ${lig}%, 0.8)`);
            gradient.addColorStop(1, `hsla(${hue}, ${sat + 5}%, ${lig + 8}%, 0.6)`);
            
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Subtle center vein line
            ctx.beginPath();
            ctx.moveTo(2, 0);
            ctx.lineTo(leafLength * 0.85, 0);
            ctx.strokeStyle = `hsla(${hue}, ${sat - 10}%, ${lig - 15}%, 0.3)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            ctx.restore();
        }
        
        // Draw small center cluster
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig - 10}%, 0.7)`;
        ctx.fill();
        
        ctx.restore();
    }
}
