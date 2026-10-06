import CallRoundedIcon from "@mui/icons-material/CallRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import {
    Avatar,
    Box,
    Button,
    Chip,
    Container,
    Paper,
    Stack,
    Typography,
    alpha,
    useTheme,
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

const STATUS_META: Record<DeliveryStatus, { label: string; color: ChipProps["color"] }> = {
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

export function DeliveryStatusChip({ status }: { status: DeliveryStatus }): React.ReactElement {
    const meta = STATUS_META[status] ?? { label: status, color: "default" as const };

    return <Chip size="small" label={meta.label} color={meta.color} sx={{ fontWeight: 800, borderRadius: 2 }} />;
}

/**
 * The coloured header every courier page opens with: a title, a line of
 * context, and optional content (stats, search) sitting on the gradient.
 */
export function DeliveryHero({
    eyebrow,
    title,
    subtitle,
    action,
    children,
}: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children?: React.ReactNode;
}): React.ReactElement {
    const theme = useTheme();

    return (
        <Box
            sx={{
                px: 2,
                pt: 2.5,
                pb: children ? 2.5 : 3,
                color: "primary.contrastText",
                background: `linear-gradient(155deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 70%)`,
                borderBottomLeftRadius: 28,
                borderBottomRightRadius: 28,
                boxShadow: `0 10px 30px ${alpha(theme.palette.primary.main, 0.25)}`,
            }}
        >
            <Container maxWidth="sm" disableGutters>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
                    <Box sx={{ minWidth: 0 }}>
                        {eyebrow ? (
                            <Typography variant="overline" sx={{ opacity: 0.8, fontWeight: 800, lineHeight: 1.4, letterSpacing: 1 }}>
                                {eyebrow}
                            </Typography>
                        ) : null}
                        <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                            {title}
                        </Typography>
                        {subtitle ? (
                            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
                                {subtitle}
                            </Typography>
                        ) : null}
                    </Box>
                    {action}
                </Stack>
                {children ? <Box sx={{ mt: 2 }}>{children}</Box> : null}
            </Container>
        </Box>
    );
}

export interface StatTileProps {
    label: string;
    value: number;
    tone?: "default" | "warning" | "success" | "danger";
    icon?: React.ReactNode;
    /** On the hero gradient, tiles are glass rather than paper. */
    onHero?: boolean;
}

export function StatTile({ label, value, tone = "default", icon, onHero = false }: StatTileProps): React.ReactElement {
    const theme = useTheme();
    const toneColor =
        tone === "danger"
            ? theme.palette.error.main
            : tone === "warning"
              ? theme.palette.warning.main
              : tone === "success"
                ? theme.palette.success.main
                : theme.palette.primary.main;

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5,
                height: "100%",
                borderRadius: 3,
                backgroundImage: "none",
                ...(onHero
                    ? { bgcolor: alpha("#fff", 0.14), color: "inherit", border: `1px solid ${alpha("#fff", 0.18)}` }
                    : { border: 1, borderColor: "divider" }),
            }}
        >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5, minWidth: 0 }}>
                {icon ? (
                    <Box sx={{ display: "flex", color: onHero ? "inherit" : toneColor, "& svg": { fontSize: 16 } }}>{icon}</Box>
                ) : (
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: onHero ? alpha("#fff", 0.8) : toneColor, flexShrink: 0 }} />
                )}
                <Typography
                    variant="caption"
                    noWrap
                    sx={{ fontWeight: 700, color: onHero ? "inherit" : "text.secondary", opacity: onHero ? 0.85 : 1 }}
                >
                    {label}
                </Typography>
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1, color: onHero ? "inherit" : "text.primary" }}>
                {value.toLocaleString()}
            </Typography>
        </Paper>
    );
}

export function SectionTitle({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }): React.ReactElement {
    return (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25, mt: 0.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {title}
                </Typography>
                {count !== undefined && count > 0 ? (
                    <Chip size="small" label={count} color="primary" sx={{ height: 20, fontWeight: 800 }} />
                ) : null}
            </Stack>
            {action}
        </Stack>
    );
}

export interface RunCardProps {
    run: DeliveryRun;
    /** Rendered under the address; omit on read-only history cards. */
    actions?: React.ReactNode;
}

export function RunCard({ run, actions }: RunCardProps): React.ReactElement {
    const theme = useTheme();
    const meta = STATUS_META[run.status];
    const accent =
        meta?.color && meta.color !== "default"
            ? theme.palette[meta.color].main
            : theme.palette.text.disabled;

    const mapsHref = run.delivery_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(run.delivery_address)}`
        : null;

    return (
        <Paper
            elevation={0}
            sx={{
                position: "relative",
                overflow: "hidden",
                p: 2,
                pl: 2.5,
                borderRadius: 4,
                border: 1,
                borderColor: "divider",
                backgroundImage: "none",
                "&::before": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    bgcolor: accent,
                },
            }}
        >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Avatar sx={{ bgcolor: alpha(accent, 0.14), color: accent, width: 42, height: 42, fontWeight: 800 }}>
                    {(run.recipient_name ?? "?").trim().charAt(0).toUpperCase() || <Inventory2RoundedIcon />}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }} noWrap>
                            {run.recipient_name ?? "Recipient not set"}
                        </Typography>
                        <DeliveryStatusChip status={run.status} />
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                        <ReceiptLongRoundedIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption" sx={{ fontFamily: "monospace" }} noWrap>
                            {run.tracking_number ?? `Run #${run.id}`}
                            {run.sale_reference ? ` · ${run.sale_reference}` : ""}
                        </Typography>
                    </Stack>
                </Box>
            </Stack>

            {run.delivery_address ? (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }}>
                    <PlaceRoundedIcon fontSize="small" sx={{ color: "text.disabled", mt: "1px" }} />
                    <Typography variant="body2" color="text.secondary">
                        {run.delivery_address}
                    </Typography>
                </Stack>
            ) : null}

            {run.scheduled_for ? (
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                    <ScheduleRoundedIcon fontSize="small" sx={{ color: "text.disabled", mt: "1px" }} />
                    <Typography variant="body2" color="text.secondary">
                        {formatMoment(run.scheduled_for)}
                    </Typography>
                </Stack>
            ) : null}

            {run.failure_reason ? (
                <Typography
                    variant="caption"
                    sx={{ display: "block", mt: 1, color: "error.main", fontWeight: 700, bgcolor: alpha(theme.palette.error.main, 0.08), px: 1, py: 0.5, borderRadius: 1.5 }}
                >
                    {run.failure_reason}
                </Typography>
            ) : null}

            {run.recipient_phone || mapsHref ? (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    {run.recipient_phone ? (
                        <Button
                            component="a"
                            href={`tel:${run.recipient_phone}`}
                            size="small"
                            variant="outlined"
                            startIcon={<CallRoundedIcon />}
                            sx={{ borderRadius: 2.5, flex: 1, fontWeight: 700 }}
                        >
                            Call
                        </Button>
                    ) : null}
                    {mapsHref ? (
                        <Button
                            component="a"
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            variant="outlined"
                            startIcon={<MapRoundedIcon />}
                            sx={{ borderRadius: 2.5, flex: 1, fontWeight: 700 }}
                        >
                            Map
                        </Button>
                    ) : null}
                </Stack>
            ) : null}

            {actions ? <Box sx={{ mt: 1.25 }}>{actions}</Box> : null}
        </Paper>
    );
}

export function EmptyRuns({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }): React.ReactElement {
    return (
        <Paper
            elevation={0}
            sx={{
                p: 4,
                borderRadius: 4,
                border: "1.5px dashed",
                borderColor: "divider",
                textAlign: "center",
                backgroundImage: "none",
            }}
        >
            <Avatar sx={{ mx: "auto", mb: 1.5, width: 52, height: 52, bgcolor: "action.hover", color: "text.secondary" }}>
                {icon ?? <Inventory2RoundedIcon />}
            </Avatar>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {title}
            </Typography>
            {hint ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
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
