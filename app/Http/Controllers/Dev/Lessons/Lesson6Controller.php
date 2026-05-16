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
                        color: '#f1f1f1',
                        mb: 3,
                        fontWeight: 700,
                        borderBottom: '1px solid #2f2f2f',
                        pb: 2
                    }}
                >
                    // Imperial Colors & Assets Initialized
                </Typography>

                <Grid container spacing={3}>
                    {initialColors.map((color) => (
                        <Grid item xs={12} sm={6} md={4} key={color.id}>
                            <Paper
                                elevation={0}
                                sx={{
                                    bgcolor: '#1f1f1f',
                                    border: '1px solid #2f2f2f',
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
                                        bgcolor: '#0a0a0a',
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
                                            sx={{ fontFamily: 'monospace', color: '#aaaaaa' }}
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
                                            bgcolor: 'rgba(15, 15, 15, 0.85)',
                                            px: 1.5,
                                            py: 0.5,
                                            borderRadius: '4px',
                                            border: '1px solid #2f2f2f',
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
                                            color: '#f1f1f1',
                                            fontWeight: 600,
                                            textTransform: 'capitalize',
                                            fontFamily: 'Roboto, sans-serif'
                                        }}
                                    >
                                        {color.title}
                                    </Typography>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#888888' }}>
                                            RATING:
                                        </Typography>
                                        <Rating
                                            value={color.rating}
                                            readOnly
                                            size="small"
                                            sx={{
                                                color: '#ffc107',
                                                '& .MuiRating-iconEmpty': { color: '#333333' }
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
