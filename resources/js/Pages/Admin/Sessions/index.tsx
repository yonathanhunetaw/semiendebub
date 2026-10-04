import * as React from 'react';
import { Head } from '@inertiajs/react';

import AdminLayout from '@/Layouts/AdminLayout';
import SessionsBoard from '@/Components/Sessions/SessionsBoard';
import type { SessionLifetimes, SessionRow } from '@/Components/Sessions/sessionTypes';

interface AdminSessionsProps {
    sessions?: SessionRow[];
    lifetimes?: SessionLifetimes;
}

export default function Index({
    sessions = [],
    lifetimes = { default: 120, remember: 8640 },
}: AdminSessionsProps): React.ReactElement {
    return (
        <>
            <Head title="Active Sessions" />
            <SessionsBoard sessions={sessions} lifetimes={lifetimes} routePrefix="admin" />
        </>
    );
}

Index.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
