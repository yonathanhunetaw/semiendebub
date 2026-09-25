import {
    Box,
    Chip,
    Paper,
    Stack,
    Typography,
    type ChipProps,
    type PaperProps,
} from "@mui/material";
import React from "react";

import type { PurchaseOrderStatus } from "@/types/vendor";

/**
 * Shared presentation for the supplier console.
 *
 * Deliberately the same surface language as the StockKeeper desk so the two
 * back-office consoles read as one product.
 */

export function VendorCard({
    children,
    sx,
    ...props
}: PaperProps): React.ReactElement {
    return (
        <Paper
            elevation={0}
            sx={{
                p: 3,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                backgroundImage: "none",
                ...sx,
            }}
            {...props}
        >
            {children}
        </Paper>
    );
}

export interface StatCardProps {
    label: string;
    value: string | number;
    hint?: string;
    tone?: "default" | "warning" | "success" | "danger";
    icon?: React.ReactNode;
}

export function StatCard({
    label,
    value,
    hint,
    tone = "default",
    icon,
}: StatCardProps): React.ReactElement {
    const color =
        tone === "danger"
            ? "error.main"
            : tone === "warning"
              ? "warning.main"
              : tone === "success"
                ? "success.main"
                : "text.primary";

    return (
        <VendorCard sx={{ p: 2.5, height: "100%" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                {icon ? (
                    <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
                ) : null}
                <Typography
                    variant="caption"
                    sx={{
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        color: "text.secondary",
                    }}
                >
                    {label}
                </Typography>
            </Stack>

            <Typography variant="h4" sx={{ fontWeight: 800, color, lineHeight: 1.15 }}>
                {typeof value === "number" ? value.toLocaleString() : value}
            </Typography>

            {hint ? (
                <Typography variant="caption" color="text.secondary">
                    {hint}
                </Typography>
            ) : null}
        </VendorCard>
    );
}

const ORDER_STATUS_META: Record<
    PurchaseOrderStatus,
    { label: string; color: ChipProps["color"] }
> = {
    pending: { label: "Pending", color: "warning" },
    received: { label: "Received", color: "success" },
    canceled: { label: "Canceled", color: "error" },
};

export function OrderStatusChip({
    status,
}: {
    status: PurchaseOrderStatus;
}): React.ReactElement {
    const meta = ORDER_STATUS_META[status] ?? {
        label: status,
        color: "default" as const,
    };

    return (
        <Chip
            size="small"
            label={meta.label}
            color={meta.color}
            sx={{ fontWeight: 700 }}
        />
    );
}

export function PageHeader({
    title,
    subtitle,
    action,
}: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
}): React.ReactElement {
    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            sx={{ mb: 3 }}
        >
            <Box>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {title}
                </Typography>
                {subtitle ? (
                    <Typography variant="body2" color="text.secondary">
                        {subtitle}
                    </Typography>
                ) : null}
            </Box>
            {action}
        </Stack>
    );
}

export function EmptyState({
    icon,
    title,
    hint,
}: {
    icon?: React.ReactNode;
    title: string;
    hint?: string;
}): React.ReactElement {
    return (
        <Box sx={{ py: 6, textAlign: "center" }}>
            {icon ? <Box sx={{ color: "text.disabled", mb: 1 }}>{icon}</Box> : null}
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {title}
            </Typography>
            {hint ? (
                <Typography variant="body2" color="text.secondary">
                    {hint}
                </Typography>
            ) : null}
        </Box>
    );
}

/** Money formatter shared across the supplier console. */
export function formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "—";
    }

    return `ETB ${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)}`;
}

export function formatMoment(value: string | null | undefined): string {
    if (!value) {
        return "—";
    }

    return new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
