import { Link } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import {
    Box,
    IconButton,
    Paper,
    type PaperProps,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import React from "react";

export const SELLER_BRAND = "#f6a45d";
export const SELLER_BRAND_DARK = "#d97706";
export const SELLER_BG = "#f5f2ed";
export const SELLER_SURFACE = "#ffffff";
export const SELLER_CITY_OPTIONS = [
    "Addis Ababa",
    "Adama",
    "Dire Dawa",
    "Bahir Dar",
    "Bishoftu",
    "Dessie",
    "Gondar",
    "Jimma",
    "Jijiga",
    "Mekele",
    "Shashamane",
];

export interface SellerHeaderProps {
    title: string;
    backHref?: string;
    action?: React.ReactNode;
    subtitle?: string;
    children?: React.ReactNode;
}

export function SellerHeader({
    title,
    backHref,
    action,
    subtitle,
    children,
}: SellerHeaderProps) {
    const theme = useTheme();
    const brandColor = theme.palette.primary.main;

    return (
        <Box
            sx={{
                px: 2,
                pt: "calc(16px + env(safe-area-inset-top))",
                pb: children ? 2.5 : 2,
                color: "#fff",
                background: `linear-gradient(180deg, ${brandColor} 0%, ${brandColor}dd 100%)`,
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
                boxShadow: `0 18px 40px ${brandColor}33`,
            }}
        >
            <Stack spacing={children || subtitle ? 2 : 0}>
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                >
                    {backHref ? (
                        <IconButton
                            component={Link}
                            href={backHref}
                            sx={sellerHeaderButtonSx}
                        >
                            <ArrowBackRoundedIcon />
                        </IconButton>
                    ) : (
                        <Box sx={{ width: 40, height: 40, flexShrink: 0 }} />
                    )}

                    <Box sx={{ flex: 1, textAlign: "center", px: 1 }}>
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                lineHeight: 1.2,
                                fontFamily: "Figtree, sans-serif",
                            }}
                        >
                            {title}
                        </Typography>
                        {subtitle ? (
                            <Typography
                                variant="body2"
                                sx={{
                                    mt: 0.5,
                                    color: "rgba(255,255,255,0.86)",
                                    fontFamily: "Figtree, sans-serif",
                                }}
                            >
                                {subtitle}
                            </Typography>
                        ) : null}
                    </Box>

                    {action ? (
                        <Box
                            sx={{
                                minWidth: 40,
                                display: "flex",
                                justifyContent: "flex-end",
                            }}
                        >
                            {action}
                        </Box>
                    ) : (
                        <Box sx={{ width: 40, height: 40, flexShrink: 0 }} />
                    )}
                </Stack>

                {children}
            </Stack>
        </Box>
    );
}

type SellerCardProps = PaperProps & {
    component?: React.ElementType;
    href?: string;
};

export function SellerCard({ children, sx, ...props }: SellerCardProps) {
    const theme = useTheme();
    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                borderRadius: 3,
                border: "1px solid",
                borderColor:
                    theme.palette.mode === "dark"
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(148, 163, 184, 0.18)",
                backgroundColor: "background.paper",
                boxShadow:
                    theme.palette.mode === "dark"
                        ? "none"
                        : "0 10px 30px rgba(15, 23, 42, 0.05)",
                backgroundImage: "none",
                ...sx,
            }}
            {...props}
        >
            {children}
        </Paper>
    );
}

export function sellerAvatarText(value?: string | null) {
    if (!value) {
        return "?";
    }

    return value
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

export function sellerName(parts: Array<string | null | undefined>) {
    return parts.filter(Boolean).join(" ").trim();
}

export function sellerPrice(value?: number | null) {
    if (value == null) {
        return "N/A";
    }

    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

export function sellerImage(src?: string | string[] | null) {
    // 1. Extract the actual string from the input
    let rawSrc: string | null = null;

    if (Array.isArray(src)) {
        rawSrc = src[0] ?? null;
    } else {
        rawSrc = src ?? null;
    }

    if (!rawSrc) return null;

    const normalizedSrc = rawSrc.trim();

    // 2. If it's already a full URL (from Controller's asset() call), return it immediately
    if (
        normalizedSrc.startsWith("http://") ||
        normalizedSrc.startsWith("https://") ||
        normalizedSrc.startsWith("data:")
    ) {
        return normalizedSrc;
    }

    // 3. Handle relative paths (for Index page or raw DB strings)
    if (
        normalizedSrc.startsWith("/storage/") ||
        normalizedSrc.startsWith("/images/")
    ) {
        return normalizedSrc;
    }

    if (normalizedSrc.startsWith("storage/")) {
        return `/${normalizedSrc}`;
    }

    return `/storage/${normalizedSrc.replace(/^\/+/, "")}`;
}

export const sellerHeaderButtonSx = {
    width: 40,
    height: 40,
    flexShrink: 0,
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.44)",
    backgroundColor: "rgba(255,255,255,0.14)",
    backdropFilter: "blur(8px)",
    "&:hover": {
        backgroundColor: "rgba(255,255,255,0.22)",
    },
};
