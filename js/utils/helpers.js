// Utility helper functions

import { CULL_MARGIN } from '../config.js';

// Canvas dimensions (will be set by RenderManager)
export let width = 0;
export let height = 0;

export function setDimensions(w, h) {
    width = w;
    height = h;
}

// Random number in range
export const rand = (min, max) => Math.random() * (max - min) + min;

// Distance between two points
export const dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Angle between two points
export const angle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

// Linear interpolation
export const lerp = (a, b, t) => a + (b - a) * t;

// Convert hex color to HSL
export function hexToHSL(H) {
    let r = 0, g = 0, b = 0;
    if (H.length == 4) {
        r = "0x" + H[1] + H[1];
        g = "0x" + H[2] + H[2];
        b = "0x" + H[3] + H[3];
    } else if (H.length == 7) {
        r = "0x" + H[1] + H[2];
        g = "0x" + H[3] + H[4];
        b = "0x" + H[5] + H[6];
    }
    r /= 255;
    g /= 255;
    b /= 255;
    let cmin = Math.min(r,g,b),
        cmax = Math.max(r,g,b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0;

    if (delta == 0)
        h = 0;
    else if (cmax == r)
        h = ((g - b) / delta) % 6;
    else if (cmax == g)
        h = (b - r) / delta + 2;
    else
        h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}

// Check if coordinates are in view
export function isInView(x, y, margin = CULL_MARGIN) {
    return x >= -margin && x <= width + margin &&
           y >= -margin && y <= height + margin;
}

// Check if object is in view (supports both {pos: {x, y}} and {x, y} formats)
export function isObjectInView(obj, margin = CULL_MARGIN) {
    const x = obj.pos ? obj.pos.x : obj.x;
    const y = obj.pos ? obj.pos.y : obj.y;
    return isInView(x, y, margin);
}
