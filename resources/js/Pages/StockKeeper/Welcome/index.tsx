import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import InventoryIcon from '@mui/icons-material/Inventory2';
import MoveDownIcon from '@mui/icons-material/MoveDown';
import ShelvesIcon from '@mui/icons-material/Shelves';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <MoveDownIcon />,
        title: 'Receive & adjust',
        body: 'Book incoming stock into its location and record counted adjustments against the ledger.',
    },
    {
        icon: <ShelvesIcon />,
        title: 'Transfers & shelving',
        body: 'Move stock between locations, shelve arrivals and accept shelf refill requests.',
    },
    {
        icon: <LocalShippingIcon />,
        title: 'Shipments',
        body: 'Pick, agree, hand over and receive shipments between the hub and stores.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Stock Keeper"
            heading="Stock Keeper"
            icon={<InventoryIcon />}
            tagline="inventory custody"
            description="Hands-on inventory for warehouses and stores: every unit received, moved, shelved or shipped is recorded here."
            loginRoute="stock_keeper.login"
            capabilities={CAPABILITIES}
        />
    );
}
