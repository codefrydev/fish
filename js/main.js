// Main Entry Point - Zen Koi Pond Screensaver
// Coordinates all modules and initializes the application

import { params } from './config.js';
import { setDimensions, width, height, rand, dist } from './utils/helpers.js';
import { Vector } from './utils/Vector.js';
import { fishGrid } from './utils/SpatialGrid.js';
import { ripplePool, foodPool } from './systems/ObjectPool.js';
import { Stone } from './entities/Stone.js';
import { Grass } from './entities/Grass.js';
import { LilyPad } from './entities/LilyPad.js';
import { Frog, setAddRippleFunction as setFrogAddRipple } from './entities/Frog.js';
import { Koi, setMainContext, setAddRippleFunction as setKoiAddRipple } from './entities/Koi.js';
import { PredatorFish } from './entities/PredatorFish.js';
import { initCanvases, resize, renderStaticBackground, animate, setEntities } from './managers/RenderManager.js';
import { initUI } from './ui/UIManager.js';

// Entity arrays
let fish = [];
let predators = [];
let pads = [];
let stones = [];
let frogs = [];
let grass = [];

// Stats
let birthCount = { count: 0 };

// Initialize environment (stones, lily pads, grass, frogs)
function initEnvironment() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Rebuild stones and pads based on params
    stones = []; 
    // Calculate density relative to screen size
    let area = (w * h);
    // Base unit: configurable pixels squared
    let stoneCount = Math.floor((area / params.stoneDensityBase) * (params.stoneDensity / 100));
    for(let i = 0; i < stoneCount; i++) stones.push(new Stone());

    pads = [];
    frogs = []; // Reset frogs
    let padCount = params.padDensity;
    
    let clusters = [];
    if (params.padFormation === 'clumped') {
        for(let j = 0; j < Math.floor(rand(params.padClusterCountMin, params.padClusterCountMax)); j++) {
            clusters.push({x: rand(100, w-100), y: rand(100, h-100)});
        }
    }

    for(let i = 0; i < padCount; i++){
        let x, y;
        if (params.padFormation === 'random') {
            x = rand(0, w);
            y = rand(0, h);
        } else if (params.padFormation === 'ring') {
            let angle = rand(0, Math.PI * 2);
            let r = Math.min(w, h) * params.padRingRadiusMult + rand(params.padRingVariationMin, params.padRingVariationMax);
            x = w/2 + Math.cos(angle) * r;
            y = h/2 + Math.sin(angle) * r;
        } else if (params.padFormation === 'clumped') {
            if (clusters.length > 0) {
                let c = clusters[Math.floor(rand(0, clusters.length))];
                let offsetR = rand(0, params.padClumpedOffsetRange); 
                let offsetA = rand(0, Math.PI * 2);
                x = c.x + Math.cos(offsetA) * offsetR;
                y = c.y + Math.sin(offsetA) * offsetR;
            } else {
                x = rand(0, w); y = rand(0, h);
            }
        } else if (params.padFormation === 'edges') {
            if (Math.random() < 0.5) {
                x = Math.random() < 0.5 ? rand(0, 150) : rand(w-150, w);
                y = rand(0, h);
            } else {
                x = rand(0, w);
                y = Math.random() < 0.5 ? rand(0, 150) : rand(h-150, h);
            }
        }
        pads.push(new LilyPad(x, y));
    }
    
    // Initialize grass near lily pads
    grass = [];
    if (pads.length > 0) {
        let grassPerPad = Math.ceil(params.grassDensity / pads.length);
        pads.forEach(pad => {
            for (let i = 0; i < grassPerPad; i++) {
                // Spawn grass in a ring around the lily pad
                let angle = rand(0, Math.PI * 2);
                let distance = pad.radius + rand(10, 60);
                let gx = pad.x + Math.cos(angle) * distance;
                let gy = pad.y + Math.sin(angle) * distance;
                // Keep grass in bounds
                gx = Math.max(10, Math.min(w - 10, gx));
                gy = Math.max(10, Math.min(h - 10, gy));
                grass.push(new Grass(gx, gy));
            }
        });
    }
    
    // Spawn initial frogs
    pads.forEach(p => {
        if (!p.hasFlower && !p.hasFrog && Math.random() < params.frogChance) {
            frogs.push(new Frog(p));
        }
    });
    
    // Update entity references
    updateEntityReferences();
    
    renderStaticBackground();
}

// Initialize fish
function initFish() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    fish = [];
    for (let i = 0; i < params.fishCount; i++) {
        fish.push(new Koi(rand(w/2 - 100, w/2 + 100), rand(h/2 - 100, h/2 + 100)));
    }
    
    // Update entity references
    updateEntityReferences();
}

// Initialize predators
function initPredators() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    predators = [];
    for (let i = 0; i < params.predatorCount; i++) {
        // Spawn predators near edges
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? rand(50, 150) : rand(w - 150, w - 50);
            y = rand(100, h - 100);
        } else {
            x = rand(100, w - 100);
            y = Math.random() < 0.5 ? rand(50, 150) : rand(h - 150, h - 50);
        }
        predators.push(new PredatorFish(x, y));
    }
    
    // Update entity references
    updateEntityReferences();
}

// Update entity references in RenderManager
function updateEntityReferences() {
    setEntities({ fish, predators, pads, stones, frogs, grass }, birthCount);
}

// Add ripple and scatter nearby fish
function addRipple(x, y) {
    ripplePool.acquire(x, y);
    // Use spatial grid for efficient fish lookup
    const nearbyFish = fishGrid.getNearby(x, y, 200);
    for (const f of nearbyFish) {
        const dx = f.pos.x - x;
        const dy = f.pos.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 40000 && distSq > 0) { // 200 * 200
            const d = Math.sqrt(distSq);
            let flee = new Vector(dx / d, dy / d);
            flee.mult(2);
            f.applyForce(flee);
        }
    }
}

// Handle click/touch interaction
function handleInteraction(x, y) {
    let hitFrog = false;
    // Check frog click
    for (let f of frogs) {
        if (f.state !== 'DIVING' && dist(x, y, f.pos.x, f.pos.y) < f.size * 2) {
            f.scare();
            hitFrog = true;
            break; // One at a time
        }
    }
    
    if (!hitFrog) {
        addRipple(x, y);
    }
}

// Initialize everything
function init() {
    // Initialize canvases
    initCanvases();
    
    // Set dimensions
    setDimensions(window.innerWidth, window.innerHeight);
    
    // Set up addRipple functions for entities
    setFrogAddRipple(addRipple);
    setKoiAddRipple(addRipple);
    
    // Resize canvases
    resize(() => {
        initEnvironment();
        renderStaticBackground();
    });
    
    // Initialize entities
    initFish();
    initPredators();
    
    // Initialize UI
    initUI({
        initFish,
        initEnvironment,
        initPredators,
        renderStaticBackground
    });
    
    // Start animation
    requestAnimationFrame((t) => animate(t, addRipple));
}

// Event listeners
window.addEventListener('resize', () => {
    resize(() => {
        initEnvironment();
        renderStaticBackground();
    });
});

window.addEventListener('click', e => {
    if(e.target.closest('#controls') || e.target.closest('#menu-btn')) return;
    handleInteraction(e.clientX, e.clientY);
});

window.addEventListener('dblclick', e => {
    if(e.target.closest('#controls') || e.target.closest('#menu-btn')) return;
    for(let i=0; i<3; i++) {
        foodPool.acquire(e.clientX + rand(-20, 20), e.clientY + rand(-20, 20));
    }
});

window.addEventListener('touchstart', e => {
    if(e.target.closest('#controls') || e.target.closest('#menu-btn')) return;
    for (let i = 0; i < e.touches.length; i++) {
        handleInteraction(e.touches[i].clientX, e.touches[i].clientY);
    }
});

window.addEventListener('mousemove', e => {
    if(Math.random() < 0.05) {
       // Optional: small trail interaction
    }
});

// Start the application
init();
