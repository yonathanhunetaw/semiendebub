import React from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Building2, Landmark, LayoutGrid, Megaphone, Package, Share2, ShieldCheck, ShoppingCart, Store, Terminal, Truck, type LucideIcon } from "lucide-react";
import { identityFor } from "./identities";

/** One thin-line glyph per app: the same names ROLES (theme/roles.ts) gives each. */
const ICONS: Record<string, LucideIcon> = {
    admin: ShieldCheck,
    seller: Store,
    stock_keeper: Package,
    delivery: Truck,
    vendor: Building2,
    finance: Landmark,
    procurement: ShoppingCart,
    marketing: Megaphone,
    dev: Terminal,
    shared: Share2,
};

/**
 * An app as a rounded tile: its glyph in the app's colour on a soft tint. The
 * quiet counterpart of RoleAvatar (the character), used where apps are listed
 * side by side, so they read as one set.
 */
export default function AppIcon({ role, size = 40, title }: { role: string; size?: number; title?: string }) {
    const theme = useTheme();
    const tone = theme.palette[identityFor(role).color].main;
    const Icon = ICONS[role] ?? LayoutGrid;

    return (
        <Box
            role="img"
            aria-label={title ?? identityFor(role).label}
            sx={{ width: size, height: size, borderRadius: "28%", flexShrink: 0, display: "grid", placeItems: "center", bgcolor: alpha(tone, 0.14), color: tone }}
        >
            <Icon size={Math.round(size * 0.52)} strokeWidth={2} aria-hidden />
        </Box>
    );
}
