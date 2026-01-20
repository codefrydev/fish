// Lily Pad class with optional flowers

import { params } from '../config.js';
import { rand, hexToHSL, width, height } from '../utils/helpers.js';

export class LilyPad {
    constructor(x, y) {
        this.x = x !== undefined ? x : rand(0, width);
        this.y = y !== undefined ? y : rand(0, height);
        this.radius = rand(params.padSizeMin, params.padSizeMax); 
        this.rotation = rand(0, Math.PI * 2);
        
        const hsl = hexToHSL(params.padColor);
        this.baseHue = hsl.h + rand(params.padHueVariationMin, params.padHueVariationMax);
        this.baseSat = hsl.s;
        this.baseLig = hsl.l;
        
        this.notchAngle = rand(params.padNotchAngleMin, params.padNotchAngleMax);
        this.hasFlower = Math.random() < params.flowerChance;
        this.flowerColor = params.flowerColors[Math.floor(Math.random() * params.flowerColors.length)];
        
        this.hasFrog = false; 
        this.budRotation = rand(0, Math.PI * 2); 
        
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

        ctx.save();
        ctx.translate(5, 5);
        ctx.beginPath();
        ctx.moveTo(0, 0); 
        ctx.arc(0, 0, this.radius, startAngle, endAngle);
        ctx.lineTo(0, 0); 
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, this.radius, startAngle, endAngle);
        ctx.lineTo(0, 0);
        ctx.fillStyle = `hsl(${this.baseHue}, ${this.baseSat}%, ${this.baseLig}%)`;
        ctx.fill();
        
        ctx.strokeStyle = `hsla(${this.baseHue}, ${this.baseSat}%, ${this.baseLig + 15}%, 0.4)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        const visibleArc = endAngle - startAngle;
        const veinCount = params.padVeinCount;
        
        for(let i = 0; i < veinCount; i++) {
             let a = startAngle + visibleArc * ((i + 1) / (veinCount + 1));
             ctx.moveTo(0,0);
             ctx.lineTo(Math.cos(a)*(this.radius*params.padVeinLengthRatio), Math.sin(a)*(this.radius*params.padVeinLengthRatio));
        }
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
