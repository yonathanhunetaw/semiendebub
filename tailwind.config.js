import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

const inter = ['"Inter Variable"', 'Inter', ...defaultTheme.fontFamily.sans];

/** @type {import('tailwindcss').Config} */
export default {
    // `dark:` follows the app's mode setting (set on <html> by the pre-paint
    // script and app.tsx), not the OS preference.
    darkMode: ['selector', '[data-mode="dark"]'],

    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
        './resources/js/**/*.tsx',
        // Shared class-name tokens live in plain .ts modules (e.g.
        // Components/Storefront/storefrontConstants.ts). Without this glob
        // Tailwind never sees them, so utilities used *only* there are never
        // generated — which is what silently flattened the storefront's
        // desktop layout to its 480px mobile shell.
        './resources/js/**/*.ts',
    ],

    theme: {
        extend: {
            // One family everywhere: Inter (bundled via @fontsource-variable/inter).
            fontFamily: {
                sans: inter,
                "headline-md": inter,
                "mono-data": inter,
                "headline-sm": inter,
                "body-sm": inter,
                "body-lg": inter,
                "display-lg": inter,
                "body-md": inter,
                "label-caps": inter
            },
            // Material 3 / Stitch names. Values are CSS variables from
            // resources/css/tokens.css (generated from resources/js/theme), so
            // they follow <html data-role> and <html data-mode>.
            colors: Object.fromEntries(
                [
                    'background',
                    'error',
                    'error-container',
                    'inverse-on-surface',
                    'inverse-primary',
                    'inverse-surface',
                    'on-background',
                    'on-error',
                    'on-error-container',
                    'on-primary',
                    'on-primary-container',
                    'on-primary-fixed',
                    'on-primary-fixed-variant',
                    'on-secondary',
                    'on-secondary-container',
                    'on-secondary-fixed',
                    'on-secondary-fixed-variant',
                    'on-surface',
                    'on-surface-variant',
                    'on-tertiary',
                    'on-tertiary-container',
                    'on-tertiary-fixed',
                    'on-tertiary-fixed-variant',
                    'outline',
                    'outline-variant',
                    'primary',
                    'primary-container',
                    'primary-fixed',
                    'primary-fixed-dim',
                    'secondary',
                    'secondary-container',
                    'secondary-fixed',
                    'secondary-fixed-dim',
                    'surface',
                    'surface-bright',
                    'surface-container',
                    'surface-container-high',
                    'surface-container-highest',
                    'surface-container-low',
                    'surface-container-lowest',
                    'surface-dim',
                    'surface-tint',
                    'surface-variant',
                    'tertiary',
                    'tertiary-container',
                    'tertiary-fixed',
                    'tertiary-fixed-dim',
                    // Status families (not in the original Stitch export).
                    'success',
                    'on-success',
                    'success-container',
                    'on-success-container',
                    'warning',
                    'on-warning',
                    'warning-container',
                    'on-warning-container',
                    'info',
                    'on-info',
                    'info-container',
                    'on-info-container',
                ].map((name) => [name, `rgb(var(--${name}) / <alpha-value>)`]),
            ),
            borderRadius: {
                "DEFAULT": "0.125rem",
                "lg": "0.25rem",
                "xl": "0.5rem",
                "full": "0.75rem",
                "round-twelve": "0.75rem"
            },
            spacing: {
                "2xl": "48px",
                "md": "16px",
                "base": "4px",
                "margin-desktop": "32px",
                "gutter": "20px",
                "xs": "4px",
                "xl": "32px",
                "margin-mobile": "16px",
                "lg": "24px",
                "sm": "8px"
            },
            fontSize: {
                "headline-md": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
                "mono-data": ["13px", { "lineHeight": "20px", "fontWeight": "450" }],
                "headline-sm": ["20px", { "lineHeight": "28px", "fontWeight": "600" }],
                "body-sm": ["12px", { "lineHeight": "18px", "fontWeight": "400" }],
                "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
                "display-lg": ["36px", { "lineHeight": "44px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
                "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
                "label-caps": ["11px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }]
            }
        },
    },

    plugins: [forms],
};
