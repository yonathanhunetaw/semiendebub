import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ShelvesIcon from '@mui/icons-material/Shelves';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <PointOfSaleIcon />,
        title: 'Carts & checkout',
        body: 'Build carts from the store catalogue, take payment and confirm orders at the counter.',
    },
    {
        icon: <ViewKanbanIcon />,
        title: 'Order board',
        body: 'Move every sale through to pay, paid, pick & pack, to deliver and delivered.',
    },
    {
        icon: <ShelvesIcon />,
        title: 'Shelves & refills',
        body: 'Watch shelf levels, request refills and receive shipments into your store.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Seller Desk"
            heading="Seller Desk"
            icon={<StorefrontIcon />}
            tagline="store sales"
            description="The point of sale for Duka stores: ring up customers, run the order pipeline and keep the shelves stocked."
            loginRoute="seller.login"
            capabilities={CAPABILITIES}
        />
    );
}
