import { Link } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Box, IconButton, Paper, type PaperProps, Stack, Typography } from "@mui/material";
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
    return (
        <Box
            sx={{
                px: 2,
                pt: "calc(16px + env(safe-area-inset-top))",
                pb: children ? 2.5 : 2,
                color: "#fff",
                background: `linear-gradient(180deg, ${SELLER_BRAND} 0%, #ee9552 100%)`,
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
                boxShadow: "0 18px 40px rgba(217, 119, 6, 0.22)",
            }}
        >
            <Stack spacing={children || subtitle ? 2 : 0}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    {backHref ? (
                        <IconButton component={Link} href={backHref} sx={sellerHeaderButtonSx}>
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
                        <Box sx={{ minWidth: 40, display: "flex", justifyContent: "flex-end" }}>
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
    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                borderRadius: 3,
                border: "1px solid rgba(148, 163, 184, 0.18)",
                backgroundColor: SELLER_SURFACE,
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
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

export function sellerImage(src?: string | null) {
    if (!src) {
        return null;
    }

    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
        return src;
    }

    if (src.startsWith("/")) {
        return src;
    }

    return `/${src.replace(/^\/+/, "")}`;
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
