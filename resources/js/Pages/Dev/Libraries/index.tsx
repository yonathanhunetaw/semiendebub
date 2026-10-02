import * as React from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/RefreshRounded';

import DevLayout from '@/Layouts/DevLayout';
import PackageRegistry from '@/Components/Dev/Architecture/PackageRegistry';
import { PackageRegistryData } from '@/types/architecture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface LibrariesProps {
    packages: PackageRegistryData;
    runtime: {
        php: string;
        laravel: string;
        environment: string;
        extensions: string[];
    };
    map: {
        generated_at: string | null;
        stale: boolean;
    };
}

/**
 * Dependency inventory for the whole project: composer, npm and the PHP
 * runtime, with a refresh that re-runs the domain map generator server-side so
 * new packages show up without dropping to a shell.
 */
export default function Libraries({ packages, runtime, map }: LibrariesProps): React.ReactElement {
    const { flash } = usePage().props as { flash?: { success?: string | null; error?: string | null } };
    const [refreshing, setRefreshing] = React.useState(false);

    const refresh = (): void => {
        setRefreshing(true);

        router.post(
            '/libraries/refresh',
            {},
            {
                preserveScroll: true,
                onFinish: () => setRefreshing(false),
            },
        );
    };

    const generated = map.generated_at !== null ? new Date(map.generated_at).toLocaleString() : 'never';

    return (
        <>
            <Head title="Libraries" />

            <Stack spacing={2}>
                {flash?.success && <Alert severity="success">{flash.success}</Alert>}
                {flash?.error && <Alert severity="error">{flash.error}</Alert>}

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={2}
                        alignItems={{ xs: 'stretch', md: 'center' }}
                        justifyContent="space-between"
                    >
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip
                                label={`composer ${packages.totals.composer}`}
                                size="small"
                                sx={{ fontFamily: MONO }}
                            />
                            <Chip label={`npm ${packages.totals.npm}`} size="small" sx={{ fontFamily: MONO }} />
                            <Chip label={`PHP ${runtime.php}`} size="small" variant="outlined" sx={{ fontFamily: MONO }} />
                            <Chip
                                label={`Laravel ${runtime.laravel}`}
                                size="small"
                                variant="outlined"
                                sx={{ fontFamily: MONO }}
                            />
                            <Chip
                                label={runtime.environment}
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ fontFamily: MONO }}
                            />
                        </Stack>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box sx={{ textAlign: { md: 'right' } }}>
                                <Typography sx={{ fontSize: 11, color: 'text.secondary', fontFamily: MONO }}>
                                    map generated {generated}
                                </Typography>
                                {map.stale && (
                                    <Typography sx={{ fontSize: 11, color: 'warning.main', fontFamily: MONO }}>
                                        a manifest changed since — refresh
                                    </Typography>
                                )}
                            </Box>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={refresh}
                                disabled={refreshing}
                                sx={{ fontFamily: MONO, whiteSpace: 'nowrap' }}
                            >
                                {refreshing ? 'Refreshing…' : 'Refresh'}
                            </Button>
                        </Stack>
                    </Stack>

                    <Typography sx={{ mt: 1.5, fontSize: 11, color: 'text.disabled', fontFamily: MONO }}>
                        Equivalent to: docker exec duka-dev-app php -d memory_limit=1G artisan
                        dev:generate-domain-map
                    </Typography>
                </Paper>

                <PackageRegistry packages={packages} />

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography
                        variant="overline"
                        sx={{ fontFamily: MONO, fontWeight: 700, letterSpacing: '0.08em' }}
                    >
                        PHP extensions
                    </Typography>
                    <Chip
                        label={runtime.extensions.length}
                        size="small"
                        sx={{ ml: 1, height: 18, fontSize: 10 }}
                    />
                    <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {runtime.extensions.map((extension) => (
                            <Chip
                                key={extension}
                                label={extension}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: 10, fontFamily: MONO }}
                            />
                        ))}
                    </Box>
                </Paper>
            </Stack>
        </>
    );
}

Libraries.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
