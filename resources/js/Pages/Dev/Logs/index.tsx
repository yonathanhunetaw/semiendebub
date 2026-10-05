import * as React from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    FormControl,
    FormControlLabel,
    InputAdornment,
    InputLabel,
    LinearProgress,
    List,
    ListItemButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchIcon from '@mui/icons-material/SearchRounded';
import RefreshIcon from '@mui/icons-material/RefreshRounded';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweepRounded';
import DescriptionIcon from '@mui/icons-material/DescriptionRounded';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunchRounded';
import DnsIcon from '@mui/icons-material/DnsRounded';

import DevLayout from '@/Layouts/DevLayout';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Levels we colour explicitly, as theme token names (each has an `on-` ink);
 * anything else falls back to neutral (outline).
 */
const LEVEL_TONES: Record<string, 'error' | 'warning' | 'info' | 'success' | 'primary'> = {
    EMERGENCY: 'error',
    ALERT: 'error',
    CRITICAL: 'error',
    ERROR: 'error',
    STDERR: 'error',
    WARNING: 'warning',
    WARN: 'warning',
    NOTICE: 'info',
    INFO: 'info',
    SUCCESS: 'success',
    DEBUG: 'primary',
    TRACE: 'primary',
};

const SEVERITIES = ['all', 'ERROR', 'STDERR', 'WARNING', 'SUCCESS', 'INFO', 'DEBUG'] as const;

const CATEGORY_ICONS: Record<string, React.ReactElement> = {
    laravel: <DescriptionIcon fontSize="small" />,
    deploy: <RocketLaunchIcon fontSize="small" />,
    docker: <DnsIcon fontSize="small" />,
};

interface LogSource {
    id: string;
    label: string;
    source_type: 'file' | 'container';
    identifier: string;
    detail: string | null;
    size: number | null;
    modified_at: string | null;
    writable: boolean;
    state: string | null;
    status: string | null;
    health: string | null;
}

interface LogCategory {
    key: string;
    label: string;
    description: string;
    sources: LogSource[];
}

interface LogEntry {
    id: number;
    timestamp: string | null;
    level: string;
    channel: string | null;
    message: string;
    trace: string | null;
}

interface LogsPageProps {
    categories: LogCategory[];
    docker: { available: boolean; hint: string | null };
}

function levelColor(level: string): string {
    const tone = LEVEL_TONES[level.toUpperCase()];
    return tone ? `rgb(var(--${tone}))` : 'rgb(var(--outline))';
}

/** Text color for a chip filled with levelColor(level). */
function levelInk(level: string): string {
    const tone = LEVEL_TONES[level.toUpperCase()];
    return tone ? `rgb(var(--on-${tone}))` : 'rgb(var(--surface-container-lowest))';
}

function formatBytes(bytes: number | null): string {
    if (bytes === null) {
        return '—';
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${value.toFixed(1)} ${units[unit]}`;
}

/** Container state → Chip colour, so a stopped container reads as stopped. */
function stateColor(state: string | null): 'success' | 'warning' | 'error' | 'default' {
    switch (state) {
        case 'running':
            return 'success';
        case 'restarting':
        case 'paused':
            return 'warning';
        case 'exited':
        case 'dead':
            return 'error';
        default:
            return 'default';
    }
}

export default function DevLogs({ categories, docker }: LogsPageProps): React.ReactElement {
    const { flash } = usePage().props as { flash?: { success?: string | null; error?: string | null } };

    const [tab, setTab] = React.useState(0);
    const [selected, setSelected] = React.useState<LogSource | null>(
        () => categories.find((category) => category.sources.length > 0)?.sources[0] ?? null,
    );

    const [entries, setEntries] = React.useState<LogEntry[]>([]);
    const [meta, setMeta] = React.useState<{ count: number; fetched_at: string; size: number | null } | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const [term, setTerm] = React.useState('');
    const [severity, setSeverity] = React.useState<string>('all');
    const [autoScroll, setAutoScroll] = React.useState(true);
    const [autoRefresh, setAutoRefresh] = React.useState(false);

    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    const load = React.useCallback(
        async (source: LogSource, quiet = false): Promise<void> => {
            if (!quiet) {
                setLoading(true);
            }

            try {
                const query = new URLSearchParams({
                    source_type: source.source_type,
                    identifier: source.identifier,
                });

                const response = await fetch(`/logs/fetch?${query.toString()}`, {
                    headers: { Accept: 'application/json' },
                });

                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText}`);
                }

                const payload = await response.json();

                setEntries(payload.entries ?? []);
                setMeta(payload.meta ?? null);
                setError(null);
            } catch (exception) {
                setError(exception instanceof Error ? exception.message : 'Failed to load log');
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    // Initial load and reload on source change.
    React.useEffect(() => {
        if (selected) {
            void load(selected);
        } else {
            setEntries([]);
            setMeta(null);
        }
    }, [selected, load]);

    // Polling. `quiet` keeps the spinner off so the view does not flicker.
    React.useEffect(() => {
        if (!autoRefresh || !selected) {
            return;
        }

        const timer = window.setInterval(() => void load(selected, true), 2500);

        return () => window.clearInterval(timer);
    }, [autoRefresh, selected, load]);

    const visible = React.useMemo(() => {
        const needle = term.trim().toLowerCase();

        return entries.filter((entry) => {
            if (severity !== 'all' && entry.level.toUpperCase() !== severity) {
                return false;
            }

            if (needle === '') {
                return true;
            }

            return (
                entry.message.toLowerCase().includes(needle) ||
                (entry.channel ?? '').toLowerCase().includes(needle) ||
                (entry.trace ?? '').toLowerCase().includes(needle)
            );
        });
    }, [entries, term, severity]);

    // Pin to the newest line after each render that changed the list.
    React.useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [visible, autoScroll]);

    const counts = React.useMemo(() => {
        const tally: Record<string, number> = {};

        entries.forEach((entry) => {
            const level = entry.level.toUpperCase();
            tally[level] = (tally[level] ?? 0) + 1;
        });

        return tally;
    }, [entries]);

    const clear = (): void => {
        if (!selected) {
            return;
        }

        router.post(
            '/logs/clear',
            { source_type: selected.source_type, identifier: selected.identifier },
            { preserveScroll: true, onSuccess: () => void load(selected) },
        );
    };

    const activeCategory = categories[tab] ?? categories[0];

    return (
        <>
            <Head title="Log viewer" />

            <Stack spacing={2}>
                {flash?.success && <Alert severity="success">{flash.success}</Alert>}
                {flash?.error && <Alert severity="error">{flash.error}</Alert>}
                {!docker.available && docker.hint && <Alert severity="info">{docker.hint}</Alert>}

                {/* Controls bar */}
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }}>
                        <TextField
                            size="small"
                            placeholder="Filter lines…"
                            value={term}
                            onChange={(event) => setTerm(event.target.value)}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                            sx={{ minWidth: 220, flex: 1 }}
                        />

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel id="severity-label">Severity</InputLabel>
                            <Select
                                labelId="severity-label"
                                label="Severity"
                                value={severity}
                                onChange={(event) => setSeverity(String(event.target.value))}
                            >
                                {SEVERITIES.map((option) => (
                                    <MenuItem key={option} value={option} sx={{ fontFamily: MONO, fontSize: 13 }}>
                                        {option === 'all' ? 'All levels' : option}
                                        {option !== 'all' && counts[option] ? ` (${counts[option]})` : ''}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControlLabel
                            control={<Switch size="small" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />}
                            label={<Typography sx={{ fontSize: 12 }}>Auto-scroll</Typography>}
                        />
                        <FormControlLabel
                            control={<Switch size="small" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />}
                            label={<Typography sx={{ fontSize: 12 }}>Live (2.5s)</Typography>}
                        />

                        <Box sx={{ flexGrow: 1 }} />

                        <Stack direction="row" spacing={1}>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<RefreshIcon />}
                                disabled={!selected || loading}
                                onClick={() => selected && void load(selected)}
                                sx={{ fontFamily: MONO }}
                            >
                                Refresh
                            </Button>
                            <Tooltip
                                title={
                                    selected?.source_type === 'container'
                                        ? 'Container streams are managed by Docker'
                                        : selected?.writable
                                          ? 'Truncate this file'
                                          : 'File is not writable'
                                }
                            >
                                <span>
                                    <Button
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        startIcon={<DeleteSweepIcon />}
                                        disabled={!selected || selected.source_type === 'container' || !selected.writable}
                                        onClick={clear}
                                        sx={{ fontFamily: MONO }}
                                    >
                                        Clear
                                    </Button>
                                </span>
                            </Tooltip>
                        </Stack>
                    </Stack>
                </Paper>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' } }}>
                    {/* Source picker */}
                    <Paper variant="outlined" sx={{ borderRadius: 2, width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
                        <Tabs
                            value={tab}
                            onChange={(_, value: number) => setTab(value)}
                            variant="fullWidth"
                            sx={{ minHeight: 44, '& .MuiTab-root': { minHeight: 44, minWidth: 0, p: 1 } }}
                        >
                            {categories.map((category) => (
                                <Tab
                                    key={category.key}
                                    icon={CATEGORY_ICONS[category.key]}
                                    iconPosition="start"
                                    label={
                                        <Typography sx={{ fontSize: 10, fontFamily: MONO }}>
                                            {category.sources.length}
                                        </Typography>
                                    }
                                    aria-label={category.label}
                                />
                            ))}
                        </Tabs>

                        <Divider />

                        <Box sx={{ p: 1.25 }}>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: MONO }}>
                                {activeCategory?.label}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                                {activeCategory?.description}
                            </Typography>
                        </Box>

                        <Divider />

                        <List dense sx={{ maxHeight: 440, overflowY: 'auto', py: 0 }}>
                            {(activeCategory?.sources ?? []).length === 0 && (
                                <Box sx={{ p: 2 }}>
                                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                        No sources in this category.
                                    </Typography>
                                </Box>
                            )}

                            {(activeCategory?.sources ?? []).map((source) => (
                                <ListItemButton
                                    key={source.id}
                                    selected={selected?.id === source.id}
                                    onClick={() => setSelected(source)}
                                    sx={{ display: 'block', py: 1 }}
                                >
                                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                                        <Typography
                                            noWrap
                                            sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0 }}
                                        >
                                            {source.label}
                                        </Typography>
                                        {source.source_type === 'container' && (
                                            <Chip
                                                label={source.health ?? source.state ?? 'unknown'}
                                                size="small"
                                                color={stateColor(source.state)}
                                                sx={{ height: 17, fontSize: 9 }}
                                            />
                                        )}
                                    </Stack>
                                    <Typography noWrap sx={{ fontSize: 10, color: 'text.secondary', fontFamily: MONO }}>
                                        {source.source_type === 'container'
                                            ? source.status
                                            : `${source.detail} · ${formatBytes(source.size)}`}
                                    </Typography>
                                </ListItemButton>
                            ))}
                        </List>
                    </Paper>

                    {/* Log pane */}
                    <Paper
                        variant="outlined"
                        sx={{ borderRadius: 2, flex: 1, minWidth: 0, overflow: 'hidden', width: { xs: '100%', md: 'auto' } }}
                    >
                        <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}
                        >
                            <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                                {selected ? selected.identifier : 'No source selected'}
                            </Typography>
                            {loading && <CircularProgress size={14} />}
                            <Chip
                                label={`${visible.length}/${entries.length}`}
                                size="small"
                                sx={{ height: 18, fontSize: 10, fontFamily: MONO }}
                            />
                            {autoRefresh && (
                                <Chip label="live" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />
                            )}
                        </Stack>

                        {loading && <LinearProgress sx={{ height: 2 }} />}

                        {error && (
                            <Alert severity="error" sx={{ m: 1.5 }}>
                                {error}
                            </Alert>
                        )}

                        <Box
                            ref={scrollRef}
                            sx={{
                                bgcolor: 'rgb(var(--surface-container-low))',
                                color: 'text.primary',
                                fontFamily: MONO,
                                fontSize: 12,
                                lineHeight: 1.6,
                                height: 560,
                                overflowY: 'auto',
                                p: 1.25,
                            }}
                        >
                            {visible.length === 0 && !loading && (
                                <Typography sx={{ color: 'rgb(var(--outline))', fontFamily: MONO, fontSize: 12 }}>
                                    {entries.length === 0 ? 'No log entries.' : 'No lines match the current filters.'}
                                </Typography>
                            )}

                            {visible.map((entry) => (
                                <Box
                                    key={entry.id}
                                    sx={{
                                        py: 0.35,
                                        borderLeft: '2px solid',
                                        borderLeftColor: levelColor(entry.level),
                                        pl: 1,
                                        mb: 0.35,
                                        '&:hover': { bgcolor: 'rgb(var(--on-surface) / 0.04)' },
                                    }}
                                >
                                    <Stack direction="row" spacing={1} alignItems="flex-start">
                                        <Chip
                                            label={entry.level}
                                            size="small"
                                            sx={{
                                                height: 17,
                                                fontSize: 9,
                                                fontFamily: MONO,
                                                fontWeight: 700,
                                                flexShrink: 0,
                                                color: levelInk(entry.level),
                                                bgcolor: levelColor(entry.level),
                                            }}
                                        />
                                        {entry.timestamp && (
                                            <Typography
                                                component="span"
                                                sx={{ color: 'rgb(var(--outline))', fontFamily: MONO, fontSize: 11, flexShrink: 0 }}
                                            >
                                                {entry.timestamp}
                                            </Typography>
                                        )}
                                        <Typography
                                            component="span"
                                            sx={{
                                                fontFamily: MONO,
                                                fontSize: 12,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                flex: 1,
                                                minWidth: 0,
                                            }}
                                        >
                                            {entry.message}
                                        </Typography>
                                    </Stack>

                                    {entry.trace && (
                                        <Accordion
                                            disableGutters
                                            elevation={0}
                                            sx={{
                                                mt: 0.5,
                                                bgcolor: 'transparent',
                                                '&:before': { display: 'none' },
                                            }}
                                        >
                                            <AccordionSummary
                                                expandIcon={<ExpandMoreIcon sx={{ color: 'rgb(var(--outline))', fontSize: 16 }} />}
                                                sx={{ minHeight: 24, px: 0, '& .MuiAccordionSummary-content': { my: 0 } }}
                                            >
                                                <Typography sx={{ color: 'text.secondary', fontFamily: MONO, fontSize: 11 }}>
                                                    {entry.trace.split('\n').length} more line
                                                    {entry.trace.split('\n').length === 1 ? '' : 's'} (stack trace)
                                                </Typography>
                                            </AccordionSummary>
                                            <AccordionDetails sx={{ px: 0, pt: 0 }}>
                                                <Box
                                                    component="pre"
                                                    sx={{
                                                        m: 0,
                                                        p: 1,
                                                        bgcolor: 'rgb(var(--surface-container))',
                                                        borderRadius: 1,
                                                        color: 'text.secondary',
                                                        fontFamily: MONO,
                                                        fontSize: 11,
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                    }}
                                                >
                                                    {entry.trace}
                                                </Box>
                                            </AccordionDetails>
                                        </Accordion>
                                    )}
                                </Box>
                            ))}
                        </Box>

                        {meta && (
                            <Stack
                                direction="row"
                                spacing={1.5}
                                sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider' }}
                            >
                                <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: MONO }}>
                                    {meta.count} entries
                                </Typography>
                                <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: MONO }}>
                                    {formatBytes(meta.size)}
                                </Typography>
                                <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: MONO }}>
                                    fetched {new Date(meta.fetched_at).toLocaleTimeString()}
                                </Typography>
                            </Stack>
                        )}
                    </Paper>
                </Box>
            </Stack>
        </>
    );
}

DevLogs.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
