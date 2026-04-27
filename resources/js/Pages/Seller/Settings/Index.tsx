import {
    SELLER_BRAND_DARK,
    SellerCard,
    SellerHeader,
    sellerAvatarText,
    sellerName,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm, usePage } from "@inertiajs/react";
import {
    Avatar, Box, Button, FormControlLabel, Stack, Switch,
    TextField, Typography, ToggleButtonGroup, ToggleButton
} from "@mui/material";
import React from "react";
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded';

interface AuthUser {
    id: number;
    first_name?: string;
    email?: string;
}

export default function Index() {
    const { auth } = usePage().props as { auth?: { user?: AuthUser } };
    const user = auth?.user;

    // Added 'theme' to the form data
    const { data, setData, patch, processing } = useForm({
        notification_email: user?.email ?? "",
        notes: "",
        email_notifications: true,
        push_notifications: false,
        theme: 'system', // Default option
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        patch(route("seller.settings.update"));
    };

    // Style override to fix the visibility of SellerCard
    const cardStyle = {
        bgcolor: "#1e293b", // Deep Navy
        color: "#ffffff",    // White Text
        border: "1px solid rgba(255,255,255,0.05)",
        "& .MuiTypography-root": { color: "#ffffff" },
        "& .MuiTypography-body2": { color: "#94a3b8" },
        "& .MuiSwitch-track": { bgcolor: "#64748b" },
    };

    return (
        <Box sx={{ bgcolor: "#0f172a", minHeight: "100vh", pb: 5 }}>
            <Head title="Seller Settings" />

            <SellerHeader title="Settings" />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>

                    {/* 1. Theme Selection (NEW) */}
                    <SellerCard sx={cardStyle}>
                        <Typography sx={{ fontWeight: 800, mb: 2 }}>Appearance</Typography>
                        <ToggleButtonGroup
                            value={data.theme}
                            exclusive
                            onChange={(e, next) => next && setData("theme", next)}
                            fullWidth
                            sx={{
                                bgcolor: "rgba(0,0,0,0.2)",
                                borderRadius: 2,
                                "& .MuiToggleButton-root": {
                                    color: "#94a3b8",
                                    border: "none",
                                    "&.Mui-selected": { bgcolor: "primary.main", color: "#000000" }
                                }
                            }}
                        >
                            <ToggleButton value="light">
                                <LightModeRoundedIcon sx={{ mr: 1, fontSize: 20 }} /> Light
                            </ToggleButton>
                            <ToggleButton value="system">
                                <SettingsBrightnessRoundedIcon sx={{ mr: 1, fontSize: 20 }} /> Auto
                            </ToggleButton>
                            <ToggleButton value="dark">
                                <DarkModeRoundedIcon sx={{ mr: 1, fontSize: 20 }} /> Dark
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </SellerCard>

                    {/* 2. User Profile */}
                    <SellerCard sx={cardStyle}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Avatar sx={{ width: 52, height: 52, bgcolor: "primary.main", color: "#000000" }}>
                                {sellerAvatarText(user?.first_name)}
                            </Avatar>
                            <Box>
                                <Typography sx={{ fontWeight: 800 }}>
                                    {sellerName([user?.first_name]) || "Seller"}
                                </Typography>
                                <Typography variant="body2">
                                    {user?.email || "No email on file"}
                                </Typography>
                            </Box>
                        </Stack>
                    </SellerCard>

                    {/* 3. Notifications */}
                    <SellerCard sx={cardStyle}>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>Notifications</Typography>
                        <FormControlLabel
                            control={(
                                <Switch
                                    checked={data.email_notifications}
                                    onChange={(event) => setData("email_notifications", event.target.checked)}
                                />
                            )}
                            label="Email notifications"
                        />
                        <FormControlLabel
                            control={(
                                <Switch
                                    checked={data.push_notifications}
                                    onChange={(event) => setData("push_notifications", event.target.checked)}
                                />
                            )}
                            label="Push notifications"
                        />
                    </SellerCard>

                    {/* 4. Profile Notes */}
                    <SellerCard sx={cardStyle}>
                        <Stack spacing={2}>
                            <Typography sx={{ fontWeight: 800 }}>Profile Notes</Typography>
                            <TextField
                                fullWidth
                                label="Notification email"
                                value={data.notification_email}
                                onChange={(event) => setData("notification_email", event.target.value)}
                                sx={{ "& .MuiInputBase-input": { color: "#fff" }, "& .MuiInputLabel-root": { color: "#94a3b8" } }}
                            />
                            <TextField
                                fullWidth
                                label="Selling notes"
                                multiline
                                minRows={4}
                                value={data.notes}
                                onChange={(event) => setData("notes", event.target.value)}
                                placeholder="Opening notes..."
                                sx={{ "& .MuiInputBase-input": { color: "#fff" }, "& .MuiInputLabel-root": { color: "#94a3b8" } }}
                            />
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={processing}
                                sx={{
                                    borderRadius: 3,
                                    py: 1.5,
                                    textTransform: "none",
                                    fontWeight: 800,
                                    bgcolor: "primary.main",
                                    color: "#000000",
                                    "&:hover": { bgcolor: "primary.dark" },
                                }}
                            >
                                Save Settings
                            </Button>
                        </Stack>
                    </SellerCard>

                    <Button
                        component={Link}
                        href={route("logout")}
                        method="post"
                        as="button"
                        variant="contained"
                        color="error"
                        sx={{ borderRadius: 3, textTransform: "none", mb: 1, py: 1.5, fontWeight: 700 }}
                    >
                        Sign Out
                    </Button>
                </Stack>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
