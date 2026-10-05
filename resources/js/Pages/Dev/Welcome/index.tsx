import * as React from 'react';
import { Head, Link } from '@inertiajs/react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PsychologyIcon from '@mui/icons-material/Psychology';
import LoginIcon from '@mui/icons-material/LoginRounded';
import PersonAddIcon from '@mui/icons-material/PersonAddAltRounded';

/** APP_NAME from .env, exposed to the client as VITE_APP_NAME. */
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Duka';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface WelcomeProps {
    /** Shared by HandleInertiaRequests — present when a session already exists. */
    auth?: { user: { first_name?: string } | null };
}

const CAPABILITIES = [
    {
        icon: <AccountTreeIcon />,
        title: 'Architecture',
        body: 'Every route traced to its controller, models, services and TSX page — regenerated from the code itself.',
    },
    {
        icon: <LocalShippingIcon />,
        title: 'Shipments Lab',
        body: 'Sandbox for the fulfillment workflow: agreements, hand-offs and stock ledger events.',
    },
    {
        icon: <PsychologyIcon />,
        title: 'Lessons',
        body: 'Working references for the patterns this codebase is built on, from props to CRUD.',
    },
];

export default function Welcome({ auth }: WelcomeProps): React.ReactElement {
    const user = auth?.user ?? null;

    return (
        <>
            <Head title="Dev Workspace" />

            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 2,
                    py: 6,
                    bgcolor: 'background.default',
                    backgroundImage: 'radial-gradient(rgb(var(--on-surface) / 0.06) 1px, transparent 0)',
                    backgroundSize: '22px 22px',
                }}
            >
                <Box sx={{ width: '100%', maxWidth: 880 }}>
                    <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center', mb: 4 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <TerminalIcon sx={{ fontSize: 34, color: 'primary.main' }} />
                            <Typography
                                variant="h4"
                                sx={{ fontFamily: MONO, fontWeight: 900, letterSpacing: -1 }}
                            >
                                DEV_OS
                            </Typography>
                        </Stack>

                        <Chip
                            label={`${APP_NAME} · internal engineering workspace`}
                            size="small"
                            sx={{ fontFamily: MONO, fontSize: 11 }}
                        />

                        <Typography sx={{ color: 'text.secondary', maxWidth: 560 }}>
                            Tooling for the people building Duka: the live architecture map, fulfillment
                            sandboxes and the lesson set. Access is limited to accounts with the dev role.
                        </Typography>
                    </Stack>

                    {/* Primary actions */}
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        justifyContent="center"
                        sx={{ mb: 5 }}
                    >
                        {user ? (
                            <Button
                                component={Link}
                                href="/dashboard"
                                variant="contained"
                                size="large"
                                disableElevation
                                startIcon={<TerminalIcon />}
                                sx={{ fontFamily: MONO, fontWeight: 700, px: 4 }}
                            >
                                Enter workspace
                            </Button>
                        ) : (
                            <>
                                <Button
                                    component={Link}
                                    href="/login"
                                    variant="contained"
                                    size="large"
                                    disableElevation
                                    startIcon={<LoginIcon />}
                                    sx={{ fontFamily: MONO, fontWeight: 700, px: 4 }}
                                >
                                    Log in
                                </Button>

                                <Button
                                    component={Link}
                                    href="/register"
                                    variant="outlined"
                                    size="large"
                                    startIcon={<PersonAddIcon />}
                                    sx={{ fontFamily: MONO, fontWeight: 700, px: 4 }}
                                >
                                    Sign up
                                </Button>
                            </>
                        )}
                    </Stack>

                    {/* What lives behind the door */}
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 1.5,
                            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                        }}
                    >
                        {CAPABILITIES.map((capability) => (
                            <Paper
                                key={capability.title}
                                variant="outlined"
                                sx={{ p: 2, borderRadius: 2.5, bgcolor: 'background.paper' }}
                            >
                                <Box sx={{ color: 'primary.main', mb: 1 }}>{capability.icon}</Box>
                                <Typography sx={{ fontFamily: MONO, fontWeight: 700, mb: 0.5 }}>
                                    {capability.title}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {capability.body}
                                </Typography>
                            </Paper>
                        ))}
                    </Box>

                    <Typography
                        variant="caption"
                        sx={{ display: 'block', textAlign: 'center', color: 'text.disabled', mt: 4, fontFamily: MONO }}
                    >
                        Forgot your password? <Link href="/forgot-password">Reset it here</Link>
                    </Typography>
                </Box>
            </Box>
        </>
    );
}
