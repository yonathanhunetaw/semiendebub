import { Head, Link } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import React from "react";

import { PageHeader, VendorCard, formatMoment, formatMoney } from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorOrderDetail, VendorStoreProfile } from "@/types/vendor";

interface Props {
    store: VendorStoreProfile;
    order: VendorOrderDetail;
}

/** One order placed with the store, read-only. */
export default function OrderShow({ order }: Props): React.ReactElement {
    return (
        <>
            <Head title={order.reference} />
            <PageHeader
                title={order.reference}
                subtitle={`${order.customer} · ${formatMoment(order.placed_at)}`}
                action={<Button component={Link} href={route("vendor.orders.index")} startIcon={<ArrowBackRoundedIcon />}>All orders</Button>}
            />
            <VendorCard>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <Chip label={order.stage_label} color="primary" />
                    <Chip label={order.payment_status.replace(/_/g, " ")} variant="outlined" sx={{ textTransform: "capitalize" }} />
                </Stack>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell>SKU</TableCell>
                            <TableCell align="right">Qty</TableCell>
                            <TableCell align="right">Unit price</TableCell>
                            <TableCell align="right">Subtotal</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {order.items.map((line) => (
                            <TableRow key={line.id}>
                                <TableCell sx={{ fontWeight: 600 }}>{line.item}</TableCell>
                                <TableCell sx={{ fontFamily: "monospace" }}>{line.sku ?? "—"}</TableCell>
                                <TableCell align="right">{line.quantity}</TableCell>
                                <TableCell align="right">{formatMoney(line.unit_price)}</TableCell>
                                <TableCell align="right">{formatMoney(line.subtotal)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Typography sx={{ textAlign: "right", fontWeight: 800, mt: 2 }}>Total {formatMoney(order.total)}</Typography>
            </VendorCard>
        </>
    );
}

OrderShow.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
