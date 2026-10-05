/**
 * Raw design values. Everything else (tokens.css, the Tailwind color names,
 * the MUI theme) is derived from this file and roles.ts.
 *
 * After editing, run `npm run tokens` in the container to regenerate
 * resources/css/tokens.css and the pre-paint Blade partial.
 */
import type { RoleKey } from './roles';

export type Mode = 'light' | 'dark';

export interface ModePair {
    light: string;
    dark: string;
}

/** Shared neutrals, identical in every module. */
export const NEUTRALS = {
    background: { light: '#f8fafc', dark: '#0b1118' },
    surface: { light: '#f8fafc', dark: '#0b1118' },
    'surface-dim': { light: '#e2e8f0', dark: '#0b1118' },
    'surface-bright': { light: '#ffffff', dark: '#334151' },
    'surface-container-lowest': { light: '#ffffff', dark: '#0b1118' },
    'surface-container-low': { light: '#f8fafc', dark: '#111821' },
    'surface-container': { light: '#f1f5f9', dark: '#151e28' },
    'surface-container-high': { light: '#e2e8f0', dark: '#1f2a36' },
    'surface-container-highest': { light: '#cbd5e1', dark: '#334151' },
    'surface-variant': { light: '#e2e8f0', dark: '#435261' },
    'on-surface': { light: '#0f172a', dark: '#e2e8f0' },
    'on-background': { light: '#0f172a', dark: '#e2e8f0' },
    'on-surface-variant': { light: '#475569', dark: '#c7d1df' },
    outline: { light: '#64748b', dark: '#7e8b9a' }, // light darkened from #94a3b8: 3:1 for input borders
    'outline-variant': { light: '#e2e8f0', dark: '#435261' },
    'inverse-surface': { light: '#0f172a', dark: '#e2e8f0' },
    'inverse-on-surface': { light: '#f8fafc', dark: '#0b1118' },

    // M3 "secondary" is a neutral slate here; Stitch emits it, so it must resolve.
    secondary: { light: '#475569', dark: '#a2acbe' },
    'on-secondary': { light: '#ffffff', dark: '#0f172a' },
    'secondary-container': { light: '#e2e8f0', dark: '#3f4859' },
    'on-secondary-container': { light: '#1e293b', dark: '#d6e0f2' },
    // *-fixed tokens are mode-independent by M3 definition.
    'secondary-fixed': { light: '#dae2fd', dark: '#dae2fd' },
    'secondary-fixed-dim': { light: '#bec6e0', dark: '#bec6e0' },
    'on-secondary-fixed': { light: '#131b2e', dark: '#131b2e' },
    'on-secondary-fixed-variant': { light: '#3f465c', dark: '#3f465c' },
} as const satisfies Record<string, ModePair>;

export type NeutralToken = keyof typeof NEUTRALS;

/** Status hues, identical in every module. Role hues must stay clear of these. */
export const STATUS = {
    error: { light: '#dc2626', dark: '#f87171' },
    success: { light: '#16a34a', dark: '#4ade80' },
    warning: { light: '#d97706', dark: '#fbbf24' },
    info: { light: '#0369a1', dark: '#38bdf8' }, // light darkened from #0284c7 for 4.5:1 with on-info
} as const satisfies Record<string, ModePair>;

export type StatusName = keyof typeof STATUS;

export interface RolePalette {
    /** Module accent. Dark is the lighter step so it reads on dark surfaces. */
    primary: ModePair;
    /** Optional second accent, exposed as `tertiary`. Defaults to `primary`. */
    accent?: ModePair;
    /**
     * Optional `primary-container` per mode, for a role whose soft fill was
     * picked by eye rather than derived. A mode left out keeps the derived tint.
     */
    container?: Partial<ModePair>;
}

export const ROLE_PALETTES: Record<RoleKey, RolePalette> = {
    shared: { primary: { light: '#64748b', dark: '#94a3b8' } }, // slate
    admin: { primary: { light: '#4f46e5', dark: '#818cf8' } }, // indigo
    delivery: { primary: { light: '#9333ea', dark: '#c084fc' } }, // purple
    dev: {
        primary: { light: '#374151', dark: '#9ca3af' }, // graphite
        accent: { light: '#16a34a', dark: '#4ade80' }, // terminal green
    },
    finance: { primary: { light: '#1e3a5f', dark: '#7da4d0' } }, // navy
    marketing: { primary: { light: '#be185d', dark: '#f7709a' } }, // pink
    procurement: { primary: { light: '#b5179e', dark: '#e76fd8' } }, // magenta
    seller: {
        primary: { light: '#c2410c', dark: '#fb923c' }, // orange
        container: { light: '#ffedd5' }, // the Stitch seller screens' orange-100 (derived: #f6e4dd)
    },
    stock_keeper: { primary: { light: '#1d4ed8', dark: '#60a5fa' } }, // blue
    vendor: { primary: { light: '#0e7490', dark: '#22d3ee' } }, // cyan
};

/** Endpoints the derivation helpers tint toward. */
export const WHITE = '#ffffff';
export const INK = '#0f172a';

export const FONT_SANS_STACK = [
    '"Inter Variable"',
    'Inter',
    'ui-sans-serif',
    'system-ui',
    'sans-serif',
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
] as const;

/** CSS font-family value for places that need a single string (MUI, sx). */
export const FONT_SANS = FONT_SANS_STACK.join(', ');

/** Radius scale, matching tailwind.config.js borderRadius (rem). */
export const RADIUS = {
    DEFAULT: '0.125rem',
    lg: '0.25rem',
    xl: '0.5rem',
    full: '0.75rem',
    'round-twelve': '0.75rem',
} as const;

/** MUI shape.borderRadius in px; equals Tailwind `rounded-lg`. */
export const MUI_RADIUS_PX = 4;
