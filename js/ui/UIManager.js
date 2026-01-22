// UI Manager - handles all UI controls and event bindings

import { params } from '../config.js';

// Callbacks for entity management (set via init)
let initFishCallback = null;
let initEnvironmentCallback = null;
let initPredatorsCallback = null;
let initCrocodilesCallback = null;
let initTurtlesCallback = null;
let initSnailsCallback = null;
let initBoatsCallback = null;
let renderStaticBackgroundCallback = null;

// Initialize dual range sliders
function initDualRangeSliders() {
    document.querySelectorAll('.dual-range').forEach(container => {
        const minInput = container.querySelector('input:first-of-type');
        const maxInput = container.querySelector('input:last-of-type');
        const fill = container.querySelector('.dual-range-fill');
        
        if (!minInput || !maxInput || !fill) return;
        
        function updateFill() {
            const min = parseFloat(minInput.min);
            const max = parseFloat(minInput.max);
            const minVal = parseFloat(minInput.value);
            const maxVal = parseFloat(maxInput.value);
            
            const leftPercent = ((minVal - min) / (max - min)) * 100;
            const rightPercent = ((maxVal - min) / (max - min)) * 100;
            
            fill.style.left = leftPercent + '%';
            fill.style.width = (rightPercent - leftPercent) + '%';
        }
        
        function enforceMinMax() {
            const minVal = parseFloat(minInput.value);
            const maxVal = parseFloat(maxInput.value);
            
            if (minVal > maxVal) {
                minInput.value = maxVal;
            }
        }
        
        function enforceMaxMin() {
            const minVal = parseFloat(minInput.value);
            const maxVal = parseFloat(maxInput.value);
            
            if (maxVal < minVal) {
                maxInput.value = minVal;
            }
        }
        
        minInput.addEventListener('input', () => {
            enforceMinMax();
            updateFill();
        });
        
        maxInput.addEventListener('input', () => {
            enforceMaxMin();
            updateFill();
        });
        
        // Initial update
        updateFill();
    });
}

// Initialize UI
export function initUI(callbacks) {
    initFishCallback = callbacks.initFish;
    initEnvironmentCallback = callbacks.initEnvironment;
    initPredatorsCallback = callbacks.initPredators;
    initCrocodilesCallback = callbacks.initCrocodiles;
    initTurtlesCallback = callbacks.initTurtles;
    initSnailsCallback = callbacks.initSnails;
    initBoatsCallback = callbacks.initBoats;
    renderStaticBackgroundCallback = callbacks.renderStaticBackground;
    
    // Menu Toggle Logic
    const menuBtn = document.getElementById('menu-btn');
    const controls = document.getElementById('controls');
    
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        controls.classList.toggle('visible');
    });
    
    const inputs = [
        'fishCount', 'sizeMin', 'sizeMax', 'fatness', 'finScale',
        'bodyWidth', 'spotSize', 'wiggle',
        'speedScale', 'waveSpeedBase', 'waveAmpMax', 'distConstraint',
        'fishJumpChance', 'fishJumpFleeChance', 'fishJumpExcitedChance',
        'fishJumpCooldown', 'fishJumpHeight', 'fishJumpDistance',
        'stoneDensity', 'stoneSizeMin', 'stoneSizeMax',
        'padDensity', 'padSizeMin', 'padSizeMax', 'flowerChance', 
        'frogChance', 
        'padSplitSize', 'padVeinCount',
        'grassDensity', 'grassHeightMin', 'grassHeightMax',
        'grassSwaySpeed', 'grassSwayAmount',
        'foodSpawnRate', 'foodSize',
        'birthChance', 'maxFishCount', 'birthCooldown',
        'predatorCount', 'predatorSizeMin', 'predatorSizeMax',
        'predatorBodyWidth', 'predatorWiggle',
        'predatorHuntSuccessRate', 'predatorDetectionRange',
        'predatorAttackSpeed', 'predatorRestTime',
        'crocodileCount', 'crocodileSizeMin', 'crocodileSizeMax',
        'crocodileBaseSpeed', 'crocodileHuntSuccessRate', 'crocodileDetectionRange',
        'crocodileAttackSpeed', 'crocodileRestTime',
        'crocodileWiggle', 'crocodileBodyWidth', 'limbSize', 'eyeSize',
        'turtleCount', 'turtleSizeMin', 'turtleSizeMax',
        'turtleBaseSpeedMin', 'turtleBaseSpeedMax', 'turtleTurnForce',
        'turtleDetectionRange', 'turtleFleeForceMultiplier', 'turtleFoodSeekRange',
        'turtleTamedDuration',
        'snailCount', 'snailSizeMin', 'snailSizeMax',
        'snailSpeedMin', 'snailSpeedMax', 'snailDetectionRange',
        'snailRetractDuration', 'snailCrawlSpeed', 'snailSwimChance', 'snailSwimDuration',
        'boatCount', 'boatSpeed', 'boatSize', 'boatPaddleSize', 'boatPaddleLength',
        'boatRowingTempo', 'boatWakeIntensity', 'boatRippleLife',
        'boatMaxSpeed', 'boatRotationSpeed', 'boatAcceleration', 'boatFriction',
        // Advanced Settings
        'fishBaseSpeedMin', 'fishBaseSpeedMax',
        'fishThicknessHead', 'fishThicknessNeck', 'fishThicknessTaper',
        'fishThicknessMin', 'fishThicknessPow', 'fishWavePhaseOffset',
        'fishInitialBirthCooldown', 'fishFleeForceMultiplier', 'fishInitialSwimTimer',
        'foodSizeVariationMin', 'foodSizeVariationMax',
        'foodVelocityMin', 'foodVelocityMax',
        'predatorBaseSpeed', 'predatorMaxForceLurking', 'predatorMaxForceAttacking',
        'predatorMaxForceResting', 'predatorWanderProbability', 'predatorWanderMagnitude',
        'predatorDetectingSpeedMult', 'predatorDetectingSeekMult', 'predatorDetectionTime',
        'predatorAttackingSeekMult', 'predatorCatchDistance', 'predatorEatingDuration',
        'predatorEatingSpeed', 'predatorRestingSpeedMult', 'predatorRestTimeFailMult',
        'predatorRestTimeGiveUpMult', 'predatorMaxChaseDistMult', 'predatorAttackWaveMult',
        'predatorBoundaryMargin',
        'padHueVariationMin', 'padHueVariationMax', 'padNotchAngleMin', 'padNotchAngleMax',
        'padVeinLengthRatio', 'flowerMixedLotusProb', 'flowerMixedLilyProb',
        'lotusOuterPetalCount', 'lotusOuterPetalRadius', 'lotusOuterPetalWidth',
        'lotusOuterPetalHeight', 'lotusCenterRadius', 'lilyPetalCount', 'lilyCenterRadius',
        'frogDiveDuration', 'frogJumpLegLength', 'frogEyeSizeRatio',
        'frogJumpRange', 'frogSwimSpeedMin', 'frogSwimSpeedMax', 'frogSwimForce', 
        'frogSwimChance', 'frogSwimSeekRange', 'frogFloatChance', 'frogFloatDuration',
        'frogFloatDriftSpeed', 'frogFloatBobSpeed', 'frogFloatBobAmount',
        'stoneDensityBase', 'padClusterCountMin', 'padClusterCountMax',
        'padRingRadiusMult', 'padRingVariationMin', 'padRingVariationMax',
        'padClumpedOffsetRange',
        'rippleLungeRadius', 'rippleLungeMaxRadius', 'rippleLungeSpeed',
        'rippleKillMainRadius', 'rippleKillMainMaxRadius', 'rippleKillMainSpeed',
        'rippleKillSecondaryRadius', 'rippleKillSecondaryMaxRadius', 'rippleKillSecondarySpeed',
        'rippleFailRadius', 'rippleFailMaxRadius', 'rippleFailSpeed',
        'bloodInitialRadius', 'bloodMaxRadius', 'bloodSpreadSpeed', 'bloodFadeSpeed',
        'bloodLifeDuration', 'bloodParticleCount', 'bloodParticleSizeMin', 'bloodParticleSizeMax',
        'bloodParticleSpreadSpeedMin', 'bloodParticleSpreadSpeedMax',
        'shadowUpdateFPS', 'shadowOffsetX', 'shadowOffsetY',
        'fishBodyShadeDark', 'fishBodyShadeLight', 'fishBodySolidAlpha',
        'fishPatternEdgeAlpha',
        'fishSpecularOuterAlpha', 'fishSpecularInnerAlpha',
        'fishSpecularWidth', 'fishSpecularInnerWidth',
        'fishFinShadeLight', 'fishFinShadeMid', 'fishFinShadeDark',
        'fishFinAlphaBase', 'fishFinAlphaMid', 'fishFinAlphaEdge',
        'fishOutlineDarken', 'fishOutlineAlpha', 'fishOutlineWidth',
        'fishEyeSizeRatio', 'fishEyeIrisRatio', 'fishEyePupilRatio',
        'predatorBodyShadeDark', 'predatorBodyShadeLight', 'predatorBodySolidAlpha',
        'predatorSpecularOuterAlpha', 'predatorSpecularInnerAlpha',
        'predatorSpecularWidth', 'predatorSpecularInnerWidth',
        'predatorFinShadeLight', 'predatorFinShadeMid', 'predatorFinShadeDark',
        'predatorFinAlphaBase', 'predatorFinAlphaMid', 'predatorFinAlphaEdge',
        'predatorOutlineDarken', 'predatorOutlineAlpha', 'predatorOutlineWidth',
        'predatorEyeSizeRatio', 'predatorEyeIrisRatio', 'predatorEyePupilRatio',
        'predatorEyeAttackGlowAlpha',
        'predatorEyeGlowOuterRadius', 'predatorEyeGlowPulseSpeed', 'predatorEyeGlowIntensity',
        'predatorTrailMaxLength', 'predatorTrailFadeTime', 'predatorTrailSpacing', 'predatorTrailAlpha'
    ];

    inputs.forEach(key => {
        const inp = document.getElementById('inp-' + key);
        const disp = document.getElementById('val-' + key);
        
        if(inp && disp) {
            inp.value = params[key];
            disp.textContent = params[key];
            
            inp.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                params[key] = val;
                disp.textContent = val;
                
                if(key === 'fishCount' || (key.includes('size') && !key.includes('predator') && !key.includes('grass') && !key.includes('turtle'))) {
                    if (initFishCallback) initFishCallback();
                }
                if(key.includes('stone') || key.includes('pad') || key.includes('flower') || key.includes('frog') || key.includes('vein') || key.includes('Split') || key.includes('grass')) {
                    if (initEnvironmentCallback) initEnvironmentCallback();
                }
                if(key === 'predatorCount' || key.includes('predatorSize')) {
                    if (initPredatorsCallback) initPredatorsCallback();
                }
                if(key === 'crocodileCount' || key.includes('crocodileSize')) {
                    if (initCrocodilesCallback) initCrocodilesCallback();
                }
                if(key === 'turtleCount' || key.includes('turtleSize')) {
                    if (initTurtlesCallback) initTurtlesCallback();
                }
                if(key === 'snailCount' || key.includes('snailSize')) {
                    if (initSnailsCallback) initSnailsCallback();
                }
                if(key === 'boatCount' || key.includes('boatControlMode')) {
                    if (initBoatsCallback) initBoatsCallback();
                }
            });
        }
    });

    // Selects
    const flowerTypeSelect = document.getElementById('inp-flowerType');
    if (flowerTypeSelect) {
        flowerTypeSelect.value = params.flowerType;
        flowerTypeSelect.addEventListener('change', e => {
            params.flowerType = e.target.value;
            if (initEnvironmentCallback) initEnvironmentCallback();
        });
    }
    
    const padFormSelect = document.getElementById('inp-padFormation');
    if (padFormSelect) {
        padFormSelect.value = params.padFormation;
        padFormSelect.addEventListener('change', e => {
            params.padFormation = e.target.value;
            if (initEnvironmentCallback) initEnvironmentCallback();
        });
    }
    
    const birthModeSelect = document.getElementById('inp-birthMode');
    if (birthModeSelect) {
        birthModeSelect.value = params.birthMode;
        birthModeSelect.addEventListener('change', e => {
            params.birthMode = e.target.value;
        });
    }
    
    const patternSelect = document.getElementById('inp-pattern');
    const crocodilePatternSelect = document.getElementById('inp-crocodilePattern');
    if (patternSelect) {
        patternSelect.value = params.pattern || 'Random';
        patternSelect.addEventListener('change', e => {
            params.pattern = e.target.value;
            // Update all existing fish patterns
            if (window.fishArray) {
                window.fishArray.forEach(fish => {
                    if (fish.setupPattern) fish.setupPattern();
                });
            }
        });
    }
    
    if (crocodilePatternSelect) {
        crocodilePatternSelect.value = params.crocodilePattern || 'Mixed';
        crocodilePatternSelect.addEventListener('change', e => {
            params.crocodilePattern = e.target.value;
            // Reinitialize crocodiles to update appearances
            if (initCrocodilesCallback) {
                initCrocodilesCallback();
            }
        });
    }
    
    // Crocodile shape curve editor (from sample code)
    const curveCanvas = document.getElementById('crocodile-shape-curve');
    if (curveCanvas) {
        const curveCtx = curveCanvas.getContext('2d');
        let activePoint = -1;
        const MAX_VAL = 80;
        
        function drawCurveEditor() {
            const w = curveCanvas.width;
            const h = curveCanvas.height;
            const len = params.crocodileShape.length;
            
            curveCtx.clearRect(0, 0, w, h);
            
            // Grid lines
            curveCtx.strokeStyle = 'rgba(255,255,255,0.05)';
            curveCtx.lineWidth = 1;
            
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                curveCtx.beginPath();
                curveCtx.moveTo(x, 0); curveCtx.lineTo(x, h);
                curveCtx.stroke();
            }
            curveCtx.beginPath(); 
            curveCtx.moveTo(0, h); curveCtx.lineTo(w, h);
            curveCtx.stroke();
            
            // Filled Area under curve
            curveCtx.fillStyle = 'rgba(85, 139, 47, 0.2)';
            curveCtx.beginPath();
            curveCtx.moveTo(0, h);
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                const val = params.crocodileShape[i];
                const y = h - (val / MAX_VAL) * h;
                curveCtx.lineTo(x, y);
            }
            curveCtx.lineTo(w, h);
            curveCtx.fill();
            
            // The Line
            curveCtx.strokeStyle = '#558b2f';
            curveCtx.lineWidth = 2;
            curveCtx.beginPath();
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                const val = params.crocodileShape[i];
                const y = h - (val / MAX_VAL) * h;
                if(i===0) curveCtx.moveTo(x, y);
                else curveCtx.lineTo(x, y);
            }
            curveCtx.stroke();
            
            // Points
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                const val = params.crocodileShape[i];
                const y = h - (val / MAX_VAL) * h;
                
                const isHovered = (i === activePoint);
                
                curveCtx.fillStyle = isHovered ? '#fff' : '#8fba92';
                const r = isHovered ? 4 : 2.5;
                
                curveCtx.beginPath();
                curveCtx.arc(x, y, r, 0, Math.PI * 2);
                curveCtx.fill();
                
                if(i===0 || i===3 || i===10) {
                   curveCtx.fillStyle = 'rgba(255,255,255,0.3)'; 
                   curveCtx.beginPath(); curveCtx.arc(x, y, r+2, 0, Math.PI * 2); curveCtx.fill();
                }
            }
        }
        
        function getMousePos(e) {
            const rect = curveCanvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
        
        function getIndexFromX(x) {
            const w = curveCanvas.width;
            const len = params.crocodileShape.length;
            let i = Math.round((x / w) * (len - 1));
            return Math.max(0, Math.min(len - 1, i));
        }
        
        function applySmoothDeformation(centerIdx, targetVal) {
            const currentVal = params.crocodileShape[centerIdx];
            const delta = targetVal - currentVal;
            const radius = 3;
            
            for(let i = -radius; i <= radius; i++) {
                const idx = centerIdx + i;
                if(idx >= 0 && idx < params.crocodileShape.length) {
                    const weight = Math.exp(-(i * i) / (2 * 1.0));
                    let newVal = params.crocodileShape[idx] + (delta * weight);
                    newVal = Math.max(0, Math.min(MAX_VAL, newVal));
                    params.crocodileShape[idx] = newVal;
                }
            }
        }

        curveCanvas.addEventListener('mousedown', (e) => {
            const pos = getMousePos(e);
            const idx = getIndexFromX(pos.x);
            activePoint = idx;
            
            let val = MAX_VAL - (pos.y / curveCanvas.height) * MAX_VAL;
            val = Math.max(0, Math.min(MAX_VAL, val));
            
            applySmoothDeformation(activePoint, val);
            drawCurveEditor();
        });
        
        window.addEventListener('mousemove', (e) => {
            if(activePoint !== -1) {
                const pos = getMousePos(e);
                let val = MAX_VAL - (pos.y / curveCanvas.height) * MAX_VAL;
                val = Math.max(0, Math.min(MAX_VAL, val));
                applySmoothDeformation(activePoint, val);
                drawCurveEditor();
            }
        });
        
        window.addEventListener('mouseup', () => {
            activePoint = -1;
            drawCurveEditor();
        });

        drawCurveEditor();
    }
    
    // Fish shape curve editor (similar to crocodile)
    const fishCurveCanvas = document.getElementById('fish-shape-curve');
    if (fishCurveCanvas) {
        const fishCurveCtx = fishCurveCanvas.getContext('2d');
        let activeFishPoint = -1;
        const FISH_MAX_VAL = 100;
        
        function drawFishCurveEditor() {
            const w = fishCurveCanvas.width;
            const h = fishCurveCanvas.height;
            const len = params.fishShape.length;
            
            fishCurveCtx.clearRect(0, 0, w, h);
            
            // Grid lines
            fishCurveCtx.strokeStyle = 'rgba(255,255,255,0.05)';
            fishCurveCtx.lineWidth = 1;
            
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                fishCurveCtx.beginPath();
                fishCurveCtx.moveTo(x, 0); fishCurveCtx.lineTo(x, h);
                fishCurveCtx.stroke();
            }
            fishCurveCtx.beginPath(); 
            fishCurveCtx.moveTo(0, h); fishCurveCtx.lineTo(w, h);
            fishCurveCtx.stroke();
            
            // Filled Area under curve
            fishCurveCtx.fillStyle = 'rgba(129, 199, 132, 0.2)';
            fishCurveCtx.beginPath();
            fishCurveCtx.moveTo(0, h);
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                const val = params.fishShape[i];
                const y = h - (val / FISH_MAX_VAL) * h;
                fishCurveCtx.lineTo(x, y);
            }
            fishCurveCtx.lineTo(w, h);
            fishCurveCtx.fill();
            
            // The Line
            fishCurveCtx.strokeStyle = '#81c784';
            fishCurveCtx.lineWidth = 2;
            fishCurveCtx.beginPath();
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                const val = params.fishShape[i];
                const y = h - (val / FISH_MAX_VAL) * h;
                if(i===0) fishCurveCtx.moveTo(x, y);
                else fishCurveCtx.lineTo(x, y);
            }
            fishCurveCtx.stroke();
            
            // Points
            for(let i=0; i<len; i++) {
                const x = (i / (len - 1)) * w;
                const val = params.fishShape[i];
                const y = h - (val / FISH_MAX_VAL) * h;
                
                const isHovered = (i === activeFishPoint);
                
                fishCurveCtx.fillStyle = isHovered ? '#fff' : '#a5d6a7';
                const r = isHovered ? 4 : 2.5;
                
                fishCurveCtx.beginPath();
                fishCurveCtx.arc(x, y, r, 0, Math.PI * 2);
                fishCurveCtx.fill();
                
                if(i===0 || i===3 || i===9) {
                   fishCurveCtx.fillStyle = 'rgba(255,255,255,0.3)'; 
                   fishCurveCtx.beginPath(); fishCurveCtx.arc(x, y, r+2, 0, Math.PI * 2); fishCurveCtx.fill();
                }
            }
        }
        
        function getFishMousePos(e) {
            const rect = fishCurveCanvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
        
        function getFishIndexFromX(x) {
            const w = fishCurveCanvas.width;
            const len = params.fishShape.length;
            let i = Math.round((x / w) * (len - 1));
            return Math.max(0, Math.min(len - 1, i));
        }
        
        function applyFishSmoothDeformation(centerIdx, targetVal) {
            const currentVal = params.fishShape[centerIdx];
            const delta = targetVal - currentVal;
            const radius = 3;
            
            for(let i = -radius; i <= radius; i++) {
                const idx = centerIdx + i;
                if(idx >= 0 && idx < params.fishShape.length) {
                    const weight = Math.exp(-(i * i) / (2 * 1.0));
                    let newVal = params.fishShape[idx] + (delta * weight);
                    newVal = Math.max(0, Math.min(FISH_MAX_VAL, newVal));
                    params.fishShape[idx] = newVal;
                }
            }
        }

        fishCurveCanvas.addEventListener('mousedown', (e) => {
            const pos = getFishMousePos(e);
            const idx = getFishIndexFromX(pos.x);
            activeFishPoint = idx;
            
            let val = FISH_MAX_VAL - (pos.y / fishCurveCanvas.height) * FISH_MAX_VAL;
            val = Math.max(0, Math.min(FISH_MAX_VAL, val));
            
            applyFishSmoothDeformation(activeFishPoint, val);
            drawFishCurveEditor();
        });
        
        window.addEventListener('mousemove', (e) => {
            if(activeFishPoint !== -1) {
                const pos = getFishMousePos(e);
                let val = FISH_MAX_VAL - (pos.y / fishCurveCanvas.height) * FISH_MAX_VAL;
                val = Math.max(0, Math.min(FISH_MAX_VAL, val));
                applyFishSmoothDeformation(activeFishPoint, val);
                drawFishCurveEditor();
            }
        });
        
        window.addEventListener('mouseup', () => {
            activeFishPoint = -1;
            drawFishCurveEditor();
        });

        drawFishCurveEditor();
    }
    
    // Copy shape array button
    const copyShapeBtn = document.getElementById('btn-copy-crocodile-shape');
    if (copyShapeBtn) {
        copyShapeBtn.addEventListener('click', () => {
            const str = JSON.stringify(params.crocodileShape);
            const textArea = document.createElement("textarea");
            textArea.value = str;
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if(successful) {
                    alert("Shape array copied to clipboard!");
                }
            } catch (err) {
                console.error('Unable to copy', err);
            }
            document.body.removeChild(textArea);
        });
    }
    
    // Copy fish shape array button
    const copyFishShapeBtn = document.getElementById('btn-copy-fish-shape');
    if (copyFishShapeBtn) {
        copyFishShapeBtn.addEventListener('click', () => {
            const str = JSON.stringify(params.fishShape);
            const textArea = document.createElement("textarea");
            textArea.value = str;
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if(successful) {
                    alert("Shape array copied to clipboard!");
                }
            } catch (err) {
                console.error('Unable to copy', err);
            }
            document.body.removeChild(textArea);
        });
    }
    
    // Sync advanced controls with normal controls
    const syncAdvancedControls = () => {
        // Fish controls
        const syncControl = (normalId, advId, paramKey) => {
            const normalInp = document.getElementById(normalId);
            const advInp = document.getElementById(advId);
            const normalDisp = document.getElementById(normalId.replace('inp-', 'val-'));
            const advDisp = document.getElementById(advId.replace('inp-', 'val-'));
            
            if (normalInp && advInp) {
                // Initialize advanced control with current value
                advInp.value = params[paramKey] || normalInp.value;
                if (advDisp) advDisp.textContent = advInp.value;
                
                // Sync normal -> advanced
                normalInp.addEventListener('input', () => {
                    if (advInp) {
                        advInp.value = normalInp.value;
                        if (advDisp) advDisp.textContent = normalInp.value;
                    }
                    params[paramKey] = parseFloat(normalInp.value);
                });
                
                // Sync advanced -> normal
                advInp.addEventListener('input', () => {
                    if (normalInp) {
                        normalInp.value = advInp.value;
                        if (normalDisp) normalDisp.textContent = advInp.value;
                    }
                    params[paramKey] = parseFloat(advInp.value);
                });
            }
        };
        
        syncControl('inp-bodyWidth', 'inp-bodyWidth-adv', 'bodyWidth');
        syncControl('inp-spotSize', 'inp-spotSize-adv', 'spotSize');
        syncControl('inp-wiggle', 'inp-wiggle-adv', 'wiggle');
        syncControl('inp-predatorBodyWidth', 'inp-predatorBodyWidth-adv', 'predatorBodyWidth');
        syncControl('inp-predatorWiggle', 'inp-predatorWiggle-adv', 'predatorWiggle');
    };
    
    syncAdvancedControls();
    
    const boatControlModeSelect = document.getElementById('inp-boatControlMode');
    if (boatControlModeSelect) {
        boatControlModeSelect.value = params.boatControlMode || 'auto';
        boatControlModeSelect.addEventListener('change', e => {
            params.boatControlMode = e.target.value;
            // Try to update existing boats without reinitializing
            if (window.updateBoatControlModes) {
                window.updateBoatControlModes();
            } else if (initBoatsCallback) {
                initBoatsCallback();
            }
        });
    }

    // Colors
    const bindColor = (id, paramKey, updateFn) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.value = params[paramKey];
        el.addEventListener('input', e => {
            params[paramKey] = e.target.value;
            if(updateFn) updateFn();
        });
    };

    const bindPalette = (prefix, paramKey, updateFn) => {
        for(let i=0; i<3; i++) {
            const el = document.getElementById(prefix + i);
            if(el) {
                el.value = params[paramKey][i];
                el.addEventListener('input', e => {
                    params[paramKey][i] = e.target.value;
                    if(updateFn) updateFn();
                });
            }
        }
    };

    bindColor('inp-color1', 'waterColor1', renderStaticBackgroundCallback);
    bindColor('inp-color2', 'waterColor2', renderStaticBackgroundCallback);
    bindColor('inp-padColor', 'padColor', initEnvironmentCallback); 
    bindColor('inp-grassColor', 'grassColor', initEnvironmentCallback);
    bindColor('inp-foodColor', 'foodColor');
    bindColor('inp-predatorColor', 'predatorColor', initPredatorsCallback);
    bindColor('inp-crocodileBodyColor', 'crocodileBodyColor', initCrocodilesCallback);
    bindColor('inp-crocodileEyeColor', 'crocodileEyeColor', initCrocodilesCallback);
    bindColor('inp-turtleColor', 'turtleColor', initTurtlesCallback);
    bindColor('inp-turtlePatternColor', 'turtlePatternColor', initTurtlesCallback);
    bindColor('inp-turtleHeadColor', 'turtleHeadColor', initTurtlesCallback);
    bindColor('inp-snailShellColor', 'snailShellColor', initSnailsCallback);
    bindColor('inp-snailBodyColor', 'snailBodyColor', initSnailsCallback);
    bindColor('inp-bloodColor', 'bloodColor');
    
    bindPalette('inp-pebbleColor', 'pebbleColors', initEnvironmentCallback);
    bindPalette('inp-flowerColor', 'flowerColors', initEnvironmentCallback);

    const rainCheck = document.getElementById('inp-rainMode');
    if (rainCheck) {
        rainCheck.checked = params.rainMode;
        rainCheck.addEventListener('change', e => { params.rainMode = e.target.checked; });
    }

    const jumpEnabledCheck = document.getElementById('inp-fishJumpEnabled');
    if (jumpEnabledCheck) {
        jumpEnabledCheck.checked = params.fishJumpEnabled;
        jumpEnabledCheck.addEventListener('change', e => { params.fishJumpEnabled = e.target.checked; });
    }

    const boatScareFishCheck = document.getElementById('inp-boatScareFish');
    if (boatScareFishCheck) {
        boatScareFishCheck.checked = params.boatScareFish !== false;
        boatScareFishCheck.addEventListener('change', e => { params.boatScareFish = e.target.checked; });
    }

    // Target FPS selector
    const fpsSelect = document.getElementById('inp-targetFPS');
    if (fpsSelect) {
        fpsSelect.value = params.targetFPS;
        fpsSelect.addEventListener('change', e => {
            params.targetFPS = parseInt(e.target.value);
        });
    }

    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    document.getElementById('btn-copy')?.addEventListener('click', async () => {
        const data = JSON.stringify(params, null, 2);
        const msg = document.getElementById('copy-msg');
        
        try {
            await navigator.clipboard.writeText(data);
            if (msg) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 2000);
            }
        } catch (err) {
            // Fallback for older browsers
            const el = document.createElement('textarea');
            el.value = data;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            if (msg) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 2000);
            }
        }
    });

    document.getElementById('btn-import')?.addEventListener('click', () => {
        const input = prompt("Paste your configuration JSON here:");
        if (!input) return;
        
        try {
            const newParams = JSON.parse(input);
            Object.assign(params, newParams);
            
            inputs.forEach(key => {
                const el = document.getElementById('inp-' + key);
                const disp = document.getElementById('val-' + key);
                if(el && params[key] !== undefined) {
                    el.value = params[key];
                    if(disp) disp.textContent = params[key];
                }
            });

            if(document.getElementById('inp-color1')) document.getElementById('inp-color1').value = params.waterColor1;
            if(document.getElementById('inp-color2')) document.getElementById('inp-color2').value = params.waterColor2;
            if(document.getElementById('inp-padColor')) document.getElementById('inp-padColor').value = params.padColor;
            if(document.getElementById('inp-foodColor')) document.getElementById('inp-foodColor').value = params.foodColor;
            if(document.getElementById('inp-predatorColor')) document.getElementById('inp-predatorColor').value = params.predatorColor;
            if(document.getElementById('inp-crocodileBodyColor')) document.getElementById('inp-crocodileBodyColor').value = params.crocodileBodyColor;
            if(document.getElementById('inp-crocodileEyeColor')) document.getElementById('inp-crocodileEyeColor').value = params.crocodileEyeColor;
            if(document.getElementById('inp-bloodColor')) document.getElementById('inp-bloodColor').value = params.bloodColor;

            for(let i=0; i<3; i++) {
                const pEl = document.getElementById('inp-pebbleColor' + i);
                if(pEl && params.pebbleColors) pEl.value = params.pebbleColors[i];
                
                const fEl = document.getElementById('inp-flowerColor' + i);
                if(fEl && params.flowerColors) fEl.value = params.flowerColors[i];
            }

            if(document.getElementById('inp-padFormation')) document.getElementById('inp-padFormation').value = params.padFormation;
            if(document.getElementById('inp-flowerType')) document.getElementById('inp-flowerType').value = params.flowerType;
            if(document.getElementById('inp-birthMode')) document.getElementById('inp-birthMode').value = params.birthMode;
            if(document.getElementById('inp-pattern')) document.getElementById('inp-pattern').value = params.pattern || 'Random';
            if(document.getElementById('inp-rainMode')) document.getElementById('inp-rainMode').checked = params.rainMode;
            if(document.getElementById('inp-fishJumpEnabled')) document.getElementById('inp-fishJumpEnabled').checked = params.fishJumpEnabled;
            if(document.getElementById('inp-targetFPS') && params.targetFPS) document.getElementById('inp-targetFPS').value = params.targetFPS;

            if (initFishCallback) initFishCallback();
            if (initPredatorsCallback) initPredatorsCallback();
            if (initTurtlesCallback) initTurtlesCallback();
            if (initSnailsCallback) initSnailsCallback();
            if (initEnvironmentCallback) initEnvironmentCallback();
            if (renderStaticBackgroundCallback) renderStaticBackgroundCallback();
            initDualRangeSliders(); // Update dual range fills after import
            
            alert("Configuration loaded successfully!");

        } catch(e) {
            alert("Error parsing JSON. Please check the format.");
            console.error(e);
        }
    });
    
    // Advanced Settings toggle
    document.getElementById('toggle-advanced')?.addEventListener('click', () => {
        const section = document.getElementById('advanced-settings');
        const toggle = document.getElementById('toggle-advanced');
        if (section && toggle) {
            if (section.style.display === 'none') {
                section.style.display = 'block';
                const span = toggle.querySelector('span');
                if (span) span.textContent = '(click to collapse)';
            } else {
                section.style.display = 'none';
                const span = toggle.querySelector('span');
                if (span) span.textContent = '(click to expand)';
            }
        }
    });
    
    // Initialize dual range sliders after all values are set
    initDualRangeSliders();
}
