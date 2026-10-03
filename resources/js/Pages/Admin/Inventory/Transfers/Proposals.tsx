import AdminLayout from "@/Layouts/AppLayout";
import type { ReplenishmentProposal, ShipmentCandidate } from "@/types/capacity";
import { Head, Link, router } from "@inertiajs/react";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Grid,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React, { useState } from "react";

interface Props {
    proposals?: ReplenishmentProposal[];
    shipment_candidates?: ShipmentCandidate[];
    filters: { store_id: number | null };
    can_approve: boolean;
    counts: {
        awaiting_approval: number;
        approved_today: number;
        rejected_today: number;
    };
}

/**
 * The store manager's approval gate.
 *
 * Everything the capacity planner raises lands here and nowhere else. It is
 * deliberately absent from the active transfers board, because an unapproved
 * suggestion is not work the floor should pick up — the dispatch endpoint
 * refuses it too, so the gate holds whether or not this screen is used.
 *
 * Approving admits a proposal to the active transfer list, at the quantity the
 * manager confirms. Rejecting cancels it with a reason, which is kept so the
 * next sweep's identical suggestion can be read in context.
 */
export default function ReplenishmentProposals({
    proposals = [],
    shipment_candidates = [],
    can_approve,
    counts,
}: Props) {
    const [approving, setApproving] = useState<ReplenishmentProposal | null>(null);
    const [approveQuantity, setApproveQuantity] = useState<string>("");
    const [rejecting, setRejecting] = useState<ReplenishmentProposal | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);

    const openApprove = (proposal: ReplenishmentProposal) => {
        setApproveQuantity(String(proposal.quantity));
        setApproving(proposal);
    };

    const confirmApprove = () => {
        if (!approving) return;

        setBusy(true);
        router.post(
            route("admin.inventory.replenishment.approve", approving.id),
            { quantity: Number(approveQuantity) || approving.quantity },
            {
                preserveScroll: true,
                onFinish: () => {
                    setBusy(false);
                    setApproving(null);
                },
            },
        );
    };

    const confirmReject = () => {
        if (!rejecting) return;

        setBusy(true);
        router.post(
            route("admin.inventory.replenishment.reject", rejecting.id),
            { reason },
            {
                preserveScroll: true,
                onFinish: () => {
                    setBusy(false);
                    setRejecting(null);
                    setReason("");
                },
            },
        );
    };

    const summary = [
        { label: "Awaiting approval", value: counts.awaiting_approval, icon: <PendingActionsIcon />, color: "warning.main" },
        { label: "Approved today", value: counts.approved_today, icon: <CheckCircleIcon />, color: "success.main" },
        { label: "Rejected today", value: counts.rejected_today, icon: <CloseIcon />, color: "error.main" },
    ];

    return (
        <>
            <Head title="Replenishment approvals" />

            <Box sx={{ p: { xs: 2, md: 3 } }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    justifyContent="space-between"
                    alignItems={{ md: "center" }}
                    spacing={2}
                    sx={{ mb: 3 }}
                >
                    <Box>
                        <Typography variant="h5" fontWeight={800}>
                            Replenishment approvals
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Transfers the capacity planner proposed because a location reached
                            its minimum. None of them can be dispatched until approved here.
                        </Typography>
                    </Box>

                    <Button
                        component={Link}
                        href={route("admin.inventory.transfers")}
                        variant="outlined"
                        endIcon={<ArrowForwardIcon />}
                    >
                        Active transfers
                    </Button>
                </Stack>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {summary.map((tile) => (
                        <Grid size={{ xs: 12, sm: 4 }} key={tile.label}>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <Box sx={{ color: tile.color, display: "flex" }}>{tile.icon}</Box>
                                    <Box>
                                        <Typography variant="h6" fontWeight={800}>
                                            {tile.value}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {tile.label}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                {!can_approve && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        You can review these proposals but not rule on them. Approval belongs
                        to the destination&rsquo;s store manager, or an admin.
                    </Alert>
                )}

                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Reference</TableCell>
                                <TableCell>Product</TableCell>
                                <TableCell>Route</TableCell>
                                <TableCell align="center">Why</TableCell>
                                <TableCell align="right">Proposed</TableCell>
                                <TableCell align="right">Decision</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {proposals.map((proposal) => (
                                <TableRow key={proposal.id} hover>
                                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                                        {proposal.reference}
                                        <Chip
                                            size="small"
                                            label="Proposed"
                                            color="warning"
                                            sx={{ ml: 1 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600}>
                                            {proposal.product_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {proposal.variant_label}
                                            {proposal.sku ? ` · ${proposal.sku}` : ""}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography variant="caption">
                                                {proposal.source
                                                    ? `${proposal.source.label} · ${proposal.source.name}`
                                                    : (proposal.from_store ?? "—")}
                                            </Typography>
                                            <ArrowForwardIcon sx={{ fontSize: 14 }} />
                                            <Typography variant="caption" fontWeight={700}>
                                                {proposal.destination
                                                    ? `${proposal.destination.label} · ${proposal.destination.name}`
                                                    : (proposal.to_store ?? "—")}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={proposal.notes ?? ""}>
                                            <Typography variant="caption">
                                                {proposal.observed_quantity ?? "?"} on hand · min{" "}
                                                {proposal.min_capacity ?? "?"} · max{" "}
                                                {proposal.max_capacity ?? "?"}
                                            </Typography>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {proposal.quantity}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <Button
                                                size="small"
                                                variant="contained"
                                                color="success"
                                                disabled={!can_approve}
                                                onClick={() => openApprove(proposal)}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                disabled={!can_approve}
                                                onClick={() => setRejecting(proposal)}
                                            >
                                                Reject
                                            </Button>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}

                            {proposals.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Nothing is waiting on a decision. Every monitored
                                            location is above its minimum.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Shortfalls the Transfer domain cannot express. */}
                {shipment_candidates.length > 0 && (
                    <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <LocalShippingIcon color="info" />
                            <Typography variant="subtitle1" fontWeight={700}>
                                Needs a shipment, not a transfer
                            </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            These shortfalls could only be filled from another warehouse, which
                            makes them bulk freight. No transfer has been raised for them — use
                            the shipment builder.
                        </Typography>

                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Product</TableCell>
                                    <TableCell>Route</TableCell>
                                    <TableCell align="right">On hand</TableCell>
                                    <TableCell align="right">Short by</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {shipment_candidates.map((candidate, index) => (
                                    <TableRow key={`${candidate.sku}-${index}`}>
                                        <TableCell>
                                            {candidate.product_name ?? "Unknown product"}
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {candidate.sku ?? "—"}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {candidate.source} → {candidate.destination}
                                        </TableCell>
                                        <TableCell align="right">{candidate.on_hand}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {candidate.shortfall}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <Button
                            component={Link}
                            href={route("admin.inventory.shipments.index")}
                            size="small"
                            sx={{ mt: 2 }}
                            endIcon={<ArrowForwardIcon />}
                        >
                            Open shipments
                        </Button>
                    </Paper>
                )}
            </Box>

            {/* ── Approve ── */}
            <Dialog open={approving !== null} onClose={() => setApproving(null)} fullWidth maxWidth="xs">
                <DialogTitle>Approve {approving?.reference}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        {approving?.notes}
                    </DialogContentText>
                    <TextField
                        label="Quantity to approve"
                        type="number"
                        fullWidth
                        size="small"
                        value={approveQuantity}
                        onChange={(event) => setApproveQuantity(event.target.value)}
                        inputProps={{ min: 1 }}
                        helperText="Adjust if less will fit than the planner proposed."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApproving(null)}>Cancel</Button>
                    <Button variant="contained" color="success" onClick={confirmApprove} disabled={busy}>
                        Approve and queue
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── Reject ── */}
            <Dialog open={rejecting !== null} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
                <DialogTitle>Reject {rejecting?.reference}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        The proposal is cancelled with this reason against it, so the next
                        sweep&rsquo;s suggestion can be read in context.
                    </DialogContentText>
                    <TextField
                        label="Reason"
                        fullWidth
                        size="small"
                        multiline
                        minRows={2}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejecting(null)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmReject}
                        disabled={busy || reason.trim().length < 3}
                    >
                        Reject proposal
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

ReplenishmentProposals.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
