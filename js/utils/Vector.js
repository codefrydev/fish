// Vector class for 2D math operations

export class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    add(v) { 
        this.x += v.x; 
        this.y += v.y; 
        return this; 
    }
    
    sub(v) { 
        this.x -= v.x; 
        this.y -= v.y; 
        return this; 
    }
    
    mult(n) { 
        this.x *= n; 
        this.y *= n; 
        return this; 
    }
    
    div(n) { 
        this.x /= n; 
        this.y /= n; 
        return this; 
    }
    
    mag() { 
        return Math.sqrt(this.x * this.x + this.y * this.y); 
    }
    
    normalize() {
        let m = this.mag();
        if (m !== 0) this.mult(1 / m);
        return this;
    }
    
    limit(max) {
        if (this.mag() > max) {
            this.normalize();
            this.mult(max);
        }
        return this;
    }
}
