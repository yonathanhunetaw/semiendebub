import * as React from 'react';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import WarningIcon from '@mui/icons-material/WarningAmberRounded';
import LinkOffIcon from '@mui/icons-material/LinkOffRounded';

import { methodColor, PageNode } from '@/types/architecture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface PageInventoryProps {
    pages: PageNode[];
    domainColor: (domain: string) => string;
}

/**
 * Every .tsx page component, the routes that render it, and the ones that
 * nothing renders (dead components) or that are referenced but missing.
 */
export default function PageInventory({ pages, domainColor }: PageInventoryProps): React.ReactElement {
    if (pages.length === 0) {
        return (
            <Typography sx={{ color: 'text.secondary', py: 6, textAlign: 'center' }}>
                No page components match the current filters.
            </Typography>
        );
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
            }}
        >
            {pages.map((page) => (
                <Paper
                    key={page.component}
                    variant="outlined"
                    sx={{
                        borderRadius: 2.5,
                        p: 1.5,
                        borderLeft: '3px solid',
                        borderLeftColor: page.exists ? domainColor(page.domain) : 'error.main',
                    }}
                >
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, wordBreak: 'break-word' }}>
                            {page.component}
                        </Typography>
                        {!page.exists && (
                            <Tooltip title="Rendered by a controller but missing on disk">
                                <WarningIcon sx={{ fontSize: 15, color: 'error.main' }} />
                            </Tooltip>
                        )}
                        {page.exists && page.routes.length === 0 && (
                            <Tooltip title="No route renders this component">
                                <LinkOffIcon sx={{ fontSize: 15, color: 'warning.main' }} />
                            </Tooltip>
                        )}
                    </Stack>

                    <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: MONO, display: 'block' }}>
                        {page.file ?? 'file not found'}
                    </Typography>

                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                        {page.layout && (
                            <Chip label={page.layout} size="small" variant="outlined" sx={{ height: 19, fontFamily: MONO, fontSize: 10 }} />
                        )}
                        {page.lines > 0 && (
                            <Chip label={`${page.lines} lines`} size="small" sx={{ height: 19, fontSize: 10, bgcolor: 'action.selected' }} />
                        )}
                    </Stack>

                    {page.routes.length > 0 && (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                            {page.routes.map((route) => (
                                <Tooltip key={route.id} title={`${route.method} ${route.uri}`}>
                                    <Chip
                                        label={route.name ?? route.uri}
                                        size="small"
                                        sx={{
                                            height: 19,
                                            fontFamily: MONO,
                                            fontSize: 10,
                                            color: methodColor(route.method),
                                            border: '1px solid',
                                            borderColor: methodColor(route.method),
                                            bgcolor: 'transparent',
                                        }}
                                    />
                                </Tooltip>
                            ))}
                        </Stack>
                    )}
                </Paper>
            ))}
        </Box>
    );
}
