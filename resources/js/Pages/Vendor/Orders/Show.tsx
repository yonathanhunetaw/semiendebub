import { Head, Link } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import {
    Button,
    Divider,
    Grid,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

import {
    OrderStatusChip,
    PageHeader,
    VendorCard,
    formatMoment,
    formatMoney,
} from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorOrderShowProps } from "@/types/vendor";

/**
 * One purchase order, as the supplier sees it.
 */
export default function OrderShow({ order }: VendorOrderShowProps): React.ReactElement {
    return (
        <>
            <Head title={`Order ${order.reference_number}`} />

            <PageHeader
                title={order.reference_number}
                subtitle={`Raised ${formatMoment(order.purchased_at ?? order.created_at)}`}
                action={
                    <Button
                        component={Link}
                        href={route("vendor.orders.index")}
                        startIcon={<ArrowBackRoundedIcon />}
                    >
                        All orders
                    </Button>
                }
            />

            <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <VendorCard>
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ mb: 2 }}
                        >
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Order details
                            </Typography>
                            <OrderStatusChip status={order.status} />
                        </Stack>

                        <Stack spacing={1.5} divider={<Divider flexItem />}>
                            <DetailRow label="Destination" value={order.warehouse ?? order.store ?? "—"} />
                            <DetailRow label="Raised by" value={order.raised_by ?? "—"} />
                            <DetailRow
                                label="Ordered"
                                value={formatMoment(order.purchased_at ?? order.created_at)}
                            />
                            <DetailRow label="Expected" value={formatMoment(order.expected_at)} />
                        </Stack>

                        {order.notes ? (
                            <>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        display: "block",
                                        mt: 2.5,
                                        mb: 0.5,
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: 0.6,
                                        color: "text.secondary",
                                    }}
                                >
                                    Notes
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {order.notes}
                                </Typography>
                            </>
                        ) : null}
                    </VendorCard>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                    <VendorCard>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Value
                        </Typography>
                        <Typography variant="h3" sx={{ fontWeight: 800 }}>
                            {formatMoney(order.total_amount)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {order.status === "received"
                                ? "This order has been received."
                                : order.status === "canceled"
                                  ? "This order was canceled."
                                  : "Awaiting receipt by the warehouse."}
                        </Typography>
                    </VendorCard>
                </Grid>
            </Grid>
        </>
    );
}

function DetailRow({
    label,
    value,
}: {
    label: string;
    value: string;
}): React.ReactElement {
    return (
        <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="body2" color="text.secondary">
                {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, textAlign: "right" }}>
                {value}
            </Typography>
        </Stack>
    );
}

OrderShow.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
