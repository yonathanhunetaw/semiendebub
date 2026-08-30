import React from "react";
import { usePage } from "@inertiajs/react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";

interface PageProps {
    databaseNode?: string | null;
    [key: string]: any;
}

export default function DatabaseNodeBadge({ variant = "chip" }: { variant?: "chip" | "footer" | "text" }) {
    const { databaseNode } = usePage<PageProps>().props;

    if (!databaseNode) return null;

    const isMaster = databaseNode.toLowerCase().includes("master");

    if (variant === "text") {
        return (
            <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>
                DB: {databaseNode}
            </Typography>
        );
    }

    if (variant === "footer") {
        return (
            <Box
                component="footer"
                sx={{
                    py: 1.5,
                    px: 2,
                    mt: "auto",
                    textAlign: "center",
                    borderTop: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                }}
            >
                <Typography variant="caption" color="text.secondary" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <StorageIcon sx={{ fontSize: 14, color: isMaster ? "success.main" : "info.main" }} />
                    Connected Database Node:{" "}
                    <Box component="span" sx={{ fontWeight: 600, fontFamily: "monospace", color: "text.primary" }}>
                        {databaseNode}
                    </Box>
                </Typography>
            </Box>
        );
    }

    return (
        <Tooltip title={`Connected Database Host: ${databaseNode}`}>
            <Chip
                icon={<StorageIcon sx={{ fontSize: "14px !important" }} />}
                label={databaseNode}
                size="small"
                variant="outlined"
                color={isMaster ? "success" : "default"}
                sx={{
                    height: 24,
                    fontSize: "11px",
                    fontWeight: 600,
                    fontFamily: "monospace",
                    display: { xs: "none", md: "inline-flex" },
                }}
            />
        </Tooltip>
    );
}
