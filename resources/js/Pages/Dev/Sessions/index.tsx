import * as React from 'react';
import { Head } from '@inertiajs/react';

import DevLayout from '@/Layouts/DevLayout';
import SessionsBoard from '@/Components/Sessions/SessionsBoard';
import type { SessionLifetimes, SessionRow } from '@/Components/Sessions/sessionTypes';

interface DevSessionsProps {
    sessions?: SessionRow[];
    lifetimes?: SessionLifetimes;
}

/**
 * Same board as Admin/Sessions — only the route prefix and layout differ.
 */
export default function DevSessions({
    sessions = [],
    lifetimes = { default: 120, remember: 8640 },
}: DevSessionsProps): React.ReactElement {
    return (
        <>
            <Head title="Sessions" />
            <SessionsBoard sessions={sessions} lifetimes={lifetimes} routePrefix="dev" />
        </>
    );
}

DevSessions.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
