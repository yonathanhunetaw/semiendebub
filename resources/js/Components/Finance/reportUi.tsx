import { Chip, Stack, TableCell, TableRow, Typography } from "@mui/material";
import React from "react";
import { dayDate, shopZone } from "@/utils/dates";

/** SalesReport::days */
export interface ReportDay {
    store_id: number;
    store: string;
    date: string;
    status: string;
    opened_at: string;
    closed_at: string | null;
    closed_late: boolean;
    orders: number;
    sales: number;
    takings: number;
    by_method: Record<string, number>;
    credit: number;
    /** Counted till minus what it should hold, frozen at closing. */
    till_difference: number | null;
    till_difference_note: string | null;
    cash_unconfirmed: number | null;
}

/** SalesReport::months */
export interface ReportMonth {
    month: string;
    label: string;
    orders: number;
    sales: number;
    takings: number;
    expenses: number;
    net: number;
}

export const etb = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const clock = (iso: string): string => new Date(iso).toLocaleTimeString(undefined, { timeZone: shopZone(), hour: "2-digit", minute: "2-digit" });

const method = (key: string): string => key.replace(/_/g, " ");

/** One business day of one store, as a table row. */
export function DayRow({ day, showStore = true }: { day: ReportDay; showStore?: boolean }): React.ReactElement {
    const off = day.till_difference !== null && Math.abs(day.till_difference) >= 0.01;

    return (
        <TableRow hover>
            <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {dayDate(day.date)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {clock(day.opened_at)} – {day.closed_at ? clock(day.closed_at) : "open now"}
                    {day.closed_late ? " · closed afterwards" : ""}
                </Typography>
            </TableCell>
            {showStore ? <TableCell>{day.store}</TableCell> : null}
            <TableCell align="right">{day.orders}</TableCell>
            <TableCell align="right">{etb(day.sales)}</TableCell>
            <TableCell align="right">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {etb(day.takings)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                    {Object.entries(day.by_method)
                        .map(([key, total]) => `${method(key)} ${total.toLocaleString()}`)
                        .join(" · ")}
                </Typography>
            </TableCell>
            <TableCell align="right">{day.credit > 0 ? etb(day.credit) : "—"}</TableCell>
            <TableCell>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                    {day.status === "open" ? <Chip size="small" color="success" label="Open" /> : null}
                    {off ? (
                        <Chip
                            size="small"
                            color="error"
                            label={`Till ${day.till_difference! < 0 ? "short" : "over"} ${etb(Math.abs(day.till_difference!))}`}
                            title={day.till_difference_note ?? undefined}
                        />
                    ) : day.till_difference !== null ? (
                        <Chip size="small" variant="outlined" color="success" label="Till matched" />
                    ) : null}
                    {(day.cash_unconfirmed ?? 0) > 0 ? <Chip size="small" color="warning" label={`${etb(day.cash_unconfirmed ?? 0)} unconfirmed`} /> : null}
                </Stack>
                {off && day.till_difference_note ? (
                    <Typography variant="caption" color="text.secondary" component="div">
                        {day.till_difference_note}
                    </Typography>
                ) : null}
            </TableCell>
        </TableRow>
    );
}

export const DAY_HEAD = ["Business day", "Store", "Orders", "Sales", "Taken", "On credit", "Close"];
