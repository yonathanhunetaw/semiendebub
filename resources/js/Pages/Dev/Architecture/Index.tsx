import * as React from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    ListItemText,
    MenuItem,
    OutlinedInput,
    Paper,
    Select,
    Stack,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import SearchIcon from '@mui/icons-material/SearchRounded';
import SyncIcon from '@mui/icons-material/SyncRounded';
import DownloadIcon from '@mui/icons-material/DownloadRounded';
import ClearIcon from '@mui/icons-material/CloseRounded';
import WarningIcon from '@mui/icons-material/WarningAmberRounded';
import SortByAlphaIcon from '@mui/icons-material/SortByAlphaRounded';
import AccountTreeIcon from '@mui/icons-material/AccountTreeRounded';

import DevLayout from '@/Layouts/DevLayout';
import TraceCard from '@/Components/Dev/Architecture/TraceCard';
import ModelGraph from '@/Components/Dev/Architecture/ModelGraph';
import ModuleGraph from '@/Components/Dev/Architecture/ModuleGraph';
import PageInventory from '@/Components/Dev/Architecture/PageInventory';
import PackageRegistry from '@/Components/Dev/Architecture/PackageRegistry';
import {
    ArchitectureMap,
    ArchitecturePageProps,
    classBasename,
    DomainKey,
    ModelNode,
    PageNode,
    RouteNode,
    ServiceNode,
} from '@/types/architecture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const PAGE_SIZE = 40;

type TabKey = 'traces' | 'graph' | 'models' | 'pages' | 'packages';
type DomainFilter = DomainKey | 'all';
type SortMode = 'grouped' | 'alpha';

/** "2 minutes ago" without pulling in a date library. */
function relativeTime(iso: string, now: number): string {
    const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

    if (seconds < 45) return 'just now';
    if (seconds < 90) return 'a minute ago';
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
    if (seconds < 7200) return 'an hour ago';
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;

    return `${Math.round(seconds / 86400)} day(s) ago`;
}

export default function Index(): React.ReactElement {
    const { map, error, endpoints } = usePage<ArchitecturePageProps & Record<string, unknown>>().props;

    const [syncing, setSyncing] = React.useState(false);
    const [syncedAt, setSyncedAt] = React.useState(() => Date.now());

    const regenerate = React.useCallback(() => {
        setSyncing(true);

        router.post(
            endpoints.regenerate,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setSyncing(false);
                    setSyncedAt(Date.now());
                },
            },
        );
    }, [endpoints.regenerate]);

    if (!map) {
        return (
            <Box sx={{ p: 3 }}>
                <Head title="Domain Architecture" />
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error ?? 'The architecture map could not be loaded.'}
                </Alert>
                <Button variant="contained" startIcon={<SyncIcon />} onClick={regenerate} disabled={syncing}>
                    Run generator
                </Button>
            </Box>
        );
    }

    return (
        <ArchitectureExplorer
            key={syncedAt}
            map={map}
            error={error}
            downloadUrl={endpoints.download}
            syncing={syncing}
            regenerate={regenerate}
        />
    );
}

interface ExplorerProps {
    map: ArchitectureMap;
    error: string | null;
    downloadUrl: string;
    syncing: boolean;
    regenerate: () => void;
}

function ArchitectureExplorer({ map, error, downloadUrl, syncing, regenerate }: ExplorerProps): React.ReactElement {
    const [tab, setTab] = React.useState<TabKey>('traces');
    const [domain, setDomain] = React.useState<DomainFilter>('all');
    const [term, setTerm] = React.useState('');
    const [methods, setMethods] = React.useState<string[]>([]);
    const [middleware, setMiddleware] = React.useState<string[]>([]);
    const [onlyGaps, setOnlyGaps] = React.useState(false);
    const [sort, setSort] = React.useState<SortMode>('grouped');
    const [visible, setVisible] = React.useState(PAGE_SIZE);
    const [now, setNow] = React.useState(() => Date.now());

    const searchRef = React.useRef<HTMLInputElement | null>(null);

    // Keep the "generated X ago" indicator honest without re-rendering constantly.
    React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15_000);

        return () => window.clearInterval(timer);
    }, []);

    // "/" focuses search, Escape clears it.
    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

            if (event.key === '/' && !typing) {
                event.preventDefault();
                searchRef.current?.focus();
            }

            if (event.key === 'Escape' && typing) {
                setTerm('');
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    React.useEffect(() => setVisible(PAGE_SIZE), [domain, term, methods, middleware, onlyGaps, sort, tab]);

    const needle = term.trim().toLowerCase();

    const colorFor = React.useCallback(
        (key: string): string => map.domains.find((item) => item.key === key)?.color ?? '#94a3b8',
        [map.domains],
    );

    const modelIndex = React.useMemo(() => {
        const index: Record<string, ModelNode> = {};
        map.models.forEach((model) => {
            index[model.class] = model;
        });

        return index;
    }, [map.models]);

    const pageIndex = React.useMemo(() => {
        const index: Record<string, PageNode> = {};
        map.pages.forEach((page) => {
            index[page.component] = page;
        });

        return index;
    }, [map.pages]);

    const matchesRoute = React.useCallback(
        (route: RouteNode): boolean => {
            if (domain !== 'all' && route.domain !== domain) return false;
            if (methods.length > 0 && !route.methods.some((method) => methods.includes(method))) return false;
            if (middleware.length > 0 && !middleware.every((tag) => route.middleware.includes(tag))) return false;

            if (onlyGaps) {
                const missingPage = route.pages.some((component) => !pageIndex[component]?.exists);

                if (!missingPage && route.action.type !== 'closure') return false;
            }

            if (!needle) return true;

            return [
                route.uri,
                route.name ?? '',
                route.host ?? '',
                route.action.label,
                route.action.class ?? '',
                route.action.source ?? '',
                ...route.pages,
                ...route.models,
                ...route.models.map(classBasename),
                ...route.services.map(classBasename),
                ...route.requests.map(classBasename),
                ...route.middleware,
            ]
                .join(' ')
                .toLowerCase()
                .includes(needle);
        },
        [domain, methods, middleware, needle, onlyGaps, pageIndex],
    );

    const filteredRoutes = React.useMemo(() => {
        const rows = map.routes.filter(matchesRoute);

        return sort === 'alpha'
            ? [...rows].sort((a, b) => (a.name ?? a.uri).localeCompare(b.name ?? b.uri))
            : rows;
    }, [map.routes, matchesRoute, sort]);

    const filteredModels = React.useMemo(() => {
        const rows = map.models.filter((model) => {
            if (domain !== 'all' && model.domain !== domain) return false;
            if (!needle) return true;

            return [model.class, model.table ?? '', ...model.migrations.map((m) => m.file), ...model.factories, ...model.seeders]
                .join(' ')
                .toLowerCase()
                .includes(needle);
        });

        return sort === 'alpha' ? [...rows].sort((a, b) => a.short.localeCompare(b.short)) : rows;
    }, [map.models, domain, needle, sort]);

    const filteredServices = React.useMemo<ServiceNode[]>(
        () =>
            map.services.filter((service) => {
                if (domain !== 'all' && service.domain !== domain) return false;
                if (!needle) return true;

                return `${service.class} ${service.methods.join(' ')}`.toLowerCase().includes(needle);
            }),
        [map.services, domain, needle],
    );

    const filteredPages = React.useMemo(() => {
        const rows = map.pages.filter((page) => {
            if (domain !== 'all' && page.domain !== domain) return false;
            if (onlyGaps && page.exists && page.routes.length > 0) return false;
            if (!needle) return true;

            return [page.component, page.file ?? '', page.layout ?? '', ...page.routes.map((route) => route.name ?? '')]
                .join(' ')
                .toLowerCase()
                .includes(needle);
        });

        return sort === 'alpha' ? [...rows].sort((a, b) => a.component.localeCompare(b.component)) : rows;
    }, [map.pages, domain, needle, onlyGaps, sort]);

    // Stat tiles follow the current selection, with the unfiltered total as context.
    const stats = React.useMemo(() => {
        const controllers = new Set(
            filteredRoutes.map((route) => route.action.class).filter((value): value is string => value !== null),
        );

        return [
            { label: 'Routes', value: filteredRoutes.length, total: map.stats.routes },
            { label: 'Controllers', value: controllers.size, total: map.stats.controllers },
            { label: 'Models', value: filteredModels.length, total: map.stats.models },
            { label: 'Services', value: filteredServices.length, total: map.stats.services },
            { label: 'TSX Pages', value: filteredPages.length, total: map.stats.pages },
            {
                label: 'Closure routes',
                value: filteredRoutes.filter((route) => route.action.type === 'closure').length,
                total: map.stats.closure_routes,
                warn: true,
            },
            {
                label: 'Orphan pages',
                value: filteredPages.filter((page) => page.exists && page.routes.length === 0).length,
                total: map.stats.orphan_pages,
                warn: true,
            },
        ];
    }, [filteredRoutes, filteredModels, filteredServices, filteredPages, map.stats]);

    const filtersActive =
        methods.length + middleware.length + (onlyGaps ? 1 : 0) + (domain === 'all' ? 0 : 1) + (needle ? 1 : 0) > 0;

    return (
        <Box sx={{ p: { xs: 1, md: 0 } }}>
            <Head title="Domain Architecture" />

            {/* ---------- Header ---------- */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }} sx={{ mb: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h5" sx={{ fontFamily: MONO, fontWeight: 900, letterSpacing: -0.5 }}>
                        Domain Module Visualizer
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {map.meta.app_name} · Laravel {map.meta.laravel_version} · PHP {map.meta.php_version} · env{' '}
                        <Box component="span" sx={{ fontFamily: MONO }}>
                            {map.meta.app_env}
                        </Box>
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1} alignItems="center">
                    <Tooltip title={`Map generated ${new Date(map.meta.generated_at).toLocaleString()} in ${map.meta.duration_ms}ms`}>
                        <Chip
                            size="small"
                            icon={syncing ? <CircularProgress size={12} sx={{ ml: 1 }} /> : undefined}
                            label={syncing ? 'Syncing…' : `Synced ${relativeTime(map.meta.generated_at, now)}`}
                            sx={{ fontFamily: MONO, fontSize: 11 }}
                        />
                    </Tooltip>

                    <Tooltip title="Download the raw JSON map">
                        <IconButton size="small" component="a" href={downloadUrl} aria-label="Download architecture map JSON">
                            <DownloadIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Button
                        variant="contained"
                        size="small"
                        disableElevation
                        startIcon={
                            <SyncIcon
                                sx={{
                                    animation: syncing ? 'spin 1s linear infinite' : 'none',
                                    '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                                }}
                            />
                        }
                        onClick={regenerate}
                        disabled={syncing}
                    >
                        Regenerate
                    </Button>
                </Stack>
            </Stack>

            {error && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {/* ---------- Stats (follow the active filters) ---------- */}
            <Box
                sx={{
                    display: 'grid',
                    gap: 1,
                    mb: 2,
                    gridTemplateColumns: {
                        xs: 'repeat(2, minmax(0, 1fr))',
                        sm: 'repeat(4, minmax(0, 1fr))',
                        lg: 'repeat(7, minmax(0, 1fr))',
                    },
                }}
            >
                {stats.map((stat) => (
                    <Box
                        key={stat.label}
                        sx={{
                            px: 1.5,
                            py: 1,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'background.paper',
                            minWidth: 0,
                        }}
                    >
                        <Stack direction="row" spacing={0.5} alignItems="baseline">
                            <Typography
                                sx={{
                                    fontFamily: MONO,
                                    fontSize: 22,
                                    fontWeight: 800,
                                    lineHeight: 1.1,
                                    color: stat.warn && stat.value > 0 ? 'warning.main' : 'text.primary',
                                }}
                            >
                                {stat.value}
                            </Typography>
                            {filtersActive && stat.value !== stat.total && (
                                <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled' }}>
                                    /{stat.total}
                                </Typography>
                            )}
                        </Stack>
                        <Typography
                            variant="caption"
                            sx={{
                                display: 'block',
                                color: 'text.secondary',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                fontSize: 10,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {stat.label}
                        </Typography>
                    </Box>
                ))}
            </Box>

            {/* ---------- Domain tabs ---------- */}
            <Paper variant="outlined" sx={{ borderRadius: 2.5, p: 1.25, mb: 2 }}>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    <Chip
                        label={`All · ${map.stats.routes}`}
                        onClick={() => setDomain('all')}
                        variant={domain === 'all' ? 'filled' : 'outlined'}
                        color={domain === 'all' ? 'primary' : 'default'}
                        sx={{ fontWeight: 700, fontFamily: MONO, fontSize: 12 }}
                    />
                    {map.domains.map((item) => {
                        const active = domain === item.key;

                        return (
                            <Tooltip key={item.key} title={item.description}>
                                <Chip
                                    label={`${item.label} · ${item.counts.routes}`}
                                    onClick={() => setDomain(item.key)}
                                    variant={active ? 'filled' : 'outlined'}
                                    sx={{
                                        fontWeight: 700,
                                        fontFamily: MONO,
                                        fontSize: 12,
                                        borderColor: item.color,
                                        color: active ? '#fff' : item.color,
                                        bgcolor: active ? item.color : 'transparent',
                                        '&:hover': { bgcolor: active ? item.color : `${item.color}22` },
                                    }}
                                />
                            </Tooltip>
                        );
                    })}
                </Stack>
            </Paper>

            {/* ---------- Search & filters ---------- */}
            <Paper variant="outlined" sx={{ borderRadius: 2.5, p: 1.25, mb: 2 }}>
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }}>
                    <TextField
                        inputRef={searchRef}
                        size="small"
                        fullWidth
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                        placeholder="Search routes, controllers, models, services or TSX components…  (press /)"
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                                endAdornment: term ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setTerm('')} aria-label="Clear search">
                                            <ClearIcon fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                ) : undefined,
                            },
                        }}
                    />

                    <MultiSelect label="Method" value={methods} options={map.filters.methods} onChange={setMethods} width={160} />

                    <MultiSelect
                        label="Middleware"
                        value={middleware}
                        options={map.filters.middleware}
                        counts={map.filters.middleware_counts}
                        onChange={setMiddleware}
                        width={220}
                    />

                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={sort}
                        onChange={(_event, value: SortMode | null) => value && setSort(value)}
                    >
                        <Tooltip title="Group by domain, then URI">
                            <ToggleButton value="grouped" sx={{ px: 1.5 }}>
                                <AccountTreeIcon fontSize="small" sx={{ mr: 0.5 }} />
                                Grouped
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title="Sort everything alphabetically">
                            <ToggleButton value="alpha" sx={{ px: 1.5 }}>
                                <SortByAlphaIcon fontSize="small" sx={{ mr: 0.5 }} />
                                A–Z
                            </ToggleButton>
                        </Tooltip>
                    </ToggleButtonGroup>

                    <ToggleButton
                        value="gaps"
                        size="small"
                        selected={onlyGaps}
                        onChange={() => setOnlyGaps(!onlyGaps)}
                        sx={{ whiteSpace: 'nowrap', px: 1.5 }}
                    >
                        <WarningIcon fontSize="small" sx={{ mr: 0.5 }} />
                        Gaps only
                    </ToggleButton>

                    {filtersActive && (
                        <Button
                            size="small"
                            onClick={() => {
                                setMethods([]);
                                setMiddleware([]);
                                setOnlyGaps(false);
                                setDomain('all');
                                setTerm('');
                            }}
                        >
                            Reset
                        </Button>
                    )}
                </Stack>
            </Paper>

            {/* ---------- Content tabs ---------- */}
            <Tabs
                value={tab}
                onChange={(_event, value: TabKey) => setTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, minHeight: 42, '& .MuiTab-root': { minHeight: 42, textTransform: 'none', fontWeight: 700 } }}
            >
                <Tab value="traces" label={<TabLabel title="Route traces" count={filteredRoutes.length} />} />
                <Tab value="graph" label={<TabLabel title="Module map" count={filteredRoutes.length} />} />
                <Tab value="models" label={<TabLabel title="Models & schema" count={filteredModels.length} />} />
                <Tab value="pages" label={<TabLabel title="TSX pages" count={filteredPages.length} />} />
                <Tab
                    value="packages"
                    label={<TabLabel title="Packages" count={map.packages.totals.composer + map.packages.totals.npm} />}
                />
            </Tabs>

            <Divider sx={{ mb: 2 }} />

            {tab === 'traces' && (
                <Stack spacing={1.25}>
                    {filteredRoutes.length === 0 && (
                        <Typography sx={{ color: 'text.secondary', py: 6, textAlign: 'center' }}>
                            No routes match the current filters.
                        </Typography>
                    )}

                    {filteredRoutes.slice(0, visible).map((route) => (
                        <TraceCard
                            key={route.id}
                            route={route}
                            domainColor={colorFor(route.domain)}
                            models={modelIndex}
                            pages={pageIndex}
                            highlight={needle}
                        />
                    ))}

                    {filteredRoutes.length > visible && (
                        <Button onClick={() => setVisible((value) => value + PAGE_SIZE)} sx={{ alignSelf: 'center', mt: 1 }}>
                            Show {Math.min(PAGE_SIZE, filteredRoutes.length - visible)} more of {filteredRoutes.length}
                        </Button>
                    )}
                </Stack>
            )}

            {tab === 'graph' && (
                <ModuleGraph
                    routes={filteredRoutes}
                    controllers={map.controllers}
                    models={modelIndex}
                    pages={pageIndex}
                    domainColor={colorFor}
                />
            )}

            {tab === 'models' && <ModelGraph models={filteredModels} domainColor={colorFor} />}

            {tab === 'pages' && <PageInventory pages={filteredPages} domainColor={colorFor} />}

            {tab === 'packages' && <PackageRegistry packages={map.packages} />}
        </Box>
    );
}

/** Inline count, so the number can never be clipped the way a Badge is. */
function TabLabel({ title, count }: { title: string; count: number }): React.ReactElement {
    return (
        <Stack direction="row" spacing={0.75} alignItems="center">
            <span>{title}</span>
            <Box
                component="span"
                sx={{
                    px: 0.75,
                    py: 0.1,
                    borderRadius: 1,
                    bgcolor: 'action.selected',
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1.6,
                }}
            >
                {count}
            </Box>
        </Stack>
    );
}

function MultiSelect({
    label,
    value,
    options,
    counts,
    onChange,
    width,
}: {
    label: string;
    value: string[];
    options: string[];
    counts?: Record<string, number>;
    onChange: (value: string[]) => void;
    width: number;
}): React.ReactElement {
    return (
        <FormControl size="small" sx={{ minWidth: width }}>
            <InputLabel>{label}</InputLabel>
            <Select
                multiple
                value={value}
                onChange={(event) => {
                    const next = event.target.value;
                    onChange(typeof next === 'string' ? next.split(',') : next);
                }}
                input={<OutlinedInput label={label} />}
                renderValue={(selected) => (selected as string[]).join(', ')}
                MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
            >
                {options.map((option) => (
                    <MenuItem key={option} value={option} dense>
                        <Checkbox size="small" checked={value.includes(option)} />
                        <ListItemText
                            primary={option}
                            secondary={counts?.[option] !== undefined ? `${counts[option]} routes` : undefined}
                            slotProps={{ primary: { sx: { fontFamily: MONO, fontSize: 12.5 } } }}
                        />
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

Index.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
