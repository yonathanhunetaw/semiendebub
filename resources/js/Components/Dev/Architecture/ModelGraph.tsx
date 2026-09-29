import * as React from 'react';
import { Box, Chip, Divider, Paper, Stack, Tooltip, Typography } from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChartRounded';
import HistoryEduIcon from '@mui/icons-material/HistoryEduRounded';
import ScienceIcon from '@mui/icons-material/ScienceRounded';
import YardIcon from '@mui/icons-material/YardRounded';
import HubIcon from '@mui/icons-material/HubRounded';

import { classBasename, ModelNode } from '@/types/architecture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface ModelGraphProps {
    models: ModelNode[];
    domainColor: (domain: string) => string;
}

/**
 * Model → table → migrations / factories / seeders, plus the routes that touch it.
 */
export default function ModelGraph({ models, domainColor }: ModelGraphProps): React.ReactElement {
    if (models.length === 0) {
        return (
            <Typography sx={{ color: 'text.secondary', py: 6, textAlign: 'center' }}>
                No models match the current filters.
            </Typography>
        );
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
            }}
        >
            {models.map((model) => (
                <Paper
                    key={model.class}
                    variant="outlined"
                    sx={{
                        borderRadius: 2.5,
                        p: 1.75,
                        borderLeft: '3px solid',
                        borderLeftColor: domainColor(model.domain),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.25,
                    }}
                >
                    <Box>
                        <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 14 }}>{model.short}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: MONO }}>
                            {model.class}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                        <TableChartIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                        <Chip
                            label={model.table ?? 'unknown table'}
                            size="small"
                            sx={{ height: 20, fontFamily: MONO, fontSize: 11, bgcolor: 'action.selected' }}
                        />
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: MONO }}>
                            pk: {model.primary_key} · {model.fillable.length} fillable
                        </Typography>
                    </Stack>

                    {model.relations.length > 0 && (
                        <Box>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5, color: 'text.secondary' }}>
                                <HubIcon sx={{ fontSize: 14 }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    Relations
                                </Typography>
                            </Stack>
                            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                {model.relations.map((relation) => (
                                    <Tooltip
                                        key={relation.name}
                                        title={`${relation.type}${relation.related ? ` → ${relation.related}` : ''}`}
                                    >
                                        <Chip
                                            label={`${relation.name}${relation.related ? `: ${classBasename(relation.related)}` : ''}`}
                                            size="small"
                                            variant="outlined"
                                            sx={{ height: 20, fontFamily: MONO, fontSize: 10 }}
                                        />
                                    </Tooltip>
                                ))}
                            </Stack>
                        </Box>
                    )}

                    <Divider flexItem />

                    <Stack spacing={0.75}>
                        <FileList
                            icon={<HistoryEduIcon sx={{ fontSize: 14 }} />}
                            label="Migrations"
                            files={model.migrations.map((migration) => `${migration.file.replace('database/migrations/', '')} (${migration.kind})`)}
                        />
                        <FileList
                            icon={<ScienceIcon sx={{ fontSize: 14 }} />}
                            label="Factories"
                            files={model.factories.map((file) => file.replace('database/factories/', ''))}
                        />
                        <FileList
                            icon={<YardIcon sx={{ fontSize: 14 }} />}
                            label="Seeders"
                            files={model.seeders.map((file) => file.replace('database/seeders/', ''))}
                        />
                    </Stack>

                    <Box sx={{ mt: 'auto' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Touched by {model.routes.length} route{model.routes.length === 1 ? '' : 's'}
                        </Typography>
                        {model.routes.length > 0 && (
                            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                {model.routes.slice(0, 6).map((route) => (
                                    <Chip
                                        key={route.id}
                                        label={route.name ?? `${route.method} ${route.uri}`}
                                        size="small"
                                        sx={{ height: 18, fontFamily: MONO, fontSize: 9.5 }}
                                    />
                                ))}
                                {model.routes.length > 6 && (
                                    <Chip label={`+${model.routes.length - 6}`} size="small" sx={{ height: 18, fontSize: 9.5 }} />
                                )}
                            </Stack>
                        )}
                    </Box>
                </Paper>
            ))}
        </Box>
    );
}

function FileList({ icon, label, files }: { icon: React.ReactNode; label: string; files: string[] }): React.ReactElement {
    return (
        <Stack direction="row" spacing={1} alignItems="flex-start">
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 104, color: 'text.secondary', pt: 0.25 }}>
                {icon}
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                </Typography>
            </Stack>
            <Box sx={{ minWidth: 0 }}>
                {files.length === 0 ? (
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                        none
                    </Typography>
                ) : (
                    files.map((file) => (
                        <Typography key={file} sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.secondary', wordBreak: 'break-all' }}>
                            {file}
                        </Typography>
                    ))
                )}
            </Box>
        </Stack>
    );
}
