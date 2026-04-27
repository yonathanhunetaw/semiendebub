import '../css/app.css';
import './bootstrap';
import * as React from 'react';
import { ThemeProvider, createTheme, CssBaseline, PaletteMode } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { getDesignTokens, SubdomainType } from './theme';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// 1. Create a Context so child pages (like Profile) can change the theme
export const ThemeContext = React.createContext({
    toggleTheme: (newMode: 'light' | 'dark' | 'system') => {},
    currentSetting: 'dark'
});

const THEME_STORAGE_KEY = 'duka.theme.mode';

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => {
        // 1. Find the page component (case-insensitive fallback for Linux hosts)
        const pages = import.meta.glob('./Pages/**/*.{tsx,jsx}');
        const base = `./Pages/${name}`;
        const requestedTsx = `${base}.tsx`;
        const requestedJsx = `${base}.jsx`;

        const exactPath = pages[requestedTsx]
            ? requestedTsx
            : pages[requestedJsx]
              ? requestedJsx
              : undefined;

        const ciPath =
            Object.keys(pages).find((key) => key.toLowerCase() === requestedTsx.toLowerCase()) ??
            Object.keys(pages).find((key) => key.toLowerCase() === requestedJsx.toLowerCase());

        const resolvedPath = exactPath ?? ciPath;
        const page = resolvedPath
            ? resolvePageComponent(resolvedPath, pages)
            : resolvePageComponent(requestedTsx, pages).catch(() => resolvePageComponent(requestedJsx, pages));

        // 2. Apply the persistent layout logic
        return page.then((module: any) => {
            const pageDefault = module.default;

            // This is the magic line: it ensures the .layout property is respected
            pageDefault.layout = pageDefault.layout || ((page: any) => page);

            return module;
        });
    },
    setup({ el, App, props }) {
        const Root = () => {
            // --- SUBDOMAIN DETECTION ---
            const subdomain = React.useMemo(() => {
                const host = window.location.hostname;
                const parts = host.split('.');

                // 1. Root domain handling (e.g., duka.pi, localhost, mysite.com)
                // If parts length is 2 or less, we are at the root, so default to admin.
                if (parts.length <= 2) return 'admin' as SubdomainType;

                // 2. Subdomain handling (e.g., dev.duka.pi, admin.mysite.com)
                const detected = parts[0].toLowerCase();

                // 3. Fallback: If the detected string isn't a valid module, return 'admin'
                // This prevents the app from crashing if someone types a fake subdomain.
                const validSubdomains = [
                    'admin', 'auth', 'dev', 'finance', 'marketing',
                    'seller', 'guest', 'delivery', 'procurement',
                    'stockkeeper', 'vendor', 'shared'
                ];

                return validSubdomains.includes(detected)
                    ? (detected as SubdomainType)
                    : 'admin';
            }, []);

            // --- THEME STATE LOGIC ---
            const [setting, setSetting] = React.useState<'light' | 'dark' | 'system'>(() => {
                try {
                    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
                    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
                } catch {
                    // ignore storage errors
                }
                return 'system';
            });

            const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

            const setThemeSetting = React.useCallback((newSetting: 'light' | 'dark' | 'system') => {
                setSetting(newSetting);
                try {
                    window.localStorage.setItem(THEME_STORAGE_KEY, newSetting);
                } catch {
                    // ignore storage errors
                }
            }, []);

            // 3. Determine if we should actually render light or dark
            const mode = React.useMemo<PaletteMode>(() => {
                if (setting === 'system') {
                    return prefersDarkMode ? 'dark' : 'light';
                }
                return setting;
            }, [setting, prefersDarkMode]);

            // 4. Generate the theme dynamically using the detected subdomain
            const theme = React.useMemo(
                () => createTheme(getDesignTokens(mode, subdomain)),
                [mode, subdomain]
            );

            return (
                <ThemeContext.Provider value={{ toggleTheme: setThemeSetting, currentSetting: setting }}>
                    <ThemeProvider theme={theme}>
                        <CssBaseline />
                        <App {...props} />
                    </ThemeProvider>
                </ThemeContext.Provider>
            );
        };

        createRoot(el).render(<Root />);
    },
    progress: {
        color: '#ff9800',
    },
});
