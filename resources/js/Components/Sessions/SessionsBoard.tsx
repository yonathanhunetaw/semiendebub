import * as React from 'react';
import { router, usePage } from '@inertiajs/react';
import {
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Block from '@mui/icons-material/Block';
import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import Logout from '@mui/icons-material/Logout';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Timer from '@mui/icons-material/TimerOutlined';
import WifiTethering from '@mui/icons-material/WifiTethering';
import UserAvatar from '@/Components/Visual/UserAvatar';
import { FigureRow, FigureTile, PageBand, Pill, densePanelSx, tinySx, type PillTone } from '@/Components/Admin/adminUi';

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
/**
 * Session list shared by the admin and dev subdomains. Only the route-name
 * prefix differs; the layout is attached by each page.
 */
export default function SessionsBoard({ sessions, lifetimes, routePrefix }: SessionsBoardProps): React.ReactElement {
    const { flash } = usePage().props as { flash?: { success?: string | null; error?: string | null } };
    const [toast, setToast] = React.useState<{ kind: 'success' | 'error'; text: string } | null>(null);
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

    const chip = (active: boolean) =>
        ({
            px: 1.25,
            py: 0.25,
            border: '1px solid',
            borderColor: active ? 'primary.main' : 'divider',
            borderRadius: 999,
            font: 'inherit',
            fontSize: '0.6875rem',
            fontWeight: active ? 800 : 600,
            textTransform: 'capitalize',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            color: active ? 'primary.main' : 'text.secondary',
            bgcolor: active ? (t: { palette: { primary: { main: string } } }) => alpha(t.palette.primary.main, 0.1) : 'background.paper',
            '&:hover': { borderColor: 'primary.main' },
        }) as const;

    const actionSx = { fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none', minWidth: 0, px: 1, py: 0.25 } as const;
    const stateTone: Record<Exclude<StateFilter, 'all'>, PillTone> = { live: 'success', idle: 'default', expiring: 'warning', expired: 'error' };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            {toast && (
                <Paper
                    role="status"
                    elevation={0}
                    sx={{ ...densePanelSx, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, color: toast.kind === 'success' ? 'success.main' : 'error.main', borderColor: toast.kind === 'success' ? 'success.main' : 'error.main' }}
                >
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{toast.text}</Typography>
                    <Button size="small" onClick={() => setToast(null)} sx={actionSx}>Dismiss</Button>
                </Paper>
            )}

            <PageBand
                icon={<WifiTethering />}
                title="Active sessions"
                subtitle={`Default lifetime ${formatMinutes(lifetimes.default)}, remember-me ${formatMinutes(lifetimes.remember)}`}
                actions={
                    <FormControlLabel
                        sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem', fontWeight: 600 } }}
                        control={<Checkbox size="small" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} sx={{ color: 'inherit', '&.Mui-checked': { color: 'inherit' }, p: 0.5 }} />}
                        label="Auto-refresh"
                    />
                }
            />

            <FigureRow>
                <FigureTile label="Connections" value={sessions.length} tone="primary" />
                <FigureTile label="Active now" value={stateCounts.live} tone="success" />
                <FigureTile label={`Expiring < ${EXPIRING_SOON_MINUTES}m`} value={stateCounts.expiring} tone={stateCounts.expiring > 0 ? 'warning' : 'default'} />
                <FigureTile label="Expired" value={stateCounts.expired} tone={stateCounts.expired > 0 ? 'error' : 'default'} />
            </FigureRow>

            {/* Lifetime to apply, and the actions on everyone */}
            <Paper elevation={0} sx={{ ...densePanelSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                    <TextField
                        size="small"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name, email, or IP"
                        sx={{ maxWidth: { md: 360 }, width: '100%' }}
                        slotProps={{ input: { startAdornment: (<InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>) } }}
                    />
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                        <TextField select size="small" aria-label="Session duration" value={preset} onChange={(e) => setPreset(e.target.value)} sx={{ minWidth: 130 }}>
                            {DURATION_PRESETS.map((d) => (<MenuItem key={d.minutes} value={String(d.minutes)}>{d.label}</MenuItem>))}
                            <MenuItem value={CUSTOM}>Custom…</MenuItem>
                        </TextField>
                        {preset === CUSTOM && (
                            <TextField size="small" type="number" aria-label="Custom duration in minutes" value={customMinutes} onChange={(e) => setCustomMinutes(Number(e.target.value))} sx={{ width: 90 }} slotProps={{ htmlInput: { min: 1 }, input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
                        )}
                        <Button size="small" variant="outlined" onClick={handleExtendAll} disabled={bulkPending} sx={actionSx}>Extend all</Button>
                        <Button size="small" variant="outlined" color="error" onClick={handleTerminateAll} disabled={bulkPending} startIcon={<Block sx={{ fontSize: '14px !important' }} />} sx={actionSx}>Terminate all</Button>
                    </Stack>
                </Stack>

                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {(['all', 'live', 'idle', 'expiring', 'expired'] as StateFilter[]).map((state) => (
                        <Box key={state} component="button" type="button" onClick={() => setStateFilter(state)} sx={chip(stateFilter === state)}>
                            {state === 'expiring' ? `Expiring < ${EXPIRING_SOON_MINUTES}m` : state} ({stateCounts[state]})
                        </Box>
                    ))}
                </Box>

                {uniqueRoles.length > 1 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Box component="button" type="button" onClick={() => setRoleFilter('all')} sx={chip(roleFilter === 'all')}>All roles</Box>
                        {uniqueRoles.map((role) => (
                            <Box key={role} component="button" type="button" onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)} sx={chip(roleFilter === role)}>
                                {role} ({sessions.filter((s) => roleOf(s) === role).length})
                            </Box>
                        ))}
                    </Box>
                )}

                {selectableIds.length > 0 && (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap', rowGap: 0.75, pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                        <FormControlLabel
                            sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 } }}
                            control={<Checkbox size="small" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : selectableIds)} sx={{ p: 0.5 }} />}
                            label={selectedIds.length > 0 ? `${selectedIds.length} selected` : `Select all ${selectableIds.length} shown`}
                        />
                        {selectedIds.length > 0 && (
                            <Stack direction="row" spacing={0.75}>
                                <Button size="small" variant="outlined" onClick={handleExtendSelected} disabled={bulkPending} sx={actionSx}>Extend selected ({formatMinutes(duration)})</Button>
                                <Button size="small" variant="outlined" color="error" onClick={handleDestroySelected} disabled={bulkPending} sx={actionSx}>Terminate</Button>
                                <Button size="small" onClick={() => setSelectedIds([])} sx={actionSx}>Clear</Button>
                            </Stack>
                        )}
                    </Stack>
                )}
            </Paper>

            {filtered.length === 0 && (
                <Paper elevation={0} sx={{ ...densePanelSx, py: 4, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
                        {sessions.length === 0 ? 'No active sessions right now.' : 'No sessions match your filters.'}
                    </Typography>
                </Paper>
            )}

            {/* One row per connection */}
            <Stack spacing={0.75}>
                {filtered.map((s) => {
                    const { label: timeLeft, expired } = formatTimeLeft(s.expires_at, now);
                    const left = minutesLeft(s.expires_at, now);
                    const critical = !expired && left < EXPIRING_SOON_MINUTES;
                    const isPending = pendingIds.includes(s.id);
                    const fullName = s.user?.first_name ? `${s.user.first_name} ${s.user.last_name || ''}`.trim() : 'Guest';
                    const state = stateOf(s);

                    return (
                        <Paper
                            key={s.id}
                            elevation={0}
                            sx={{
                                ...densePanelSx,
                                p: 1,
                                display: 'grid',
                                alignItems: 'center',
                                columnGap: 1.5,
                                rowGap: 1,
                                gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '28px minmax(0, 3fr) minmax(0, 1.4fr) minmax(0, 2fr) minmax(0, 1.4fr) auto' },
                                opacity: s.is_live || state !== 'idle' ? 1 : 0.85,
                                borderLeft: '3px solid',
                                borderLeftColor: s.is_current ? 'primary.main' : critical ? 'error.main' : 'divider',
                            }}
                        >
                            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                                <Checkbox
                                    size="small"
                                    sx={{ p: 0 }}
                                    inputProps={{ 'aria-label': `Select session for ${s.user?.email ?? 'guest'}` }}
                                    checked={selectedIds.includes(s.id)}
                                    onChange={() => toggleOne(s.id)}
                                    disabled={s.is_current}
                                />
                            </Box>

                            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                                <UserAvatar name={s.user?.first_name ? fullName : null} role={s.user?.role || 'guest'} size={36} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.25 }}>
                                        <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.8125rem' }}>{fullName}</Typography>
                                        {s.is_current && <Pill tone="primary" label="You" />}
                                        <Pill label={s.user?.role || 'Guest'} />
                                    </Stack>
                                    <Typography noWrap sx={tinySx}>{s.user?.email || 'N/A'}</Typography>
                                </Box>
                            </Stack>

                            <Box>
                                {expired ? (
                                    <Pill tone="error" label="Expired" />
                                ) : (
                                    <Pill tone={stateTone[state]} label={s.is_live ? 'Active now' : `Idle ${s.last_active_human}`} />
                                )}
                            </Box>

                            <Box sx={{ minWidth: 0 }}>
                                <Typography noWrap sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600 }}>{s.ip_address || 'Unknown'}</Typography>
                                <Stack direction="row" spacing={0.5} alignItems="center" title={s.user_agent ?? undefined} sx={{ minWidth: 0, color: 'text.secondary' }}>
                                    <DevicesOutlined sx={{ fontSize: 14 }} />
                                    <Typography noWrap sx={tinySx}>{describeDevice(s.user_agent)}</Typography>
                                </Stack>
                            </Box>

                            <Box sx={{ textAlign: { md: 'right' } }}>
                                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} sx={{ color: expired || critical ? 'error.main' : 'warning.main' }}>
                                    <Timer sx={{ fontSize: 15 }} />
                                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>{timeLeft}</Typography>
                                </Stack>
                                <Typography sx={{ ...tinySx, fontSize: '0.625rem' }}>
                                    of {formatMinutes(s.lifetime_minutes)}{s.has_custom_lifetime ? ' · custom' : s.remember_me ? ' · remembered' : ''}
                                </Typography>
                            </Box>

                            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                                <Button size="small" variant="outlined" onClick={() => handleExtend(s)} disabled={isPending} title={`Set lifetime to ${formatMinutes(duration)} from now`} sx={actionSx}>Extend</Button>
                                {s.has_custom_lifetime && (
                                    <Button size="small" variant="outlined" onClick={() => handleReset(s)} disabled={isPending} title="Back to the default lifetime" sx={actionSx}>Reset</Button>
                                )}
                                {s.user.id !== null && !s.is_current && (
                                    <Tooltip title="Sign this user out everywhere">
                                        <span><IconButton size="small" onClick={() => handleDeleteUser(s)} disabled={isPending}><Logout sx={{ fontSize: 16 }} /></IconButton></span>
                                    </Tooltip>
                                )}
                                <Button size="small" variant="outlined" color="error" onClick={() => handleDelete(s)} disabled={isPending} sx={actionSx}>Terminate</Button>
                            </Stack>
                        </Paper>
                    );
                })}
            </Stack>

            {sessions.length > 0 && (
                <Typography sx={{ ...tinySx, pt: 0.5 }}>Showing {filtered.length} of {sessions.length}</Typography>
            )}
        </Box>
    );
}
