import * as React from 'react';
import {
    Box,
    Chip,
    Collapse,
    Divider,
    IconButton,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';
import LayersIcon from '@mui/icons-material/LayersRounded';
import StorageIcon from '@mui/icons-material/StorageRounded';
import BuildIcon from '@mui/icons-material/BuildRounded';
import CodeIcon from '@mui/icons-material/CodeRounded';
import WarningIcon from '@mui/icons-material/WarningAmberRounded';

import { classBasename, methodColor, ModelNode, PageNode, RouteNode } from '@/types/architecture';

interface TraceCardProps {
    route: RouteNode;
    domainColor: string;
    models: Record<string, ModelNode>;
    pages: Record<string, PageNode>;
    /** Highlight the substring currently being searched for. */
    highlight?: string;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Split a label so the matched search term can be emphasised. */
function Highlighted({ text, term }: { text: string; term?: string }): React.ReactElement {
    if (!term || term.length < 2) {
        return <>{text}</>;
    }

    const index = text.toLowerCase().indexOf(term.toLowerCase());

    if (index === -1) {
        return <>{text}</>;
    }

    return (
        <>
            {text.slice(0, index)}
            <Box component="mark" sx={{ bgcolor: 'warning.light', color: 'warning.contrastText', px: 0.2, borderRadius: 0.5 }}>
                {text.slice(index, index + term.length)}
            </Box>
            {text.slice(index + term.length)}
        </>
    );
}

function NodeShell({
    icon,
    title,
    accent,
    children,
    grow = 1,
}: {
    icon: React.ReactNode;
    title: string;
    accent: string;
    children: React.ReactNode;
    grow?: number;
}): React.ReactElement {
    return (
        <Box
            sx={{
                flex: `${grow} 1 200px`,
                minWidth: 190,
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                borderLeft: '3px solid',
                borderLeftColor: accent,
            }}
        >
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75, color: 'text.secondary' }}>
                {icon}
                <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    {title}
                </Typography>
            </Stack>
            {children}
        </Box>
    );
}

function Arrow(): React.ReactElement {
    return (
        <Box
            aria-hidden
            sx={{
                display: { xs: 'none', lg: 'flex' },
                alignItems: 'center',
                color: 'text.disabled',
                flex: '0 0 auto',
            }}
        >
            <ArrowForwardIcon fontSize="small" />
        </Box>
    );
}

function EmptyNode({ label }: { label: string }): React.ReactElement {
    return (
        <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
            {label}
        </Typography>
    );
}

const TraceCard = React.memo(function TraceCard({
    route,
    domainColor,
    models,
    pages,
    highlight,
}: TraceCardProps): React.ReactElement {
    const [open, setOpen] = React.useState(false);

    const accent = methodColor(route.primary_method);

    return (
        <Paper
            variant="outlined"
            sx={{
                borderRadius: 2.5,
                overflow: 'hidden',
                borderColor: 'divider',
                transition: 'border-color 120ms ease, box-shadow 120ms ease',
                '&:hover': { borderColor: domainColor, boxShadow: 2 },
            }}
        >
            {/* Header: method + uri + route name */}
            <Stack
                direction="row"
                spacing={1.25}
                alignItems="center"
                sx={{ px: 1.5, py: 1.25, bgcolor: 'background.paper' }}
            >
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    {route.methods.map((method) => (
                        <Chip
                            key={method}
                            label={method}
                            size="small"
                            sx={{
                                height: 22,
                                fontFamily: MONO,
                                fontWeight: 800,
                                fontSize: 11,
                                color: '#fff',
                                bgcolor: methodColor(method),
                            }}
                        />
                    ))}
                </Stack>

                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography
                        sx={{
                            fontFamily: MONO,
                            fontSize: 14,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Highlighted text={route.uri} term={highlight} />
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: MONO }}>
                        {route.name ?? 'unnamed route'}
                        {route.host ? ` · ${route.host}` : ''}
                    </Typography>
                </Box>

                <Tooltip title={open ? 'Hide details' : 'Show middleware, requests & files'}>
                    <IconButton
                        size="small"
                        onClick={() => setOpen((value) => !value)}
                        aria-label={open ? 'Collapse route details' : 'Expand route details'}
                        sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
                    >
                        <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Stack>

            <Divider />

            {/* The trace: route -> controller -> models/services -> page */}
            <Stack
                direction={{ xs: 'column', lg: 'row' }}
                spacing={1}
                alignItems="stretch"
                sx={{ p: 1.5, bgcolor: 'background.paper' }}
            >
                <NodeShell icon={<LayersIcon fontSize="inherit" />} title="Endpoint" accent={accent}>
                    <Typography sx={{ fontFamily: MONO, fontSize: 13, wordBreak: 'break-all' }}>
                        {route.uri}
                    </Typography>
                    {route.parameters.length > 0 && (
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                            {route.parameters.map((parameter) => (
                                <Chip key={parameter} label={`{${parameter}}`} size="small" variant="outlined" sx={{ height: 20, fontFamily: MONO, fontSize: 10 }} />
                            ))}
                        </Stack>
                    )}
                </NodeShell>

                <Arrow />

                <NodeShell icon={<CodeIcon fontSize="inherit" />} title="Controller" accent={domainColor} grow={1.2}>
                    {route.action.type === 'closure' ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography sx={{ fontFamily: MONO, fontSize: 13, color: 'text.secondary' }}>Closure</Typography>
                            <Tooltip title="Inline closure — consider extracting to a controller">
                                <WarningIcon fontSize="inherit" sx={{ color: 'warning.main' }} />
                            </Tooltip>
                        </Stack>
                    ) : (
                        <>
                            <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }}>
                                <Highlighted text={route.action.short ?? ''} term={highlight} />
                            </Typography>
                            <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'primary.main' }}>
                                @{route.action.method}
                            </Typography>
                        </>
                    )}
                    {route.action.source && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5, fontFamily: MONO, fontSize: 10 }}>
                            {route.action.source}
                        </Typography>
                    )}
                </NodeShell>

                <Arrow />

                <NodeShell icon={<StorageIcon fontSize="inherit" />} title="Models & Services" accent="#8b5cf6" grow={1.4}>
                    {route.models.length === 0 && route.services.length === 0 ? (
                        <EmptyNode label="No data dependencies detected" />
                    ) : (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                            {route.models.map((model) => (
                                <Tooltip key={model} title={`${model}${models[model]?.table ? ` → ${models[model].table}` : ''}`}>
                                    <Chip
                                        label={classBasename(model)}
                                        size="small"
                                        sx={{ height: 22, fontFamily: MONO, fontSize: 11, bgcolor: 'rgba(139,92,246,0.14)', color: '#8b5cf6', fontWeight: 600 }}
                                    />
                                </Tooltip>
                            ))}
                            {route.services.map((service) => (
                                <Tooltip key={service} title={service}>
                                    <Chip
                                        icon={<BuildIcon sx={{ fontSize: 12 }} />}
                                        label={classBasename(service)}
                                        size="small"
                                        sx={{ height: 22, fontFamily: MONO, fontSize: 11, bgcolor: 'rgba(16,185,129,0.14)', color: '#10b981', fontWeight: 600 }}
                                    />
                                </Tooltip>
                            ))}
                        </Stack>
                    )}
                </NodeShell>

                <Arrow />

                <NodeShell icon={<LayersIcon fontSize="inherit" />} title="TSX Page" accent="#38bdf8" grow={1.2}>
                    {route.pages.length === 0 ? (
                        <EmptyNode label={route.primary_method === 'GET' ? 'No Inertia render' : 'Redirect / JSON response'} />
                    ) : (
                        <Stack spacing={0.5}>
                            {route.pages.map((component) => {
                                const page = pages[component];
                                const missing = page ? !page.exists : true;

                                return (
                                    <Tooltip
                                        key={component}
                                        title={missing ? 'Component not found under resources/js/Pages' : page?.file ?? component}
                                    >
                                        <Typography
                                            sx={{
                                                fontFamily: MONO,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                wordBreak: 'break-word',
                                                color: missing ? 'error.main' : 'text.primary',
                                            }}
                                        >
                                            <Highlighted text={component} term={highlight} />
                                            {missing && ' ⚠'}
                                        </Typography>
                                    </Tooltip>
                                );
                            })}
                        </Stack>
                    )}
                </NodeShell>
            </Stack>

            {/* Expandable detail drawer */}
            <Collapse in={open} unmountOnExit>
                <Divider />
                <Box sx={{ px: 1.5, py: 1.5, bgcolor: 'background.default' }}>
                    <Stack spacing={1.25}>
                        <DetailRow label="Middleware">
                            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                {route.middleware.map((tag) => (
                                    <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 20, fontFamily: MONO, fontSize: 10 }} />
                                ))}
                            </Stack>
                        </DetailRow>

                        {route.requests.length > 0 && (
                            <DetailRow label="Form Requests">
                                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                    {route.requests.map((request) => (
                                        <Tooltip key={request} title={request}>
                                            <Chip label={classBasename(request)} size="small" sx={{ height: 20, fontFamily: MONO, fontSize: 10, bgcolor: 'rgba(245,158,11,0.16)', color: '#b45309' }} />
                                        </Tooltip>
                                    ))}
                                </Stack>
                            </DetailRow>
                        )}

                        {route.action.signature && (
                            <DetailRow label="Signature">
                                <Typography sx={{ fontFamily: MONO, fontSize: 12 }}>{route.action.signature}</Typography>
                            </DetailRow>
                        )}

                        {route.action.file && (
                            <DetailRow label="Controller file">
                                <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary' }}>
                                    {route.action.file}
                                    {route.action.line ? `:${route.action.line}` : ''}
                                </Typography>
                            </DetailRow>
                        )}

                        {route.links.length > 0 && (
                            <DetailRow label="Redirects to">
                                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                    {route.links.map((link) => (
                                        <Chip key={link} label={link} size="small" variant="outlined" sx={{ height: 20, fontFamily: MONO, fontSize: 10 }} />
                                    ))}
                                </Stack>
                            </DetailRow>
                        )}
                    </Stack>
                </Box>
            </Collapse>
        </Paper>
    );
});

function DetailRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
    return (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Typography
                variant="caption"
                sx={{ minWidth: 130, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}
            >
                {label}
            </Typography>
            <Box sx={{ minWidth: 0 }}>{children}</Box>
        </Stack>
    );
}

export default TraceCard;
