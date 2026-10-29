import React, { useState } from "react";
import FinanceLayout from "@/Layouts/FinanceLayout";
import { Head, router } from "@inertiajs/react";
import { Alert, Box, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { DAY_HEAD, DayRow, etb, type ReportDay } from "@/Components/Finance/reportUi";

interface Props {
    filters: { from: string; to: string; store: number | null };
    /** The period was longer than max_days and was shortened, keeping its end. */
    limited?: boolean;
    max_days?: number;
    stores?: { id: number; name: string }[];
    days?: ReportDay[];
    /** Per store: what came in while it was closed. */
    outside?: { store_id: number; store: string; orders: number; sales: number; takings: number }[];
    methods?: { method: string; total: number; count: number }[];
}

const panelSx = { border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto", mb: 2 } as const;

/** Sales and takings per store per business day, outside open hours, and payment methods. */
export default function FinanceReports({ filters, limited = false, max_days = 62, stores = [], days = [], outside = [], methods = [] }: Props): React.ReactElement {
    const [from, setFrom] = useState(filters.from);
    const [to, setTo] = useState(filters.to);
    const [store, setStore] = useState<string>(filters.store === null ? "" : String(filters.store));

    const apply = (): void =>
        router.get(route("finance.reports.index"), { from, to, ...(store !== "" ? { store } : {}) }, { preserveState: true, preserveScroll: true, replace: true });

    const totals = days.reduce(
        (sum, day) => ({ orders: sum.orders + day.orders, sales: sum.sales + day.sales, takings: sum.takings + day.takings, credit: sum.credit + day.credit }),
        { orders: 0, sales: 0, takings: 0, credit: 0 },
    );
    const short = days.filter((day) => day.till_difference !== null && Math.abs(day.till_difference) >= 0.01);

    return (
        <>
            <Head title="Reports" />

            <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Reports
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                A business day runs from a store&apos;s opening to its closing. What came in while a store was closed is listed on its own.
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
                <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                <TextField size="small" select label="Store" value={store} onChange={(e) => setStore(e.target.value)} sx={{ minWidth: 180 }}>
                    <MenuItem value="">All stores</MenuItem>
                    {stores.map((option) => (
                        <MenuItem key={option.id} value={String(option.id)}>
                            {option.name}
                        </MenuItem>
                    ))}
                </TextField>
                <Button variant="contained" disableElevation onClick={apply}>
                    Show
                </Button>
            </Stack>

            {limited ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    A report covers at most {max_days} days, so it starts on {filters.from}.
                </Alert>
            ) : null}

            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="overline" color="text.secondary">Orders</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{totals.orders}</Typography>
                </Box>
                <Box>
                    <Typography variant="overline" color="text.secondary">Sales</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{etb(totals.sales)}</Typography>
                </Box>
                <Box>
                    <Typography variant="overline" color="text.secondary">Taken</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{etb(totals.takings)}</Typography>
                </Box>
                <Box>
                    <Typography variant="overline" color="text.secondary">On credit</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{etb(totals.credit)}</Typography>
                </Box>
                <Box>
                    <Typography variant="overline" color="text.secondary">Tills that did not match</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: short.length > 0 ? "error.main" : "text.primary" }}>{short.length}</Typography>
                </Box>
            </Stack>

            <Paper elevation={0} sx={panelSx}>
                <Typography sx={{ fontWeight: 800, p: 1.5 }}>Business days</Typography>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            {DAY_HEAD.map((head, i) => (
                                <TableCell key={head} align={i >= 2 && i <= 5 ? "right" : "left"}>
                                    {head}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {days.length > 0 ? (
                            days.map((day) => <DayRow key={`${day.store_id}-${day.date}`} day={day} />)
                        ) : (
                            <TableRow>
                                <TableCell colSpan={DAY_HEAD.length} align="center" sx={{ py: 3, color: "text.secondary" }}>
                                    No store opened in this period.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Paper>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <Paper elevation={0} sx={panelSx}>
                    <Typography sx={{ fontWeight: 800, p: 1.5 }}>Outside open hours</Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Store</TableCell>
                                <TableCell align="right">Orders</TableCell>
                                <TableCell align="right">Sales</TableCell>
                                <TableCell align="right">Taken</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {outside.length > 0 ? (
                                outside.map((row) => (
                                    <TableRow key={row.store_id} hover>
                                        <TableCell>{row.store}</TableCell>
                                        <TableCell align="right">{row.orders}</TableCell>
                                        <TableCell align="right">{etb(row.sales)}</TableCell>
                                        <TableCell align="right">{etb(row.takings)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ py: 3, color: "text.secondary" }}>
                                        Nothing came in while the stores were closed.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Paper>

                <Paper elevation={0} sx={panelSx}>
                    <Typography sx={{ fontWeight: 800, p: 1.5 }}>By payment method (confirmed)</Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Method</TableCell>
                                <TableCell align="right">Parts</TableCell>
                                <TableCell align="right">Total</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {methods.map((row) => (
                                <TableRow key={row.method} hover>
                                    <TableCell sx={{ textTransform: "capitalize" }}>{row.method.replace(/_/g, " ")}</TableCell>
                                    <TableCell align="right">{row.count}</TableCell>
                                    <TableCell align="right">{etb(row.total)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            </Box>
        </>
    );
}

FinanceReports.layout = (page: React.ReactNode) => <FinanceLayout>{page}</FinanceLayout>;
