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
            // Extracts 'admin' from 'admin.duka.test' or 'finance' from 'finance.duka.com'
            const subdomain = React.useMemo(() => {
                const host = window.location.hostname;
                const parts = host.split('.');
                // If localhost or single-word host, default to 'admin' or 'duka'
                if (parts.length <= 1) return 'admin';
                return parts[0].toLowerCase() as SubdomainType;
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
