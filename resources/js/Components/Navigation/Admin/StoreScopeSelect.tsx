import React from "react";
import LockOutlined from "@mui/icons-material/LockOutlined";
import Storefront from "@mui/icons-material/Storefront";
import { Box, MenuItem, Select, Typography } from "@mui/material";
import type { ActiveStoreId } from "@/types/adminScope";
import { useAdminScope } from "./useAdminScope";

const TYPE_LABEL: Record<string, string> = {
    retail: "Retail store",
    central_warehouse: "Main hub",
    remote_warehouse: "Remote hub",
};

/**
 * "Active Operating Scope": the store the store zone follows. A global admin
 * picks "All stores" or any store; a store admin is fixed to theirs (or picks
 * among the few they manage).
 */
export default function StoreScopeSelect() {
    const { activeStore, accessibleStores, isGlobalAdmin, canSwitch, setStore } = useAdminScope();

    return (
        <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Typography
                variant="overline"
                sx={{ display: "block", color: "text.secondary", fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.6, mb: 0.75 }}
            >
                Active operating scope
            </Typography>
            {canSwitch ? (
                <Select
                    fullWidth
                    size="small"
                    value={String(activeStore.id)}
                    onChange={(event) => {
                        const value = event.target.value;
                        setStore((value === "all" ? "all" : Number(value)) as ActiveStoreId);
                    }}
                    inputProps={{ "aria-label": "Active store" }}
                    renderValue={() => (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                            <Storefront fontSize="small" sx={{ color: "primary.main" }} />
                            <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.875rem" }}>
                                {activeStore.name}
                            </Typography>
                        </Box>
                    )}
                    sx={{ borderRadius: 2, bgcolor: "action.hover", "& .MuiOutlinedInput-notchedOutline": { borderColor: "divider" } }}
                >
                    {isGlobalAdmin && <MenuItem value="all">All stores</MenuItem>}
                    {accessibleStores.map((store) => (
                        <MenuItem key={store.id} value={String(store.id)}>
                            <Box sx={{ display: "flex", flexDirection: "column" }}>
                                <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{store.name}</Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    {TYPE_LABEL[store.type] ?? "Facility"}
                                </Typography>
                            </Box>
                        </MenuItem>
                    ))}
                </Select>
            ) : (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "action.hover",
                    }}
                >
                    <Storefront fontSize="small" sx={{ color: "primary.main" }} />
                    <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.875rem", flexGrow: 1 }}>
                        {activeStore.name}
                    </Typography>
                    <LockOutlined fontSize="small" sx={{ color: "text.secondary" }} titleAccess="Your account is fixed to this store" />
                </Box>
            )}
        </Box>
    );
}
