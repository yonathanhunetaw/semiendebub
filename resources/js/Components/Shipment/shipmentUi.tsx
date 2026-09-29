import { router } from "@inertiajs/react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    type ChipProps,
    type PaperProps,
} from "@mui/material";
import React from "react";

import type {
    LineCoverage,
    PartyAgreement,
    PartyKey,
    Shipment,
    ShipmentStatus,
} from "@/types/shipment";

/**
 * Shared shipment presentation for all four role consoles.
 *
 * Written once so Admin, Seller, StockKeeper and Delivery show the same
 * status vocabulary and the same manifest — the whole point of the shared
 * domain is that a shipment looks the same wherever you stand.
 */

const STATUS_META: Record<
    ShipmentStatus,
    { label: string; color: ChipProps["color"] }
> = {
    draft: { label: "Draft", color: "default" },
    pending_agreement: { label: "Awaiting agreement", color: "warning" },
    scheduled: { label: "Scheduled", color: "info" },
    picking: { label: "Picking", color: "warning" },
    ready: { label: "Ready", color: "warning" },
    dispatched: { label: "Dispatched", color: "primary" },
    in_transit: { label: "In transit", color: "primary" },
    delivered: { label: "Delivered", color: "success" },
    received: { label: "Received", color: "success" },
    cancelled: { label: "Cancelled", color: "error" },
};

/** Button copy for entering each status. */
export const TRANSITION_LABELS: Record<string, string> = {
    scheduled: "Schedule",
    picking: "Start picking",
    ready: "Mark ready",
    dispatched: "Dispatch",
    in_transit: "Start run",
    delivered: "Mark delivered",
    received: "Confirm receipt",
    cancelled: "Cancel",
};

const COVERAGE_META: Record<
    LineCoverage,
    { label: string; color: ChipProps["color"] }
> = {
    ok: { label: "In stock", color: "success" },
    low: { label: "Short", color: "warning" },
    oos: { label: "Out of stock", color: "error" },
};

export function ShipmentStatusChip({
    status,
}: {
    status: ShipmentStatus;
}): React.ReactElement {
    const meta = STATUS_META[status] ?? { label: status, color: "default" as const };

    return (
        <Chip size="small" label={meta.label} color={meta.color} sx={{ fontWeight: 700 }} />
    );
}

export function ShipmentCard({
    children,
    sx,
    ...props
}: PaperProps): React.ReactElement {
    return (
        <Paper
            elevation={0}
            sx={{
                p: 2.5,
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

/** Origin → destination with the reference and current status. */
export function ShipmentRouteHeader({
    shipment,
}: {
    shipment: Shipment;
}): React.ReactElement {
    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
            spacing={1}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", fontWeight: 700, color: "text.secondary" }}
                >
                    {shipment.reference}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {shipment.origin.name} → {shipment.destination.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {shipment.sku_count} SKU{shipment.sku_count === 1 ? "" : "s"} ·{" "}
                    {shipment.total_units.toLocaleString()} units
                    {shipment.total_cbm > 0 ? ` · ${shipment.total_cbm.toFixed(2)} CBM` : ""}
                </Typography>
            </Box>
            <ShipmentStatusChip status={shipment.status} />
        </Stack>
    );
}

/** Vehicle fill bar; only meaningful once a vehicle with capacity is set. */
export function LoadBar({ shipment }: { shipment: Shipment }): React.ReactElement | null {
    if (!shipment.vehicle_max_cbm) {
        return null;
    }

    return (
        <Box sx={{ mt: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                    {shipment.vehicle_name ?? "Vehicle"}
                    {shipment.vehicle_plate ? ` · ${shipment.vehicle_plate}` : ""}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {shipment.load_percentage}% of {shipment.vehicle_max_cbm} CBM
                </Typography>
            </Stack>
            <LinearProgress
                variant="determinate"
                value={shipment.load_percentage}
                color={shipment.load_percentage > 95 ? "error" : "primary"}
                sx={{ height: 6, borderRadius: 3 }}
            />
        </Box>
    );
}

export interface TransitionBarProps {
    shipment: Shipment;
    /** Route name taking (shipment) and receiving PATCH { status }. */
    transitionRoute: string;
    size?: "small" | "medium";
    onCancelRequested?: (shipment: Shipment) => void;
}

/**
 * Renders exactly the moves the server said this role may make.
 *
 * `allowed_transitions` is already the intersection of the state machine and
 * the role's permissions, so the UI can never offer an illegal action.
 */
export function TransitionBar({
    shipment,
    transitionRoute,
    size = "small",
    onCancelRequested,
}: TransitionBarProps): React.ReactElement | null {
    if (shipment.allowed_transitions.length === 0) {
        return null;
    }

    const go = (status: string): void => {
        if (status === "cancelled") {
            onCancelRequested?.(shipment);
            return;
        }

        router.patch(
            route(transitionRoute, shipment.id),
            { status },
            { preserveScroll: true },
        );
    };

    return (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
            {shipment.allowed_transitions.map((status) => (
                <Button
                    key={status}
                    size={size}
                    variant={status === "cancelled" ? "outlined" : "contained"}
                    color={
                        status === "cancelled"
                            ? "error"
                            : status === "received" || status === "delivered"
                              ? "success"
                              : "primary"
                    }
                    onClick={() => go(status)}
                >
                    {TRANSITION_LABELS[status] ?? status}
                </Button>
            ))}
        </Stack>
    );
}

/**
 * The manifest.
 *
 * `showPicked` surfaces the picked column for the warehouse floor; other roles
 * only need what was asked for and whether the origin can cover it.
 */
export function ManifestTable({
    shipment,
    showPicked = false,
    showCoverage = true,
}: {
    shipment: Shipment;
    showPicked?: boolean;
    showCoverage?: boolean;
}): React.ReactElement {
    if (shipment.items.length === 0) {
        return (
            <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    The manifest is empty
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Add SKUs before scheduling this shipment.
                </Typography>
            </Box>
        );
    }

    return (
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    {showPicked ? <TableCell align="right">Picked</TableCell> : null}
                    {showCoverage ? <TableCell align="right">At origin</TableCell> : null}
                    <TableCell align="right">CBM</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {shipment.items.map((line) => (
                    <TableRow key={line.id} hover>
                        <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {line.name}
                            </Typography>
                            {line.location ? (
                                <Typography variant="caption" color="text.secondary">
                                    {line.location}
                                </Typography>
                            ) : null}
                        </TableCell>
                        <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                                {line.sku ?? "—"}
                            </Typography>
                        </TableCell>
                        <TableCell align="right">
                            {line.quantity.toLocaleString()}
                            {line.unit ? ` ${line.unit}` : ""}
                        </TableCell>
                        {showPicked ? (
                            <TableCell align="right">
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontWeight: 700,
                                        color: line.shortfall > 0 ? "warning.main" : "text.primary",
                                    }}
                                >
                                    {line.picked_quantity.toLocaleString()}
                                </Typography>
                            </TableCell>
                        ) : null}
                        {showCoverage ? (
                            <TableCell align="right">
                                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                    <Typography variant="caption" color="text.secondary">
                                        {line.stock_qty.toLocaleString()}
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={COVERAGE_META[line.coverage].label}
                                        color={COVERAGE_META[line.coverage].color}
                                        variant={line.coverage === "ok" ? "outlined" : "filled"}
                                        sx={{ fontWeight: 700 }}
                                    />
                                </Stack>
                            </TableCell>
                        ) : null}
                        <TableCell align="right">
                            {line.cbm !== null ? line.cbm.toFixed(2) : "—"}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

/** Ordered milestones, so every role reads the same history. */
export function ShipmentTimeline({ shipment }: { shipment: Shipment }): React.ReactElement {
    const stages: Array<{ label: string; at: string | null }> = [
        { label: "Created", at: shipment.created_at },
        { label: "Scheduled", at: shipment.scheduled_for },
        { label: "Picked", at: shipment.picked_at },
        { label: "Dispatched", at: shipment.dispatched_at },
        { label: "In transit", at: shipment.in_transit_at },
        { label: "Delivered", at: shipment.delivered_at },
        { label: "Received", at: shipment.received_at },
    ];

    return (
        <Stack spacing={1}>
            {stages.map((stage) => (
                <Stack
                    key={stage.label}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                >
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                bgcolor: stage.at ? "primary.main" : "action.disabled",
                            }}
                        />
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: stage.at ? 600 : 400 }}
                            color={stage.at ? "text.primary" : "text.disabled"}
                        >
                            {stage.label}
                        </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                        {formatMoment(stage.at)}
                    </Typography>
                </Stack>
            ))}
        </Stack>
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

/* ----------------------------------------------------------
 | The 4-party agreement gate
 |----------------------------------------------------------*/

const PARTY_ORDER: PartyKey[] = ["creator", "fleet", "origin", "destination"];

const STANCE_META: Record<
    PartyAgreement["status"],
    { color: ChipProps["color"]; icon: string }
> = {
    created: { color: "success", icon: "✓" },
    accepted: { color: "success", icon: "✓" },
    rescheduled: { color: "warning", icon: "↻" },
    pending: { color: "default", icon: "…" },
};

/** A proposed window, rendered the way people say times out loud. */
export function formatWindow(value: string | null | undefined): string {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    });
}

function partyHasAgreed(agreement: PartyAgreement): boolean {
    return agreement.status === "accepted" || agreement.status === "created";
}

/**
 * The proposed delivery windows, who has accepted which, and the viewer's own
 * accept / prefer-another action.
 *
 * Every detail screen — Delivery, StockKeeper and Admin — showed the route, the
 * load, the manifest and the timeline, and nothing at all about the schedule
 * everyone was supposed to be agreeing on. `present()` had been sending
 * `schedule_options`, `agreements` and `outstanding_parties` the whole time and
 * no screen read them, so the only place a driver could accept a window was a
 * modal buried behind a tile on the index card. A run that nobody could agree to
 * is a run that never moves, which is what made it look like shipments were not
 * reaching delivery at all.
 */
export function AgreementPanel({
    shipment,
    agreeRoute,
}: {
    shipment: Shipment;
    /** Route name for POST {party, slot, stance}, e.g. `delivery.shipments.agree`. */
    agreeRoute: string;
}): React.ReactElement | null {
    const windows = shipment.schedule_options ?? [];
    const mine = shipment.actionable_parties ?? [];
    const agreements = shipment.agreements;

    // Nothing to show before a schedule has been proposed.
    if (!agreements || windows.length === 0) return null;

    const settled = shipment.agreed_scheduled_for;
    const [party, setParty] = React.useState<PartyKey>(mine[0] ?? "creator");
    const [slot, setSlot] = React.useState<string>(
        settled ?? agreements[mine[0] ?? "creator"]?.agreed_time ?? windows[0],
    );
    const [submitting, setSubmitting] = React.useState(false);

    // The gate closes once the run is scheduled; after that these are a record.
    const open = shipment.status === "draft" || shipment.status === "pending_agreement";
    const canAct = open && mine.length > 0;

    const submit = (stance: "accepted" | "rescheduled") => {
        setSubmitting(true);
        router.post(
            route(agreeRoute, shipment.id),
            { party, slot, stance },
            { preserveScroll: true, onFinish: () => setSubmitting(false) },
        );
    };

    return (
        <ShipmentCard>
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
            >
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Delivery window
                </Typography>
                <Chip
                    size="small"
                    label={
                        settled
                            ? `Agreed · ${formatWindow(settled)}`
                            : `${4 - (shipment.outstanding_parties?.length ?? 4)}/4 agreed`
                    }
                    color={settled ? "success" : "warning"}
                    sx={{ fontWeight: 700 }}
                />
            </Stack>

            {/* Who has accepted what. A party is only "agreed" on a specific
                window, so the window is shown next to the tick — four
                acceptances on three different times is not a consensus. */}
            <Stack spacing={1} sx={{ mb: 2 }}>
                {PARTY_ORDER.filter((key) => agreements[key]).map((key) => {
                    const agreement = agreements[key];
                    const meta = STANCE_META[agreement.status] ?? STANCE_META.pending;

                    return (
                        <Stack
                            key={key}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            sx={{
                                p: 1.25,
                                borderRadius: 1.5,
                                bgcolor: partyHasAgreed(agreement)
                                    ? "success.50"
                                    : "action.hover",
                                border: 1,
                                borderColor: partyHasAgreed(agreement)
                                    ? "success.light"
                                    : "divider",
                            }}
                        >
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                    {agreement.title} · {agreement.party}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                    {agreement.detail}
                                </Typography>
                            </Box>
                            <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
                                <Chip
                                    size="small"
                                    label={`${meta.icon} ${agreement.status_label}`}
                                    color={meta.color}
                                    variant={partyHasAgreed(agreement) ? "filled" : "outlined"}
                                    sx={{ fontWeight: 700 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                    {formatWindow(agreement.agreed_time)}
                                </Typography>
                            </Stack>
                        </Stack>
                    );
                })}
            </Stack>

            <Divider sx={{ mb: 2 }} />

            <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
                {windows.length === 1 ? "Proposed window" : `Proposed windows (${windows.length})`}
            </Typography>

            <ToggleButtonGroup
                value={slot}
                exclusive
                onChange={(_, next) => next && setSlot(next)}
                orientation="vertical"
                fullWidth
                disabled={!canAct}
                sx={{ mt: 1, mb: canAct ? 2 : 0 }}
            >
                {windows.map((option) => (
                    <ToggleButton
                        key={option}
                        value={option}
                        sx={{ justifyContent: "space-between", textTransform: "none", py: 1 }}
                    >
                        <span>{formatWindow(option)}</span>
                        {option === settled ? (
                            <Chip size="small" label="Agreed" color="success" />
                        ) : null}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            {windows.length === 1 && canAct ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Only one window was proposed, so there is no alternative to choose. Ask the
                    creator to offer more if this time does not work.
                </Alert>
            ) : null}

            {canAct ? (
                <>
                    {/* A user can be a party in more than one seat — an admin is
                        all four, a keeper covering both docks is two. */}
                    {mine.length > 1 ? (
                        <ToggleButtonGroup
                            value={party}
                            exclusive
                            size="small"
                            onChange={(_, next) => next && setParty(next)}
                            sx={{ mb: 2 }}
                        >
                            {mine.map((key) => (
                                <ToggleButton key={key} value={key} sx={{ textTransform: "none" }}>
                                    {agreements[key]?.title ?? key}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    ) : null}

                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="contained"
                            fullWidth
                            disabled={submitting}
                            onClick={() => submit("accepted")}
                        >
                            Accept {formatWindow(slot)}
                        </Button>
                        <Tooltip title="Records that this window does not suit you, without accepting it">
                            <Button
                                variant="outlined"
                                color="warning"
                                disabled={submitting}
                                onClick={() => submit("rescheduled")}
                                sx={{ whiteSpace: "nowrap" }}
                            >
                                Can't make it
                            </Button>
                        </Tooltip>
                    </Stack>
                </>
            ) : (
                <Alert severity={settled ? "success" : "info"} sx={{ mt: 2 }}>
                    {settled
                        ? `All parties agreed on ${formatWindow(settled)}.`
                        : mine.length === 0
                        ? "You are not a party to this run's schedule."
                        : "The schedule is fixed once the run leaves the agreement stage."}
                </Alert>
            )}
        </ShipmentCard>
    );
}
