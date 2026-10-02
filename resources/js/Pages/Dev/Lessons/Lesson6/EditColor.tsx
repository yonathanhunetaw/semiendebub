import type { ReactNode } from 'react';
import { Head } from '@inertiajs/react';
import { Typography } from '@mui/material';

import DevLayout from '@/Layouts/DevLayout';

interface EditColorProps {
    color: string | number;
}

export default function EditColor({ color }: EditColorProps): ReactNode {
    return (
        <>
            <Head title="Edit color" />

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Editing color {color}.
            </Typography>
        </>
    );
}

EditColor.layout = (page: ReactNode) => <DevLayout>{page}</DevLayout>;
