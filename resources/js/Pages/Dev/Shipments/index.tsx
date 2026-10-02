import type { ReactNode } from 'react';
import { Head } from '@inertiajs/react';
import { Typography } from '@mui/material';

import DevLayout from '@/Layouts/DevLayout';

export default function DevShipments({}): ReactNode {
    return (
        <>
            <Head title="Shipments lab" />

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Fulfillment sandbox placeholder.
            </Typography>
        </>
    );
}

DevShipments.layout = (page: ReactNode) => <DevLayout>{page}</DevLayout>;
