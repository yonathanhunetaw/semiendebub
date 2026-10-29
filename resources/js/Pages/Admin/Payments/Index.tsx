import AdminLayout from "@/Layouts/AppLayout";
import { PageBand } from "@/Components/Admin/adminUi";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { Head, router } from "@inertiajs/react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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
import { dayDateTime } from "@/utils/dates";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import AgeBadge from "@/Components/Shared/time/AgeBadge";
import DayTag from "@/Components/Shared/time/DayTag";
import { DayHeadingRow, startsDay } from "@/Components/Shared/time/DayHeading";
import TimeFilterChips from "@/Components/Shared/time/TimeFilterChips";
import type { DayTagView, TimeFilterView } from "@/types/time";

interface PaymentRow {
    id: number;
    order: string | null;
    store: string | null;
    method: string;
    /** "CBE · 1000…" when paid into an account. */
    account: string | null;
    /** Who confirms deposits into that account. */
    owner: string | null;
    status: "pending" | "claimed" | "confirmed" | "void" | string;
    amount: number;
    currency: string;
    reference: string | null;
    taken_by: string | null;
    paid_at: string | null;
    /** Waiting on its account's owner: listed whatever its day. */
    open: boolean;
    day: DayTagView | null;
}

/** A part this admin may be the second person on (PaymentBoard::inbox). */
interface ToConfirm {
    id: number;
    method: string;
    amount: number;
    reference: string | null;
    account: { provider_name: string; account_number: string } | null;
    order: string;
    order_total: number;
    customer: string;
    store: string | null;
    claimed_by: string | null;
    claimed_at: string | null;
}

interface Props {
    to_confirm?: ToConfirm[];
    payments?: PaymentRow[];
    today?: Array<{ method: string; total: number; count: number }>;
    /** What the takings box covers: Today, Yesterday, Last 7 days… */
    summary_label?: string;
    time: TimeFilterView;
    methods?: string[];
    filters: { method: string | null; when: string };
    pagination: { current_page: number; last_page: number; total: number };
}

const money = (amount: number, currency = "ETB"): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const label = (method: string): string => method.replace(/_/g, " ");

const STATUS: Record<string, { label: string; color: "default" | "info" | "success" | "warning" }> = {
    pending: { label: "Waiting for customer", color: "default" },
    claimed: { label: "Owner checking", color: "info" },
    confirmed: { label: "Received", color: "success" },
    void: { label: "Void", color: "default" },
};

/** Every payment part, with today's confirmed takings by method. */
export default function PaymentsIndex({ to_confirm = [], payments = [], today = [], summary_label = "Today", time, methods = [], filters, pagination }: Props): React.ReactElement {
    const go = (patch: Record<string, string | number | null>): void =>
        router.get(route("admin.payments.index"), { ...filters, ...patch }, { preserveState: true, replace: true });

    const todayTotal = today.reduce((sum, row) => sum + row.total, 0);

    return (
        <>
            <Head title="Payments" />
            <Box sx={ROOT}>
                <Box sx={{ mb: 1.5 }}>
                    <PageBand
                        icon={<PaymentsOutlined />}
                        title="Payments"
                        subtitle={`Received (${summary_label.toLowerCase()}): ${money(todayTotal)}${today.length > 0 ? ` — ${today.map((row) => `${label(row.method)} ${money(row.total)} (${row.count})`).join(" · ")}` : ""}`}
                    />
                </Box>

                <ConfirmInbox parts={to_confirm} />

                <Box sx={{ mb: 1.5 }}>
                    <TimeFilterChips filter={time} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Parts waiting to be confirmed are always listed; the day narrows the settled ones.
                    </Typography>
                </Box>

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

                <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: "auto" }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>When</TableCell>
                                <TableCell>Order</TableCell>
                                <TableCell>Method</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Reference</TableCell>
                                <TableCell>Taken by</TableCell>
                                <TableCell align="right">Amount</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {payments.map((p, i) => (
                                <React.Fragment key={p.id}>
                                {startsDay(payments, i) ? <DayHeadingRow tag={p.day} colSpan={7} /> : null}
                                <TableRow hover>
                                    <TableCell>
                                        {dayDateTime(p.paid_at)}
                                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                                            <DayTag tag={p.day} />
                                            {p.open ? <AgeBadge since={p.paid_at} warnHours={12} lateHours={48} prefix="waiting " /> : null}
                                        </Stack>
                                    </TableCell>
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
                                    <TableCell>
                                        <Typography variant="body2" sx={{ textTransform: "capitalize" }}>{label(p.method)}</Typography>
                                        {p.account ? (
                                            <Typography variant="caption" color="text.secondary" component="div">
                                                {p.account}
                                                {p.owner ? ` · ${p.owner}` : ""}
                                            </Typography>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            label={(STATUS[p.status] ?? { label: p.status }).label}
                                            color={STATUS[p.status]?.color ?? "default"}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: "monospace" }}>{p.reference ?? "—"}</TableCell>
                                    <TableCell>{p.taken_by ?? "—"}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {money(p.amount, p.currency)}
                                    </TableCell>
                                </TableRow>
                                </React.Fragment>
                            ))}
                            {payments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
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

/**
 * The parts waiting on a second person that this admin may be: the same rules as
 * the seller app's inbox (PaymentService), so never one they took or claimed.
 */
function ConfirmInbox({ parts }: { parts: ToConfirm[] }): React.ReactElement | null {
    const [confirming, setConfirming] = React.useState<ToConfirm | null>(null);
    const [busy, setBusy] = React.useState(false);

    if (parts.length === 0) return null;

    const act = (part: ToConfirm, action: "confirm" | "reject"): void => {
        setBusy(true);
        router.post(route(`admin.payments.${action}`, part.id), {}, {
            preserveScroll: true,
            onFinish: () => {
                setBusy(false);
                setConfirming(null);
            },
        });
    };

    return (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 3, borderColor: "warning.light" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Waiting for you to confirm ({parts.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Money someone else took or says arrived. Confirm only what you hold or can see in the account.
            </Typography>
            <Stack spacing={1}>
                {parts.map((part) => (
                    <Stack
                        key={part.id}
                        data-testid={`to-confirm-${part.order}`}
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                        alignItems={{ sm: "center" }}
                        sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}
                    >
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {part.order} · {part.customer}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" component="div">
                                <Box component="span" sx={{ textTransform: "capitalize" }}>{label(part.method)}</Box>
                                {part.account ? ` · ${part.account.provider_name} ${part.account.account_number}` : ""}
                                {part.store ? ` · ${part.store}` : ""}
                                {part.claimed_by ? ` · taken by ${part.claimed_by}` : ""}
                            </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                            {money(part.amount)}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Button size="small" color="warning" disabled={busy} onClick={() => act(part, "reject")}>
                                Not received
                            </Button>
                            <Button size="small" variant="contained" disabled={busy} onClick={() => setConfirming(part)}>
                                Confirm received
                            </Button>
                        </Stack>
                    </Stack>
                ))}
            </Stack>

            <Dialog open={confirming !== null} onClose={() => setConfirming(null)}>
                <DialogTitle sx={{ fontWeight: 800 }}>Are you sure?</DialogTitle>
                <DialogContent>
                    <Alert severity="info" variant="outlined">
                        You confirm you received {confirming ? money(confirming.amount) : ""} for {confirming?.order}.
                        The order moves on once every part is confirmed.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button variant="contained" disabled={busy} onClick={() => confirming && act(confirming, "confirm")}>
                        Yes, confirm
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

PaymentsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
