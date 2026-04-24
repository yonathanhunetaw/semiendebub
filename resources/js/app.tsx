import '../css/app.css';
import './bootstrap';
import * as React from 'react';
import { ThemeProvider, createTheme, CssBaseline, PaletteMode } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { getDesignTokens } from './theme';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// 1. Create a Context so child pages (like Profile) can change the theme
export const ThemeContext = React.createContext({
    toggleTheme: (newMode: 'light' | 'dark' | 'system') => {},
    currentSetting: 'dark'
});

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => {
        // 1. Find the page component
        const pages = import.meta.glob('./Pages/**/*.{tsx,jsx}');
        const page = resolvePageComponent(`./Pages/${name}.tsx`, pages)
            .catch(() => resolvePageComponent(`./Pages/${name}.jsx`, pages));

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
            // 2. These hooks MUST be inside the component
            const [setting, setSetting] = React.useState<'light' | 'dark' | 'system'>('dark');
            const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

            // 3. Determine if we should actually render light or dark
            const mode = React.useMemo<PaletteMode>(() => {
                if (setting === 'system') {
                    return prefersDarkMode ? 'dark' : 'light';
                }
                return setting;
            }, [setting, prefersDarkMode]);

            // 4. Generate the theme
            const theme = React.useMemo(
                () => createTheme(getDesignTokens(mode)),
                [mode]
            );

            return (
                <ThemeContext.Provider value={{ toggleTheme: setSetting, currentSetting: setting }}>
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
        color: '#006630',
    },
});
