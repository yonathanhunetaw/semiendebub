import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PaymentsIcon from '@mui/icons-material/Payments';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <AssessmentIcon />,
        title: 'Reports',
        body: 'Financial reports across stores and periods.',
    },
    {
        icon: <PaymentsIcon />,
        title: 'Revenue',
        body: 'Sales and payment figures as they are recorded at the counter.',
    },
    {
        icon: <VerifiedUserIcon />,
        title: 'Sessions',
        body: 'Review and revoke the devices signed in to your account.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Finance"
            heading="Finance"
            icon={<AccountBalanceIcon />}
            tagline="accounts"
            description="The finance team’s view of Duka: reporting on sales and payments across the business."
            loginRoute="finance.login"
            capabilities={CAPABILITIES}
        />
    );
}
