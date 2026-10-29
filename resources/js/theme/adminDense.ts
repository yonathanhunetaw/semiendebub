/**
 * The admin dashboard's sizing, as a theme layer for every admin page.
 *
 * The dashboard is built from small text (0.625-0.8125rem), 8px panels with a
 * 1px divider border, tight tables and compact controls. Other admin pages used
 * MUI's defaults (h4 headings, 16px cards, 14px+ cells, full-size chips), so the
 * app read as two different products. AdminLayout wraps the page area in this
 * layer, so both look alike without touching each page. It is applied on top of
 * the role theme (colours stay the role's), and only inside the admin app.
 */
import { createTheme, type Theme } from '@mui/material/styles';
import { MUI_RADIUS_PX } from './tokens';

/** Panel radius: the dashboard's `borderRadius: 2` (2 x shape.borderRadius). */
const PANEL = 2;

export function adminDenseTheme(outer: Theme): Theme {
    const radius = MUI_RADIUS_PX * PANEL;

    return createTheme(outer, {
        typography: {
            h1: { fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.25 },
            h2: { fontSize: '1.375rem', fontWeight: 800, lineHeight: 1.25 },
            h3: { fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3 },
            h4: { fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.3 },
            h5: { fontSize: '1rem', fontWeight: 800, lineHeight: 1.3 },
            h6: { fontSize: '0.875rem', fontWeight: 800, lineHeight: 1.35 },
            subtitle1: { fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.4 },
            subtitle2: { fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.4 },
            body1: { fontSize: '0.8125rem', lineHeight: 1.45 },
            body2: { fontSize: '0.75rem', lineHeight: 1.45 },
            caption: { fontSize: '0.6875rem', lineHeight: 1.3 },
            overline: { fontSize: '0.625rem', lineHeight: 1.3 },
            button: { fontSize: '0.75rem', fontWeight: 600, textTransform: 'none' },
        },
        components: {
            // Panels: thin divider border, no shadow, 8px corners.
            MuiPaper: {
                styleOverrides: {
                    rounded: { borderRadius: radius },
                    outlined: { borderColor: outer.palette.divider, backgroundColor: outer.palette.background.paper },
                },
            },
            MuiCard: {
                defaultProps: { elevation: 0 },
                styleOverrides: { root: { borderRadius: radius } },
            },
            MuiCardHeader: {
                styleOverrides: {
                    root: { padding: '10px 12px' },
                    title: { fontSize: '0.8125rem', fontWeight: 800 },
                    subheader: { fontSize: '0.6875rem' },
                },
            },
            MuiCardContent: {
                styleOverrides: { root: { padding: 12, '&:last-child': { paddingBottom: 12 } } },
            },
            MuiCardActions: { styleOverrides: { root: { padding: '6px 12px' } } },

            // Tables: tight rows, quiet header.
            MuiTableCell: {
                styleOverrides: {
                    root: { padding: '6px 10px', fontSize: '0.75rem', borderColor: outer.palette.divider },
                    sizeSmall: { padding: '5px 10px' },
                    head: {
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        color: outer.palette.text.secondary,
                        backgroundColor: outer.palette.action.hover,
                        whiteSpace: 'nowrap',
                    },
                },
            },
            // Rows light up under the pointer, as the dashboard's lists do.
            MuiTableRow: {
                styleOverrides: { root: { '&.MuiTableRow-hover:hover, tbody &:hover': { backgroundColor: outer.palette.action.hover } } },
            },
            MuiTablePagination: {
                styleOverrides: {
                    toolbar: { minHeight: 40, paddingLeft: 10, paddingRight: 6 },
                    selectLabel: { fontSize: '0.6875rem' },
                    displayedRows: { fontSize: '0.6875rem' },
                },
            },

            // Buttons: the dashboard's small, non-uppercase actions.
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: {
                    root: { fontSize: '0.75rem', borderRadius: MUI_RADIUS_PX * 1.5 },
                    sizeMedium: { padding: '4px 12px' },
                    sizeSmall: { fontSize: '0.6875rem', padding: '2px 8px' },
                    sizeLarge: { fontSize: '0.8125rem', padding: '6px 16px' },
                },
            },
            MuiIconButton: {
                styleOverrides: { sizeMedium: { padding: 6 }, sizeSmall: { padding: 4 } },
            },
            MuiToggleButton: {
                styleOverrides: { root: { fontSize: '0.6875rem', padding: '4px 10px' } },
            },

            // Chips read like the dashboard's pills.
            MuiChip: {
                styleOverrides: {
                    root: { height: 22, fontSize: '0.6875rem', fontWeight: 700, borderRadius: MUI_RADIUS_PX * 1.5 },
                    sizeSmall: { height: 20, fontSize: '0.625rem' },
                    label: { paddingLeft: 8, paddingRight: 8 },
                    labelSmall: { paddingLeft: 6, paddingRight: 6 },
                },
            },

            // Fields: compact by default.
            MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
            MuiFormControl: { defaultProps: { size: 'small' } },
            MuiInputBase: {
                styleOverrides: { root: { fontSize: '0.8125rem' } },
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: { borderRadius: MUI_RADIUS_PX * 1.5 },
                    input: { padding: '7px 10px' },
                    inputSizeSmall: { padding: '6px 10px' },
                },
            },
            MuiInputLabel: {
                styleOverrides: { root: { fontSize: '0.8125rem' }, shrink: { fontSize: '0.8125rem' } },
            },
            MuiFormHelperText: { styleOverrides: { root: { fontSize: '0.6875rem', marginTop: 2 } } },
            MuiFormControlLabel: {
                styleOverrides: { label: { fontSize: '0.8125rem' } },
            },
            MuiCheckbox: { defaultProps: { size: 'small' } },
            MuiRadio: { defaultProps: { size: 'small' } },
            MuiSwitch: { defaultProps: { size: 'small' } },

            // Tabs, menus, lists.
            MuiTabs: { styleOverrides: { root: { minHeight: 36 } } },
            MuiTab: {
                styleOverrides: { root: { minHeight: 36, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700 } },
            },
            MuiMenuItem: { styleOverrides: { root: { minHeight: 32, fontSize: '0.75rem' } } },
            MuiListItemText: {
                styleOverrides: {
                    primary: { fontSize: '0.8125rem' },
                    secondary: { fontSize: '0.6875rem' },
                },
            },
            MuiListItemButton: { styleOverrides: { root: { paddingTop: 4, paddingBottom: 4 } } },

            // Dialogs.
            MuiDialog: {
                styleOverrides: { paper: { borderRadius: MUI_RADIUS_PX * 3 } },
            },
            MuiDialogTitle: {
                styleOverrides: { root: { padding: '12px 16px', fontSize: '0.9375rem', fontWeight: 800 } },
            },
            MuiDialogContent: { styleOverrides: { root: { padding: '8px 16px' } } },
            MuiDialogActions: { styleOverrides: { root: { padding: '8px 16px 12px' } } },

            // Feedback.
            MuiAlert: {
                styleOverrides: {
                    root: { padding: '2px 10px', fontSize: '0.75rem', borderRadius: radius },
                    icon: { padding: '6px 0', fontSize: 18 },
                    message: { padding: '6px 0' },
                },
            },
            MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.6875rem' } } },
            MuiAccordion: {
                defaultProps: { disableGutters: true, elevation: 0 },
                styleOverrides: { root: { borderRadius: radius, border: `1px solid ${outer.palette.divider}`, '&:before': { display: 'none' } } },
            },
            MuiAccordionSummary: {
                styleOverrides: { root: { minHeight: 40, padding: '0 12px' }, content: { margin: '8px 0' } },
            },
        },
    });
}
