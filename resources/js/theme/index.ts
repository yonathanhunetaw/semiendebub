/**
 * Public theme API. `@/theme` resolves here.
 *
 * Source of truth: tokens.ts (values) and roles.ts (roles, hostname rule).
 * After changing either, run `npm run tokens` in the container.
 *
 * ColorModeIconDropdown is deliberately not re-exported: it imports from
 * `@/app`, which imports this file.
 */
import { getRole, ROLES, type RoleKey } from './roles';
import { ROLE_PALETTES } from './tokens';

export * from './roles';
export * from './tokens';
export {
    buildScheme,
    COLOR_TOKENS,
    DEFAULT_THEME_SETTING,
    THEME_STORAGE_KEY,
    type ColorToken,
    type Scheme,
    type ThemeSetting,
} from './cssVars';
export { getDesignTokens } from './muiTheme';
export { contrastRatio } from './color';

// ---------------------------------------------------------------------------
// Deprecated: the old per-subdomain config, kept so existing layouts compile.
// Removed in Phase 2 once layouts use resolveRole()/useRole().
// ---------------------------------------------------------------------------

/** @deprecated Use RoleKey. Keys are hostname labels, not role keys. */
export type SubdomainType =
    | 'admin'
    | 'auth'
    | 'dev'
    | 'finance'
    | 'marketing'
    | 'seller'
    | 'delivery'
    | 'procurement'
    | 'stockkeeper'
    | 'stock'
    | 'vendor'
    | 'shared';

interface SubdomainConfig {
    color: string;
    icon: string;
    label: string;
}

const configFor = (key: RoleKey): SubdomainConfig => {
    const role = getRole(key);
    return { color: ROLE_PALETTES[key].primary.light, icon: role.icon, label: role.label };
};

/** @deprecated Use ROLES / getRole() and the role's tokens. */
export const subdomainConfigs = {
    ...Object.fromEntries(ROLES.flatMap((r) => r.subdomains.map((s) => [s, configFor(r.key)]))),
    auth: { ...configFor('admin'), icon: 'Lock', label: 'Auth' },
} as Record<SubdomainType, SubdomainConfig>;
