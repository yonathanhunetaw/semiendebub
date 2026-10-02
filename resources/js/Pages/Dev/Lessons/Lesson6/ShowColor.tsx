import type { ReactNode } from 'react';
import { Head } from '@inertiajs/react';
import { Typography } from '@mui/material';

import DevLayout from '@/Layouts/DevLayout';

interface ShowColorProps {
    color: string | number;
}

export default function ShowColor({ color }: ShowColorProps): ReactNode {
    return (
        <>
            <Head title="Color" />

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Showing color {color}.
            </Typography>
        </>
    );
}

ShowColor.layout = (page: ReactNode) => <DevLayout>{page}</DevLayout>;
