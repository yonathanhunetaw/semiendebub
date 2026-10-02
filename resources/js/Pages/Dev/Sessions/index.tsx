import * as React from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';

import DevLayout from '@/Layouts/DevLayout';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface SessionUser {
    id: number | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role: string;
}

interface DevSession {
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
}

interface DevSessionsProps {
    sessions?: DevSession[];
}

/** "Chrome on Mac OS X" rather than a chopped-off UA string. */
function describeDevice(userAgent: string | null): string {
    if (!userAgent) {
        return 'Unknown device';
    }

    const browser =
        userAgent
            .match(/(Chrome|Firefox|Safari|Edg|OPR)\/[\d.]+/)?.[1]
            ?.replace('Edg', 'Edge')
            ?.replace('OPR', 'Opera') ?? 'Unknown browser';

    const os = userAgent.match(/Windows|Mac OS X|Linux|Android|iPhone|iPad/)?.[0] ?? 'Unknown OS';

    return `${browser} on ${os}`;
}

/**
 * Active login sessions, dev-subdomain flavour.
 *
 * Deliberately not the Admin sessions screen: that one hardcodes
 * `admin.sessions.*` route names (extend, destroyAll, destroySelected) which
 * only exist on the admin subdomain. The dev group registers just index and
 * destroy, so this page exposes exactly those and nothing that would 404.
 */
export default function DevSessions({ sessions = [] }: DevSessionsProps): React.ReactElement {
    const { flash } = usePage().props as { flash?: { success?: string | null; error?: string | null } };
    const [pending, setPending] = React.useState<string[]>([]);

    const revoke = (id: string): void => {
        setPending((ids) => [...ids, id]);

        router.delete(`/sessions/${id}`, {
            preserveScroll: true,
            onFinish: () => setPending((ids) => ids.filter((candidate) => candidate !== id)),
        });
    };

    return (
        <>
            <Head title="Sessions" />

            <Stack spacing={2}>
                {flash?.success && <Alert severity="success">{flash.success}</Alert>}
                {flash?.error && <Alert severity="error">{flash.error}</Alert>}

                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                        label={`${sessions.length} session${sessions.length === 1 ? '' : 's'}`}
                        size="small"
                        sx={{ fontFamily: MONO }}
                    />
                    <Chip
                        label={`${sessions.filter((session) => session.is_live).length} live`}
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ fontFamily: MONO }}
                    />
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {['User', 'Role', 'Device', 'IP', 'Last active', 'State', ''].map((heading) => (
                                    <TableCell
                                        key={heading}
                                        sx={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}
                                    >
                                        {heading}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sessions.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                                            No active sessions.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}

                            {sessions.map((session) => (
                                <TableRow key={session.id} hover>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                                            {[session.user.first_name, session.user.last_name]
                                                .filter(Boolean)
                                                .join(' ') || 'Visitor'}
                                        </Typography>
                                        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                                            {session.user.email ?? '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={session.user.role} size="small" sx={{ height: 19, fontSize: 10 }} />
                                    </TableCell>
                                    <TableCell sx={{ fontSize: 12 }}>{describeDevice(session.user_agent)}</TableCell>
                                    <TableCell sx={{ fontFamily: MONO, fontSize: 11 }}>
                                        {session.ip_address ?? '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                        {session.last_active_human}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5}>
                                            {session.is_live && (
                                                <Chip
                                                    label="live"
                                                    size="small"
                                                    color="success"
                                                    sx={{ height: 19, fontSize: 10 }}
                                                />
                                            )}
                                            {session.is_current && (
                                                <Chip
                                                    label="this device"
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                    sx={{ height: 19, fontSize: 10 }}
                                                />
                                            )}
                                            {session.remember_me && (
                                                <Chip
                                                    label="remembered"
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ height: 19, fontSize: 10 }}
                                                />
                                            )}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button
                                            size="small"
                                            color="error"
                                            disabled={session.is_current || pending.includes(session.id)}
                                            onClick={() => revoke(session.id)}
                                            sx={{ fontFamily: MONO, fontSize: 11 }}
                                        >
                                            Revoke
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>

                <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Extend and bulk actions live on the admin sessions screen; the dev subdomain registers only
                        index and destroy.
                    </Typography>
                </Box>
            </Stack>
        </>
    );
}

DevSessions.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
