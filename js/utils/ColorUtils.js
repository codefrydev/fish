// Color manipulation utilities

export function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

export function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return { r, g, b };
}

export function rgbToHex({ r, g, b }) {
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mixColors(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const k = clamp01(t);
    return rgbToHex({
        r: Math.round(ca.r + (cb.r - ca.r) * k),
        g: Math.round(ca.g + (cb.g - ca.g) * k),
        b: Math.round(ca.b + (cb.b - ca.b) * k)
    });
}

export function adjustColor(hex, amount) {
    if (amount >= 0) {
        return mixColors(hex, '#ffffff', clamp01(amount));
    }
    return mixColors(hex, '#000000', clamp01(-amount));
}

export function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToRgba(hex, alpha) {
    const h = hex.startsWith('#') ? hex.slice(1) : hex;
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
