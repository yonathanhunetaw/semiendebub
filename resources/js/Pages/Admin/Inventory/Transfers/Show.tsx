import AdminLayout from "@/Layouts/AppLayout";
import type { TransferRow } from "@/types/stockkeeper";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import React, { useState } from "react";

interface JournalRow {
    id: number;
    type: string;
    quantity: number;
    balance_after: number | null;
    location: string | null;
    reason: string | null;
    by: string | null;
    at: string | null;
}

interface Props {
    transfer: TransferRow & { courier_id?: number | null };
    journal?: JournalRow[];
    couriers?: Array<{ id: number; name: string }>;
}

/** What each journal verb means for a transfer. */
const VERB: Record<string, string> = {
    move_out: "Left the origin",
    custody_in: "Handed to the courier",
    custody_out: "Courier handed it on",
    move_in: "Arrived at the destination",
    return: "Back at the origin",
};

/**
 * One transfer: its route, its courier, the actions its stage allows, and every
 * stock movement it has made — the custody journal.
 */
export default function TransferShow({ transfer, journal = [], couriers = [] }: Props): React.ReactElement {
    const [courierId, setCourierId] = useState<number | "">(transfer.courier_id ?? "");

    const act = (name: string): void => {
        router.patch(route(name, transfer.id), {}, { preserveScroll: true });
    };

    return (
        <>
            <Head title={`Transfer ${transfer.reference}`} />
            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: "auto" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: "monospace" }}>
                            {transfer.reference}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {transfer.product_name} · {transfer.quantity.toLocaleString()} units
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={transfer.status.replace("_", " ")} />
                        <Button component={Link} href={route("admin.inventory.transfers")}>
                            All transfers
                        </Button>
                    </Stack>
                </Stack>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                        {transfer.source_label ?? transfer.from_store ?? "—"} → {transfer.destination_label ?? transfer.to_store ?? "—"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {transfer.needs_courier
                            ? transfer.courier
                                ? `Carried by ${transfer.courier}`
                                : "Leaves its site — a courier must carry it"
                            : "Within one store — staff carry it across"}
                    </Typography>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ sm: "center" }}>
                        {transfer.needs_courier && transfer.status === "pending" ? (
                            <>
                                <TextField
                                    select
                                    size="small"
                                    label="Courier"
                                    value={courierId}
                                    onChange={(event) => setCourierId(event.target.value === "" ? "" : Number(event.target.value))}
                                    sx={{ minWidth: 220 }}
                                >
                                    {couriers.map((courier) => (
                                        <MenuItem key={courier.id} value={courier.id}>
                                            {courier.name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <Button
                                    variant="outlined"
                                    disabled={courierId === "" || courierId === transfer.courier_id}
                                    onClick={() =>
                                        router.patch(route("admin.inventory.transfers.courier", transfer.id), { courier_id: courierId }, { preserveScroll: true })
                                    }
                                >
                                    Assign courier
                                </Button>
                            </>
                        ) : null}
                        {transfer.status === "pending" ? (
                            <Button
                                variant="contained"
                                disabled={Boolean(transfer.needs_courier && !transfer.courier)}
                                onClick={() => act("admin.inventory.transfers.dispatch")}
                            >
                                {transfer.needs_courier ? "Hand to courier" : "Dispatch"}
                            </Button>
                        ) : null}
                        {transfer.status === "in_transit" ? (
                            <Button variant="contained" color="success" onClick={() => act("admin.inventory.transfers.complete")}>
                                Received at destination
                            </Button>
                        ) : null}
                        {["pending", "in_transit"].includes(transfer.status) ? (
                            <Button
                                color="error"
                                onClick={() => {
                                    if (window.confirm(`Cancel ${transfer.reference}?`)) act("admin.inventory.transfers.cancel");
                                }}
                            >
                                Cancel
                            </Button>
                        ) : null}
                    </Stack>
                </Paper>

                <Typography variant="overline" color="text.secondary">
                    Custody journal
                </Typography>
                <Paper variant="outlined" sx={{ borderRadius: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>When</TableCell>
                                <TableCell>What</TableCell>
                                <TableCell>Where</TableCell>
                                <TableCell align="right">Units</TableCell>
                                <TableCell>By</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {journal.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.at ? new Date(row.at).toLocaleString() : "—"}</TableCell>
                                    <TableCell>{VERB[row.type] ?? row.type}</TableCell>
                                    <TableCell>{row.location ?? "—"}</TableCell>
                                    <TableCell align="right" sx={{ fontFamily: "monospace" }}>
                                        {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                                    </TableCell>
                                    <TableCell>{row.by ?? "—"}</TableCell>
                                </TableRow>
                            ))}
                            {journal.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>
                                        No stock has moved yet.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </Paper>
            </Box>
        </>
    );
}

TransferShow.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
