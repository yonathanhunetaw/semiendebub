import { Head, Link, router } from "@inertiajs/react";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import { Button, Chip, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import React from "react";

import NoStore from "@/Components/Vendor/NoStore";
import { EmptyState, PageHeader, StatCard, VendorCard, formatMoment, formatMoney } from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorOrderRow, VendorStoreMetrics, VendorStoreProfile } from "@/types/vendor";

interface Props {
    store: VendorStoreProfile | null;
    metrics: VendorStoreMetrics | null;
    recent_orders?: VendorOrderRow[];
    /** A global admin may look at any vendor store. */
    choices?: Array<{ id: number; name: string }>;
}

/** A vendor's first screen: their store, its last 30 days, and its latest orders. */
export default function Dashboard({ store, metrics, recent_orders: recentOrders = [], choices = [] }: Props): React.ReactElement {
    return (
        <>
            <Head title="My store" />

            <PageHeader
                title={store ? store.name : "My store"}
                subtitle={store ? "Your store on Duka: its orders, what it lists and how customers find it." : undefined}
                action={
                    <Stack direction="row" spacing={1} alignItems="center">
                        {choices.length > 1 && (
                            <TextField select size="small" label="Store" value={store?.id ?? ""} onChange={(e) => router.get(route("vendor.dashboard"), { store: e.target.value })} sx={{ minWidth: 180 }}>
                                {choices.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                            </TextField>
                        )}
                        {store?.public_url && (
                            <Button href={store.public_url} target="_blank" rel="noopener" variant="outlined" endIcon={<OpenInNewRoundedIcon />}>
                                See it on the shop
                            </Button>
                        )}
                    </Stack>
                }
            />

            {!store || !metrics ? (
                <NoStore />
            ) : (
                <Stack spacing={3}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard label="Orders, 30 days" value={metrics.orders_30d} icon={<ReceiptLongRoundedIcon />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard label="Paid, 30 days" value={formatMoney(metrics.revenue_30d)} tone="success" icon={<PaidRoundedIcon />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard label="Waiting: pay · pack · deliver" value={`${metrics.to_pay} · ${metrics.to_pack} · ${metrics.to_deliver}`} tone={metrics.to_pay + metrics.to_pack + metrics.to_deliver > 0 ? "warning" : "default"} icon={<LocalShippingRoundedIcon />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard label="Items listed" value={metrics.listed_items} icon={<Inventory2RoundedIcon />} /></Grid>
                    </Grid>

                    <VendorCard>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>Latest orders</Typography>
                            <Button component={Link} href={route("vendor.orders.index")}>All orders</Button>
                        </Stack>
                        {recentOrders.length === 0 ? (
                            <EmptyState title="No orders yet" hint="Orders customers place with your store show here." />
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Order</TableCell>
                                        <TableCell>Customer</TableCell>
                                        <TableCell>Stage</TableCell>
                                        <TableCell align="right">Total</TableCell>
                                        <TableCell>Placed</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentOrders.map((o) => (
                                        <TableRow key={o.id} hover sx={{ cursor: "pointer" }} onClick={() => router.visit(route("vendor.orders.show", o.id))}>
                                            <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>{o.reference}</TableCell>
                                            <TableCell>{o.customer}</TableCell>
                                            <TableCell><Chip size="small" label={o.stage_label} /></TableCell>
                                            <TableCell align="right">{formatMoney(o.total)}</TableCell>
                                            <TableCell>{formatMoment(o.placed_at)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </VendorCard>

                    <Typography variant="body2" color="text.secondary">
                        Prices, stock and staff are run from the admin app, where you are your store&apos;s admin.
                    </Typography>
                </Stack>
            )}
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
