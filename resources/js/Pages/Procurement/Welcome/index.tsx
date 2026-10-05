import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import HandshakeIcon from '@mui/icons-material/Handshake';
import InventoryIcon from '@mui/icons-material/Inventory2';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <ReceiptLongIcon />,
        title: 'Purchase orders',
        body: 'Raise and track purchase orders with suppliers.',
    },
    {
        icon: <HandshakeIcon />,
        title: 'Vendors',
        body: 'Work with the suppliers who stock Duka.',
    },
    {
        icon: <InventoryIcon />,
        title: 'Restocking',
        body: 'Buy what the warehouses need before shelves run dry.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Procurement"
            heading="Procurement"
            icon={<ShoppingBasketIcon />}
            tagline="purchasing"
            description="Purchasing for Duka: ordering from vendors to keep warehouses and stores supplied."
            loginRoute="procurement.login"
            capabilities={CAPABILITIES}
        />
    );
}
