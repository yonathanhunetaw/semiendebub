import * as React from 'react';
import {
    Box,
    Chip,
    InputAdornment,
    Link as MuiLink,
    Paper,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchRounded';
import OpenInNewIcon from '@mui/icons-material/OpenInNewRounded';

import { PackageGroup, PackageNode, PackageRegistryData } from '@/types/architecture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const GROUP_META: Record<PackageGroup, { label: string; color: string; hint: string }> = {
    framework: { label: 'Framework', color: '#6366f1', hint: 'Laravel, Inertia, React core' },
    ui: { label: 'UI', color: '#ec4899', hint: 'MUI, Tailwind, icons, canvas' },
    dev: { label: 'Dev tools', color: '#f59e0b', hint: 'Build chain, testing, linting' },
    utility: { label: 'Utilities', color: '#10b981', hint: 'HTTP, storage, observability' },
};

const GROUP_ORDER: PackageGroup[] = ['framework', 'ui', 'dev', 'utility'];

type RegistryFilter = 'all' | 'composer' | 'npm';

interface PackageRegistryProps {
    packages: PackageRegistryData;
}

export default function PackageRegistry({ packages }: PackageRegistryProps): React.ReactElement {
    const [term, setTerm] = React.useState('');
    const [registry, setRegistry] = React.useState<RegistryFilter>('all');

    const flattened = React.useMemo<PackageNode[]>(() => {
        const items: PackageNode[] = [];

        GROUP_ORDER.forEach((group) => {
            if (registry !== 'npm') {
                items.push(...(packages.composer[group] ?? []));
            }

            if (registry !== 'composer') {
                items.push(...(packages.npm[group] ?? []));
            }
        });

        return items;
    }, [packages, registry]);

    const filtered = React.useMemo(() => {
        const needle = term.trim().toLowerCase();

        if (!needle) {
            return flattened;
        }

        return flattened.filter((item) => item.name.toLowerCase().includes(needle));
    }, [flattened, term]);

    const grouped = React.useMemo(() => {
        const buckets: Record<PackageGroup, PackageNode[]> = { framework: [], ui: [], dev: [], utility: [] };

        filtered.forEach((item) => buckets[item.group].push(item));

        return buckets;
    }, [filtered]);

    return (
        <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <TextField
                    size="small"
                    fullWidth
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="Search packages…"
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{ maxWidth: { sm: 360 } }}
                />

                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={registry}
                    onChange={(_event, value: RegistryFilter | null) => value && setRegistry(value)}
                >
                    <ToggleButton value="all">All</ToggleButton>
                    <ToggleButton value="composer">Composer ({packages.totals.composer})</ToggleButton>
                    <ToggleButton value="npm">NPM ({packages.totals.npm})</ToggleButton>
                </ToggleButtonGroup>

                <Typography variant="caption" sx={{ color: 'text.secondary', ml: { sm: 'auto' } }}>
                    {filtered.length} package{filtered.length === 1 ? '' : 's'}
                </Typography>
            </Stack>

            {GROUP_ORDER.map((group) => {
                const items = grouped[group];

                if (items.length === 0) {
                    return null;
                }

                const meta = GROUP_META[group];

                return (
                    <Paper key={group} variant="outlined" sx={{ borderRadius: 2.5, p: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1.5 }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: meta.color }} />
                            <Typography sx={{ fontWeight: 800, letterSpacing: 0.4 }}>{meta.label}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {meta.hint} · {items.length}
                            </Typography>
                        </Stack>

                        <Box
                            sx={{
                                display: 'grid',
                                gap: 1,
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    sm: 'repeat(2, minmax(0, 1fr))',
                                    lg: 'repeat(3, minmax(0, 1fr))',
                                },
                            }}
                        >
                            {items.map((item) => (
                                <Box
                                    key={`${item.registry}:${item.name}`}
                                    sx={{
                                        p: 1.25,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: 'background.default',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        minWidth: 0,
                                    }}
                                >
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                                            <Typography
                                                sx={{
                                                    fontFamily: MONO,
                                                    fontSize: 12.5,
                                                    fontWeight: 600,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {item.name}
                                            </Typography>
                                            {item.dev && (
                                                <Chip
                                                    label="dev"
                                                    size="small"
                                                    sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: 'action.selected' }}
                                                />
                                            )}
                                        </Stack>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: MONO }}>
                                            {item.version ?? item.constraint}
                                            {item.version && item.version !== item.constraint ? ` (${item.constraint})` : ''}
                                        </Typography>
                                    </Box>

                                    <Tooltip title={`Open ${item.name} documentation`}>
                                        <MuiLink
                                            href={item.docs}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            sx={{ display: 'inline-flex', color: 'text.secondary', '&:hover': { color: meta.color } }}
                                            aria-label={`Documentation for ${item.name}`}
                                        >
                                            <OpenInNewIcon sx={{ fontSize: 16 }} />
                                        </MuiLink>
                                    </Tooltip>
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                );
            })}

            {filtered.length === 0 && (
                <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
                    No packages match “{term}”.
                </Typography>
            )}
        </Stack>
    );
}
