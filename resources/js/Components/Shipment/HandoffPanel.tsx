import { router } from "@inertiajs/react";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DrawRoundedIcon from "@mui/icons-material/DrawRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Paper,
    Stack,
    TextField,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import React from "react";

import SignaturePad from "@/Components/Shipment/SignaturePad";
import type { HandoffLine, HandoffStep, ShipmentHandoff } from "@/types/shipment";

interface Props {
    shipmentId: number;
    reference: string;
    handoff: ShipmentHandoff;
    lines: HandoffLine[];
    /** Route name for POST /shipments/{shipment}/steps/{step}, e.g. `delivery.shipments.step`. */
    stepRoute: string;
    /** Names for the two ends, for the step copy. */
    originName: string;
    destinationName: string;
}

type Phase = "done" | "current" | "todo";

const when = (value: string | null): string | null =>
    value
        ? new Date(value).toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
          })
        : null;

/**
 * Everything after the four parties agree, in one place for every role.
 *
 *   Origin      pick → prepare in the pickup bay
 *   Driver      start trip → check the load → sign (en route) → arrive
 *   Destination check the goods → sign (finished)
 *
 * The server says which steps the viewer may take (`available_steps`), so a
 * driver only ever sees driver buttons and a keeper only theirs. Everyone sees
 * the same progress.
 */
export default function HandoffPanel({
    shipmentId,
    reference,
    handoff,
    lines,
    stepRoute,
    originName,
    destinationName,
}: Props): React.ReactElement {
    const theme = useTheme();
    const [busy, setBusy] = React.useState<HandoffStep | null>(null);
    const [checking, setChecking] = React.useState<"courier_check" | "receiver_check" | null>(null);
    const [signing, setSigning] = React.useState<"courier_sign" | "receiver_sign" | null>(null);
    const [bay, setBay] = React.useState(handoff.preparation.bay ?? "");

    const can = (step: HandoffStep) => handoff.available_steps.includes(step);
    const t = handoff.times;
    const prep = handoff.preparation;

    const post = (step: HandoffStep, payload: Record<string, unknown> = {}, onSuccess?: () => void) => {
        setBusy(step);
        router.post(route(stepRoute, [shipmentId, step]), payload as Record<string, never>, {
            preserveScroll: true,
            onSuccess,
            onFinish: () => setBusy(null),
        });
    };

    // Four phases, each done / current / still to come.
    const phaseOf = (done: boolean, started: boolean): Phase => (done ? "done" : started ? "current" : "todo");
    const prepPhase = phaseOf(Boolean(t.prepared), true);
    // The driver may set off while the origin is still picking.
    const pickupPhase = phaseOf(
        Boolean(t.courier_signed),
        Boolean(t.prepared) || Boolean(t.courier_started) || can("courier_start"),
    );
    const roadPhase = phaseOf(Boolean(t.arrived), Boolean(t.courier_signed));
    const receivePhase = phaseOf(Boolean(t.received), Boolean(t.arrived));

    const overall = [prepPhase, pickupPhase, roadPhase, receivePhase].filter((p) => p === "done").length;

    return (
        <Paper
            elevation={0}
            sx={{
                borderRadius: 4,
                border: 1,
                borderColor: "divider",
                overflow: "hidden",
                backgroundImage: "none",
            }}
        >
            {/* Header: where the whole run stands */}
            <Box
                sx={{
                    p: 2.5,
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.14)}, ${alpha(theme.palette.primary.main, 0.02)})`,
                }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: 1 }}>
                            Hand-off · {reference}
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                            {STAGE_COPY[handoff.stage] ?? "In progress"}
                        </Typography>
                    </Box>
                    <Chip
                        icon={t.received ? <CheckCircleRoundedIcon /> : <ScheduleRoundedIcon />}
                        label={t.received ? "Finished" : `${overall}/4`}
                        color={t.received ? "success" : "primary"}
                        sx={{ fontWeight: 800 }}
                    />
                </Stack>
                <LinearProgress
                    variant="determinate"
                    value={(overall / 4) * 100}
                    sx={{ mt: 1.5, height: 6, borderRadius: 3 }}
                />
                {t.scheduled_for ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                        Agreed window: <strong>{when(t.scheduled_for)}</strong>
                    </Typography>
                ) : null}
            </Box>

            <Stack spacing={0} sx={{ p: { xs: 1.5, sm: 2.5 } }}>
                {/* 1. Origin preparation */}
                <PhaseRow
                    phase={prepPhase}
                    icon={<Inventory2RoundedIcon fontSize="small" />}
                    title="Preparation at the origin"
                    subtitle={originName}
                >
                    <Stack spacing={1.25}>
                        <Box>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {t.prepared
                                        ? `Prepared${prep.bay ? ` · bay ${prep.bay}` : ""}`
                                        : t.picking_started
                                          ? "Picking in progress"
                                          : "Waiting for the keeper to start picking"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                                    {prep.lines_picked}/{prep.lines} lines · {prep.percent}%
                                </Typography>
                            </Stack>
                            <LinearProgress
                                variant="determinate"
                                value={prep.percent}
                                color={t.prepared ? "success" : "primary"}
                                sx={{ height: 10, borderRadius: 5 }}
                            />
                        </Box>
                        <Meta label="Picking started" value={when(t.picking_started)} />
                        <Meta
                            label="Prepared for pickup"
                            value={when(t.prepared)}
                            by={handoff.people.prepared_by}
                        />

                        {can("start_picking") ? (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<Inventory2RoundedIcon />}
                                disabled={busy !== null}
                                onClick={() => post("start_picking")}
                            >
                                Step 1 · Start picking
                            </Button>
                        ) : null}

                        {can("pick_line") ? (
                            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
                                <Typography variant="caption" sx={{ display: "block", px: 2, pt: 1.5, fontWeight: 800, color: "text.secondary" }}>
                                    STEP 1 · TICK EACH LINE AS YOU PICK IT
                                </Typography>
                                <List dense disablePadding>
                                    {lines.map((line) => {
                                        const picked = line.picked_quantity >= line.quantity;
                                        return (
                                            <ListItemButton
                                                key={line.variant_id}
                                                disabled={busy !== null}
                                                onClick={() => post("pick_line", { variant_id: line.variant_id, picked: !picked })}
                                            >
                                                <ListItemIcon sx={{ minWidth: 40 }}>
                                                    <Checkbox edge="start" checked={picked} tabIndex={-1} disableRipple />
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={line.name}
                                                    secondary={line.sku ?? undefined}
                                                    slotProps={{
                                                        primary: { sx: { fontWeight: 700, textDecoration: picked ? "line-through" : "none" } },
                                                    }}
                                                />
                                                <Typography variant="body2" sx={{ fontWeight: 800, ml: 1, whiteSpace: "nowrap" }}>
                                                    {line.quantity} {line.unit ?? ""}
                                                </Typography>
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            </Paper>
                        ) : null}

                        {can("pick_line") || can("prepared") ? (
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                <TextField
                                    size="small"
                                    label="Pickup bay"
                                    placeholder="e.g. Dock 2"
                                    value={bay}
                                    onChange={(e) => setBay(e.target.value)}
                                    sx={{ flex: 1 }}
                                />
                                <Button
                                    variant="contained"
                                    color="success"
                                    startIcon={<MoveToInboxRoundedIcon />}
                                    disabled={!can("prepared") || busy !== null}
                                    onClick={() => post("prepared", { bay })}
                                >
                                    Step 2 · Mark prepared
                                </Button>
                            </Stack>
                        ) : null}
                    </Stack>
                </PhaseRow>

                {/* 2. Driver pickup */}
                <PhaseRow
                    phase={pickupPhase}
                    icon={<LocalShippingRoundedIcon fontSize="small" />}
                    title="Driver pickup"
                    subtitle={handoff.people.courier ?? "Driver"}
                >
                    <Stack spacing={1.25}>
                        <Meta label="Trip started" value={when(t.courier_started)} />
                        <Meta label="Load checked" value={when(t.courier_checked)} />
                        <Meta label="Signed for the load" value={when(t.courier_signed)} by={handoff.people.courier} />
                        {handoff.signatures.courier ? <SignatureThumb src={handoff.signatures.courier} /> : null}

                        {t.courier_started && !t.prepared ? (
                            <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                On the way. The origin is preparing the load — {prep.percent}% picked.
                            </Alert>
                        ) : null}

                        {can("courier_start") ? (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<LocalShippingRoundedIcon />}
                                disabled={busy !== null}
                                onClick={() => post("courier_start")}
                            >
                                Start trip to {originName}
                            </Button>
                        ) : null}
                        {can("courier_check") ? (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<AssignmentTurnedInRoundedIcon />}
                                onClick={() => setChecking("courier_check")}
                            >
                                Step 1 · Check the load
                            </Button>
                        ) : null}
                        {can("courier_sign") ? (
                            <Button
                                variant="contained"
                                color="success"
                                size="large"
                                startIcon={<DrawRoundedIcon />}
                                onClick={() => setSigning("courier_sign")}
                            >
                                Step 2 · Sign & take the load
                            </Button>
                        ) : null}
                    </Stack>
                </PhaseRow>

                {/* 3. On the road */}
                <PhaseRow
                    phase={roadPhase}
                    icon={<PlaceRoundedIcon fontSize="small" />}
                    title="En route"
                    subtitle={`To ${destinationName}`}
                >
                    <Stack spacing={1.25}>
                        <Meta label="Left the origin" value={when(t.courier_signed)} />
                        <Meta label="Arrived" value={when(t.arrived)} />
                        {can("courier_arrive") ? (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<FlagRoundedIcon />}
                                disabled={busy !== null}
                                onClick={() => post("courier_arrive")}
                            >
                                Arrived at {destinationName}
                            </Button>
                        ) : null}
                    </Stack>
                </PhaseRow>

                {/* 4. Receiving */}
                <PhaseRow
                    phase={receivePhase}
                    icon={<MoveToInboxRoundedIcon fontSize="small" />}
                    title="Receiving"
                    subtitle={destinationName}
                    last
                >
                    <Stack spacing={1.25}>
                        <Meta label="Goods checked" value={when(t.receiver_checked)} />
                        <Meta label="Signed in" value={when(t.received)} by={handoff.people.received_by} />
                        {handoff.signatures.receiver ? <SignatureThumb src={handoff.signatures.receiver} /> : null}
                        {can("receiver_check") ? (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<AssignmentTurnedInRoundedIcon />}
                                onClick={() => setChecking("receiver_check")}
                            >
                                Step 1 · Check the goods
                            </Button>
                        ) : null}
                        {can("receiver_sign") ? (
                            <Button
                                variant="contained"
                                color="success"
                                size="large"
                                startIcon={<DrawRoundedIcon />}
                                onClick={() => setSigning("receiver_sign")}
                            >
                                Step 2 · Sign & receive
                            </Button>
                        ) : null}
                        {t.received ? (
                            <Alert severity="success" icon={<CheckCircleRoundedIcon />} sx={{ borderRadius: 2 }}>
                                Shipment finished — stock is on {destinationName}&apos;s books.
                            </Alert>
                        ) : null}
                    </Stack>
                </PhaseRow>
            </Stack>

            <CheckDialog
                open={checking !== null}
                title={checking === "courier_check" ? "Check the load" : "Check the goods"}
                hint={
                    checking === "courier_check"
                        ? "Count each line in the pickup bay before you take it."
                        : "Count each line the driver brought before you sign it in."
                }
                lines={lines}
                busy={busy !== null}
                onClose={() => setChecking(null)}
                onConfirm={() => checking && post(checking, {}, () => setChecking(null))}
            />

            <SignDialog
                open={signing !== null}
                title={signing === "courier_sign" ? "Sign for the load" : "Sign the goods in"}
                hint={
                    signing === "courier_sign"
                        ? `By signing you take ${reference} from ${originName}. It goes en route.`
                        : `By signing you receive ${reference} at ${destinationName}. The shipment is finished.`
                }
                busy={busy !== null}
                onClose={() => setSigning(null)}
                onSign={(signature) => signing && post(signing, { signature }, () => setSigning(null))}
            />
        </Paper>
    );
}

const STAGE_COPY: Record<string, string> = {
    awaiting_picking: "Scheduled — waiting for picking",
    picking: "Origin is picking",
    prepared: "Prepared — waiting for the driver",
    driver_on_way: "Driver on the way to pickup",
    driver_checked: "Driver checked the load",
    en_route: "En route",
    arrived: "Arrived — receiving dock to check",
    receiver_checked: "Checked — waiting for signature",
    finished: "Finished",
};

function PhaseRow({
    phase,
    icon,
    title,
    subtitle,
    children,
    last = false,
}: {
    phase: Phase;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    last?: boolean;
}): React.ReactElement {
    const color = phase === "done" ? "success.main" : phase === "current" ? "primary.main" : "text.disabled";

    return (
        <Stack direction="row" spacing={1.75}>
            <Stack alignItems="center" sx={{ pt: 0.25 }}>
                <Avatar
                    sx={{
                        width: 34,
                        height: 34,
                        bgcolor: phase === "todo" ? "action.hover" : color,
                        color: phase === "todo" ? "text.disabled" : "common.white",
                    }}
                >
                    {phase === "done" ? <CheckCircleRoundedIcon fontSize="small" /> : icon}
                </Avatar>
                {!last ? (
                    <Box sx={{ flex: 1, width: 2, my: 0.5, bgcolor: phase === "done" ? "success.light" : "divider", minHeight: 16 }} />
                ) : null}
            </Stack>
            <Box sx={{ flex: 1, minWidth: 0, pb: last ? 0 : 2.5 }}>
                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: phase === "todo" ? 0 : 1.25 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: phase === "todo" ? "text.secondary" : "text.primary" }}>
                        {title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                        {subtitle}
                    </Typography>
                </Stack>
                {phase !== "todo" ? children : null}
            </Box>
        </Stack>
    );
}

function Meta({ label, value, by }: { label: string; value: string | null; by?: string | null }): React.ReactElement {
    return (
        <Stack direction="row" spacing={1} alignItems="center">
            {value ? (
                <CheckCircleRoundedIcon sx={{ fontSize: 16, color: "success.main" }} />
            ) : (
                <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            )}
            <Typography variant="body2" sx={{ fontWeight: 600, color: value ? "text.primary" : "text.secondary" }}>
                {label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: "auto !important", textAlign: "right" }}>
                {value ?? "—"}
                {value && by ? ` · ${by}` : ""}
            </Typography>
        </Stack>
    );
}

function SignatureThumb({ src }: { src: string }): React.ReactElement {
    return (
        <Box
            component="img"
            src={src}
            alt="Signature"
            sx={{ width: "100%", maxWidth: 260, height: 72, objectFit: "contain", bgcolor: "#fff", borderRadius: 2, border: 1, borderColor: "divider" }}
        />
    );
}

function CheckDialog({
    open,
    title,
    hint,
    lines,
    busy,
    onClose,
    onConfirm,
}: {
    open: boolean;
    title: string;
    hint: string;
    lines: HandoffLine[];
    busy: boolean;
    onClose: () => void;
    onConfirm: () => void;
}): React.ReactElement {
    const [ticked, setTicked] = React.useState<number[]>([]);

    React.useEffect(() => {
        if (open) setTicked([]);
    }, [open]);

    const all = lines.length > 0 && ticked.length === lines.length;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 1.5 }}>
                    {hint}
                </Typography>
                <List dense disablePadding>
                    {lines.map((line) => {
                        const on = ticked.includes(line.variant_id);
                        return (
                            <ListItem key={line.variant_id} disablePadding>
                                <ListItemButton
                                    onClick={() =>
                                        setTicked((ids) => (on ? ids.filter((id) => id !== line.variant_id) : [...ids, line.variant_id]))
                                    }
                                >
                                    <ListItemIcon sx={{ minWidth: 40 }}>
                                        <Checkbox edge="start" checked={on} tabIndex={-1} disableRipple />
                                    </ListItemIcon>
                                    <ListItemText primary={line.name} secondary={line.sku ?? undefined} slotProps={{ primary: { sx: { fontWeight: 700 } } }} />
                                    <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                                        {line.quantity} {line.unit ?? ""}
                                    </Typography>
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
                    {ticked.length}/{lines.length} counted
                </Typography>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!all || busy} onClick={onConfirm}>
                    All counted
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function SignDialog({
    open,
    title,
    hint,
    busy,
    onClose,
    onSign,
}: {
    open: boolean;
    title: string;
    hint: string;
    busy: boolean;
    onClose: () => void;
    onSign: (signature: string) => void;
}): React.ReactElement {
    const [signature, setSignature] = React.useState<string | null>(null);
    const handleChange = React.useCallback((value: string | null) => setSignature(value), []);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {hint}
                </Typography>
                {open ? <SignaturePad onChange={handleChange} /> : null}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    color="success"
                    startIcon={<DrawRoundedIcon />}
                    disabled={!signature || busy}
                    onClick={() => signature && onSign(signature)}
                >
                    Sign
                </Button>
            </DialogActions>
        </Dialog>
    );
}
