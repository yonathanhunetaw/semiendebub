import { Head, Link, useForm } from "@inertiajs/react";
import DevicesRoundedIcon from "@mui/icons-material/DevicesRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import {
    Alert,
    Avatar,
    Button,
    Container,
    Divider,
    Grid,
    Paper,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import { DeliveryHero, StatTile } from "@/Components/Delivery/deliveryUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { DeliveryProfileProps } from "@/types/delivery";

/**
 * The courier's own account, with their running totals.
 */
export default function Profile({
    courier,
    metrics,
    flash,
}: DeliveryProfileProps): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) {
            setNotice(message);
        }
    }, [flash?.success, flash?.error]);

    const { data, setData, patch, processing, errors } = useForm({
        first_name: courier.first_name ?? "",
        last_name: courier.last_name ?? "",
        email: courier.email,
        phone_number: courier.phone_number ?? "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        patch(route("delivery.profile.update"), { preserveScroll: true });
    };

    const initials = `${courier.first_name?.[0] ?? ""}${courier.last_name?.[0] ?? ""}`
        .toUpperCase()
        .trim();

    return (
        <>
            <Head title="Profile" />

            <DeliveryHero
                eyebrow="Profile"
                title={`${courier.first_name ?? ""} ${courier.last_name ?? ""}`.trim() || "Courier"}
                subtitle={courier.email ?? undefined}
                action={
                    <Avatar sx={{ width: 56, height: 56, bgcolor: "rgba(255,255,255,0.2)", color: "inherit", fontWeight: 800 }}>
                        {initials || "?"}
                    </Avatar>
                }
            >
                <Grid container spacing={1}>
                    <Grid size={4}>
                        <StatTile onHero label="Delivered" value={metrics.delivered_total} />
                    </Grid>
                    <Grid size={4}>
                        <StatTile onHero label="Open" value={metrics.open} />
                    </Grid>
                    <Grid size={4}>
                        <StatTile onHero label="Failed" value={metrics.failed} />
                    </Grid>
                </Grid>
            </DeliveryHero>

            <Container maxWidth="sm" sx={{ pt: 2.5, pb: 4 }}>
                {/* ── Editable details ── */}
                <Paper
                    elevation={0}
                    component="form"
                    onSubmit={submit}
                    sx={{
                        p: 2.5,
                        borderRadius: 3,
                        border: "1px solid",
                        borderColor: "divider",
                        backgroundImage: "none",
                        mb: 2.5,
                    }}
                >
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                        My details
                    </Typography>

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

                        <Button type="submit" variant="contained" disabled={processing}>
                            Save changes
                        </Button>
                    </Stack>
                </Paper>

                {/* ── Account actions ── */}
                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: 3,
                        border: "1px solid",
                        borderColor: "divider",
                        backgroundImage: "none",
                        overflow: "hidden",
                    }}
                >
                    <Button
                        component={Link}
                        href={route("delivery.sessions.index")}
                        startIcon={<DevicesRoundedIcon />}
                        fullWidth
                        sx={{ justifyContent: "flex-start", py: 1.5, px: 2.5 }}
                    >
                        Active sessions
                    </Button>
                    <Divider />
                    <Button
                        component={Link}
                        href={route("logout")}
                        method="post"
                        as="button"
                        color="error"
                        startIcon={<LogoutRoundedIcon />}
                        fullWidth
                        sx={{ justifyContent: "flex-start", py: 1.5, px: 2.5 }}
                    >
                        Log out
                    </Button>
                </Paper>
            </Container>

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                sx={{ bottom: { xs: 72 } }}
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

Profile.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
