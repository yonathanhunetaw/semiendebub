import AdminLayout from "@/Layouts/AppLayout";
import { Head, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import React from "react";

interface PaymentRow {
    id: number;
    order: string | null;
    store: string | null;
    method: string;
    amount: number;
    currency: string;
    reference: string | null;
    taken_by: string | null;
    paid_at: string | null;
}

interface Props {
    payments?: PaymentRow[];
    today?: Array<{ method: string; total: number; count: number }>;
    methods?: string[];
    filters: { method: string | null };
    pagination: { current_page: number; last_page: number; total: number };
}

const money = (amount: number, currency = "ETB"): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const label = (method: string): string => method.replace(/_/g, " ");

/** Every payment taken, with today's takings by method. */
export default function PaymentsIndex({ payments = [], today = [], methods = [], filters, pagination }: Props): React.ReactElement {
    const go = (patch: Record<string, string | number | null>): void =>
        router.get(route("admin.payments.index"), { ...filters, ...patch }, { preserveState: true, replace: true });

    const todayTotal = today.reduce((sum, row) => sum + row.total, 0);

    return (
        <>
            <Head title="Payments" />
            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Payments
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Today: {money(todayTotal)}
                    {today.length > 0 ? ` — ${today.map((row) => `${label(row.method)} ${money(row.total)} (${row.count})`).join(" · ")}` : ""}
                </Typography>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    <Chip label="All methods" color={filters.method === null ? "primary" : "default"} onClick={() => go({ method: null, page: null })} />
                    {methods.map((method) => (
                        <Chip
                            key={method}
                            label={label(method)}
                            color={filters.method === method ? "primary" : "default"}
                            onClick={() => go({ method, page: null })}
                            sx={{ textTransform: "capitalize" }}
                        />
                    ))}
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>When</TableCell>
                                <TableCell>Order</TableCell>
                                <TableCell>Method</TableCell>
                                <TableCell>Reference</TableCell>
                                <TableCell>Taken by</TableCell>
                                <TableCell align="right">Amount</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {payments.map((p) => (
                                <TableRow key={p.id} hover>
                                    <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleString() : "—"}</TableCell>
                                    <TableCell>
                                        {p.order ? (
                                            <Button size="small" onClick={() => router.visit(route("admin.orders.custody", { reference: p.order as string }))}>
                                                {p.order}
                                            </Button>
                                        ) : (
                                            "—"
                                        )}
                                        <Typography variant="caption" color="text.secondary" component="div">
                                            {p.store ?? ""}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textTransform: "capitalize" }}>{label(p.method)}</TableCell>
                                    <TableCell sx={{ fontFamily: "monospace" }}>{p.reference ?? "—"}</TableCell>
                                    <TableCell>{p.taken_by ?? "—"}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {money(p.amount, p.currency)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {payments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                                        No payments yet.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </Paper>

                {pagination.last_page > 1 ? (
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 2 }}>
                        <Button disabled={pagination.current_page <= 1} onClick={() => go({ page: pagination.current_page - 1 })}>
                            Previous
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            Page {pagination.current_page} of {pagination.last_page}
                        </Typography>
                        <Button disabled={pagination.current_page >= pagination.last_page} onClick={() => go({ page: pagination.current_page + 1 })}>
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </Box>
        </>
    );
}

PaymentsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
