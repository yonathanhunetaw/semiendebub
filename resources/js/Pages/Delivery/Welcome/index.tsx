import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler';
import RouteIcon from '@mui/icons-material/Route';
import HistoryIcon from '@mui/icons-material/History';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <TwoWheelerIcon />,
        title: 'Customer deliveries',
        body: 'Claim open deliveries and update their status from pickup to doorstep.',
    },
    {
        icon: <RouteIcon />,
        title: 'Freight & transfers',
        body: 'Carry shipments and inter-site transfers, agreeing hand-overs at each end.',
    },
    {
        icon: <HistoryIcon />,
        title: 'History',
        body: 'Look back over every run you have completed.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Delivery"
            heading="Delivery"
            icon={<LocalShippingIcon />}
            tagline="couriers"
            description="For the people on the road: pick up work, move goods between sites and get orders to customers."
            loginRoute="delivery.login"
            capabilities={CAPABILITIES}
        />
    );
}
