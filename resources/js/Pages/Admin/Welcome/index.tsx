import * as React from 'react';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <WarehouseIcon />,
        title: 'Stores & warehouses',
        body: 'Set up stores, warehouse locations and capacity, and assign the managers responsible for each site.',
    },
    {
        icon: <SyncAltIcon />,
        title: 'Replenishment & shipments',
        body: 'Approve replenishment requests and oversee transfers and shipments moving stock between hub and stores.',
    },
    {
        icon: <ReceiptLongIcon />,
        title: 'Orders & payments',
        body: 'Follow orders through custody, assign deliveries and reconcile payments across every store.',
    },
];

export default function Welcome(): React.ReactElement {
    return (
        <RoleWelcome
            title="Admin Console"
            heading="Admin Console"
            icon={<AdminPanelSettingsIcon />}
            tagline="operations control"
            description="Company-wide oversight for Duka: stores, inventory, people and the flow of goods between them. Restricted to administrator accounts."
            loginRoute="admin.login"
            capabilities={CAPABILITIES}
        />
    );
}
