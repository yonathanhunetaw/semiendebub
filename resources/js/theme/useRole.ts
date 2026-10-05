/**
 * The active role (module) for React code.
 *
 * app.tsx resolves the role once from the hostname and provides it through
 * RoleContext; layouts and pages read it with useRole() instead of parsing
 * window.location themselves. Outside a provider (e.g. a component rendered
 * in isolation) the context falls back to the role the pre-paint script put on
 * <html data-role>, then to the hostname rule.
 */
import * as React from 'react';
import { useTheme } from '@mui/material/styles';
import { DEFAULT_ROLE, getRole, isRoleKey, resolveRole, type RoleKey } from './roles';

/** The role for this page load: <html data-role>, else the hostname rule. */
export function detectRole(): RoleKey {
    if (typeof document !== 'undefined') {
        const fromHtml = document.documentElement.getAttribute('data-role');
        if (isRoleKey(fromHtml)) return fromHtml;
    }
    if (typeof window !== 'undefined') return resolveRole(window.location.hostname);
    return DEFAULT_ROLE;
}

export const RoleContext = React.createContext<RoleKey>(detectRole());

export function useRole(): RoleKey {
    return React.useContext(RoleContext);
}

/**
 * The tab icon for the active role: a rounded square in the role's primary
 * color with the first letter of its label in the on-primary color.
 *
 * Returns the `href` for `<link rel="icon">` inside Inertia's <Head>.
 */
export function useRoleFavicon(options: { fontFamily?: string } = {}): string {
    const role = useRole();
    const theme = useTheme();
    const { fontFamily = 'sans-serif' } = options;

    return React.useMemo(() => {
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
            `<rect width="100" height="100" rx="20" fill="${theme.palette.primary.main}"/>` +
            `<text x="50" y="54" font-size="60" font-family="${fontFamily}" font-weight="900" ` +
            `fill="${theme.palette.primary.contrastText}" text-anchor="middle" dominant-baseline="middle">` +
            `${getRole(role).label.charAt(0)}</text></svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }, [role, theme.palette.primary.main, theme.palette.primary.contrastText, fontFamily]);
}

/**
 * Keeps <link rel="icon"> in <head> pointed at the role favicon. Rendered once
 * by app.tsx (inside ThemeProvider), so every page gets it — welcome, login and
 * pages without a role layout included — and it follows light/dark changes.
 * Inertia's <Head> can't be used here: it lives outside the Inertia <App>.
 */
export function RoleFavicon(): null {
    const role = useRole();
    const href = useRoleFavicon({ fontFamily: role === 'dev' ? 'monospace' : 'sans-serif' });

    React.useEffect(() => {
        let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][data-role-favicon]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.setAttribute('data-role-favicon', '');
            document.head.appendChild(link);
        }
        link.href = href;
    }, [href]);

    return null;
}
