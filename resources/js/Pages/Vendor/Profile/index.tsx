import { Head, Link, router, useForm } from "@inertiajs/react";
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
    VendorCard,
} from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";

/**
 * The vendor's own account details and trading summary.
 */
interface Props {
    vendor: { id: number; first_name: string | null; last_name: string | null; email: string; phone_number: string | null; role: string | null };
    flash?: { success?: string | null; error?: string | null };
}

/** The vendor's own account details (the store's profile is /store). */
export default function Profile({ vendor, flash }: Props): React.ReactElement {
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
                                {/* Inside the profile form: a submit-type button would save instead. */}
                                <Button
                                    type="button"
                                    onClick={() => router.post(route("logout"))}
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
                    {/* The store's public face is its own page (a vendor is a store). */}
                    <VendorCard>
                        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Your store&apos;s profile</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Its address on the shop, what it says about itself and how customers reach it.
                        </Typography>
                        <Button component={Link} href={route("vendor.store.edit")} variant="outlined">Open store profile</Button>
                    </VendorCard>
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
