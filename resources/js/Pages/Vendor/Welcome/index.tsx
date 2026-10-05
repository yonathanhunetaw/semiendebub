import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import HandshakeIcon from '@mui/icons-material/Handshake';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BadgeIcon from '@mui/icons-material/Badge';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <MenuBookIcon />,
        title: 'Catalogue',
        body: 'See the items you supply to Duka and how they are listed.',
    },
    {
        icon: <ReceiptLongIcon />,
        title: 'Purchase orders',
        body: 'Review the purchase orders placed with you and their details.',
    },
    {
        icon: <BadgeIcon />,
        title: 'Profile',
        body: 'Keep your company and contact details current.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Vendor Portal"
            heading="Vendor Portal"
            icon={<HandshakeIcon />}
            tagline="supplier access"
            description="For suppliers working with Duka: your catalogue, your purchase orders and your account in one place."
            loginRoute="vendor.login"
            capabilities={CAPABILITIES}
        />
    );
}
