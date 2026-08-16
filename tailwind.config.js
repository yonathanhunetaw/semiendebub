import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
        './resources/js/**/*.tsx',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
                "headline-md": ["Inter"],
                "mono-data": ["JetBrains Mono"],
                "headline-sm": ["Inter"],
                "body-sm": ["Inter"],
                "body-lg": ["Inter"],
                "display-lg": ["Inter"],
                "body-md": ["Inter"],
                "label-caps": ["Inter"]
            },
            colors: {
                "inverse-primary": "#c3c0ff",
                "on-secondary": "#ffffff",
                "on-surface-variant": "#c7d1df",
                "error-container": "#93000a",
                "on-tertiary": "#ffffff",
                "secondary-fixed-dim": "#bec6e0",
                "on-error": "#ffffff",
                "primary-container": "#4f46e5",
                "surface-container": "#151e28",
                "on-tertiary-container": "#ffd2be",
                "outline": "#7e8b9a",
                "tertiary-container": "#a44100",
                "tertiary-fixed-dim": "#ffb695",
                "surface-container-highest": "#334151",
                "error": "#ffb4ab",
                "outline-variant": "#435261",
                "secondary": "#a2acbe",
                "background": "#0b1118",
                "on-secondary-container": "#d6e0f2",
                "surface-container-low": "#111821",
                "on-secondary-fixed-variant": "#3f465c",
                "surface-container-lowest": "#0b1118",
                "tertiary-fixed": "#ffdbcc",
                "tertiary": "#ffb695",
                "on-primary-fixed": "#0f0069",
                "on-primary-fixed-variant": "#3323cc",
                "secondary-container": "#3f4859",
                "primary-fixed-dim": "#c3c0ff",
                "surface-variant": "#435261",
                "secondary-fixed": "#dae2fd",
                "on-tertiary-fixed-variant": "#7b2f00",
                "on-surface": "#e2e8f0",
                "surface-bright": "#334151",
                "surface-tint": "#c3c0ff",
                "inverse-on-surface": "#0b1118",
                "primary": "#7dd3fc",
                "inverse-surface": "#e2e8f0",
                "on-tertiary-fixed": "#351000",
                "on-secondary-fixed": "#131b2e",
                "surface-dim": "#0b1118",
                "on-primary": "#1b00a7",
                "on-background": "#e2e8f0",
                "surface-container-high": "#1f2a36",
                "on-primary-container": "#dad7ff",
                "primary-fixed": "#e2dfff",
                "on-error-container": "#ffdad6",
                "surface": "#0b1118"
            },
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
