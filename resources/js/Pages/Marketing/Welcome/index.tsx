import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import CampaignIcon from '@mui/icons-material/Campaign';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StorefrontIcon from '@mui/icons-material/Storefront';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <TrendingUpIcon />,
        title: 'Campaigns',
        body: 'Plan and follow promotional campaigns.',
    },
    {
        icon: <StorefrontIcon />,
        title: 'Storefront',
        body: 'Shape how products are presented to shoppers online.',
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
            title="Marketing"
            heading="Marketing"
            icon={<CampaignIcon />}
            tagline="growth"
            description="Campaigns and promotion for Duka, from planning to the public storefront."
            loginRoute="marketing.login"
            capabilities={CAPABILITIES}
        />
    );
}
