// Ripple water effect class

export class Ripple {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 1;
        this.maxRadius = 180;
        this.opacity = 0.8;
        this.speed = 1.5;
        this.life = 120;
    }

    update(dt = 1/60) {
        const scale = dt * 60; // Normalize to 60 FPS
        this.radius += this.speed * scale;
        this.opacity -= 0.008 * scale;
        this.life -= scale;
    }

    draw(ctx) {
        if (this.opacity <= 0) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
