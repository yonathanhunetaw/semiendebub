import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import GroupsIcon from '@mui/icons-material/Groups';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonIcon from '@mui/icons-material/Person';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <DashboardIcon />,
        title: 'Dashboard',
        body: 'A common workspace for staff whose work spans departments.',
    },
    {
        icon: <PersonIcon />,
        title: 'Profile',
        body: 'Manage your name, contact details and password.',
    },
    {
        icon: <VerifiedUserIcon />,
        title: 'Sessions',
        body: 'See where you are signed in and sign out other devices.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Shared Workspace"
            heading="Shared Workspace"
            icon={<GroupsIcon />}
            tagline="cross-team"
            description="A workspace for Duka staff who don’t sit in a single department."
            loginRoute="shared.login"
            capabilities={CAPABILITIES}
        />
    );
}
