import CallRoundedIcon from "@mui/icons-material/CallRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Typography,
    type ChipProps,
} from "@mui/material";
import React from "react";

import type { DeliveryRun, DeliveryStatus } from "@/types/delivery";

/**
 * Shared presentation for the courier app.
 *
 * Phone-first: the driver uses this one-handed, so touch targets stay large
 * and each run is a self-contained card rather than a table row.
 */

const STATUS_META: Record<
    DeliveryStatus,
    { label: string; color: ChipProps["color"] }
> = {
    pending: { label: "To collect", color: "warning" },
    dispatched: { label: "Collected", color: "info" },
    in_transit: { label: "In transit", color: "primary" },
    delivered: { label: "Delivered", color: "success" },
    failed: { label: "Failed", color: "error" },
    returned: { label: "Returned", color: "default" },
};

/** Button copy for each forward move, keyed by the status being entered. */
export const TRANSITION_LABELS: Record<string, string> = {
    dispatched: "Collect",
    in_transit: "Start run",
    delivered: "Mark delivered",
    failed: "Report problem",
    returned: "Return to depot",
};

export function DeliveryStatusChip({
    status,
}: {
    status: DeliveryStatus;
}): React.ReactElement {
    const meta = STATUS_META[status] ?? { label: status, color: "default" as const };

    return (
        <Chip
            size="small"
            label={meta.label}
            color={meta.color}
            sx={{ fontWeight: 700 }}
        />
    );
}

export interface StatTileProps {
    label: string;
    value: number;
    tone?: "default" | "warning" | "success" | "danger";
}

export function StatTile({
    label,
    value,
    tone = "default",
}: StatTileProps): React.ReactElement {
    const color =
        tone === "danger"
            ? "error.main"
            : tone === "warning"
              ? "warning.main"
              : tone === "success"
                ? "success.main"
                : "text.primary";

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                textAlign: "center",
                backgroundImage: "none",
            }}
        >
            <Typography variant="h5" sx={{ fontWeight: 800, color, lineHeight: 1.2 }}>
                {value.toLocaleString()}
            </Typography>
            <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontWeight: 600 }}
            >
                {label}
            </Typography>
        </Paper>
    );
}

export interface RunCardProps {
    run: DeliveryRun;
    /** Rendered under the address; omit on read-only history cards. */
    actions?: React.ReactNode;
}

export function RunCard({ run, actions }: RunCardProps): React.ReactElement {
    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                backgroundImage: "none",
            }}
        >
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                spacing={1}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }} noWrap>
                        {run.recipient_name ?? "Recipient not set"}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{ fontFamily: "monospace", color: "text.secondary" }}
                    >
                        {run.tracking_number ?? `Run #${run.id}`}
                        {run.sale_reference ? ` · ${run.sale_reference}` : ""}
                    </Typography>
                </Box>
                <DeliveryStatusChip status={run.status} />
            </Stack>

            {run.delivery_address ? (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }}>
                    <PlaceRoundedIcon
                        fontSize="small"
                        sx={{ color: "text.disabled", mt: "1px" }}
                    />
                    <Typography variant="body2" color="text.secondary">
                        {run.delivery_address}
                    </Typography>
                </Stack>
            ) : null}

            {run.recipient_phone ? (
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                    <CallRoundedIcon
                        fontSize="small"
                        sx={{ color: "text.disabled", mt: "1px" }}
                    />
                    <Typography
                        component="a"
                        href={`tel:${run.recipient_phone}`}
                        variant="body2"
                        sx={{ color: "primary.main", textDecoration: "none", fontWeight: 600 }}
                    >
                        {run.recipient_phone}
                    </Typography>
                </Stack>
            ) : null}

            {run.failure_reason ? (
                <Typography
                    variant="caption"
                    sx={{ display: "block", mt: 1, color: "error.main", fontWeight: 600 }}
                >
                    {run.failure_reason}
                </Typography>
            ) : null}

            {actions ? <Box sx={{ mt: 1.75 }}>{actions}</Box> : null}
        </Paper>
    );
}

export function EmptyRuns({
    title,
    hint,
}: {
    title: string;
    hint?: string;
}): React.ReactElement {
    return (
        <Paper
            elevation={0}
            sx={{
                p: 4,
                borderRadius: 3,
                border: "1px dashed",
                borderColor: "divider",
                textAlign: "center",
                backgroundImage: "none",
            }}
        >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {title}
            </Typography>
            {hint ? (
                <Typography variant="body2" color="text.secondary">
                    {hint}
                </Typography>
            ) : null}
        </Paper>
    );
}

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
