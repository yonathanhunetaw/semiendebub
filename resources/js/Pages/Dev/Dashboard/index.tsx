import * as React from 'react';
import { Head, Link } from '@inertiajs/react';
import { Box, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material';

import DevLayout from '@/Layouts/DevLayout';
import { DEV_NAVIGATION } from '@/Components/Navigation/Dev/devNavigation';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Dev workspace home.
 *
 * The route `dev.dashboard` pointed at this component for a while before the
 * file existed, which is why /dashboard 500'd. It doubles as the index of the
 * workspace: every sidebar group is mirrored here as a card grid, read from the
 * same DEV_NAVIGATION source so the two can never drift apart.
 */
export default function DevDashboard(): React.ReactElement {
    return (
        <>
            <Head title="Dev workspace" />

            <Stack spacing={4}>
                {DEV_NAVIGATION.map((group) => (
                    <Box key={group.title}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                            <Typography
                                variant="overline"
                                sx={{ fontFamily: MONO, fontWeight: 700, letterSpacing: '0.08em' }}
                            >
                                {group.title}
                            </Typography>
                            <Chip label={group.items.length} size="small" sx={{ height: 18, fontSize: 10 }} />
                        </Stack>

                        <Box
                            sx={{
                                display: 'grid',
                                gap: 1.5,
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    sm: 'repeat(2, minmax(0, 1fr))',
                                    lg: 'repeat(3, minmax(0, 1fr))',
                                },
                            }}
                        >
                            {group.items.map((item) => (
                                <Card key={item.href} variant="outlined" sx={{ borderRadius: 2 }}>
                                    <CardActionArea
                                        {...(item.external
                                            ? { component: 'a' as const, href: item.href }
                                            : { component: Link, href: item.href })}
                                        sx={{ p: 2, height: '100%', alignItems: 'flex-start' }}
                                    >
                                        <Typography sx={{ fontWeight: 700, fontFamily: MONO, fontSize: 14 }}>
                                            {item.label}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                                            {item.description}
                                        </Typography>
                                        <Typography
                                            sx={{ mt: 1, fontFamily: MONO, fontSize: 11, color: 'text.disabled' }}
                                        >
                                            {item.href}
                                        </Typography>
                                    </CardActionArea>
                                </Card>
                            ))}
                        </Box>
                    </Box>
                ))}
            </Stack>
        </>
    );
}

DevDashboard.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
