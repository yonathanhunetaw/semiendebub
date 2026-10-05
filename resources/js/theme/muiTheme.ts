/**
 * MUI theme built from the same scheme as the Tailwind tokens, so MUI and
 * Tailwind components agree while pages are mixed.
 */
import type { PaletteMode, ThemeOptions } from '@mui/material';
import { buildScheme } from './cssVars';
import { DEFAULT_ROLE, isRoleKey, type RoleKey } from './roles';
import { FONT_SANS, MUI_RADIUS_PX } from './tokens';

export function getDesignTokens(mode: PaletteMode, role: RoleKey = DEFAULT_ROLE): ThemeOptions {
    const s = buildScheme(isRoleKey(role) ? role : DEFAULT_ROLE, mode);

    return {
        palette: {
            mode,
            primary: {
                main: s.primary,
                contrastText: s['on-primary'],
            },
            secondary: {
                main: s.secondary,
                contrastText: s['on-secondary'],
            },
            error: { main: s.error, contrastText: s['on-error'] },
            warning: { main: s.warning, contrastText: s['on-warning'] },
            info: { main: s.info, contrastText: s['on-info'] },
            success: { main: s.success, contrastText: s['on-success'] },
            background: {
                default: s.background,
                paper: s['surface-container-lowest'],
            },
            text: {
                primary: s['on-surface'],
                secondary: s['on-surface-variant'],
            },
            divider: s['outline-variant'],
        },
        shape: {
            borderRadius: MUI_RADIUS_PX,
        },
        typography: {
            fontFamily: FONT_SANS,
            button: { textTransform: 'none', fontWeight: 600 },
        },
        components: {
            MuiButton: {
                defaultProps: { disableElevation: true },
            },
            MuiPaper: {
                // MUI's dark-mode elevation overlay would tint surfaces away from the tokens.
                styleOverrides: { root: { backgroundImage: 'none' } },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        backgroundColor: s['surface-container-lowest'],
                        border: `1px solid ${s['outline-variant']}`,
                    },
                },
            },
            MuiChip: {
                styleOverrides: { root: { fontWeight: 500 } },
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        backgroundColor: s['surface-container-low'],
                        borderColor: s['outline-variant'],
                    },
                },
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    notchedOutline: { borderColor: s.outline },
                },
            },
            MuiTextField: {
                defaultProps: { variant: 'outlined' },
            },
            MuiTooltip: {
                styleOverrides: {
                    tooltip: {
                        backgroundColor: s['inverse-surface'],
                        color: s['inverse-on-surface'],
                    },
                },
            },
        },
    };
}
