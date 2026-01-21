// Stone/Pebble class for pond floor decoration

import { params } from '../config.js';
import { rand, hexToHSL, width, height } from '../utils/helpers.js';

export class Stone {
    constructor() {
        this.x = rand(0, width);
        this.y = rand(0, height);
        this.size = rand(params.stoneSizeMin, params.stoneSizeMax); 
        this.rotation = rand(0, Math.PI);
        
        // Parse base color with variations (like grass/lily pads)
        const color = params.pebbleColors[Math.floor(Math.random() * params.pebbleColors.length)];
        const hsl = hexToHSL(color);
        
        this.hue = hsl.h + rand(-8, 8);
        this.sat = Math.max(0, Math.min(100, hsl.s + rand(-10, 10)));
        this.lig = Math.max(0, Math.min(100, hsl.l + rand(-15, 15)));
        
        // Shape variation for organic look
        this.widthRatio = rand(0.65, 0.85);
        this.irregularity = rand(0.92, 1.0); // How perfect the shape is
        
        // Light source position (offset from center top)
        this.lightOffsetX = rand(-0.2, 0.2);
        this.lightOffsetY = rand(-0.3, -0.15);
        
        // Multi-colored patches (like real stones have different minerals)
        this.patchCount = Math.floor(rand(2, 5));
        this.patches = [];
        for (let i = 0; i < this.patchCount; i++) {
            const angle = rand(0, Math.PI * 2);
            const distance = rand(0, 0.5);
            // Each patch can be a different color from palette or variation
            const patchColorIndex = Math.floor(Math.random() * params.pebbleColors.length);
            const patchHsl = hexToHSL(params.pebbleColors[patchColorIndex]);
            this.patches.push({
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                radius: rand(0.2, 0.45),
                hue: patchHsl.h + rand(-15, 15),
                sat: Math.max(0, Math.min(100, patchHsl.s + rand(-10, 10))),
                lig: Math.max(0, Math.min(100, patchHsl.l + rand(-15, 15))),
                opacity: rand(0.4, 0.7)
            });
        }
        
        // Small speckles (like granite texture)
        this.speckleCount = Math.floor(rand(15, 40));
        this.speckles = [];
        for (let i = 0; i < this.speckleCount; i++) {
            const angle = rand(0, Math.PI * 2);
            const distance = rand(0, 0.85);
            this.speckles.push({
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                radius: rand(0.02, 0.06),
                isLight: Math.random() > 0.5
            });
        }
        
        // Veins/cracks (mineral veins in stone)
        this.veinCount = Math.floor(rand(1, 4));
        this.veins = [];
        for (let i = 0; i < this.veinCount; i++) {
            const startAngle = rand(0, Math.PI * 2);
            const length = rand(0.4, 0.9);
            this.veins.push({
                startX: Math.cos(startAngle) * rand(0, 0.3),
                startY: Math.sin(startAngle) * rand(0, 0.3),
                angle: rand(0, Math.PI * 2),
                length: length,
                width: rand(0.01, 0.03),
                segments: Math.floor(rand(2, 5)),
                isLight: Math.random() > 0.6 // 40% light veins, 60% dark
            });
        }
        
        // Natural striping/banding (sedimentary layers, 30% chance)
        this.hasStripes = Math.random() < 0.3;
        if (this.hasStripes) {
            this.stripeCount = Math.floor(rand(2, 5));
            this.stripeAngle = rand(0, Math.PI);
            this.stripeSpacing = rand(0.2, 0.35);
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        const width = this.size;
        const height = this.size * this.widthRatio;
        
        // Soft underwater shadow (more diffused than in air)
        ctx.save();
        ctx.translate(1.5, 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, width * 0.9, height * 0.9, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)"; // Softer shadow underwater
        ctx.fill();
        ctx.restore();
        
        // Main pebble body with radial gradient for 3D effect
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        
        // Underwater colors: desaturated and blue-shifted
        const underwaterSat = this.sat * 0.6; // Reduce saturation by 40%
        const underwaterHue = this.hue + (190 - this.hue) * 0.15; // Shift slightly toward blue-green
        
        // Radial gradient from light point (top) to shadow (bottom)
        const lightX = width * this.lightOffsetX;
        const lightY = height * this.lightOffsetY;
        const gradientRadius = Math.max(width, height) * 1.3;
        
        const gradient = ctx.createRadialGradient(
            lightX, lightY, 0,
            0, height * 0.3, gradientRadius
        );
        
        // Softer highlights underwater (less contrast)
        gradient.addColorStop(0, `hsla(${underwaterHue}, ${Math.max(0, underwaterSat - 5)}%, ${Math.min(100, this.lig + 15)}%, 0.85)`);
        // Mid-tone base color
        gradient.addColorStop(0.45, `hsla(${underwaterHue}, ${underwaterSat}%, ${this.lig}%, 0.8)`);
        // Softer shadows underwater
        gradient.addColorStop(1, `hsla(${underwaterHue}, ${Math.min(100, underwaterSat + 5)}%, ${Math.max(0, this.lig - 15)}%, 0.75)`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Clip to pebble shape for details
        ctx.save();
        ctx.clip();
        
        // Multi-colored patches (different mineral regions)
        for (let patch of this.patches) {
            const patchX = patch.x * width;
            const patchY = patch.y * height;
            const patchRadius = patch.radius * Math.max(width, height);
            
            // Apply underwater color shift to patches too
            const patchUnderwaterSat = patch.sat * 0.6;
            const patchUnderwaterHue = patch.hue + (190 - patch.hue) * 0.15;
            
            const patchGradient = ctx.createRadialGradient(
                patchX, patchY, 0,
                patchX, patchY, patchRadius
            );
            patchGradient.addColorStop(0, `hsla(${patchUnderwaterHue}, ${patchUnderwaterSat}%, ${patch.lig}%, ${patch.opacity})`);
            patchGradient.addColorStop(0.7, `hsla(${patchUnderwaterHue}, ${patchUnderwaterSat}%, ${patch.lig - 5}%, ${patch.opacity * 0.6})`);
            patchGradient.addColorStop(1, `hsla(${patchUnderwaterHue}, ${patchUnderwaterSat}%, ${patch.lig - 10}%, 0)`);
            
            ctx.beginPath();
            ctx.arc(patchX, patchY, patchRadius, 0, Math.PI * 2);
            ctx.fillStyle = patchGradient;
            ctx.fill();
        }
        
        // Natural banding/striping (sedimentary layers)
        if (this.hasStripes) {
            ctx.save();
            ctx.rotate(this.stripeAngle);
            for (let i = 0; i < this.stripeCount; i++) {
                const offset = (i - this.stripeCount / 2) * this.stripeSpacing * width;
                ctx.beginPath();
                ctx.rect(-width * 1.5, offset - height * 0.04, width * 3, height * 0.08);
                ctx.fillStyle = `hsla(${underwaterHue}, ${underwaterSat}%, ${this.lig - 12}%, 0.25)`;
                ctx.fill();
            }
            ctx.restore();
        }
        
        // Veins and cracks (mineral veins)
        for (let vein of this.veins) {
            ctx.save();
            ctx.translate(vein.startX * width, vein.startY * height);
            ctx.rotate(vein.angle);
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            
            // Draw vein as segmented line with slight curves
            const segmentLength = (vein.length * Math.max(width, height)) / vein.segments;
            let currentX = 0;
            let currentY = 0;
            
            for (let i = 0; i < vein.segments; i++) {
                const nextX = currentX + segmentLength;
                const nextY = currentY + rand(-segmentLength * 0.2, segmentLength * 0.2);
                const controlX = currentX + segmentLength * 0.5;
                const controlY = currentY + rand(-segmentLength * 0.15, segmentLength * 0.15);
                ctx.quadraticCurveTo(controlX, controlY, nextX, nextY);
                currentX = nextX;
                currentY = nextY;
            }
            
            const veinLig = vein.isLight ? this.lig + 15 : this.lig - 18;
            ctx.strokeStyle = `hsla(${underwaterHue}, ${underwaterSat * 0.7}%, ${veinLig}%, 0.4)`;
            ctx.lineWidth = vein.width * this.size;
            ctx.stroke();
            ctx.restore();
        }
        
        // Small speckles (granite-like texture)
        for (let speckle of this.speckles) {
            const speckleX = speckle.x * width;
            const speckleY = speckle.y * height;
            const speckleRadius = speckle.radius * this.size;
            
            ctx.beginPath();
            ctx.arc(speckleX, speckleY, speckleRadius, 0, Math.PI * 2);
            
            if (speckle.isLight) {
                ctx.fillStyle = `hsla(${underwaterHue}, ${underwaterSat * 0.5}%, ${this.lig + 20}%, 0.5)`;
            } else {
                ctx.fillStyle = `hsla(${underwaterHue}, ${underwaterSat}%, ${this.lig - 25}%, 0.6)`;
            }
            ctx.fill();
        }
        
        ctx.restore(); // End clip
        
        // Underwater caustic light patterns (shimmering effect)
        const causticX = lightX + Math.sin(Date.now() * 0.001 + this.x) * width * 0.1;
        const causticY = lightY + Math.cos(Date.now() * 0.0015 + this.y) * height * 0.1;
        const causticSize = Math.min(width, height) * 0.35;
        
        const causticGradient = ctx.createRadialGradient(
            causticX, causticY, 0,
            causticX, causticY, causticSize
        );
        causticGradient.addColorStop(0, `rgba(200, 230, 255, 0.25)`); // Soft blue-white
        causticGradient.addColorStop(0.5, `rgba(180, 220, 250, 0.1)`);
        causticGradient.addColorStop(1, `rgba(180, 220, 250, 0)`);
        
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.fillStyle = causticGradient;
        ctx.fill();
        
        // Subtle underwater highlight (less intense than in air)
        const highlightX = lightX * 0.7;
        const highlightY = lightY * 0.7;
        const highlightSize = Math.min(width, height) * 0.2;
        
        const highlightGradient = ctx.createRadialGradient(
            highlightX, highlightY, 0,
            highlightX, highlightY, highlightSize
        );
        highlightGradient.addColorStop(0, `rgba(220, 240, 255, 0.2)`); // Soft bluish highlight
        highlightGradient.addColorStop(0.6, `rgba(220, 240, 255, 0.08)`);
        highlightGradient.addColorStop(1, `rgba(220, 240, 255, 0)`);
        
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.fillStyle = highlightGradient;
        ctx.fill();
        
        // Very subtle edge definition (softer underwater)
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${underwaterHue}, ${underwaterSat}%, ${this.lig - 20}%, 0.2)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        
        // Blue-green water tint overlay
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 150, 180, 0.15)`; // Subtle water color overlay
        ctx.fill();
        
        ctx.restore();
    }
}
