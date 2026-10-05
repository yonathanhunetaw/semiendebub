import * as React from 'react';
import { router, usePage } from '@inertiajs/react';
import { useTheme } from '@mui/material';

import {
    DURATION_PRESETS,
    EXPIRING_SOON_MINUTES,
    describeDevice,
    formatMinutes,
    formatTimeLeft,
    minutesLeft,
    type SessionLifetimes,
    type SessionRoutePrefix,
    type SessionRow,
} from '@/Components/Sessions/sessionTypes';

interface SessionsBoardProps {
    sessions: SessionRow[];
    lifetimes: SessionLifetimes;
    routePrefix: SessionRoutePrefix;
}

type StateFilter = 'all' | 'live' | 'idle' | 'expiring' | 'expired';

const CUSTOM = 'custom';
const REFRESH_MS = 30000;
const TOAST_MS = 4000;
const pill = (active: boolean): string =>
    `px-3 py-1 rounded-full text-[12px] font-medium uppercase tracking-wider transition-all border ${
        active
            ? 'bg-primary/20 border-primary/50 text-primary'
            : 'glass-panel border-outline-variant/40 text-on-surface-variant hover:border-primary/30 hover:text-on-surface'
    }`;

/**
 * Session list shared by the admin and dev subdomains. Only the route-name
 * prefix differs; the layout is attached by each page.
 */
export default function SessionsBoard({ sessions, lifetimes, routePrefix }: SessionsBoardProps): React.ReactElement {
    const { flash } = usePage().props as { flash?: { success?: string | null; error?: string | null } };
    const [toast, setToast] = React.useState<{ kind: 'success' | 'error'; text: string } | null>(null);
    const isDark = useTheme().palette.mode === 'dark';
    const r = (name: string): string => `${routePrefix}.sessions.${name}`;

    const [query, setQuery] = React.useState('');
    const [roleFilter, setRoleFilter] = React.useState('all');
    const [stateFilter, setStateFilter] = React.useState<StateFilter>('all');
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [now, setNow] = React.useState(() => new Date());
    const [pendingIds, setPendingIds] = React.useState<string[]>([]);
    const [bulkPending, setBulkPending] = React.useState(false);
    const [preset, setPreset] = React.useState<string>('120');
    const [customMinutes, setCustomMinutes] = React.useState(90);
    const [autoRefresh, setAutoRefresh] = React.useState(true);

    // Flash props linger on the page until the next visit, so mirror them into
    // local state that clears itself. Depending on the `flash` object (new on
    // every full response) lets an identical repeat message show again.
    React.useEffect(() => {
        const next = flash?.error
            ? { kind: 'error' as const, text: flash.error }
            : flash?.success
              ? { kind: 'success' as const, text: flash.success }
              : null;

        setToast(next);
        if (!next) return undefined;

        const timer = setTimeout(() => setToast(null), TOAST_MS);
        return () => clearTimeout(timer);
    }, [flash]);

    const duration = preset === CUSTOM ? Math.max(1, Math.floor(customMinutes) || 1) : Number(preset);

    // Keep countdowns ticking, and (optionally) re-fetch the list itself.
    React.useEffect(() => {
        const tick = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(tick);
    }, []);

    React.useEffect(() => {
        if (!autoRefresh) return undefined;
        const poll = setInterval(() => router.reload({ only: ['sessions'] }), REFRESH_MS);
        return () => clearInterval(poll);
    }, [autoRefresh]);

    const stateOf = React.useCallback(
        (s: SessionRow): Exclude<StateFilter, 'all'> => {
            const left = minutesLeft(s.expires_at, now);
            if (left < 0) return 'expired';
            if (left < EXPIRING_SOON_MINUTES) return 'expiring';
            return s.is_live ? 'live' : 'idle';
        },
        [now],
    );

    const roleOf = (s: SessionRow): string => s.user?.role || 'guest';
    const uniqueRoles = React.useMemo(() => Array.from(new Set(sessions.map(roleOf))).sort(), [sessions]);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return sessions.filter((s) => {
            if (roleFilter !== 'all' && roleOf(s) !== roleFilter) return false;
            if (stateFilter !== 'all' && stateOf(s) !== stateFilter) return false;
            if (!q) return true;
            return [s.user?.first_name, s.user?.last_name, s.user?.email, s.ip_address]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }, [sessions, query, roleFilter, stateFilter, stateOf]);

    const stateCounts = React.useMemo(() => {
        const counts: Record<StateFilter, number> = { all: sessions.length, live: 0, idle: 0, expiring: 0, expired: 0 };
        sessions.forEach((s) => {
            counts[stateOf(s)] += 1;
        });
        return counts;
    }, [sessions, stateOf]);

    const selectableIds = filtered.filter((s) => !s.is_current).map((s) => s.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

    const toggleOne = (id: string): void =>
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const withPending = (id: string, run: (done: () => void) => void): void => {
        setPendingIds((p) => [...p, id]);
        run(() => setPendingIds((p) => p.filter((x) => x !== id)));
    };

    const bulk = (run: (done: () => void) => void): void => {
        setBulkPending(true);
        run(() => setBulkPending(false));
    };

    const clearSelection = { onSuccess: () => setSelectedIds([]) };

    const handleDelete = (s: SessionRow): void => {
        const message = s.is_current ? 'This is your current session. You will be logged out. Continue?' : 'Force logout this session?';
        if (!confirm(message)) return;
        withPending(s.id, (done) => router.delete(route(r('destroy'), s.id), { preserveScroll: true, onFinish: done }));
    };

    const handleExtend = (s: SessionRow): void =>
        withPending(s.id, (done) =>
            router.post(route(r('extend'), s.id), { minutes: duration }, { preserveScroll: true, onFinish: done }),
        );

    const handleReset = (s: SessionRow): void =>
        withPending(s.id, (done) => router.post(route(r('reset'), s.id), {}, { preserveScroll: true, onFinish: done }));

    const handleDeleteUser = (s: SessionRow): void => {
        if (s.user.id === null) return;
        if (!confirm(`Sign ${s.user.email ?? 'this user'} out of every device (your own session is kept)?`)) return;
        withPending(s.id, (done) =>
            router.delete(route(r('destroyUser'), s.user.id as number), { preserveScroll: true, onFinish: done }),
        );
    };

    const handleExtendAll = (): void => {
        if (!confirm(`Give every session ${formatMinutes(duration)} from now?`)) return;
        bulk((done) => router.post(route(r('extendAll')), { minutes: duration }, { preserveScroll: true, onFinish: done }));
    };

    const handleTerminateAll = (): void => {
        if (!confirm('Terminate every session except your own?')) return;
        bulk((done) => router.delete(route(r('destroyAll')), { preserveScroll: true, onFinish: done }));
    };

    const handleExtendSelected = (): void =>
        bulk((done) =>
            router.post(
                route(r('extendSelected')),
                { ids: selectedIds, minutes: duration },
                { preserveScroll: true, onFinish: done, ...clearSelection },
            ),
        );

    const handleDestroySelected = (): void => {
        if (!confirm(`Terminate ${selectedIds.length} selected session(s)?`)) return;
        bulk((done) =>
            router.delete(route(r('destroySelected')), {
                data: { ids: selectedIds },
                preserveScroll: true,
                onFinish: done,
                ...clearSelection,
            }),
        );
    };

    const btn =
        'px-3 py-1.5 border border-outline-variant/50 bg-surface-container-high/50 text-on-surface rounded font-medium text-[12px] uppercase tracking-wider hover:bg-surface-container-highest transition-colors disabled:opacity-50';
    const dangerBtn =
        'px-3 py-1.5 bg-error/20 border border-error/50 text-error rounded font-medium text-[12px] uppercase tracking-wider hover:bg-error/30 transition-colors flex items-center justify-center gap-xs disabled:opacity-50';

    return (
        <div className="w-full text-on-background font-body-md pb-24 md:pb-0 relative min-h-screen">
            <style
                dangerouslySetInnerHTML={{
                    __html: `
        .animate-pulse-fast { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .glass-panel {
            background: rgb(var(--surface-container-low) / 0.6);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgb(var(--outline) / 0.2);
            box-shadow: ${isDark ? 'inset 0 1px 0 rgb(var(--on-surface) / 0.05)' : '0px 2px 1px -1px rgb(var(--on-surface) / 0.1), 0px 1px 3px 0px rgb(var(--on-surface) / 0.05)'};
        }
`,
                }}
            />

            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none z-0" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] pointer-events-none z-0" />

            <div className="relative z-10 w-full max-w-[1600px] mx-auto p-margin-mobile md:p-margin-desktop">
                {toast && (
                    <div
                        role="status"
                        className={`p-4 mb-6 border rounded-lg glass-panel flex items-start justify-between gap-sm ${
                            toast.kind === 'success'
                                ? 'text-success border-success/20'
                                : 'text-error border-error/20'
                        }`}
                    >
                        <span>{toast.text}</span>
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => setToast(null)}
                            className="opacity-70 hover:opacity-100"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                )}

                {/* Header + duration + global actions */}
                <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-md">
                    <div>
                        <h1 className="font-display-lg text-display-lg text-on-surface drop-shadow-md">Active Sessions</h1>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                            Managing {sessions.length} connection{sessions.length === 1 ? '' : 's'} · default lifetime{' '}
                            {formatMinutes(lifetimes.default)}, remember-me {formatMinutes(lifetimes.remember)}.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-sm items-center">
                        <label className="flex items-center gap-xs text-[12px] text-on-surface-variant uppercase tracking-wider">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded border-outline-variant text-primary w-4 h-4"
                            />
                            Auto-refresh
                        </label>
                        <select
                            aria-label="Session duration"
                            value={preset}
                            onChange={(e) => setPreset(e.target.value)}
                            className="glass-panel text-on-surface px-3 py-[6px] rounded font-medium text-[13px] tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/50"
                        >
                            {DURATION_PRESETS.map((d) => (
                                <option key={d.minutes} value={d.minutes}>
                                    {d.label}
                                </option>
                            ))}
                            <option value={CUSTOM}>Custom…</option>
                        </select>
                        {preset === CUSTOM && (
                            <input
                                type="number"
                                min={1}
                                aria-label="Custom duration in minutes"
                                value={customMinutes}
                                onChange={(e) => setCustomMinutes(Number(e.target.value))}
                                className="glass-panel text-on-surface w-24 px-3 py-[6px] rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                        )}
                        {preset === CUSTOM && <span className="text-[12px] text-on-surface-variant">min</span>}
                        <button onClick={handleExtendAll} disabled={bulkPending} className={btn}>
                            Extend All
                        </button>
                        <button onClick={handleTerminateAll} disabled={bulkPending} className={dangerBtn}>
                            <span className="material-symbols-outlined text-[18px]">block</span>
                            Terminate All
                        </button>
                    </div>
                </div>

                {/* Search + filters */}
                <div className="mb-md flex flex-col gap-sm">
                    <div className="relative max-w-sm">
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-[14px] top-1/2 -translate-y-1/2">
                            search
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name, email, or IP"
                            className="w-full pl-[42px] pr-sm py-2 glass-panel rounded-lg text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder-outline text-[14px]"
                        />
                    </div>

                    <div className="flex flex-wrap gap-xs">
                        {(['all', 'live', 'idle', 'expiring', 'expired'] as StateFilter[]).map((state) => (
                            <button key={state} onClick={() => setStateFilter(state)} className={pill(stateFilter === state)}>
                                {state === 'expiring' ? `Expiring < ${EXPIRING_SOON_MINUTES}m` : state}
                                <span className="ml-1 opacity-60 text-[10px]">({stateCounts[state]})</span>
                            </button>
                        ))}
                    </div>

                    {uniqueRoles.length > 1 && (
                        <div className="flex flex-wrap gap-xs">
                            <button onClick={() => setRoleFilter('all')} className={pill(roleFilter === 'all')}>
                                All roles
                            </button>
                            {uniqueRoles.map((role) => (
                                <button
                                    key={role}
                                    onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
                                    className={pill(roleFilter === role)}
                                >
                                    {role}
                                    <span className="ml-1 opacity-60 text-[10px]">
                                        ({sessions.filter((s) => roleOf(s) === role).length})
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Select-all + bulk bar */}
                {selectableIds.length > 0 && (
                    <div className="mb-md flex flex-wrap items-center justify-between gap-sm p-sm rounded-xl glass-panel">
                        <label className="flex items-center gap-sm text-[12px] uppercase tracking-widest text-on-surface-variant">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => setSelectedIds(allSelected ? [] : selectableIds)}
                                className="rounded border-outline-variant text-primary w-4 h-4"
                            />
                            {selectedIds.length > 0 ? `${selectedIds.length} selected` : `Select all ${selectableIds.length} shown`}
                        </label>
                        {selectedIds.length > 0 && (
                            <div className="flex gap-sm">
                                <button onClick={handleExtendSelected} disabled={bulkPending} className={btn}>
                                    Extend Selected ({formatMinutes(duration)})
                                </button>
                                <button onClick={handleDestroySelected} disabled={bulkPending} className={dangerBtn}>
                                    <span className="material-symbols-outlined text-[14px]">block</span> Terminate
                                </button>
                                <button
                                    onClick={() => setSelectedIds([])}
                                    className="px-3 py-1.5 text-on-surface-variant font-medium text-[12px] uppercase tracking-wider hover:text-on-surface"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-xs py-2xl text-center glass-panel rounded-xl mt-4">
                        <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-2 opacity-50">
                            {sessions.length === 0 ? 'wifi_off' : 'search_off'}
                        </span>
                        <p className="font-body-md text-body-md text-on-surface">
                            {sessions.length === 0 ? 'No active sessions right now.' : 'No sessions match your filters.'}
                        </p>
                    </div>
                )}

                {/* Session list */}
                <div className="flex flex-col gap-md">
                    {filtered.map((s) => {
                        const { label: timeLeft, expired } = formatTimeLeft(s.expires_at, now);
                        const left = minutesLeft(s.expires_at, now);
                        const critical = !expired && left < EXPIRING_SOON_MINUTES;
                        const isPending = pendingIds.includes(s.id);
                        const fullName = s.user?.first_name ? `${s.user.first_name} ${s.user.last_name || ''}` : 'Guest';

                        return (
                            <div
                                key={s.id}
                                className={`glass-panel rounded-xl p-md flex flex-col md:grid md:grid-cols-12 md:gap-sm hover:bg-surface-container-high/60 transition-all relative overflow-hidden ${
                                    s.is_live ? '' : 'opacity-80'
                                }`}
                            >
                                {s.is_current && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/80" />}
                                {critical && !s.is_current && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-error/80 animate-pulse-fast" />
                                )}

                                <div className="hidden md:flex col-span-1 items-center justify-center">
                                    <input
                                        type="checkbox"
                                        aria-label={`Select session for ${s.user?.email ?? 'guest'}`}
                                        checked={selectedIds.includes(s.id)}
                                        onChange={() => toggleOne(s.id)}
                                        disabled={s.is_current}
                                        className="rounded border-outline-variant text-primary w-4 h-4 bg-surface-container-low disabled:opacity-30"
                                    />
                                </div>

                                {/* User + role */}
                                <div className="md:col-span-3 flex items-start md:items-center gap-sm mb-md md:mb-0">
                                    <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-primary overflow-hidden shrink-0 uppercase">
                                        {s.user?.first_name ? (
                                            s.user.first_name[0]
                                        ) : (
                                            <span className="material-symbols-outlined text-primary/70">person</span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-xs flex-wrap">
                                            {fullName}
                                            {s.is_current && (
                                                <span className="bg-primary/20 border border-primary/30 text-primary px-2 py-0.5 rounded-full font-medium text-[10px] uppercase">
                                                    You
                                                </span>
                                            )}
                                            <span className="bg-surface-container-highest border border-outline-variant/50 text-on-surface-variant px-2 py-0.5 rounded-full font-medium text-[10px] uppercase">
                                                {s.user?.role || 'Guest'}
                                            </span>
                                        </div>
                                        <div className="font-mono-data text-mono-data text-on-surface-variant mt-xs truncate max-w-[200px]">
                                            {s.user?.email || 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {/* State */}
                                <div className="md:col-span-2 flex items-center mb-sm md:mb-0">
                                    {expired ? (
                                        <div className="flex items-center gap-xs border border-error/50 px-3 py-1 rounded-full text-error text-[12px]">
                                            Expired
                                        </div>
                                    ) : s.is_live ? (
                                        <div className="flex items-center gap-xs bg-success/10 border border-success/30 px-3 py-1 rounded-full">
                                            <div className="w-2 h-2 rounded-full bg-success animate-pulse-fast" />
                                            <span className="font-medium text-[12px] text-success">Active Now</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-xs bg-surface-container-highest/50 border border-outline-variant/30 px-3 py-1 rounded-full">
                                            <div className="w-2 h-2 rounded-full bg-outline" />
                                            <span className="font-medium text-[12px] text-on-surface-variant">Idle {s.last_active_human}</span>
                                        </div>
                                    )}
                                </div>

                                {/* IP + device */}
                                <div className="md:col-span-2 flex flex-col justify-center mb-sm md:mb-0">
                                    <div className="font-mono-data text-mono-data text-on-surface truncate">{s.ip_address || 'Unknown'}</div>
                                    <div
                                        className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs mt-xs truncate max-w-[200px]"
                                        title={s.user_agent ?? undefined}
                                    >
                                        <span className="material-symbols-outlined text-[14px] text-primary/70">devices</span>
                                        {describeDevice(s.user_agent)}
                                    </div>
                                </div>

                                {/* Time left + total lifetime */}
                                <div className="md:col-span-2 flex md:justify-end items-center mb-md md:mb-0">
                                    <div className="text-right flex items-center md:items-end flex-row md:flex-col gap-sm md:gap-0">
                                        <div
                                            className={`font-mono-data text-mono-data font-bold flex items-center gap-xs ${
                                                expired || critical ? 'text-error' : 'text-warning'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">timer</span> {timeLeft}
                                        </div>
                                        <div className="font-medium text-[11px] uppercase text-on-surface-variant mt-xs">
                                            of {formatMinutes(s.lifetime_minutes)}
                                            {s.has_custom_lifetime ? ' · custom' : s.remember_me ? ' · remembered' : ''}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="md:col-span-2 flex flex-wrap justify-between md:justify-end items-center gap-xs mt-auto">
                                    <button
                                        onClick={() => handleExtend(s)}
                                        disabled={isPending}
                                        title={`Set lifetime to ${formatMinutes(duration)} from now`}
                                        className={btn}
                                    >
                                        Extend
                                    </button>
                                    {s.has_custom_lifetime && (
                                        <button
                                            onClick={() => handleReset(s)}
                                            disabled={isPending}
                                            title="Back to the default lifetime"
                                            className={btn}
                                        >
                                            Reset
                                        </button>
                                    )}
                                    {s.user.id !== null && !s.is_current && (
                                        <button
                                            onClick={() => handleDeleteUser(s)}
                                            disabled={isPending}
                                            title="Sign this user out everywhere"
                                            className={btn}
                                        >
                                            <span className="material-symbols-outlined text-[14px] align-middle">logout</span>
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(s)} disabled={isPending} className={dangerBtn}>
                                        <span className="material-symbols-outlined text-[16px]">block</span> Term
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {sessions.length > 0 && (
                    <div className="mt-lg border-t border-outline-variant/30 pt-md font-body-sm text-body-sm text-on-surface-variant">
                        Showing {filtered.length} of {sessions.length}
                    </div>
                )}
            </div>
        </div>
    );
}
