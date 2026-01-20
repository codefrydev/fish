// Render Manager - handles all rendering and canvas operations

import { params, CULL_MARGIN } from '../config.js';
import { setDimensions, isInView, rand } from '../utils/helpers.js';
import { fishGrid, foodGrid, predatorGrid } from '../utils/SpatialGrid.js';
import { ripplePool, foodPool, updatePooledRipple, drawPooledRipple, updatePooledFood, drawPooledFood } from '../systems/ObjectPool.js';
import { performanceManager } from '../systems/PerformanceManager.js';
import { setMainContext, Koi } from '../entities/Koi.js';
import { Frog } from '../entities/Frog.js';

// Canvas references
let canvas, ctx;
let bgCanvas, bgCtx;
let shadowCanvas, shadowCtx;
let lastShadowUpdate = 0;

// Entity references (set via setEntities)
let entities = null;
let birthCountRef = { count: 0 };

// Initialize canvases
export function initCanvases() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    bgCanvas = document.createElement('canvas');
    bgCtx = bgCanvas.getContext('2d');
    
    shadowCanvas = document.createElement('canvas');
    shadowCtx = shadowCanvas.getContext('2d');
    
    // Set main context for Koi drawing
    setMainContext(ctx);
    
    return { canvas, ctx, bgCanvas, bgCtx, shadowCanvas, shadowCtx };
}

// Set entity references
export function setEntities(entitiesRef, birthCountReference) {
    entities = entitiesRef;
    birthCountRef = birthCountReference;
}

// Get canvas context
export function getContext() {
    return ctx;
}

// Resize canvases
export function resize(initEnvironmentCallback) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    canvas.width = w;
    canvas.height = h;
    bgCanvas.width = w;
    bgCanvas.height = h;
    shadowCanvas.width = w;
    shadowCanvas.height = h;
    
    setDimensions(w, h);
    
    if (initEnvironmentCallback) {
        initEnvironmentCallback();
    }
}

// Render static background (water gradient + stones)
export function renderStaticBackground() {
    const w = canvas.width;
    const h = canvas.height;
    
    let grd = bgCtx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, params.waterColor1);
    grd.addColorStop(1, params.waterColor2);
    bgCtx.fillStyle = grd;
    bgCtx.fillRect(0, 0, w, h);

    // Draw stones on background
    if (entities && entities.stones) {
        entities.stones.forEach(s => s.draw(bgCtx));
    }
    
    let rad = Math.max(w, h);
    let radial = bgCtx.createRadialGradient(w/2, h/2, rad * 0.4, w/2, h/2, rad * 0.8);
    radial.addColorStop(0, "rgba(0,0,0,0)");
    radial.addColorStop(1, "rgba(0,0,0,0.6)");
    bgCtx.fillStyle = radial;
    bgCtx.fillRect(0, 0, w, h);
}

// Main animation frame
export function animate(currentTime, addRippleFn) {
    if (!entities) {
        requestAnimationFrame((t) => animate(t, addRippleFn));
        return;
    }
    
    const { fish, predators, pads, frogs, grass } = entities;
    
    // Frame rate limiting
    if (!performanceManager.shouldRender(currentTime, params.targetFPS)) {
        requestAnimationFrame((t) => animate(t, addRippleFn));
        return;
    }
    
    // Update FPS counter
    if (performanceManager.updateFPS(currentTime)) {
        updateStatsDisplay();
    }
    
    // Delta time in seconds for physics calculations
    const dt = performanceManager.getDeltaSeconds();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    if(bgCanvas.width > 0 && bgCanvas.height > 0)
        ctx.drawImage(bgCanvas, 0, 0);
    
    // Draw grass (animated, so must be in main loop)
    grass.forEach(g => g.draw(ctx, currentTime));
    
    // Scale spawn rates by delta time for consistency across frame rates
    if (Math.random() < params.foodSpawnRate * dt * 60) {
        foodPool.acquire(rand(50, w-50), rand(50, h-50));
    }

    if (params.rainMode && Math.random() < 0.3 * dt * 60) { 
        ripplePool.acquire(rand(0, w), rand(0, h), 0, rand(30, 80), 3);
    }
    
    // Auto-spawn frogs if population drops low (slow repopulation)
    if (Math.random() < 0.005 * dt * 60) {
        // Find empty pad
        const emptyPad = pads.find(p => !p.hasFlower && !p.hasFrog);
        if (emptyPad && frogs.length < pads.length * params.frogChance) {
            frogs.push(new Frog(emptyPad));
        }
    }
    
    // Get active pooled objects
    const activeRipples = ripplePool.getActive();
    const activeFoods = foodPool.getActive();
    
    // Update spatial grids for efficient queries
    fishGrid.clear();
    foodGrid.clear();
    predatorGrid.clear();
    
    fish.forEach(f => fishGrid.insert(f, f.pos.x, f.pos.y));
    activeFoods.forEach(f => {
        if (!f.eaten) foodGrid.insert(f, f.pos.x, f.pos.y);
    });
    predators.forEach(p => predatorGrid.insert(p, p.pos.x, p.pos.y));
    
    // Update shadow canvas at lower frame rate for performance
    const shouldUpdateShadows = currentTime - lastShadowUpdate >= (1000 / params.shadowUpdateFPS);
    if (shouldUpdateShadows) {
        lastShadowUpdate = currentTime;
        shadowCtx.clearRect(0, 0, w, h);
        // Only draw shadows for fish in view (with larger margin for shadows)
        fish.forEach(f => {
            if (isInView(f.pos.x, f.pos.y, CULL_MARGIN + 50)) {
                f.drawShadow(shadowCtx);
            }
        });
        // Predator shadows
        predators.forEach(p => {
            if (isInView(p.pos.x, p.pos.y, CULL_MARGIN + 50)) {
                p.drawShadow(shadowCtx);
            }
        });
    }
    
    // Composite shadow layer
    ctx.drawImage(shadowCanvas, 0, 0);
    
    // Update and draw pooled food (swap-and-pop for removal, with culling)
    for (let i = activeFoods.length - 1; i >= 0; i--) {
        const food = activeFoods[i];
        updatePooledFood(food, dt);
        // Only draw if in view
        if (isInView(food.pos.x, food.pos.y)) {
            drawPooledFood(food, ctx);
        }
        if (food.eaten) {
            foodPool.release(food);
        }
    }

    // Update and draw fish BEFORE lily pads (fish swim under pads)
    fish.forEach(f => f.run(fish, activeFoods, dt)); 

    // Update and draw predators (also under lily pads)
    predators.forEach(p => {
        p.update(fish, dt);
        p.draw(ctx);
    });

    // Draw lily pads on top of fish
    pads.forEach(pad => pad.draw(ctx));
    
    // Update and Draw Frogs (swap-and-pop for removal)
    for (let i = frogs.length - 1; i >= 0; i--) {
        const f = frogs[i];
        const keep = f.update(pads, dt);
        f.draw(ctx);
        if (!keep) {
            // Swap with last element and pop
            frogs[i] = frogs[frogs.length - 1];
            frogs.pop();
        }
    }

    // Update and draw pooled ripples (swap-and-pop for removal, with culling)
    for (let i = activeRipples.length - 1; i >= 0; i--) {
        const ripple = activeRipples[i];
        const alive = updatePooledRipple(ripple, dt);
        // Only draw if in view (use ripple radius for margin)
        if (isInView(ripple.x, ripple.y, CULL_MARGIN + ripple.radius)) {
            drawPooledRipple(ripple, ctx);
        }
        if (!alive) {
            ripplePool.release(ripple);
        }
    }

    // Fish reproduction
    handleReproduction(dt, w, h);

    requestAnimationFrame((t) => animate(t, addRippleFn));
}

// Handle fish reproduction
function handleReproduction(dt, w, h) {
    if (!entities) return;
    const { fish } = entities;
    
    if (fish.length < params.maxFishCount && params.birthChance > 0) {
        let birthHappened = false;
        
        // Update birth timers
        fish.forEach(f => { f.birthTimer -= dt * 60; });
        
        // Random birth mode
        if ((params.birthMode === 'random' || params.birthMode === 'hybrid') && !birthHappened) {
            if (Math.random() < params.birthChance * dt * 60) {
                // Pick a random fish as parent
                const parent = fish[Math.floor(Math.random() * fish.length)];
                const newX = parent.pos.x + rand(-30, 30);
                const newY = parent.pos.y + rand(-30, 30);
                
                // Keep in bounds
                const spawnX = Math.max(50, Math.min(w - 50, newX));
                const spawnY = Math.max(50, Math.min(h - 50, newY));
                
                const newFish = new Koi(spawnX, spawnY);
                newFish.size = rand(params.sizeMin, (params.sizeMin + params.sizeMax) / 2);
                fish.push(newFish);
                
                ripplePool.acquire(spawnX, spawnY, 3, 40, 1.5);
                birthCountRef.count++;
                birthHappened = true;
            }
        }
        
        // Proximity birth mode
        if ((params.birthMode === 'proximity' || params.birthMode === 'hybrid') && !birthHappened) {
            for (let i = 0; i < fish.length && !birthHappened; i++) {
                const f1 = fish[i];
                if (f1.birthTimer > 0) continue;
                
                for (let j = i + 1; j < fish.length && !birthHappened; j++) {
                    const f2 = fish[j];
                    if (f2.birthTimer > 0) continue;
                    
                    // Check distance
                    const dx = f1.pos.x - f2.pos.x;
                    const dy = f1.pos.y - f2.pos.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    
                    if (d < 60 && Math.random() < params.birthChance * 2) {
                        const newX = (f1.pos.x + f2.pos.x) / 2 + rand(-15, 15);
                        const newY = (f1.pos.y + f2.pos.y) / 2 + rand(-15, 15);
                        
                        const newFish = new Koi(newX, newY);
                        newFish.size = rand(params.sizeMin, (params.sizeMin + params.sizeMax) / 2);
                        fish.push(newFish);
                        
                        f1.birthTimer = params.birthCooldown;
                        f2.birthTimer = params.birthCooldown;
                        
                        ripplePool.acquire(newX, newY, 3, 40, 1.5);
                        birthCountRef.count++;
                        birthHappened = true;
                    }
                }
            }
        }
    }
}

// Update stats display
function updateStatsDisplay() {
    if (!entities) return;
    const { fish, predators, frogs } = entities;
    const actualFPS = performanceManager.getActualFPS();
    
    // Update FPS display
    const fpsDisplay = document.getElementById('val-currentFPS');
    if (fpsDisplay) fpsDisplay.textContent = actualFPS;
    
    // Update stats display
    const statFish = document.getElementById('stat-fish');
    const statRipples = document.getElementById('stat-ripples');
    const statFood = document.getElementById('stat-food');
    const statFrogs = document.getElementById('stat-frogs');
    const statHunts = document.getElementById('stat-hunts');
    const statKills = document.getElementById('stat-kills');
    if (statFish) statFish.textContent = fish.length;
    if (statRipples) statRipples.textContent = ripplePool.getActiveCount();
    if (statFood) statFood.textContent = foodPool.getActiveCount();
    if (statFrogs) statFrogs.textContent = frogs.length;
    
    // Predator stats
    let totalHunts = 0, totalKills = 0;
    predators.forEach(p => { totalHunts += p.huntCount; totalKills += p.killCount; });
    if (statHunts) statHunts.textContent = totalHunts;
    if (statKills) statKills.textContent = totalKills;
    
    // Birth stats
    const statBirths = document.getElementById('stat-births');
    if (statBirths) statBirths.textContent = birthCountRef.count;
    
    // Update overlay stats
    const overlayFish = document.getElementById('overlay-fish');
    const overlayBirths = document.getElementById('overlay-births');
    const overlayPredators = document.getElementById('overlay-predators');
    const overlayKills = document.getElementById('overlay-kills');
    const overlayFps = document.getElementById('overlay-fps');
    
    if (overlayFish) overlayFish.textContent = fish.length;
    if (overlayBirths) overlayBirths.textContent = birthCountRef.count;
    if (overlayPredators) overlayPredators.textContent = predators.length;
    if (overlayKills) overlayKills.textContent = totalKills;
    if (overlayFps) overlayFps.textContent = actualFPS;
}
