import {
    SellerHeader,
    sellerAvatarText,
    sellerName,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm, usePage } from "@inertiajs/react";
import {
    Avatar, Box, Button, Chip, Divider, FormControlLabel, Stack, Switch,
    TextField, Typography, ToggleButtonGroup, ToggleButton, alpha, useTheme,
} from "@mui/material";
import React from "react";
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import { ThemeContext } from "@/app";

interface AuthUser {
    id: number;
    first_name?: string;
    email?: string;
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
            <Typography sx={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3, color: "text.primary" }}>
                {label}
            </Typography>
        </Stack>
    );
}

function ComingSoonRow({ icon, label, description }: { icon: React.ReactNode; label: string; description: string }) {
    return (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.5 }}>
            <Box sx={{ color: "text.disabled", display: "flex", flexShrink: 0 }}>{icon}</Box>
            <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.disabled" }}>{label}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{description}</Typography>
            </Box>
            <Chip label="Soon" size="small" sx={{ fontSize: 11, height: 22, bgcolor: "action.hover", color: "text.disabled" }} />
        </Stack>
    );
}

export default function Index() {
    const { auth } = usePage().props as { auth?: { user?: AuthUser } };
    const user = auth?.user;
    const theme = useTheme();
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext);

    const { data, setData, patch, processing } = useForm({
        notification_email: user?.email ?? "",
        email_notifications: true,
        push_notifications: false,
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        patch(route("seller.settings.update"));
    };

    const initials = sellerAvatarText(user?.first_name);
    const displayName = sellerName([user?.first_name]) || "Seller";
    const accentColor = theme.palette.primary.main;
    const isLight = theme.palette.mode === "light";

    const cardSx = {
        bgcolor: "background.paper",
        borderRadius: "16px",
        border: "1px solid",
        borderColor: "divider",
        boxShadow: isLight ? "0 1px 4px rgba(0,0,0,0.06)" : "0 1px 4px rgba(0,0,0,0.3)",
        p: "20px",
    };

    return (
        <Box sx={{ minHeight: "100vh", pb: 6 }}>
            <Head title="Settings" />
            <SellerHeader title="Settings" />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2.5 }}>
                <Stack spacing={2}>

                    {/* ── Profile hero ── */}
                    <Box sx={{
                        ...cardSx,
                        background: isLight
                            ? `linear-gradient(135deg, ${alpha(accentColor, 0.08)} 0%, ${theme.palette.background.paper} 65%)`
                            : `linear-gradient(135deg, ${alpha(accentColor, 0.15)} 0%, ${theme.palette.background.paper} 65%)`,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                    }}>
                        <Box sx={{
                            p: "3px",
                            borderRadius: "50%",
                            background: `linear-gradient(135deg, ${accentColor} 0%, ${alpha(accentColor, 0.4)} 100%)`,
                            flexShrink: 0,
                        }}>
                            <Avatar sx={{
                                width: 56, height: 56,
                                bgcolor: accentColor,
                                color: isLight ? "#fff" : "#000",
                                fontWeight: 800, fontSize: 22,
                                border: `2px solid ${theme.palette.background.paper}`,
                            }}>
                                {initials}
                            </Avatar>
                        </Box>
                        <Box>
                            <Typography sx={{ fontWeight: 800, fontSize: 17, color: "text.primary", lineHeight: 1.2 }}>
                                {displayName}
                            </Typography>
                            <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.3 }}>
                                {user?.email || "No email on file"}
                            </Typography>
                        </Box>
                    </Box>

                    {/* ── Appearance ── */}
                    <Box sx={cardSx}>
                        <SectionLabel icon={<LightModeRoundedIcon sx={{ fontSize: 18 }} />} label="Appearance" />
                        <ToggleButtonGroup
                            value={currentSetting}
                            exclusive
                            onChange={(_, next) => next && toggleTheme(next as 'light' | 'dark' | 'system')}
                            fullWidth
                            sx={{
                                bgcolor: alpha(theme.palette.text.primary, 0.05),
                                borderRadius: "12px",
                                p: "4px",
                                gap: "4px",
                                "& .MuiToggleButtonGroup-grouped": {
                                    border: "none !important",
                                    borderRadius: "9px !important",
                                },
                                "& .MuiToggleButton-root": {
                                    color: "text.secondary",
                                    fontSize: 13, fontWeight: 600,
                                    textTransform: "none",
                                    py: 0.8,
                                    transition: "all 0.15s ease",
                                    "&.Mui-selected": {
                                        bgcolor: "background.paper",
                                        color: "primary.main",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                                        "&:hover": { bgcolor: "background.paper" },
                                    },
                                    "&:hover:not(.Mui-selected)": {
                                        bgcolor: alpha(theme.palette.text.primary, 0.04),
                                    },
                                },
                            }}
                        >
                            <ToggleButton value="light">
                                <LightModeRoundedIcon sx={{ mr: 0.75, fontSize: 17 }} /> Light
                            </ToggleButton>
                            <ToggleButton value="system">
                                <SettingsBrightnessRoundedIcon sx={{ mr: 0.75, fontSize: 17 }} /> Auto
                            </ToggleButton>
                            <ToggleButton value="dark">
                                <DarkModeRoundedIcon sx={{ mr: 0.75, fontSize: 17 }} /> Dark
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {/* ── Notifications ── */}
                    <Box sx={cardSx}>
                        <SectionLabel icon={<NotificationsNoneRoundedIcon sx={{ fontSize: 18 }} />} label="Notifications" />
                        <Stack divider={<Divider />}>
                            <FormControlLabel
                                sx={{ mx: 0, py: 1.25, justifyContent: "space-between" }}
                                labelPlacement="start"
                                control={
                                    <Switch
                                        checked={data.email_notifications}
                                        onChange={(e) => setData("email_notifications", e.target.checked)}
                                        sx={{
                                            "& .MuiSwitch-switchBase.Mui-checked": { color: "primary.main" },
                                            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "primary.main" },
                                        }}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>Email notifications</Typography>
                                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Order updates sent to your inbox</Typography>
                                    </Box>
                                }
                            />
                            <FormControlLabel
                                sx={{ mx: 0, py: 1.25, justifyContent: "space-between" }}
                                labelPlacement="start"
                                control={
                                    <Switch
                                        checked={data.push_notifications}
                                        onChange={(e) => setData("push_notifications", e.target.checked)}
                                        sx={{
                                            "& .MuiSwitch-switchBase.Mui-checked": { color: "primary.main" },
                                            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "primary.main" },
                                        }}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>Push notifications</Typography>
                                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Alerts on this device</Typography>
                                    </Box>
                                }
                            />
                        </Stack>

                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            fullWidth
                            sx={{
                                mt: 2,
                                borderRadius: "12px",
                                py: 1.4,
                                textTransform: "none",
                                fontWeight: 700,
                                fontSize: 15,
                                boxShadow: `0 2px 8px ${alpha(accentColor, 0.35)}`,
                                "&:hover": { boxShadow: `0 4px 12px ${alpha(accentColor, 0.40)}` },
                                "&.Mui-disabled": { opacity: 0.6 },
                            }}
                        >
                            {processing ? "Saving…" : "Save settings"}
                        </Button>
                    </Box>

                    {/* ── Store info (coming soon) ── */}
                    <Box sx={cardSx}>
                        <SectionLabel icon={<StorefrontRoundedIcon sx={{ fontSize: 18 }} />} label="Store Info" />
                        <Stack divider={<Divider />}>
                            <ComingSoonRow
                                icon={<StorefrontRoundedIcon sx={{ fontSize: 20 }} />}
                                label="Store name & description"
                                description="Set your public-facing store name and tagline"
                            />
                            <ComingSoonRow
                                icon={<PhotoCameraOutlinedIcon sx={{ fontSize: 20 }} />}
                                label="Logo & banner"
                                description="Upload images that appear on your storefront"
                            />
                            <ComingSoonRow
                                icon={<LocationOnOutlinedIcon sx={{ fontSize: 20 }} />}
                                label="Address"
                                description="Physical location shown to customers"
                            />
                        </Stack>
                    </Box>

                    {/* ── More coming soon ── */}
                    <Box sx={cardSx}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14, color: "text.secondary", mb: 1.5, letterSpacing: 0.3 }}>
                            Coming soon
                        </Typography>
                        <Stack divider={<Divider />}>
                            <ComingSoonRow
                                icon={<PaymentsOutlinedIcon sx={{ fontSize: 20 }} />}
                                label="Payments & payouts"
                                description="Connect your bank and manage payout schedules"
                            />
                            <ComingSoonRow
                                icon={<LocalShippingOutlinedIcon sx={{ fontSize: 20 }} />}
                                label="Delivery options"
                                description="Set shipping zones, rates, and lead times"
                            />
                            <ComingSoonRow
                                icon={<InventoryOutlinedIcon sx={{ fontSize: 20 }} />}
                                label="Catalogue settings"
                                description="Default currency, tax rules, and stock behaviour"
                            />
                        </Stack>
                    </Box>

                    {/* ── Sign out ── */}
                    <Button
                        component={Link}
                        href={route("logout")}
                        method="post"
                        as="button"
                        variant="outlined"
                        fullWidth
                        sx={{
                            borderRadius: "12px",
                            textTransform: "none",
                            py: 1.5,
                            fontWeight: 700,
                            fontSize: 15,
                            color: "error.main",
                            borderColor: alpha(theme.palette.error.main, 0.35),
                            "&:hover": {
                                bgcolor: alpha(theme.palette.error.main, 0.05),
                                borderColor: "error.main",
                            },
                        }}
                    >
                        Sign out
                    </Button>

                </Stack>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;