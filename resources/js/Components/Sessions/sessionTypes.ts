export interface SessionUser {
    id: number | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role: string;
}

export interface SessionRow {
    id: string;
    user: SessionUser;
    ip_address: string | null;
    user_agent: string | null;
    last_activity: string;
    expires_at: string;
    last_active_human: string;
    is_live: boolean;
    is_current: boolean;
    remember_me: boolean;
    lifetime_minutes: number;
    has_custom_lifetime: boolean;
}

export interface SessionLifetimes {
    default: number;
    remember: number;
}

/** Route-name prefix of the subdomain the board is mounted on. */
export type SessionRoutePrefix = 'admin' | 'dev';

export const DURATION_PRESETS: { label: string; minutes: number }[] = [
    { label: '30 minutes', minutes: 30 },
    { label: '2 hours', minutes: 120 },
    { label: '24 hours', minutes: 1440 },
    { label: '6 days', minutes: 8640 },
    { label: '30 days', minutes: 43200 },
];

/** Sessions with less than this left are flagged as about to expire. */
export const EXPIRING_SOON_MINUTES = 30;

/** "Chrome on Mac OS X" rather than a chopped-off UA string. */
export function describeDevice(userAgent: string | null): string {
    if (!userAgent) return 'Unknown device';

    const browser =
        userAgent
            .match(/(Chrome|Firefox|Safari|Edg|OPR)\/[\d.]+/)?.[1]
            ?.replace('Edg', 'Edge')
            ?.replace('OPR', 'Opera') ?? 'Unknown browser';
    const os = userAgent.match(/Windows|Mac OS X|Linux|Android|iPhone|iPad/)?.[0] ?? 'Unknown OS';

    return `${browser} on ${os}`;
}

/** 90 -> "1h 30m", 8640 -> "6d", 43200 -> "30d". */
export function formatMinutes(total: number): string {
    if (total < 60) return `${total}m`;
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const mins = total % 60;
    return [days && `${days}d`, hours && `${hours}h`, mins && `${mins}m`].filter(Boolean).join(' ');
}

export function minutesLeft(expiresAt: string, now: Date): number {
    return Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 60000);
}

export function formatTimeLeft(expiresAt: string, now: Date): { label: string; expired: boolean } {
    const left = minutesLeft(expiresAt, now);
    if (left < 0) return { label: 'Expired', expired: true };
    if (left >= 1440) return { label: formatMinutes(left), expired: false };

    const hrs = Math.floor(left / 60);
    const mins = left % 60;
    return { label: `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`, expired: false };
}
