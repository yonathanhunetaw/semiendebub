import { Box, Chip, Stack, Typography } from "@mui/material";
import React from "react";
import { PanelHead, densePanelSx } from "@/Components/Visual/DashboardAreas";
import { shopZone } from "@/utils/dates";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";

export interface ShopDayFigures {
    date: string;
    status: string;
    opened_at: string;
    closed_at: string | null;
    orders: number;
    takings: number;
    late_close: boolean;
    /** Counted till minus what it should hold; null while open or when no cash moved. */
    till_difference: number | null;
    cash_unconfirmed: number | null;
}

export interface ShopDayRow {
    store_id: number;
    store: string;
    open: boolean;
    today: ShopDayFigures | null;
    yesterday: ShopDayFigures | null;
    /** Orders in the last 7 days that came in while the store was closed. */
    outside_orders: number;
}

const money = (amount: number): string => `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB`;

const clock = (iso: string): string =>
    new Date(iso).toLocaleTimeString(undefined, { timeZone: shopZone(), hour: "2-digit", minute: "2-digit" });

function Figures({ title, day, empty }: { title: string; day: ShopDayFigures | null; empty: string }): React.ReactElement {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {title}
            </Typography>
            {day ? (
                <>
                    <Typography sx={{ fontWeight: 800, fontSize: "0.9rem" }}>
                        {day.orders} order{day.orders === 1 ? "" : "s"} · {money(day.takings)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {clock(day.opened_at)} – {day.closed_at ? clock(day.closed_at) : "open now"}
                        {day.late_close ? " · closed afterwards" : ""}
                    </Typography>
                    {day.till_difference !== null && Math.abs(day.till_difference) >= 0.01 ? (
                        <Typography variant="caption" color="error" component="div" sx={{ fontWeight: 700 }}>
                            Till {day.till_difference < 0 ? "short" : "over"} {money(Math.abs(day.till_difference))}
                        </Typography>
                    ) : null}
                    {(day.cash_unconfirmed ?? 0) > 0 ? (
                        <Typography variant="caption" color="warning.main" component="div">
                            {money(day.cash_unconfirmed ?? 0)} cash not confirmed at close
                        </Typography>
                    ) : null}
                </>
            ) : (
                <Typography variant="body2" color="text.secondary">
                    {empty}
                </Typography>
            )}
        </Box>
    );
}

/** Every store's business day side by side: today, yesterday, and orders that came while it was closed. */
export default function ShopDaysPanel({ rows }: { rows: ShopDayRow[] }): React.ReactElement | null {
    if (rows.length === 0) return null;

    return (
        <Box sx={densePanelSx}>
            <PanelHead icon={<StorefrontOutlined fontSize="small" />} title="Business days" />
            <Stack spacing={1.25} divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
                {rows.map((row) => (
                    <Box key={row.store_id} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr)" }, alignItems: "center" }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography noWrap sx={{ fontWeight: 800 }}>
                                {row.store}
                            </Typography>
                            <Chip size="small" label={row.open ? "Open" : "Closed"} color={row.open ? "success" : "default"} variant={row.open ? "filled" : "outlined"} />
                        </Stack>
                        <Figures title="Today" day={row.today} empty="Not opened yet" />
                        <Figures title="Yesterday" day={row.yesterday} empty="Did not open" />
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                Outside open hours (7 days)
                            </Typography>
                            <Typography sx={{ fontWeight: 800, fontSize: "0.9rem" }} color={row.outside_orders > 0 ? "warning.main" : "text.primary"}>
                                {row.outside_orders} order{row.outside_orders === 1 ? "" : "s"}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Stack>
        </Box>
    );
}
