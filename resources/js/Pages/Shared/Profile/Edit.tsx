import React from "react";
import { Head, Link, usePage } from "@inertiajs/react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AccountLayout from "@/Layouts/AccountLayout";
import AdminLayout from "@/Layouts/AdminLayout";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import DevLayout from "@/Layouts/DevLayout";
import FinanceLayout from "@/Layouts/FinanceLayout";
import SharedLayout from "@/Layouts/SharedLayout";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import VendorLayout from "@/Layouts/VendorLayout";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { identityFor } from "@/Components/Visual/identities";
import { SUBDOMAIN_TO_ROLE, type RoleKey } from "@/theme";
import DeleteUserForm from "./Partials/DeleteUserForm";
import UpdatePasswordForm from "./Partials/UpdatePasswordForm";
import UpdateProfileInformationForm from "./Partials/UpdateProfileInformationForm";

/**
 * `/profile` is served on every host (routes/web/shared/profile.php). The page
 * wears the app it was opened from: the admin shell on admin., the seller
 * workspace on seller., and so on; the shop chrome only on the root domain.
 * "Back" returns to that app's dashboard (the shop, for a shopper). It used to
 * offer "Back to shop" to every non-seller, admins included.
 */

/** The app this host belongs to, or null on the shop (root domain). */
function hostApp(): RoleKey | null {
    if (typeof window === "undefined") return null;
    const parts = window.location.hostname.toLowerCase().split(".");
    return parts.length > 2 ? SUBDOMAIN_TO_ROLE[parts[0]] ?? null : null;
}

interface PageProps {
    auth?: { user?: { first_name?: string; last_name?: string | null; email?: string; role?: string; role_key?: string } | null };
    [key: string]: unknown;
}

const cardSx = { p: { xs: 2, sm: 3 }, borderRadius: 4, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" } as const;

export default function Edit({ mustVerifyEmail, status }: { mustVerifyEmail?: boolean; status?: string }) {
    const theme = useTheme();
    const { auth } = usePage<PageProps>().props;
    const user = auth?.user;
    const app = hostApp();
    const roleKey = user?.role_key ?? app ?? "customer";
    const identity = identityFor(roleKey);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Your account";

    // Back to where this app starts; a shopper goes back to the shop.
    const back = app ? { href: "/dashboard", label: "Back to dashboard" } : { href: route("storefront.index"), label: "Back to shop" };

    return (
        <Box sx={{ maxWidth: 880, mx: "auto", px: { xs: app === "admin" ? 0 : 2, sm: 0 }, py: { xs: 2, sm: app === "admin" ? 0 : 3 } }}>
            <Head title="Profile" />

            {/* Who you are, in the app's own colours */}
            <Paper elevation={0} sx={{ ...cardSx, mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
                background: `linear-gradient(135deg, ${alpha(theme.palette[identity.color].main, 0.14)} 0%, transparent 70%)` }}>
                <RoleAvatar role={roleKey} size={64} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="overline" sx={{ color: `${identity.color}.main`, fontWeight: 800, lineHeight: 1.4 }}>{identity.label}</Typography>
                    <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" }, fontWeight: 900, lineHeight: 1.2 }} noWrap>{name}</Typography>
                    {user?.email && <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>}
                </Box>
                <Button component={Link} href={back.href} startIcon={<ArrowBackRoundedIcon />} variant="outlined" sx={{ borderRadius: 999, fontWeight: 700 }}>
                    {back.label}
                </Button>
            </Paper>

            <Stack spacing={2}>
                <Paper elevation={0} sx={cardSx}>
                    <UpdateProfileInformationForm mustVerifyEmail={mustVerifyEmail} status={status} />
                </Paper>
                <Paper elevation={0} sx={cardSx}>
                    <UpdatePasswordForm />
                </Paper>
                <Paper elevation={0} sx={{ ...cardSx, borderColor: alpha(theme.palette.error.main, 0.35) }}>
                    <DeleteUserForm />
                </Paper>
            </Stack>
        </Box>
    );
}

const LAYOUTS: Partial<Record<RoleKey, React.ComponentType<{ children: React.ReactNode }>>> = {
    admin: AdminLayout,
    stock_keeper: StockKeeperLayout,
    delivery: DeliveryLayout,
    finance: FinanceLayout,
    vendor: VendorLayout,
    dev: DevLayout,
    shared: SharedLayout,
};

/** The chrome of the app this host belongs to; the seller workspace and the shop share AccountLayout. */
function ProfileChrome({ children }: { children: React.ReactNode }) {
    const app = hostApp();
    const Layout = (app && LAYOUTS[app]) || AccountLayout;
    return <Layout>{children}</Layout>;
}

Edit.layout = (page: React.ReactNode) => <ProfileChrome>{page}</ProfileChrome>;
