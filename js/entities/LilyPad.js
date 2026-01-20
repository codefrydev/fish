// Lily Pad class with optional flowers

import { params } from '../config.js';
import { rand, hexToHSL, width, height } from '../utils/helpers.js';

export class LilyPad {
    constructor(x, y) {
        this.x = x !== undefined ? x : rand(0, width);
        this.y = y !== undefined ? y : rand(0, height);
        this.radius = rand(params.padSizeMin, params.padSizeMax); 
        this.rotation = rand(0, Math.PI * 2);
        
        // Parse base color and create variations (like grass)
        const baseHsl = hexToHSL(params.padColor);
        this.baseHue = baseHsl.h + rand(params.padHueVariationMin, params.padHueVariationMax);
        this.baseSat = baseHsl.s + rand(-5, 5);
        this.baseLig = baseHsl.l + rand(-8, 8);
        
        this.notchAngle = rand(params.padNotchAngleMin, params.padNotchAngleMax);
        this.hasFlower = Math.random() < params.flowerChance;
        this.flowerColor = params.flowerColors[Math.floor(Math.random() * params.flowerColors.length)];
        
        this.hasFrog = false; 
        this.budRotation = rand(0, Math.PI * 2);
        
        // Generate surface spots for texture variation
        this.spotCount = Math.floor(rand(3, 8));
        this.spots = [];
        for (let i = 0; i < this.spotCount; i++) {
            const angle = rand(0, Math.PI * 2);
            const distance = rand(0.2, 0.7) * this.radius;
            this.spots.push({
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                radius: rand(this.radius * 0.08, this.radius * 0.18),
                hueOffset: rand(-15, 15),
                ligOffset: rand(-12, 8),
                opacity: rand(0.15, 0.35)
            });
        }
        
        // Generate vein properties for curved organic veins
        this.veinProps = [];
        const veinCount = params.padVeinCount;
        for (let i = 0; i < veinCount; i++) {
            this.veinProps.push({
                curveAmount: rand(-0.15, 0.15),
                widthVariation: rand(0.8, 1.3),
                lengthVariation: rand(0.9, 1.0)
            });
        }
        
        if (this.hasFlower) {
            if (params.flowerType === 'mixed') {
                const r = Math.random();
                if (r < params.flowerMixedLotusProb) this.type = 'lotus';
                else if (r < params.flowerMixedLilyProb) this.type = 'lily';
                else this.type = 'bud';
            } else {
                this.type = params.flowerType;
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        const splitSize = params.padSplitSize;
        const startAngle = splitSize / 2;
        const endAngle = Math.PI * 2 - splitSize / 2;

        // Shadow (keep existing)
        ctx.save();
        ctx.translate(5, 5);
        ctx.beginPath();
        ctx.moveTo(0, 0); 
        ctx.arc(0, 0, this.radius, startAngle, endAngle);
        ctx.lineTo(0, 0); 
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fill();
        ctx.restore();

        // Main pad shape with radial gradient for depth
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, this.radius, startAngle, endAngle);
        ctx.lineTo(0, 0);
        
        // Radial gradient from center (lighter) to edge (darker)
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, `hsla(${this.baseHue}, ${this.baseSat + 8}%, ${this.baseLig + 12}%, 1)`);
        gradient.addColorStop(0.5, `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig}%, 1)`);
        gradient.addColorStop(1, `hsla(${this.baseHue}, ${this.baseSat - 5}%, ${this.baseLig - 12}%, 0.95)`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Surface texture spots/patches
        for (let spot of this.spots) {
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, spot.radius, 0, Math.PI * 2);
            const spotHue = this.baseHue + spot.hueOffset;
            const spotLig = Math.max(0, Math.min(100, this.baseLig + spot.ligOffset));
            ctx.fillStyle = `hsla(${spotHue}, ${this.baseSat}%, ${spotLig}%, ${spot.opacity})`;
            ctx.fill();
        }
        
        // Organic curved veins with gradients
        const visibleArc = endAngle - startAngle;
        const veinCount = params.padVeinCount;
        
        for(let i = 0; i < veinCount; i++) {
            const veinProp = this.veinProps[i];
            const a = startAngle + visibleArc * ((i + 1) / (veinCount + 1));
            const veinLength = this.radius * params.padVeinLengthRatio * veinProp.lengthVariation;
            
            const endX = Math.cos(a) * veinLength;
            const endY = Math.sin(a) * veinLength;
            
            // Control point for curve (perpendicular offset)
            const midX = endX * 0.5;
            const midY = endY * 0.5;
            const perpX = -Math.sin(a) * this.radius * veinProp.curveAmount;
            const perpY = Math.cos(a) * this.radius * veinProp.curveAmount;
            
            // Draw main vein with gradient stroke
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(midX + perpX, midY + perpY, endX, endY);
            
            const veinGradient = ctx.createLinearGradient(0, 0, endX, endY);
            veinGradient.addColorStop(0, `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig - 20}%, 0.5)`);
            veinGradient.addColorStop(1, `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig - 10}%, 0.3)`);
            
            ctx.strokeStyle = veinGradient;
            ctx.lineWidth = 1.2 * veinProp.widthVariation;
            ctx.stroke();
            
            // Highlight on one side of vein for dimension
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(midX + perpX, midY + perpY, endX, endY);
            ctx.strokeStyle = `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig + 15}%, 0.25)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
        
        // Edge highlight for depth
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.95, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${this.baseHue}, ${this.baseSat + 10}%, ${this.baseLig + 18}%, 0.3)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Subtle darker edge
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.98, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig - 15}%, 0.4)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (this.hasFrog) {
            // Frog is drawn by the Frog object
        }
        else if (this.hasFlower) {
            this.drawFlower(ctx);
        }

        ctx.restore();
    }

    drawFlower(ctx) {
        if (this.type === 'lotus') {
            const petalCount = params.lotusOuterPetalCount;
            for(let j=0; j<petalCount; j++) {
                ctx.save();
                ctx.rotate((Math.PI * 2 / petalCount) * j);
                ctx.beginPath();
                ctx.ellipse(params.lotusOuterPetalRadius, 0, params.lotusOuterPetalWidth, params.lotusOuterPetalHeight, 0, 0, Math.PI*2);
                ctx.fillStyle = this.flowerColor;
                ctx.fill();
                ctx.restore();
            }
            ctx.beginPath();
            ctx.arc(0, 0, params.lotusCenterRadius, 0, Math.PI*2);
            ctx.fillStyle = '#ffce00';
            ctx.fill();
            
        } else if (this.type === 'lily') {
            const petals = params.lilyPetalCount;
            for(let j=0; j<petals; j++) {
                ctx.save();
                ctx.rotate((Math.PI * 2 / petals) * j);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(8, -4, 18, 0); 
                ctx.quadraticCurveTo(8, 4, 0, 0);
                ctx.fillStyle = this.flowerColor;
                ctx.fill();
                ctx.restore();
            }
            ctx.beginPath();
            ctx.arc(0, 0, params.lilyCenterRadius, 0, Math.PI*2);
            ctx.fillStyle = '#ffeb3b';
            ctx.fill();
            
        } else if (this.type === 'bud') {
            ctx.save();
            ctx.rotate(this.budRotation);
            ctx.beginPath();
            ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI*2);
            ctx.fillStyle = `hsl(${this.baseHue}, ${this.baseSat - 10}%, ${this.baseLig + 10}%)`;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, -2, 3, 5, 0, 0, Math.PI*2);
            ctx.fillStyle = this.flowerColor;
            ctx.fill();
            ctx.restore();
        }
    }
}
