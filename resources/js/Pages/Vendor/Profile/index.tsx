import { Head, Link, useForm } from "@inertiajs/react";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import {
    Alert,
    Avatar,
    Button,
    Grid,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    PageHeader,
    StatCard,
    VendorCard,
    formatMoney,
} from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorProfileProps } from "@/types/vendor";

/**
 * The vendor's own account details and trading summary.
 */
export default function Profile({
    vendor,
    metrics,
    flash,
}: VendorProfileProps): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) {
            setNotice(message);
        }
    }, [flash?.success, flash?.error]);

    const { data, setData, patch, processing, errors } = useForm({
        first_name: vendor.first_name ?? "",
        last_name: vendor.last_name ?? "",
        email: vendor.email,
        phone_number: vendor.phone_number ?? "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        patch(route("vendor.profile.update"), { preserveScroll: true });
    };

    const initials = `${vendor.first_name?.[0] ?? ""}${vendor.last_name?.[0] ?? ""}`
        .toUpperCase()
        .trim();

    return (
        <>
            <Head title="Profile" />

            <PageHeader title="Profile" subtitle="Your account and trading summary." />

            <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <VendorCard component="form" onSubmit={submit}>
                        <Stack
                            direction="row"
                            spacing={2}
                            alignItems="center"
                            sx={{ mb: 3 }}
                        >
                            <Avatar
                                sx={{
                                    width: 56,
                                    height: 56,
                                    bgcolor: "primary.main",
                                    fontWeight: 800,
                                }}
                            >
                                {initials || "?"}
                            </Avatar>
                            <div>
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                    {`${vendor.first_name ?? ""} ${vendor.last_name ?? ""}`.trim() ||
                                        "Supplier"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {vendor.email}
                                </Typography>
                            </div>
                        </Stack>

                        <Stack spacing={2}>
                            <TextField
                                label="First name"
                                value={data.first_name}
                                onChange={(event) => setData("first_name", event.target.value)}
                                error={Boolean(errors.first_name)}
                                helperText={errors.first_name}
                                size="small"
                                fullWidth
                            />
                            <TextField
                                label="Last name"
                                value={data.last_name}
                                onChange={(event) => setData("last_name", event.target.value)}
                                error={Boolean(errors.last_name)}
                                helperText={errors.last_name}
                                size="small"
                                fullWidth
                            />
                            <TextField
                                label="Email"
                                type="email"
                                value={data.email}
                                onChange={(event) => setData("email", event.target.value)}
                                error={Boolean(errors.email)}
                                helperText={errors.email}
                                size="small"
                                fullWidth
                            />
                            <TextField
                                label="Phone number"
                                value={data.phone_number}
                                onChange={(event) => setData("phone_number", event.target.value)}
                                error={Boolean(errors.phone_number)}
                                helperText={errors.phone_number}
                                size="small"
                                fullWidth
                            />

                            <Stack direction="row" spacing={1.5}>
                                <Button type="submit" variant="contained" disabled={processing}>
                                    Save changes
                                </Button>
                                <Button
                                    component={Link}
                                    href={route("logout")}
                                    method="post"
                                    as="button"
                                    color="error"
                                    startIcon={<LogoutRoundedIcon />}
                                >
                                    Log out
                                </Button>
                            </Stack>
                        </Stack>
                    </VendorCard>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                    <Grid container spacing={2.5}>
                        <Grid size={{ xs: 6, md: 12 }}>
                            <StatCard
                                label="SKUs supplied"
                                value={metrics.catalogue_skus}
                                hint={`${metrics.units_in_network.toLocaleString()} units in network`}
                            />
                        </Grid>
                        <Grid size={{ xs: 6, md: 12 }}>
                            <StatCard
                                label="Received value"
                                value={formatMoney(metrics.revenue_received)}
                                tone="success"
                                hint={`${metrics.orders_received} order${metrics.orders_received === 1 ? "" : "s"}`}
                            />
                        </Grid>
                        <Grid size={{ xs: 6, md: 12 }}>
                            <StatCard
                                label="Open value"
                                value={formatMoney(metrics.revenue_pending)}
                                tone={metrics.orders_pending > 0 ? "warning" : "default"}
                                hint={`${metrics.orders_pending} pending`}
                            />
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={flash?.error ? "error" : "success"}
                    variant="filled"
                    onClose={() => setNotice(null)}
                >
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

Profile.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
