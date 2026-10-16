import * as React from 'react';

/**
 * Lets pages (Settings, the top bars) change the colour mode. app.tsx provides it.
 * It lives here, not in app.tsx: importing app.tsx from a page re-runs the whole
 * Inertia bootstrap in Vite dev (a second createRoot) and hands the page a second,
 * provider-less copy of this context.
 */
export const ThemeContext = React.createContext({
    toggleTheme: (_newMode: 'light' | 'dark' | 'system') => {},
    currentSetting: 'light',
});
