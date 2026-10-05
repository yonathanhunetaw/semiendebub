/**
 * Single source of truth for the Dev workspace navigation.
 *
 * Every non-parameterised GET route on the `dev.` subdomain is listed here, so
 * nothing in the workspace is reachable by URL only. `tests/Feature/Dev/
 * DevNavigationTest.php` fails the build if a route is added without a link.
 *
 * Routes deliberately excluded (and asserted as such by that test):
 *   /            → the guest landing page, linked from the brand mark
 *   /login       → guest-only
 */

export interface DevNavItem {
    label: string;
    href: string;
    icon: DevNavIcon;
    description: string;
    /** Route names this entry should light up for. */
    matches?: string[];
    /** Renders as an external/download link rather than an Inertia visit. */
    external?: boolean;
}

export interface DevNavGroup {
    title: string;
    items: DevNavItem[];
}

export type DevNavIcon =
    | 'terminal'
    | 'architecture'
    | 'shipments'
    | 'sessions'
    | 'lesson'
    | 'colors'
    | 'box'
    | 'libraries'
    | 'logs'
    | 'download';

export const DEV_NAVIGATION: DevNavGroup[] = [
    {
        title: 'Workspace',
        items: [
            {
                label: 'Dashboard',
                href: '/dashboard',
                icon: 'terminal',
                description: 'Dev workspace home',
            },
            {
                label: 'Architecture',
                href: '/architecture',
                icon: 'architecture',
                description: 'Domain module visualizer',
            },
            {
                label: 'Libraries',
                href: '/libraries',
                icon: 'libraries',
                description: 'Composer, npm & PHP inventory',
            },
            {
                label: 'Design System',
                href: '/design-system',
                icon: 'colors',
                description: 'Shared UI components in every role, light and dark',
            },
            {
                label: 'Log Viewer',
                href: '/logs',
                icon: 'logs',
                description: 'Live Laravel, deploy & Docker container logs',
            },
            {
                label: 'Shipments Lab',
                href: '/shipments',
                icon: 'shipments',
                description: 'Fulfillment sandbox',
            },
            {
                label: 'Sessions',
                href: '/sessions',
                icon: 'sessions',
                description: 'Active login sessions',
            },
        ],
    },
    {
        title: 'Lessons',
        items: [
            {
                label: 'Lesson 4 · Props',
                href: '/lesson4',
                icon: 'lesson',
                description: 'Component props walkthrough',
            },
            {
                label: 'Lesson 6 · Colors',
                href: '/lesson6',
                icon: 'colors',
                description: 'Color organizer CRUD',
            },
            {
                label: 'Lesson 6 · New color',
                href: '/lesson6/create',
                icon: 'colors',
                description: 'Create a color asset',
            },
            {
                label: 'Lesson 7 · Box',
                href: '/lesson7',
                icon: 'box',
                description: 'MUI Box primitives',
            },
        ],
    },
    {
        title: 'Exports',
        items: [
            {
                label: 'Architecture JSON',
                href: '/architecture/download',
                icon: 'download',
                description: 'Raw dev-architecture-map.json',
                external: true,
            },
        ],
    },
];

/** Flat list of every navigable href, used by the sidebar and coverage test. */
export const DEV_NAV_HREFS: string[] = DEV_NAVIGATION.flatMap((group) =>
    group.items.map((item) => item.href),
);

/**
 * Normalise an Inertia `url` to a workspace path.
 *
 * The workspace is served from the `dev.` subdomain (`/architecture`), but the
 * visualizer is also mounted at `/dev/architecture` on the plain host during
 * local development — both must resolve to the same nav entry.
 */
export function devPath(url: string): string {
    const path = url.split('?')[0].replace(/\/+$/, '') || '/';

    return path === '/dev' ? '/' : path.replace(/^\/dev(?=\/)/, '') || '/';
}

/**
 * Longest-prefix match so `/lesson6/create` does not also light up `/lesson6`.
 */
export function activeDevHref(url: string, hrefs: string[] = DEV_NAV_HREFS): string | null {
    const path = devPath(url);

    return (
        hrefs
            .filter((href) => path === href || path.startsWith(`${href}/`))
            .sort((a, b) => b.length - a.length)[0] ?? null
    );
}

/** The nav entry (and its group) matching the current url, if any. */
export function activeDevEntry(url: string): { group: DevNavGroup; item: DevNavItem } | null {
    const href = activeDevHref(url);

    if (href === null) {
        return null;
    }

    for (const group of DEV_NAVIGATION) {
        const item = group.items.find((candidate) => candidate.href === href);

        if (item) {
            return { group, item };
        }
    }

    return null;
}
