// Render Manager - handles all rendering and canvas operations

import { params, CULL_MARGIN } from '../config.js';
import { setDimensions, isInView, rand } from '../utils/helpers.js';
import { fishGrid, foodGrid, predatorGrid, crocodileGrid } from '../utils/SpatialGrid.js';
import { ripplePool, foodPool, bloodPool, splashPool, updatePooledRipple, drawPooledRipple, updatePooledFood, drawPooledFood, updatePooledBlood, drawPooledBlood, updatePooledSplash, drawPooledSplash } from '../systems/ObjectPool.js';
import { performanceManager } from '../systems/PerformanceManager.js';
import { setMainContext, Koi } from '../entities/Koi.js';
import { PredatorFish } from '../entities/PredatorFish.js';
import { Frog } from '../entities/Frog.js';
import { updateWakeRipples, drawWakeRipples } from '../entities/Boat.js';

// Canvas references
let canvas, ctx;
let bgCanvas, bgCtx;
let shadowCanvas, shadowCtx;
let lastShadowUpdate = 0;

// Entity references (set via setEntities)
let entities = null;
let birthCountRef = { count: 0 };
let mousePosRef = { x: 0, y: 0 };
let mouseActiveRef = false;

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
export function setEntities(entitiesRef, birthCountReference, mousePosition, mouseIsActive) {
    entities = entitiesRef;
    birthCountRef = birthCountReference;
    if (mousePosition) mousePosRef = mousePosition;
    if (mouseIsActive !== undefined) mouseActiveRef = mouseIsActive;
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

// Render animated water caustics (light patterns on pond floor from above)
function renderAnimatedCaustics(ctx, w, h, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12;
    
    // Caustic network - light refracting through water surface ripples onto floor
    const layers = 2;
    for (let layer = 0; layer < layers; layer++) {
        const speed = 0.0004 * (layer + 1);
        const scale = 180 + layer * 60;
        const phase = layer * Math.PI;
        
        // Organic movement pattern
        const offsetX = Math.sin(time * speed + phase) * 25;
        const offsetY = Math.cos(time * speed * 0.7 + phase) * 25;
        
        // Draw caustic network across pond floor
        for (let x = -scale; x < w + scale; x += scale) {
            for (let y = -scale; y < h + scale; y += scale) {
                const cellX = x + offsetX + Math.sin(time * speed * 1.5 + y * 0.008) * 40;
                const cellY = y + offsetY + Math.cos(time * speed * 1.5 + x * 0.008) * 40;
                
                // Distance from center affects intensity (shallower = brighter)
                const distFromCenter = Math.sqrt(Math.pow(cellX - w/2, 2) + Math.pow(cellY - h/2, 2));
                const centerFactor = 1 - Math.min(distFromCenter / (Math.max(w, h) * 0.6), 1) * 0.4;
                
                // Pulsating caustic blob
                const intensity = (0.35 + Math.sin(time * speed * 2.5 + x * 0.015 + y * 0.015) * 0.25) * centerFactor;
                
                const causticGradient = ctx.createRadialGradient(
                    cellX, cellY, 0,
                    cellX, cellY, scale * 0.55
                );
                
                causticGradient.addColorStop(0, `rgba(230, 245, 255, ${intensity * 0.5})`);
                causticGradient.addColorStop(0.35, `rgba(210, 235, 250, ${intensity * 0.3})`);
                causticGradient.addColorStop(0.7, `rgba(190, 225, 245, ${intensity * 0.1})`);
                causticGradient.addColorStop(1, 'rgba(180, 220, 240, 0)');
                
                ctx.fillStyle = causticGradient;
                ctx.beginPath();
                ctx.arc(cellX, cellY, scale * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    ctx.restore();
}

// Render static background (water gradient + stones) - TOP-DOWN VIEW
export function renderStaticBackground() {
    const w = canvas.width;
    const h = canvas.height;
    
    // Base water color (uniform since we're looking down)
    bgCtx.fillStyle = params.waterColor2;
    bgCtx.fillRect(0, 0, w, h);
    
    // Subtle depth variation from center (shallow) to edges (deeper)
    // This represents the natural bowl shape of a pond
    let rad = Math.max(w, h);
    let depthGradient = bgCtx.createRadialGradient(w/2, h/2, rad * 0.2, w/2, h/2, rad * 0.7);
    depthGradient.addColorStop(0, params.waterColor1); // Shallow center
    depthGradient.addColorStop(0.6, params.waterColor2); // Transition
    depthGradient.addColorStop(1, params.waterColor2); // Deep edges
    bgCtx.fillStyle = depthGradient;
    bgCtx.fillRect(0, 0, w, h);
    
    // Suspended particles throughout (uniform distribution from top view)
    bgCtx.save();
    for (let i = 0; i < 100; i++) {
        const px = rand(0, w);
        const py = rand(0, h);
        const size = rand(0.5, 1.8);
        const opacity = rand(0.03, 0.1);
        
        bgCtx.beginPath();
        bgCtx.arc(px, py, size, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(200, 220, 230, ${opacity})`;
        bgCtx.fill();
    }
    bgCtx.restore();

    // Draw stones on pond floor
    if (entities && entities.stones) {
        entities.stones.forEach(s => s.draw(bgCtx));
    }
    
    // Subtle overall lighting gradient (sun overhead, slightly from one side)
    const lightAngle = Math.PI / 6; // Sun slightly off-center
    const lightX = w/2 + Math.cos(lightAngle) * w * 0.3;
    const lightY = h/2 + Math.sin(lightAngle) * h * 0.3;
    
    const overheadLight = bgCtx.createRadialGradient(lightX, lightY, 0, lightX, lightY, rad);
    overheadLight.addColorStop(0, 'rgba(200, 230, 255, 0.08)');
    overheadLight.addColorStop(0.4, 'rgba(180, 220, 245, 0.04)');
    overheadLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bgCtx.fillStyle = overheadLight;
    bgCtx.fillRect(0, 0, w, h);
    
    // Darker edges (pond edges / shadow from banks)
    let edgeVignette = bgCtx.createRadialGradient(w/2, h/2, rad * 0.4, w/2, h/2, rad * 0.85);
    edgeVignette.addColorStop(0, "rgba(0,0,0,0)");
    edgeVignette.addColorStop(0.7, "rgba(0,0,0,0.1)");
    edgeVignette.addColorStop(1, "rgba(0,0,0,0.45)");
    bgCtx.fillStyle = edgeVignette;
    bgCtx.fillRect(0, 0, w, h);
}

// Main animation frame
export function animate(currentTime, addRippleFn) {
    if (!entities) {
        requestAnimationFrame((t) => animate(t, addRippleFn));
        return;
    }
    
    const { fish, predators, crocodiles, turtles, snails, pads, frogs, grass, boats, boatWakeRipples } = entities;
    
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
    
    // Animated water caustic patterns (light refracting through water surface)
    renderAnimatedCaustics(ctx, w, h, currentTime);
    
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
    crocodileGrid.clear();
    
    fish.forEach(f => fishGrid.insert(f, f.pos.x, f.pos.y));
    activeFoods.forEach(f => {
        if (!f.eaten) foodGrid.insert(f, f.pos.x, f.pos.y);
    });
    predators.forEach(p => predatorGrid.insert(p, p.pos.x, p.pos.y));
    crocodiles.forEach(c => crocodileGrid.insert(c, c.pos.x, c.pos.y));
    
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
        // Crocodile shadows
        crocodiles.forEach(c => {
            if (isInView(c.pos.x, c.pos.y, CULL_MARGIN + 100)) {
                c.drawShadow(shadowCtx);
            }
        });
        // Turtle shadows
        turtles.forEach(t => {
            if (isInView(t.pos.x, t.pos.y, CULL_MARGIN + 50)) {
                t.drawShadow(shadowCtx);
            }
        });
        // Snail shadows
        if (snails) {
            snails.forEach(s => {
                if (isInView(s.pos.x, s.pos.y, CULL_MARGIN + 50)) {
                    s.drawShadow(shadowCtx);
                }
            });
        }
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
    
    // Update and draw crocodiles (apex predators, also under lily pads)
    crocodiles.forEach(c => {
        c.update(predators, crocodiles, dt);
        c.draw(ctx);
    });
    
    // Update and draw turtles (also under lily pads)
    const followTarget = mouseActiveRef ? mousePosRef : null;
    turtles.forEach(t => {
        t.update(activeFoods, followTarget, dt);
        t.draw(ctx);
    });
    
    // Update and draw snails (also under lily pads)
    if (snails) {
        snails.forEach(s => {
            s.update(pads, entities.stones, dt);
            s.draw(ctx);
        });
    }

    // Draw lily pads on top of fish
    pads.forEach(pad => pad.draw(ctx));
    
    // Update and draw boats (float on surface, AFTER lily pads so they appear on top)
    if (boats) {
        boats.forEach(boat => {
            boat.update(dt, fish, boats);
            boat.draw(ctx);
        });
    }
    
    // Update and draw boat wake ripples (simple system like the example)
    if (boatWakeRipples && boatWakeRipples.length > 0) {
        updateWakeRipples(boatWakeRipples, dt);
        drawWakeRipples(boatWakeRipples, ctx);
    }
    
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
            // Pass all ripples for interference calculations
            drawPooledRipple(ripple, ctx, activeRipples);
        }
        if (!alive) {
            ripplePool.release(ripple);
        }
    }

    // Update and draw pooled blood effects (swap-and-pop for removal, with culling)
    const activeBlood = bloodPool.getActive();
    for (let i = activeBlood.length - 1; i >= 0; i--) {
        const blood = activeBlood[i];
        const alive = updatePooledBlood(blood, dt);
        // Only draw if in view (use blood radius for margin)
        if (isInView(blood.x, blood.y, CULL_MARGIN + blood.radius)) {
            drawPooledBlood(blood, ctx);
        }
        if (!alive) {
            bloodPool.release(blood);
        }
    }

    // Update and draw pooled splash effects (swap-and-pop for removal, with culling)
    const activeSplashes = splashPool.getActive();
    for (let i = activeSplashes.length - 1; i >= 0; i--) {
        const splash = activeSplashes[i];
        const alive = updatePooledSplash(splash, dt);
        // Only draw if in view (use splash radius for margin)
        if (isInView(splash.x, splash.y, CULL_MARGIN + splash.radius)) {
            drawPooledSplash(splash, ctx);
        }
        if (!alive) {
            splashPool.release(splash);
        }
    }

    // Fish reproduction
    handleReproduction(dt, w, h);
    
    // Predator respawn (maintain minimum population for crocodile)
    handlePredatorRespawn(dt, w, h, predators);

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

// Handle predator respawn to maintain population
function handlePredatorRespawn(dt, w, h, predators) {
    // Only spawn if predator count is low (to ensure crocodile has prey)
    if (predators.length <= 1) {
        // Spawn chance - not too frequent
        if (Math.random() < 0.01 * dt * 60) {
            // Spawn near edges like initial spawn
            let x, y;
            if (Math.random() < 0.5) {
                x = Math.random() < 0.5 ? rand(50, 150) : rand(w - 150, w - 50);
                y = rand(100, h - 100);
            } else {
                x = rand(100, w - 100);
                y = Math.random() < 0.5 ? rand(50, 150) : rand(h - 150, h - 50);
            }
            
            // Create new predator
            const newPredator = new PredatorFish(x, y);
            predators.push(newPredator);
            
            // Create spawn ripple
            ripplePool.acquire(x, y, 5, 80, 2);
        }
    }
}

// Update stats display
function updateStatsDisplay() {
    if (!entities) return;
    const { fish, predators, crocodiles, turtles, snails, frogs } = entities;
    const actualFPS = performanceManager.getActualFPS();
    
    // Update FPS display
    const fpsDisplay = document.getElementById('val-currentFPS');
    if (fpsDisplay) fpsDisplay.textContent = actualFPS;
    
    // Update stats display
    const statFish = document.getElementById('stat-fish');
    const statRipples = document.getElementById('stat-ripples');
    const statFood = document.getElementById('stat-food');
    const statFrogs = document.getElementById('stat-frogs');
    const statTurtles = document.getElementById('stat-turtles');
    const statSnails = document.getElementById('stat-snails');
    const statCrocodiles = document.getElementById('stat-crocodiles');
    const statHunts = document.getElementById('stat-hunts');
    const statKills = document.getElementById('stat-kills');
    const statCrocHunts = document.getElementById('stat-croc-hunts');
    const statCrocKills = document.getElementById('stat-croc-kills');
    if (statFish) statFish.textContent = fish.length;
    if (statRipples) statRipples.textContent = ripplePool.getActiveCount();
    if (statFood) statFood.textContent = foodPool.getActiveCount();
    if (statFrogs) statFrogs.textContent = frogs.length;
    if (statTurtles) statTurtles.textContent = turtles.length;
    if (statSnails && snails) statSnails.textContent = snails.length;
    if (statCrocodiles && crocodiles) statCrocodiles.textContent = crocodiles.length;
    
    // Predator stats
    let totalHunts = 0, totalKills = 0;
    predators.forEach(p => { totalHunts += p.huntCount; totalKills += p.killCount; });
    if (statHunts) statHunts.textContent = totalHunts;
    if (statKills) statKills.textContent = totalKills;
    
    // Crocodile stats
    let totalCrocHunts = 0, totalCrocKills = 0;
    crocodiles.forEach(c => { totalCrocHunts += c.huntCount; totalCrocKills += c.killCount; });
    if (statCrocHunts) statCrocHunts.textContent = totalCrocHunts;
    if (statCrocKills) statCrocKills.textContent = totalCrocKills;
    
    // Birth stats
    const statBirths = document.getElementById('stat-births');
    if (statBirths) statBirths.textContent = birthCountRef.count;
    
    // Update overlay stats
    const overlayFish = document.getElementById('overlay-fish');
    const overlayBirths = document.getElementById('overlay-births');
    const overlayPredators = document.getElementById('overlay-predators');
    const overlayKills = document.getElementById('overlay-kills');
    const overlayCrocodiles = document.getElementById('overlay-crocodiles');
    const overlayCrocKills = document.getElementById('overlay-croc-kills');
    const overlayFps = document.getElementById('overlay-fps');
    
    if (overlayFish) overlayFish.textContent = fish.length;
    if (overlayBirths) overlayBirths.textContent = birthCountRef.count;
    if (overlayPredators) overlayPredators.textContent = predators.length;
    if (overlayKills) overlayKills.textContent = totalKills;
    if (overlayCrocodiles) overlayCrocodiles.textContent = crocodiles.length;
    if (overlayCrocKills) overlayCrocKills.textContent = totalCrocKills;
    if (overlayFps) overlayFps.textContent = actualFPS;
}
