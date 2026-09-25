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

import type { StockRowStatus, TransferStatus } from "@/types/stockkeeper";

/**
 * Shared presentation for the StockKeeper desk.
 *
 * Follows the Admin module's surface language (flat Paper, 1px divider
 * border, 3-unit radius) so the warehouse screens sit alongside the admin
 * console without a visual seam.
 */

export function SkCard({ children, sx, ...props }: PaperProps): React.ReactElement {
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
    /** Tints the value; use sparingly to flag a number that needs attention. */
    tone?: "default" | "warning" | "danger" | "success";
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
        <SkCard sx={{ p: 2.5, height: "100%" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                {icon ? <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box> : null}
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
        </SkCard>
    );
}

const STOCK_STATUS_META: Record<
    StockRowStatus,
    { label: string; color: ChipProps["color"] }
> = {
    healthy: { label: "Healthy", color: "success" },
    low_stock: { label: "Low", color: "warning" },
    critical: { label: "Critical", color: "error" },
    out_of_stock: { label: "Out of stock", color: "error" },
};

export function StockStatusChip({
    status,
}: {
    status: StockRowStatus;
}): React.ReactElement {
    const meta = STOCK_STATUS_META[status];

    return (
        <Chip
            size="small"
            label={meta.label}
            color={meta.color}
            variant={status === "healthy" ? "outlined" : "filled"}
            sx={{ fontWeight: 700 }}
        />
    );
}

const TRANSFER_STATUS_META: Record<
    TransferStatus,
    { label: string; color: ChipProps["color"] }
> = {
    pending: { label: "Queued", color: "default" },
    in_transit: { label: "In transit", color: "info" },
    completed: { label: "Completed", color: "success" },
    cancelled: { label: "Cancelled", color: "error" },
};

export function TransferStatusChip({
    status,
}: {
    status: TransferStatus;
}): React.ReactElement {
    const meta = TRANSFER_STATUS_META[status] ?? {
        label: status,
        color: "default" as const,
    };

    return (
        <Chip
            size="small"
            label={meta.label}
            color={meta.color}
            variant={status === "pending" ? "outlined" : "filled"}
            sx={{ fontWeight: 700 }}
        />
    );
}

export interface PageHeaderProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
}

export function PageHeader({
    title,
    subtitle,
    action,
}: PageHeaderProps): React.ReactElement {
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

/** Empty-state block used when a query legitimately returns nothing. */
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

/** Formats an ISO timestamp for the desk; returns an em dash when absent. */
export function formatMoment(value: string | null | undefined): string {
    if (!value) {
        return "—";
    }

    return new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
