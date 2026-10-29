import { Head } from "@inertiajs/react";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import { Chip, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import React from "react";

import { Pager } from "@/Components/Admin/adminUi";
import NoStore from "@/Components/Vendor/NoStore";
import { EmptyState, PageHeader, StatCard, VendorCard, formatMoment, formatMoney } from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { Paginated, VendorStoreProfile } from "@/types/vendor";

interface Entry {
    id: number;
    kind: "earning" | "reversal" | "payout";
    reference: string | null;
    gross: number;
    commission_pct: number;
    commission: number;
    amount: number;
    at: string | null;
}

interface Payout {
    id: number;
    amount: number;
    method: string;
    reference: string | null;
    status: "recorded" | "confirmed" | "rejected";
    at: string | null;
}

interface Props {
    store: VendorStoreProfile | null;
    balance: number;
    entries: Paginated<Entry> | null;
    payouts: Payout[];
    commission_pct: number;
}

const KIND_LABEL: Record<Entry["kind"], string> = { earning: "Order paid", reversal: "Order cancelled", payout: "Paid out to you" };
const PAYOUT_LABEL: Record<Payout["status"], string> = { recorded: "On its way", confirmed: "Paid", rejected: "Not paid" };

/** What the store earned after Duka's commission, what was paid out, and what Duka owes it now. */
export default function Money({ store, balance = 0, entries, payouts = [], commission_pct }: Props): React.ReactElement {
    const rows = entries?.data ?? [];
    const onTheWay = payouts.filter((p) => p.status === "recorded").reduce((sum, p) => sum + p.amount, 0);

    return (
        <>
            <Head title="Money" />
            <PageHeader title="Money" subtitle={`Duka keeps ${commission_pct}% of each paid order and delivers it; the rest is yours.`} />

            {!store ? (
                <NoStore />
            ) : (
                <Stack spacing={3}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}><StatCard label="Duka owes you" value={formatMoney(balance)} tone="success" icon={<AccountBalanceWalletRoundedIcon />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><StatCard label="Payouts on their way" value={formatMoney(onTheWay)} tone={onTheWay > 0 ? "warning" : "default"} /></Grid>
                    </Grid>

                    <VendorCard>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Your account</Typography>
                        {rows.length === 0 ? (
                            <EmptyState title="Nothing yet" hint="Each paid order adds what it earned you here." />
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>What</TableCell>
                                        <TableCell>Order</TableCell>
                                        <TableCell align="right">Order total</TableCell>
                                        <TableCell align="right">Commission</TableCell>
                                        <TableCell align="right">To you</TableCell>
                                        <TableCell>When</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((e) => (
                                        <TableRow key={e.id}>
                                            <TableCell>{KIND_LABEL[e.kind]}</TableCell>
                                            <TableCell sx={{ fontFamily: "monospace" }}>{e.reference ?? "—"}</TableCell>
                                            <TableCell align="right">{e.kind === "payout" ? "—" : formatMoney(e.gross)}</TableCell>
                                            <TableCell align="right">{e.kind === "payout" ? "—" : `${formatMoney(e.commission)} (${e.commission_pct}%)`}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: e.amount < 0 ? "error.main" : "success.main" }}>{formatMoney(e.amount)}</TableCell>
                                            <TableCell>{formatMoment(e.at)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                        <Pager links={entries?.links} from={entries?.from} to={entries?.to} total={entries?.total} />
                    </VendorCard>

                    <VendorCard>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Payouts</Typography>
                        {payouts.length === 0 ? (
                            <EmptyState title="No payouts yet" hint="Duka pays out what it owes you; each payout shows here." />
                        ) : (
                            <Table size="small">
                                <TableBody>
                                    {payouts.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell sx={{ fontWeight: 700 }}>{formatMoney(p.amount)}</TableCell>
                                            <TableCell sx={{ textTransform: "capitalize" }}>{p.method.replace(/_/g, " ")}{p.reference ? ` · ${p.reference}` : ""}</TableCell>
                                            <TableCell><Chip size="small" label={PAYOUT_LABEL[p.status]} color={p.status === "confirmed" ? "success" : p.status === "rejected" ? "error" : "warning"} /></TableCell>
                                            <TableCell>{formatMoment(p.at)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </VendorCard>
                </Stack>
            )}
        </>
    );
}

Money.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
