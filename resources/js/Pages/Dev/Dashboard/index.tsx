import DevLayout from '@/Layouts/DevLayout';
import { Head } from '@inertiajs/react';
import { Box, Typography, Paper } from '@mui/material';

export default function Index() {
    return (
        <>
            {/* The title here will be prefixed to what we set in DevLayout */}
            <Head title="Terminal" />

            <Box>
                <Paper
                    elevation={0}
                    sx={{
                        p: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        borderRadius: '12px'
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{
                            fontFamily: 'monospace',
                            color: 'primary.main',
                            mb: 2,
                            fontWeight: 700
                        }}
                    >
                        // Dev Workspace Initialized
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        System ready for Machine Learning experiments and Raspberry Pi cluster management.
                    </Typography>
                </Paper>
            </Box>
        </>
    );
}

// Use the specialized DevLayout instead of AdminLayout
Index.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
