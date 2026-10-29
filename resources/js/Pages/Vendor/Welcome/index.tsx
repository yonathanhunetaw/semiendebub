import * as React from 'react';
import { useForm, usePage } from '@inertiajs/react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import RoleWelcome, { RoleWelcomeCapability } from '@/Components/Shared/RoleWelcome';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LinkIcon from '@mui/icons-material/Link';

const CAPABILITIES: RoleWelcomeCapability[] = [
    {
        icon: <StorefrontIcon />,
        title: 'Your own store',
        body: 'Your store gets its own page on the Duka shop, with your items at your prices.',
    },
    {
        icon: <ReceiptLongIcon />,
        title: 'Orders',
        body: 'See every order customers place with your store and where it is.',
    },
    {
        icon: <Inventory2Icon />,
        title: 'Catalogue and stock',
        body: 'Run your items, prices and stock from the same tools Duka uses.',
    },
];

/** vendor.<domain>: log in to your store, or apply to open one (a vendor is a store). */
export default function Welcome(): React.ReactElement {
    const flash = (usePage().props as { flash?: { success?: string | null } }).flash;
    const { data, setData, post, processing, errors, reset } = useForm({
        business_name: '',
        contact_first_name: '',
        contact_last_name: '',
        email: '',
        phone_number: '',
        city: '',
        tin_number: '',
        description: '',
    });

    const field = (name: keyof typeof data, label: string, extra: Record<string, unknown> = {}) => (
        <TextField
            fullWidth
            size="small"
            label={label}
            value={data[name]}
            onChange={(e) => setData(name, e.target.value)}
            error={Boolean(errors[name])}
            helperText={errors[name]}
            {...extra}
        />
    );

    return (
        <RoleWelcome
            title="Sell on Duka"
            heading="Sell on Duka"
            icon={<StorefrontIcon />}
            tagline="vendors"
            description="A vendor is a store on Duka. Log in to run yours, or apply below to open one."
            loginRoute="vendor.login"
            capabilities={CAPABILITIES}
        >
            <Paper id="apply" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mt: 4, borderRadius: 2.5, maxWidth: 640, mx: 'auto' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <LinkIcon color="primary" />
                    <Typography sx={{ fontWeight: 800 }}>Apply to open a store</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    We look at every application. Once approved you get a link to set your password and your store opens.
                </Typography>
                {flash?.success && <Alert severity="success" sx={{ mb: 2 }}>{flash.success}</Alert>}
                <Stack component="form" spacing={1.5} onSubmit={(e: React.FormEvent) => { e.preventDefault(); post(route('vendor.apply'), { preserveScroll: true, onSuccess: () => reset() }); }}>
                    {field('business_name', 'Business name', { required: true })}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        {field('contact_first_name', 'Your first name', { required: true })}
                        {field('contact_last_name', 'Last name')}
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        {field('email', 'Email', { required: true, type: 'email' })}
                        {field('phone_number', 'Phone', { required: true })}
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        {field('city', 'City')}
                        {field('tin_number', 'TIN (optional)')}
                    </Stack>
                    {field('description', 'What do you sell?', { multiline: true, minRows: 3 })}
                    <Button type="submit" variant="contained" disabled={processing} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
                        Send application
                    </Button>
                </Stack>
            </Paper>
        </RoleWelcome>
    );
}
