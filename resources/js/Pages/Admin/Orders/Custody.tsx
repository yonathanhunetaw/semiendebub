import AdminLayout from "@/Layouts/AppLayout";
import Custody from "@/Pages/Seller/Orders/Custody";
import OrderJourney, { journeyStageFor } from "@/Components/Visual/OrderJourney";
import { Box, Paper, Typography } from "@mui/material";
import React from "react";

type CustodyProps = React.ComponentProps<typeof Custody>;

/** The seller's custody log, opened from Admin → Orders, under the order's road. */
export default function AdminOrderCustody(props: CustodyProps): React.ReactElement {
    const stage = props.log?.stage;

    return (
        <>
            <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, mb: 2, borderRadius: 4, border: "1px solid", borderColor: "divider", maxWidth: 1200, mx: "auto" }}>
                <Typography sx={{ fontWeight: 800, mb: 2 }}>
                    Where {props.log?.reference ?? "this order"} is
                </Typography>
                <Box>
                    <OrderJourney current={journeyStageFor(stage)} cancelled={stage === "cancelled"} />
                </Box>
            </Paper>
            <Custody {...props} backRoute="admin.orders.index" />
        </>
    );
}

AdminOrderCustody.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
