import React, { useState } from "react";
import SwapHorizRounded from "@mui/icons-material/SwapHorizRounded";
import { Box, Button, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { identityFor } from "@/Components/Visual/identities";
import { ROLES, roleUrl, type RoleKey } from "@/theme";

/**
 * Apps this user may enter: an admin may enter every subdomain (the gate's
 * admin bypass); a store manager also works in the seller app.
 */
function enterableRoles(roleKey: string): RoleKey[] {
    if (roleKey === "admin") {
        return ROLES.map((role) => role.key);
    }

    const roles: RoleKey[] = ROLES.some((role) => role.key === roleKey) ? [roleKey as RoleKey] : [];

    return roleKey === "store_manager" ? [...roles, "seller"] : roles;
}

/**
 * The Role Switcher pill. Built from ROLES (theme/roles.ts) and filtered to the
 * apps the user may enter. Each entry is a cross-subdomain link to that app's
 * dashboard; the target derives the store from the user record and session,
 * so nothing is carried along.
 */
export default function RoleSwitcher({ roleKey, current }: { roleKey: string; current: RoleKey }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const targets = ROLES.filter((role) => role.key !== current && enterableRoles(roleKey).includes(role.key));

    if (targets.length === 0) {
        return null;
    }

    return (
        <>
            {/* The pill wears the current role's character, with room between it and the words. */}
            <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={(event) => setAnchor(event.currentTarget)}
                aria-haspopup="true"
                aria-expanded={anchor ? "true" : undefined}
                aria-label="Role Switcher"
                sx={{ borderRadius: 999, fontWeight: 700, pl: 0.5, pr: { xs: 1.5, md: 1, lg: 1.5 }, py: 0.5, minWidth: 0, gap: 1, whiteSpace: "nowrap" }}
            >
                <RoleAvatar role={current} size={28} />
                {/* Words hidden between phone and desktop, where the bar is tight. */}
                <Box component="span" sx={{ display: { xs: "inline", md: "none", lg: "inline" } }}>
                    Role Switcher
                </Box>
                <SwapHorizRounded fontSize="small" />
            </Button>
            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { minWidth: 280, maxWidth: "calc(100vw - 24px)", mt: 0.75, borderRadius: 3, py: 0.5 } } }}
            >
                <Typography variant="overline" sx={{ px: 2, color: "text.secondary", fontWeight: 700, display: "block" }}>
                    Open another app
                </Typography>
                {targets.map((role) => (
                    <MenuItem key={role.key} component="a" href={roleUrl(role.key, "/dashboard")} onClick={() => setAnchor(null)} sx={{ gap: 1.75, py: 1, mx: 0.75, borderRadius: 2 }}>
                        <RoleAvatar role={role.key} size={40} />
                        <ListItemText
                            primary={role.label}
                            secondary={identityFor(role.key).does}
                            slotProps={{ primary: { sx: { fontWeight: 700 } }, secondary: { sx: { fontSize: "0.75rem", whiteSpace: "normal", lineHeight: 1.3 } } }}
                        />
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
