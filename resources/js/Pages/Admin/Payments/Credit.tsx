import { Head, router } from "@inertiajs/react";
import {
    Alert,
    Box,
    Chip,
    FormControlLabel,
    Paper,
    Snackbar,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import React from "react";

import AdminLayout from "@/Layouts/AdminLayout";
import type { SharedProps } from "@/types/shipment";
import type { CreditInvoice, CreditSummary } from "@/types/payments";

interface CreditRow extends CreditSummary {
    name: string;
    phone: string | null;
    /** Credit orders still owed on, oldest first. */
    invoices: CreditInvoice[];
}

interface Props extends SharedProps {
    customers?: CreditRow[];
}

const money = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : "—");

/**
 * Customer credit: who has credit, what they owe, and who is overdue.
 *
 * Limits and days are set on the customer (Customers → edit). Here an admin
 * can let an overdue customer keep buying on credit.
 */
export default function CustomerCredit({ customers = [], flash }: Props): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    const owed = customers.reduce((sum, row) => sum + row.outstanding, 0);
    const overdue = customers.reduce((sum, row) => sum + row.overdue, 0);

    return (
        <>
            <Head title="Customer credit" />

            <Box mb={2}>
                <Typography variant="h5" fontWeight={800}>Customer credit</Typography>
                <Typography variant="body2" color="text.secondary">
                    {money(owed)} owed in all{overdue > 0 ? `, ${money(overdue)} of it overdue` : ""}. Set a customer&apos;s
                    limit and days to pay under Customers.
                </Typography>
            </Box>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Customer</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Limit</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Owes</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Available</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Open invoices</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>While overdue</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {customers.map((row) => (
                            <TableRow key={row.customer_id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={700}>{row.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{row.phone ?? ""}</Typography>
                                </TableCell>
                                <TableCell>
                                    {row.enabled ? `${money(row.limit)} · ${row.days} days` : <Chip size="small" label="No credit" />}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {money(row.outstanding)}
                                    {row.overdue > 0 ? (
                                        <Typography variant="caption" color="error" component="div">
                                            {money(row.overdue)} overdue since {date(row.oldest_due)}
                                        </Typography>
                                    ) : null}
                                </TableCell>
                                <TableCell align="right">{money(row.available)}</TableCell>
                                <TableCell>
                                    {row.invoices.length === 0
                                        ? "—"
                                        : row.invoices.map((invoice) => (
                                              <Typography
                                                  key={invoice.sale_id}
                                                  variant="caption"
                                                  component="div"
                                                  color={invoice.overdue ? "error" : "text.secondary"}
                                              >
                                                  {invoice.reference}: {money(invoice.owed)} due {date(invoice.due_date)}
                                              </Typography>
                                          ))}
                                </TableCell>
                                <TableCell>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                size="small"
                                                checked={row.override}
                                                onChange={(event) =>
                                                    router.patch(
                                                        route("admin.credit.override", row.customer_id),
                                                        { credit_override: event.target.checked },
                                                        { preserveScroll: true },
                                                    )
                                                }
                                            />
                                        }
                                        label={row.override ? "Allowed" : "Blocked"}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                        {customers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                    <Typography color="text.secondary">
                                        No customer has credit. Give one a limit under Customers.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={flash?.error ? "error" : "success"} variant="filled">
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

CustomerCredit.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
