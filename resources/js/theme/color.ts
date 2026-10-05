/** Small color helpers for deriving tokens. Pure functions, no DOM. */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
    return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Space-separated channels for `rgb(var(--x) / <alpha-value>)`. */
export function hexToChannels(hex: string): string {
    return hexToRgb(hex).join(' ');
}

/** Linear mix in sRGB: weight 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, weight: number): string {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return rgbToHex([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * weight) as Rgb);
}

export function relativeLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of `light` / `dark` reads better on `bg`. */
export function pickOn(bg: string, light = '#ffffff', dark = '#0f172a'): string {
    return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

/** OKLCH hue in degrees, for checking that role hues stay apart. */
export function oklchHue(hex: string): { l: number; c: number; h: number } {
    const [r, g, b] = hexToRgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const h = (Math.atan2(B, A) * 180) / Math.PI;
    return { l: L, c: Math.sqrt(A * A + B * B), h: h < 0 ? h + 360 : h };
}
