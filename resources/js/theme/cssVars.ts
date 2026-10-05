/**
 * Builds the resolved color scheme for a role x mode, and from it the CSS
 * variable blocks (resources/css/tokens.css) and the pre-paint script.
 *
 * buildScheme() is the single derivation used by both Tailwind (through the
 * generated CSS variables) and MUI (muiTheme.ts), so the two always agree.
 */
import { contrastRatio, hexToChannels, mix, pickOn } from './color';
import { DEFAULT_ROLE, ROLES, SUBDOMAIN_TO_ROLE, type RoleKey } from './roles';
import { INK, NEUTRALS, ROLE_PALETTES, STATUS, WHITE, type Mode, type ModePair, type NeutralToken, type StatusName } from './tokens';

export type ThemeSetting = 'light' | 'dark' | 'system';

/** localStorage key for the user's light/dark/system choice. */
export const THEME_STORAGE_KEY = 'duka.theme.mode';
export const DEFAULT_THEME_SETTING: ThemeSetting = 'light';

type RoleToken =
    | 'primary'
    | 'on-primary'
    | 'primary-container'
    | 'on-primary-container'
    | 'inverse-primary'
    | 'surface-tint'
    | 'primary-fixed'
    | 'primary-fixed-dim'
    | 'on-primary-fixed'
    | 'on-primary-fixed-variant'
    | 'tertiary'
    | 'on-tertiary'
    | 'tertiary-container'
    | 'on-tertiary-container'
    | 'tertiary-fixed'
    | 'tertiary-fixed-dim'
    | 'on-tertiary-fixed'
    | 'on-tertiary-fixed-variant';

type StatusToken = StatusName | `on-${StatusName}` | `${StatusName}-container` | `on-${StatusName}-container`;

export type ColorToken = NeutralToken | RoleToken | StatusToken;
export type Scheme = Record<ColorToken, string>;

/** Darkest surface; dark-mode containers are tinted toward it. */
const DARK_BASE = NEUTRALS.surface.dark;

interface Family {
    base: string;
    on: string;
    container: string;
    onContainer: string;
}

/** base / on-base / container / on-container for one accent in one mode. */
export function deriveFamily(pair: ModePair, mode: Mode): Family {
    if (mode === 'light') {
        const base = pair.light;
        return {
            base,
            on: pickOn(base, WHITE, INK),
            container: mix(pair.light, WHITE, 0.86),
            onContainer: mix(pair.light, INK, 0.5),
        };
    }
    const base = pair.dark;
    return {
        base,
        on: pickOn(base, WHITE, INK),
        container: mix(pair.light, DARK_BASE, 0.5),
        onContainer: mix(pair.dark, WHITE, 0.7),
    };
}

/** M3 "fixed" variants: identical in both modes. */
function deriveFixed(pair: ModePair) {
    return {
        fixed: mix(pair.light, WHITE, 0.86),
        fixedDim: pair.dark,
        onFixed: mix(pair.light, INK, 0.65),
        onFixedVariant: pair.light,
    };
}

export function buildRoleScheme(role: RoleKey, mode: Mode): Record<RoleToken, string> {
    const palette = ROLE_PALETTES[role] ?? ROLE_PALETTES[DEFAULT_ROLE];
    const p = deriveFamily(palette.primary, mode);
    const container = palette.container?.[mode];
    if (container) p.container = container;
    const pf = deriveFixed(palette.primary);
    const accent = palette.accent ?? palette.primary;
    const t = deriveFamily(accent, mode);
    const tf = deriveFixed(accent);

    return {
        primary: p.base,
        'on-primary': p.on,
        'primary-container': p.container,
        'on-primary-container': p.onContainer,
        'inverse-primary': mode === 'light' ? palette.primary.dark : palette.primary.light,
        'surface-tint': p.base,
        'primary-fixed': pf.fixed,
        'primary-fixed-dim': pf.fixedDim,
        'on-primary-fixed': pf.onFixed,
        'on-primary-fixed-variant': pf.onFixedVariant,
        tertiary: t.base,
        'on-tertiary': t.on,
        'tertiary-container': t.container,
        'on-tertiary-container': t.onContainer,
        'tertiary-fixed': tf.fixed,
        'tertiary-fixed-dim': tf.fixedDim,
        'on-tertiary-fixed': tf.onFixed,
        'on-tertiary-fixed-variant': tf.onFixedVariant,
    };
}

export function buildSharedScheme(mode: Mode): Record<NeutralToken | StatusToken, string> {
    const out = {} as Record<NeutralToken | StatusToken, string>;
    for (const [name, pair] of Object.entries(NEUTRALS) as [NeutralToken, ModePair][]) {
        out[name] = pair[mode];
    }
    for (const [name, pair] of Object.entries(STATUS) as [StatusName, ModePair][]) {
        const f = deriveFamily(pair, mode);
        out[name] = f.base;
        out[`on-${name}`] = f.on;
        out[`${name}-container`] = f.container;
        out[`on-${name}-container`] = f.onContainer;
    }
    return out;
}

/** Every token, resolved to hex, for one role in one mode. */
export function buildScheme(role: RoleKey, mode: Mode): Scheme {
    return { ...buildSharedScheme(mode), ...buildRoleScheme(role, mode) };
}

/** All color token names, in a stable order (used by tailwind.config.js). */
export const COLOR_TOKENS = Object.keys(buildScheme(DEFAULT_ROLE, 'light')) as ColorToken[];

function block(selector: string, vars: Record<string, string>, extra: string[] = []): string {
    const lines = Object.entries(vars).map(([k, v]) => `    --${k}: ${hexToChannels(v)};`);
    return `${selector} {\n${[...extra.map((e) => `    ${e}`), ...lines].join('\n')}\n}\n`;
}

/**
 * The full tokens.css. Values are space-separated RGB channels so Tailwind's
 * `rgb(var(--primary) / <alpha-value>)` opacity modifiers work.
 *
 * Neutrals and status follow the nearest `data-mode` (light also on `:root`);
 * role accents follow the nearest element carrying both `data-role` and
 * `data-mode`, falling back to the default role on `:root`. So setting both
 * attributes on any element scopes that subtree to a role x mode, even inside
 * an <html> in the other mode (the Dev design-system preview relies on this).
 * Tailwind's `dark:` variant still follows the nearest `[data-mode="dark"]`
 * ancestor, so components meant for nested previews use tokens, not `dark:`.
 */
export function buildTokensCss(): string {
    const parts: string[] = [
        '/*\n * GENERATED by `npm run tokens` from resources/js/theme/{tokens,roles,cssVars}.ts.\n * Do not edit by hand.\n */\n',
        block(':root,\n[data-mode="light"]', buildSharedScheme('light'), ['color-scheme: light;']),
        block('[data-mode="dark"]', buildSharedScheme('dark'), ['color-scheme: dark;']),
        block(':root', buildRoleScheme(DEFAULT_ROLE, 'light')),
        block(':root[data-mode="dark"]', buildRoleScheme(DEFAULT_ROLE, 'dark')),
    ];
    for (const role of ROLES) {
        for (const mode of ['light', 'dark'] as const) {
            parts.push(block(`[data-role="${role.key}"][data-mode="${mode}"]`, buildRoleScheme(role.key, mode)));
        }
    }
    return parts.join('\n');
}

/**
 * Inline script for <head>: sets data-mode and data-role on <html> before
 * first paint. Same storage key, same default and same hostname rule as
 * app.tsx / resolveRole().
 */
export function buildPrepaintScript(): string {
    const map = JSON.stringify(SUBDOMAIN_TO_ROLE);
    return [
        '(function () {',
        '    var d = document.documentElement;',
        `    var m = ${JSON.stringify(DEFAULT_THEME_SETTING)};`,
        '    try {',
        `        var s = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
        "        if (s === 'light' || s === 'dark' || s === 'system') m = s;",
        '    } catch (e) {}',
        "    if (m === 'system') {",
        "        m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';",
        '    }',
        `    var roles = ${map};`,
        "    var p = window.location.hostname.toLowerCase().split('.');",
        `    var r = (p.length > 2 && roles[p[0]]) || ${JSON.stringify(DEFAULT_ROLE)};`,
        "    d.setAttribute('data-mode', m);",
        "    d.setAttribute('data-role', r);",
        '})();',
    ].join('\n');
}

/** Contrast pairs reported by the swatch check. */
export const CONTRAST_PAIRS: [fg: ColorToken, bg: ColorToken, minimum: number][] = [
    ['on-primary', 'primary', 4.5],
    ['on-primary-container', 'primary-container', 4.5],
    ['primary', 'surface', 4.5],
    ['primary', 'surface-container-lowest', 4.5],
    ['on-surface', 'surface', 4.5],
    ['on-surface-variant', 'surface', 4.5],
    ['on-surface-variant', 'surface-container-high', 4.5],
    ['outline', 'surface', 3],
    ['on-error', 'error', 4.5],
    ['on-success', 'success', 4.5],
    ['on-warning', 'warning', 4.5],
    ['on-info', 'info', 4.5],
    ['on-error-container', 'error-container', 4.5],
    ['on-success-container', 'success-container', 4.5],
    ['on-warning-container', 'warning-container', 4.5],
    ['on-info-container', 'info-container', 4.5],
    ['error', 'surface', 4.5],
    ['on-tertiary', 'tertiary', 4.5],
];

export function contrastOf(scheme: Scheme, fg: ColorToken, bg: ColorToken): number {
    return contrastRatio(scheme[fg], scheme[bg]);
}
