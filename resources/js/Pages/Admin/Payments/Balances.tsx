import { Head } from "@inertiajs/react";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
    Box,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";

import AdminLayout from "@/Layouts/AdminLayout";
import type { BalanceBucket, OverdueCash, RemittanceRow } from "@/types/payments";

interface SellerBalance {
    id: number;
    name: string;
    store: string | null;
    held: number;
    cash: number;
    handing_over: number;
    overdue_cash: OverdueCash;
    buckets: BalanceBucket[];
}

interface Props {
    sellers?: SellerBalance[];
    remittances?: RemittanceRow[];
    cash_flag_days?: number;
}

const money = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const STATUS: Record<RemittanceRow["status"], { label: string; color: "info" | "success" | "error" }> = {
    claimed: { label: "Owner checking", color: "info" },
    confirmed: { label: "Received", color: "success" },
    rejected: { label: "Not received", color: "error" },
};

/**
 * What every seller holds for the company, and their handovers.
 *
 * A seller's balance is the deposits they confirmed and the cash they took,
 * less what a settlement account's owner confirmed receiving from them. Cash
 * held past the flag window is marked: it has no bank record to check.
 */
export default function SellerBalances({ sellers = [], remittances = [], cash_flag_days = 3 }: Props): React.ReactElement {
    const total = sellers.reduce((sum, seller) => sum + seller.held, 0);

    return (
        <>
            <Head title="Seller balances" />

            <Box mb={2}>
                <Typography variant="h5" fontWeight={800}>Seller balances</Typography>
                <Typography variant="body2" color="text.secondary">
                    Money sellers hold until they hand it over: {money(total)} in all. Cash held more than {cash_flag_days}{" "}
                    days is flagged.
                </Typography>
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Seller</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Held in accounts</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Cash</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Handing over</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Total held</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sellers.map((seller) => (
                            <TableRow key={seller.id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={700}>{seller.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{seller.store ?? ""}</Typography>
                                </TableCell>
                                <TableCell>
                                    {seller.buckets.filter((bucket) => bucket.account !== null && bucket.held !== 0).map((bucket) => (
                                        <Typography key={bucket.account?.id} variant="caption" component="div">
                                            {bucket.account?.provider_name} · {bucket.account?.account_number}: {money(bucket.held)}
                                        </Typography>
                                    ))}
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                                        {seller.overdue_cash.amount > 0 ? (
                                            <Tooltip title={`${money(seller.overdue_cash.amount)} held more than ${seller.overdue_cash.days} days`}>
                                                <WarningAmberRoundedIcon fontSize="small" color="warning" />
                                            </Tooltip>
                                        ) : null}
                                        <span>{money(seller.cash)}</span>
                                    </Stack>
                                </TableCell>
                                <TableCell align="right">{seller.handing_over > 0 ? money(seller.handing_over) : "—"}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800 }}>{money(seller.held)}</TableCell>
                            </TableRow>
                        ))}
                        {sellers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                                    <Typography color="text.secondary">No seller holds any money yet.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Typography variant="h6" fontWeight={800} mb={1}>Handovers</Typography>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>When</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Seller</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>From → To</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Reference</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Amount</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {remittances.map((row) => (
                            <TableRow key={row.id} hover>
                                <TableCell>{row.at ? new Date(row.at).toLocaleString() : "—"}</TableCell>
                                <TableCell>{row.by ?? "—"}</TableCell>
                                <TableCell>
                                    {row.from} → {row.to ? `${row.to.provider_name} · ${row.to.account_number}` : "—"}
                                    {row.to?.owner ? (
                                        <Typography variant="caption" color="text.secondary" component="div">
                                            Confirmed by {row.to.owner}
                                        </Typography>
                                    ) : null}
                                </TableCell>
                                <TableCell sx={{ fontFamily: "monospace" }}>{row.reference ?? "—"}</TableCell>
                                <TableCell>
                                    <Chip size="small" variant="outlined" label={STATUS[row.status].label} color={STATUS[row.status].color} />
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>{money(row.amount)}</TableCell>
                            </TableRow>
                        ))}
                        {remittances.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">No handovers yet.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    );
}

SellerBalances.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
