import { Head, router } from "@inertiajs/react";
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import React from "react";

import { Pager } from "@/Components/Admin/adminUi";
import NoStore from "@/Components/Vendor/NoStore";
import { EmptyState, PageHeader, VendorCard, formatMoment, formatMoney } from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { Paginated, VendorOrderRow, VendorStoreProfile } from "@/types/vendor";

interface Props {
    store: VendorStoreProfile | null;
    orders: Paginated<VendorOrderRow> | null;
    /** Stage key => label (Sale::fulfillmentStages). */
    stages: Record<string, string>;
    filters: { stage: string };
}

/** Orders customers placed with the store, by stage. */
export default function Orders({ store, orders, stages = {}, filters }: Props): React.ReactElement {
    const rows = orders?.data ?? [];
    const tabs = [["all", "All"], ...Object.entries(stages)];

    return (
        <>
            <Head title="Orders" />
            <PageHeader title="Orders" subtitle="What customers ordered from your store, and where each order is." />

            {!store ? (
                <NoStore />
            ) : (
                <VendorCard>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                        {tabs.map(([key, label]) => (
                            <Chip
                                key={key}
                                label={label}
                                color={filters.stage === key ? "primary" : "default"}
                                variant={filters.stage === key ? "filled" : "outlined"}
                                onClick={() => router.get(route("vendor.orders.index"), { stage: key }, { preserveState: true })}
                            />
                        ))}
                    </Stack>
                    {rows.length === 0 ? (
                        <EmptyState title="No orders here" hint="Orders placed with your store show here." />
                    ) : (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Order</TableCell>
                                    <TableCell>Customer</TableCell>
                                    <TableCell>Stage</TableCell>
                                    <TableCell>Payment</TableCell>
                                    <TableCell align="right">Total</TableCell>
                                    <TableCell>Placed</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((o) => (
                                    <TableRow key={o.id} hover sx={{ cursor: "pointer" }} onClick={() => router.visit(route("vendor.orders.show", o.id))}>
                                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>{o.reference}</TableCell>
                                        <TableCell>{o.customer}</TableCell>
                                        <TableCell><Chip size="small" label={o.stage_label} /></TableCell>
                                        <TableCell sx={{ textTransform: "capitalize" }}>{o.payment_status.replace(/_/g, " ")}</TableCell>
                                        <TableCell align="right">{formatMoney(o.total)}</TableCell>
                                        <TableCell>{formatMoment(o.placed_at)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    <Pager links={orders?.links} from={orders?.from} to={orders?.to} total={orders?.total} />
                </VendorCard>
            )}
        </>
    );
}

Orders.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
