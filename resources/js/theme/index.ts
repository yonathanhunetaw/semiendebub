/**
 * Public theme API. `@/theme` resolves here.
 *
 * Source of truth: tokens.ts (values) and roles.ts (roles, hostname rule).
 * After changing either, run `npm run tokens` in the container.
 *
 * ColorModeIconDropdown is deliberately not re-exported: it imports from
 * `@/app`, which imports this file.
 */
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
export { detectRole, RoleContext, useRole, useRoleFavicon } from './useRole';
