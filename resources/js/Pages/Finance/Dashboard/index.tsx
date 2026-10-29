import React from "react";
import FinanceLayout from "@/Layouts/FinanceLayout";
import { Head, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { DAY_HEAD, DayRow, etb, type ReportDay, type ReportMonth } from "@/Components/Finance/reportUi";

interface Props {
    /** Newest first: this month, then the five before. */
    months?: ReportMonth[];
    /** Every store's business days of the last seven days. */
    recent_days?: ReportDay[];
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }): React.ReactElement {
    return (
        <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, flex: 1, minWidth: 160 }}>
            <Typography variant="overline" color="text.secondary">
                {label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {value}
            </Typography>
            {hint ? (
                <Typography variant="caption" color="text.secondary">
                    {hint}
                </Typography>
            ) : null}
        </Paper>
    );
}

/** Finance home: this month, month by month, and the last seven business days. */
export default function FinanceDashboard({ months = [], recent_days = [] }: Props): React.ReactElement {
    const [now, before] = months;

    return (
        <>
            <Head title="Finance" />

            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        Finance
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Takings are money confirmed by a second person, not credit. Expenses are confirmed expenses.
                    </Typography>
                </Box>
                <Button component={Link} href={route("finance.reports.index")} variant="contained" disableElevation size="small">
                    Reports
                </Button>
            </Stack>

            {now ? (
                <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                    <Tile label={`Sales · ${now.label}`} value={etb(now.sales)} hint={`${now.orders} orders${before ? ` · ${before.label}: ${etb(before.sales)}` : ""}`} />
                    <Tile label="Taken" value={etb(now.takings)} hint={before ? `${before.label}: ${etb(before.takings)}` : undefined} />
                    <Tile label="Expenses" value={etb(now.expenses)} hint={before ? `${before.label}: ${etb(before.expenses)}` : undefined} />
                    <Tile label="Taken less expenses" value={etb(now.net)} hint={before ? `${before.label}: ${etb(before.net)}` : undefined} />
                </Stack>
            ) : null}

            <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 2, overflowX: "auto" }}>
                <Typography sx={{ fontWeight: 800, p: 1.5 }}>Month by month</Typography>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Month</TableCell>
                            <TableCell align="right">Orders</TableCell>
                            <TableCell align="right">Sales</TableCell>
                            <TableCell align="right">Taken</TableCell>
                            <TableCell align="right">Expenses</TableCell>
                            <TableCell align="right">Taken less expenses</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {months.map((month) => (
                            <TableRow key={month.month} hover>
                                <TableCell sx={{ fontWeight: 700 }}>{month.label}</TableCell>
                                <TableCell align="right">{month.orders}</TableCell>
                                <TableCell align="right">{etb(month.sales)}</TableCell>
                                <TableCell align="right">{etb(month.takings)}</TableCell>
                                <TableCell align="right">{etb(month.expenses)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: month.net < 0 ? "error.main" : "text.primary" }}>
                                    {etb(month.net)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>

            <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
                <Typography sx={{ fontWeight: 800, p: 1.5 }}>The last seven business days</Typography>
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
                        {recent_days.length > 0 ? (
                            recent_days.map((day) => <DayRow key={`${day.store_id}-${day.date}`} day={day} />)
                        ) : (
                            <TableRow>
                                <TableCell colSpan={DAY_HEAD.length} align="center" sx={{ py: 3, color: "text.secondary" }}>
                                    No store opened in the last seven days.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Paper>
        </>
    );
}

FinanceDashboard.layout = (page: React.ReactNode) => <FinanceLayout>{page}</FinanceLayout>;
