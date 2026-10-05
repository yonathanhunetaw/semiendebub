import '../css/app.css';
// Material Symbols, bundled from npm rather than fonts.googleapis.com: the
// icons then work offline and never flash their ligature names while loading.
import 'material-symbols/outlined.css';
// Inter, bundled for the same reason (variable weight axis, all subsets).
import '@fontsource-variable/inter';
import './bootstrap';
import * as React from 'react';
import { ThemeProvider, createTheme, CssBaseline, PaletteMode } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { getDesignTokens, resolveRole, RoleContext, THEME_STORAGE_KEY, DEFAULT_THEME_SETTING } from './theme';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// 1. Create a Context so child pages (like Profile) can change the theme
export const ThemeContext = React.createContext({
    toggleTheme: (newMode: 'light' | 'dark' | 'system') => {},
    currentSetting: 'light'
});

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
            // --- ROLE (module) DETECTION ---
            // Same hostname rule as the pre-paint script in app.blade.php.
            // Provided as RoleContext; layouts read it with useRole().
            const role = React.useMemo(() => resolveRole(window.location.hostname), []);

            // --- THEME STATE LOGIC ---
            const [setting, setSetting] = React.useState<'light' | 'dark' | 'system'>(() => {
                try {
                    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
                    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
                } catch {
                    // ignore storage errors
                }
                return DEFAULT_THEME_SETTING;
            });

            // noSsr: read matchMedia on the first render, so 'system' never
            // renders light for one frame after the pre-paint script chose dark.
            const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

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

            // 4. Generate the MUI theme from the same tokens Tailwind uses
            const theme = React.useMemo(
                () => createTheme(getDesignTokens(mode, role)),
                [mode, role]
            );

            // 5. Mirror role + mode onto <html> so the Tailwind tokens
            //    (resources/css/tokens.css) and `dark:` variants follow them.
            React.useEffect(() => {
                const root = document.documentElement;
                root.setAttribute('data-role', role);
                root.setAttribute('data-mode', mode);
            }, [role, mode]);

            return (
                <ThemeContext.Provider value={{ toggleTheme: setThemeSetting, currentSetting: setting }}>
                    <RoleContext.Provider value={role}>
                        <ThemeProvider theme={theme}>
                            <CssBaseline />
                            <App {...props} />
                        </ThemeProvider>
                    </RoleContext.Provider>
                </ThemeContext.Provider>
            );
        };

        createRoot(el).render(<Root />);
    },
    progress: {
        // Injected into a <style> as plain CSS, so the theme variable resolves:
        // the page-load bar follows the role accent.
        color: 'rgb(var(--primary))',
    },
});