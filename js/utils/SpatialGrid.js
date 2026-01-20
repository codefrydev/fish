// Spatial Grid for Efficient Distance Queries

export class SpatialGrid {
    constructor(cellSize = 100) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }
    
    // Get cell key from coordinates
    getKey(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }
    
    // Clear the grid
    clear() {
        this.grid.clear();
    }
    
    // Insert an object into the grid
    insert(obj, x, y) {
        const key = this.getKey(x, y);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(obj);
    }
    
    // Get all objects within range of a point
    getNearby(x, y, range) {
        const results = [];
        const cellRange = Math.ceil(range / this.cellSize);
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        
        // Check all cells within range
        for (let dx = -cellRange; dx <= cellRange; dx++) {
            for (let dy = -cellRange; dy <= cellRange; dy++) {
                const key = `${cx + dx},${cy + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    results.push(...cell);
                }
            }
        }
        
        return results;
    }
    
    // Get objects within range that pass a filter (more efficient)
    getNearbyFiltered(x, y, range, filterFn) {
        const results = [];
        const cellRange = Math.ceil(range / this.cellSize);
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const rangeSq = range * range;
        
        for (let dx = -cellRange; dx <= cellRange; dx++) {
            for (let dy = -cellRange; dy <= cellRange; dy++) {
                const key = `${cx + dx},${cy + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const obj of cell) {
                        if (filterFn(obj)) {
                            const objX = obj.pos ? obj.pos.x : obj.x;
                            const objY = obj.pos ? obj.pos.y : obj.y;
                            const distSq = (objX - x) ** 2 + (objY - y) ** 2;
                            if (distSq <= rangeSq) {
                                results.push({ obj, distSq });
                            }
                        }
                    }
                }
            }
        }
        
        return results;
    }
}

// Create spatial grids for different entity types
export const fishGrid = new SpatialGrid(100);
export const foodGrid = new SpatialGrid(150);
export const predatorGrid = new SpatialGrid(200);
