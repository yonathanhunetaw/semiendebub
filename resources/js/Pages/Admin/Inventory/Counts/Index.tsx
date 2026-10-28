import AdminLayout from "@/Layouts/AppLayout";
import { shopZone } from "@/utils/dates";
import { Head, router } from "@inertiajs/react";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from "@mui/material";
import React, { useState } from "react";

interface CountLine {
    id: number;
    name: string;
    variant: string;
    sku: string | null;
    unit: string;
    expected: number;
    counted: number | null;
    variance: number | null;
}

interface Count {
    id: number;
    reference: string;
    note: string | null;
    location: { id: number; name: string; kind: string };
    started_by: string | null;
    submitted_by: string | null;
    submitted_at: string | null;
    totals: { lines: number; counted: number; matching: number; over: number; short: number };
    can_approve: boolean;
    lines: CountLine[];
}

interface Props {
    counts?: Count[];
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { timeZone: shopZone(), day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Stocktakes a keeper has submitted, waiting for a second person. Approving books each
 * counted line's difference into the ledger; lines nobody counted are left alone. The
 * keeper who submitted a count cannot approve it, so in a store with one keeper this is
 * the only place it can be approved.
 */
export default function CountApprovals({ counts = [] }: Props) {
    const [approving, setApproving] = useState<Count | null>(null);
    const [busy, setBusy] = useState(false);

    const approve = () => {
        if (!approving) return;
        setBusy(true);
        router.post(route("admin.inventory.counts.approve", approving.id), {}, {
            preserveScroll: true,
            onFinish: () => {
                setBusy(false);
                setApproving(null);
            },
        });
    };

    return (
        <>
            <Head title="Counts to approve" />
            <Box sx={{ mb: 2 }}>
                <Typography variant="h5" fontWeight={800}>Counts to approve</Typography>
                <Typography variant="body2" color="text.secondary">
                    Stocktakes a keeper has submitted. Someone other than the person who submitted a count approves it, and the differences are booked.
                </Typography>
            </Box>

            {counts.length === 0 ? (
                <Alert severity="success" icon={<FactCheckIcon />}>No count is waiting for approval.</Alert>
            ) : (
                <Stack spacing={2}>
                    {counts.map((count) => {
                        const differences = count.totals.over + count.totals.short;
                        const off = count.lines.filter((line) => line.variance !== null && line.variance !== 0);

                        return (
                            <Paper key={count.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }} data-testid={`count-${count.reference}`}>
                                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography fontWeight={800}>{count.location.name}</Typography>
                                        <Typography variant="caption" sx={{ fontFamily: "monospace" }} color="text.secondary">{count.reference}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Submitted by {count.submitted_by ?? "—"} · {when(count.submitted_at)}
                                            {count.note ? ` · ${count.note}` : ""}
                                        </Typography>
                                    </Box>
                                    <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
                                        <Chip size="small" label={`${count.totals.counted} of ${count.totals.lines} counted`} />
                                        <Chip size="small" color={count.totals.short > 0 ? "error" : "default"} label={`${count.totals.short} short`} />
                                        <Chip size="small" color={count.totals.over > 0 ? "info" : "default"} label={`${count.totals.over} over`} />
                                    </Stack>
                                </Stack>

                                {off.length > 0 && (
                                    <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 1.5, borderTop: 1, borderColor: "divider" }}>
                                        {off.map((line) => (
                                            <Stack component="li" key={line.id} direction="row" justifyContent="space-between" spacing={1} sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography variant="body2" fontWeight={700} noWrap>{line.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                                        {line.sku ?? "—"}{line.variant ? ` · ${line.variant}` : ""}
                                                    </Typography>
                                                </Box>
                                                <Typography variant="body2" sx={{ whiteSpace: "nowrap", fontWeight: 800, color: (line.variance ?? 0) < 0 ? "error.main" : "info.main" }}>
                                                    {line.expected} → {line.counted} ({(line.variance ?? 0) > 0 ? "+" : ""}{line.variance} {line.unit})
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Box>
                                )}

                                <Box sx={{ mt: 1.5, display: "flex", justifyContent: "flex-end" }}>
                                    {count.can_approve ? (
                                        <Button variant="contained" color="success" onClick={() => setApproving(count)}>
                                            Approve and book {differences} difference{differences === 1 ? "" : "s"}
                                        </Button>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">You submitted this count; someone else approves it.</Typography>
                                    )}
                                </Box>
                            </Paper>
                        );
                    })}
                </Stack>
            )}

            <Dialog open={approving !== null} onClose={() => setApproving(null)}>
                <DialogTitle>Approve {approving?.reference}?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        The ledger at {approving?.location.name} moves to what was counted on {approving ? approving.totals.over + approving.totals.short : 0} line(s). This cannot be undone here.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApproving(null)}>Not now</Button>
                    <Button variant="contained" color="success" onClick={approve} disabled={busy}>Yes, approve</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

CountApprovals.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
