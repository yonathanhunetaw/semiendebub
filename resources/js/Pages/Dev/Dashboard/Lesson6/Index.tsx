import DevLayout from '@/Layouts/DevLayout';
import { Head } from '@inertiajs/react';
import { Box, Typography, Paper, Grid, Rating } from '@mui/material';

interface ColorAsset {
    id: string;
    title: string;
    color: string;
    rating: number;
    image_url?: string;
}

interface IndexProps {
    initialColors: ColorAsset[];
}

export default function Index({ initialColors }: IndexProps) {
    return (
        <>
            <Head title="Imperial Colors & Assets" />

            <Box sx={{ p: 1 }}>
                <Typography
                    variant="h5"
                    sx={{
                        fontFamily: 'monospace',
                        color: 'text.primary',
                        mb: 3,
                        fontWeight: 700,
                        borderBottom: '1px solid rgb(var(--outline-variant))',
                        pb: 2
                    }}
                >
                    // Imperial Colors & Assets Initialized
                </Typography>

                <Grid container spacing={3}>
                    {initialColors.map((color) => (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={color.id}>
                            <Paper
                                elevation={0}
                                sx={{
                                    bgcolor: 'background.paper',
                                    border: '1px solid rgb(var(--outline-variant))',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'transform 0.2s, border-color 0.2s',
                                    '&:hover': {
                                        borderColor: color.color,
                                        transform: 'translateY(-2px)'
                                    }
                                }}
                            >
                                {/* Asset Media Window */}
                                <Box
                                    sx={{
                                        width: '100%',
                                        height: '180px',
                                        bgcolor: 'rgb(var(--surface-container))',
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {color.image_url ? (
                                        <Box
                                            component="img"
                                            src={color.image_url}
                                            alt={color.title}
                                            sx={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    ) : (
                                        <Typography
                                            variant="body2"
                                            sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                                        >
                                            [ No Asset Registered ]
                                        </Typography>
                                    )}

                                    {/* Color Hex Badge */}
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            bottom: '10px',
                                            right: '10px',
                                            // Dark chip on light, light chip on dark; the text is the asset's own (data) color.
                                            bgcolor: 'rgb(var(--inverse-surface) / 0.85)',
                                            px: 1.5,
                                            py: 0.5,
                                            borderRadius: '4px',
                                            border: '1px solid rgb(var(--inverse-on-surface) / 0.1)',
                                            fontSize: '12px',
                                            fontFamily: 'monospace',
                                            color: color.color,
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        {color.color}
                                    </Box>
                                </Box>

                                {/* Metadata Panel */}
                                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography
                                        variant="subtitle1"
                                        sx={{
                                            color: 'text.primary',
                                            fontWeight: 600,
                                            textTransform: 'capitalize',
                                            fontFamily: 'Roboto, sans-serif'
                                        }}
                                    >
                                        {color.title}
                                    </Typography>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                                            RATING:
                                        </Typography>
                                        <Rating
                                            value={color.rating}
                                            readOnly
                                            size="small"
                                            sx={{
                                                color: 'warning.main',
                                                '& .MuiRating-iconEmpty': { color: 'rgb(var(--outline-variant))' }
                                            }}
                                        />
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
