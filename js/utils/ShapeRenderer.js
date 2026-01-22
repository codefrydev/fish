// Shape rendering helpers (Processing-style)
// Encapsulates shape vertex state for drawing complex shapes

export class ShapeRenderer {
    constructor() {
        this.shapeVertices = [];
    }

    beginShape() {
        this.shapeVertices = [];
    }

    vertex(x, y) {
        this.shapeVertices.push({ x, y, type: 'vertex' });
    }

    curveVertex(x, y) {
        this.shapeVertices.push({ x, y, type: 'curve' });
    }

    bezierVertex(cx1, cy1, cx2, cy2, x, y) {
        this.shapeVertices.push({ cx1, cy1, cx2, cy2, x, y, type: 'bezier' });
    }

    endShape(ctx, fillStyle, patternCallback) {
        if (this.shapeVertices.length === 0) return;
        ctx.beginPath();
        
        let isSpline = this.shapeVertices.some(v => v.type === 'curve');

        if (isSpline && this.shapeVertices.length >= 4) {
            ctx.moveTo(this.shapeVertices[1].x, this.shapeVertices[1].y);
            for (let i = 1; i < this.shapeVertices.length - 2; i++) {
                let p0 = this.shapeVertices[i - 1];
                let p1 = this.shapeVertices[i];
                let p2 = this.shapeVertices[i + 1];
                let p3 = this.shapeVertices[i + 2];
                
                let cp1x = p1.x + (p2.x - p0.x) / 6;
                let cp1y = p1.y + (p2.y - p0.y) / 6;
                let cp2x = p2.x - (p3.x - p1.x) / 6;
                let cp2y = p2.y - (p3.y - p1.y) / 6;
                
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
        } else {
            ctx.moveTo(this.shapeVertices[0].x, this.shapeVertices[0].y);
            for (let i = 1; i < this.shapeVertices.length; i++) {
                let v = this.shapeVertices[i];
                if (v.type === 'bezier') {
                    ctx.bezierCurveTo(v.cx1, v.cy1, v.cx2, v.cy2, v.x, v.y);
                } else {
                    ctx.lineTo(v.x, v.y);
                }
            }
        }
        
        ctx.closePath();
        
        // Main Fill
        if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }

        // Render Patterns (Spots) clipped to the fish body
        if (patternCallback) {
            ctx.save();
            ctx.clip(); 
            patternCallback();
            ctx.restore();
        }
    }
}

// Create a singleton instance for backward compatibility
// This allows existing code to use the functions directly
let globalShapeRenderer = new ShapeRenderer();

export function beginShape() {
    globalShapeRenderer.beginShape();
}

export function vertex(x, y) {
    globalShapeRenderer.vertex(x, y);
}

export function curveVertex(x, y) {
    globalShapeRenderer.curveVertex(x, y);
}

export function bezierVertex(cx1, cy1, cx2, cy2, x, y) {
    globalShapeRenderer.bezierVertex(cx1, cy1, cx2, cy2, x, y);
}

export function endShape(ctx, fillStyle, patternCallback) {
    globalShapeRenderer.endShape(ctx, fillStyle, patternCallback);
}
