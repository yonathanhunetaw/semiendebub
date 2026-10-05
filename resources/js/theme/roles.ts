/**
 * Roles (modules) and the hostname -> role rule.
 *
 * The role keys and subdomains mirror config/subdomains.php: the server maps
 * `{subdomain}.{APP_SYSTEM_DOMAIN}` to a role, plus the alias `stock.` ->
 * `stockkeeper.`. The client does not know the base domain, so it reads the
 * first hostname label instead; anything it does not recognise (root domain,
 * `www.`, an IP, localhost) falls back to DEFAULT_ROLE, which is also what
 * auth, public and storefront pages use.
 *
 * resources/views/partials/theme-prepaint.blade.php is generated from this
 * file by `npm run tokens`, so the pre-paint script and resolveRole() can
 * never disagree. Re-run it after changing ROLES.
 */

export type RoleKey =
    | 'admin'
    | 'seller'
    | 'stock_keeper'
    | 'delivery'
    | 'vendor'
    | 'finance'
    | 'procurement'
    | 'marketing'
    | 'dev'
    | 'shared';

export interface RoleDefinition {
    key: RoleKey;
    label: string;
    /** Hostname labels that select this role; the first one is canonical. */
    subdomains: readonly string[];
    /** Icon name (lucide-style). */
    icon: string;
}

export const ROLES: readonly RoleDefinition[] = [
    { key: 'admin', label: 'Admin', subdomains: ['admin'], icon: 'ShieldCheck' },
    { key: 'seller', label: 'Seller', subdomains: ['seller'], icon: 'Store' },
    { key: 'stock_keeper', label: 'StockKeeper', subdomains: ['stockkeeper', 'stock'], icon: 'Package' },
    { key: 'delivery', label: 'Delivery', subdomains: ['delivery'], icon: 'Truck' },
    { key: 'vendor', label: 'Vendor', subdomains: ['vendor'], icon: 'Building2' },
    { key: 'finance', label: 'Finance', subdomains: ['finance'], icon: 'Landmark' },
    { key: 'procurement', label: 'Procurement', subdomains: ['procurement'], icon: 'ShoppingCart' },
    { key: 'marketing', label: 'Marketing', subdomains: ['marketing'], icon: 'Megaphone' },
    { key: 'dev', label: 'Dev', subdomains: ['dev'], icon: 'Terminal' },
    { key: 'shared', label: 'Shared', subdomains: ['shared'], icon: 'Share2' },
];

export const DEFAULT_ROLE: RoleKey = 'admin';

export const ROLE_KEYS: readonly RoleKey[] = ROLES.map((r) => r.key);

/** Hostname label -> role key, e.g. { stock: 'stock_keeper', seller: 'seller' }. */
export const SUBDOMAIN_TO_ROLE: Readonly<Record<string, RoleKey>> = Object.fromEntries(
    ROLES.flatMap((r) => r.subdomains.map((s) => [s, r.key] as const)),
);

export function isRoleKey(value: unknown): value is RoleKey {
    return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

export function getRole(key: RoleKey): RoleDefinition {
    return ROLES.find((r) => r.key === key) ?? ROLES[0];
}

/**
 * The role a hostname belongs to. Keep this rule identical to the generated
 * pre-paint script (see buildPrepaintScript in cssVars.ts).
 */
export function resolveRole(hostname: string): RoleKey {
    const parts = hostname.toLowerCase().split('.');
    if (parts.length <= 2) return DEFAULT_ROLE;
    return SUBDOMAIN_TO_ROLE[parts[0]] ?? DEFAULT_ROLE;
}

/**
 * Absolute URL of `path` on another role's subdomain, keeping the current
 * base domain, protocol and port (admin.duka.test:8095 -> finance.duka.test:8095).
 */
export function roleUrl(role: RoleKey, path = '/'): string {
    if (typeof window === 'undefined') return '#';
    const { protocol, hostname, port } = window.location;
    const parts = hostname.split('.');
    const base = parts.length > 2 ? parts.slice(1).join('.') : hostname;
    return `${protocol}//${getRole(role).subdomains[0]}.${base}${port ? `:${port}` : ''}${path}`;
}
