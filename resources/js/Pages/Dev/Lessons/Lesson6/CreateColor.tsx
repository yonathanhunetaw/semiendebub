import type { ReactNode } from 'react';
import { Head } from '@inertiajs/react';
import { Typography } from '@mui/material';

import DevLayout from '@/Layouts/DevLayout';

export default function CreateColor({}): ReactNode {
    return (
        <>
            <Head title="New color" />

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Create-color form placeholder.
            </Typography>
        </>
    );
}

CreateColor.layout = (page: ReactNode) => <DevLayout>{page}</DevLayout>;
